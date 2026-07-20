import { useEffect, useRef, useState } from 'react'
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision'
import { EXERCISE_ANGLE_CONFIG, jointsUsedBy } from './exerciseAngleConfig'
import { pickDominantSide, getJointLandmark, findUnclearJoints } from './poseLandmarks'
import { angleBetweenPoints, createAngleSmoother } from './angleMath'
import { createPhaseTracker } from './repPhaseTracker'

const PASS_COLOR = '#22c55e' // green
const FAIL_COLOR = '#ef4444' // red

/**
 * PoseDetector
 *
 * CV MVP: live joint-angle form checking for the 3 locked exercises
 * (squat, lunge, shoulder-raise). Pipeline per frame:
 *
 *   landmarks -> lock camera-facing side -> compute configured angles
 *   -> smooth -> run through each angle's rep-phase tracker -> compare
 *   evaluated checkpoints to target ranges -> color the relevant joint
 *   + report feedback text up to the parent.
 *
 * Props:
 *   exerciseId   - one of the keys in exerciseAngleConfig.js
 *                  ("squat" | "lunge" | "shoulder-raise"). If omitted or
 *                  unrecognized, falls back to landmark detection only
 *                  (no angle scoring), same as before.
 *   onFeedback   - (message: string) => void, called whenever the
 *                  feedback text should update (positioning prompts,
 *                  form corrections, rep-complete confirmations).
 *   onRepComplete - (angleName: string) => void, called each time a
 *                  checkpoint angle completes a full rep cycle.
 */
function PoseDetector({ exerciseId, onFeedback, onRepComplete }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const poseLandmarkerRef = useRef(null)
  const animationFrameRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const streamRef = useRef(null)

  const [status, setStatus] = useState('loading') // loading | ready | running | error
  const [errorMessage, setErrorMessage] = useState('')
  const [visibleLandmarkCount, setVisibleLandmarkCount] = useState(0)

  // Angle-detection state that needs to survive across frames but
  // shouldn't trigger re-renders - refs, reset whenever exerciseId changes.
  const activeSideRef = useRef(null) // 'left' | 'right' | null (not locked yet)
  const trackersRef = useRef({}) // angleName -> tracker from createPhaseTracker
  const smoothersRef = useRef({}) // angleName -> smoothing fn from createAngleSmoother
  const jointStatusRef = useRef({}) // angleName -> 'pass' | 'fail' | null (for coloring)
  const onFeedbackRef = useRef(onFeedback)
  const onRepCompleteRef = useRef(onRepComplete)

  useEffect(() => {
    onFeedbackRef.current = onFeedback
  }, [onFeedback])
  useEffect(() => {
    onRepCompleteRef.current = onRepComplete
  }, [onRepComplete])

  // Reset all angle-tracking state whenever the exercise changes (new
  // set of a different exercise = fresh baseline, fresh side lock).
  useEffect(() => {
    activeSideRef.current = null
    const config = EXERCISE_ANGLE_CONFIG[exerciseId]
    trackersRef.current = {}
    smoothersRef.current = {}
    jointStatusRef.current = {}
    if (config) {
      for (const angleDef of config.angles) {
        trackersRef.current[angleDef.name] = createPhaseTracker(angleDef)
        smoothersRef.current[angleDef.name] = createAngleSmoother()
        jointStatusRef.current[angleDef.name] = null
      }
      onFeedbackRef.current?.(config.instructions)
    }
  }, [exerciseId])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        setStatus('loading')

        // Loads the MediaPipe WASM runtime from CDN.
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
        )

        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'LIVE_STREAM',
          numPoses: 1,
        })

        if (cancelled) return
        poseLandmarkerRef.current = poseLandmarker

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream

        video.addEventListener('loadeddata', () => {
          if (cancelled) return
          setStatus('running')
          predictWebcam()
        })
      } catch (err) {
        console.error('Pose detector init failed:', err)
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(err.message || String(err))
        }
      }
    }

    /**
     * Runs the full angle-detection pipeline for one frame's pose result.
     * Returns a list of { aIndex, vertexIndex, cIndex, status } - one per
     * actively-evaluated angle - so the full two-bone segment (e.g. the
     * entire hip-knee-ankle leg line) can be color-coded, not just a dot
     * on the vertex joint. That makes it clear which whole angle/limb is
     * being judged, not just which single joint.
     */
    function processAngles(worldLandmarks, imageLandmarks) {
      const config = EXERCISE_ANGLE_CONFIG[exerciseId]
      const highlights = []
      if (!config) return highlights

      // Lock which side of the body we're tracking, once, based on
      // whichever side is more visible - avoids flip-flopping mid-session.
      if (!activeSideRef.current) {
        const requiredJoints = jointsUsedBy(exerciseId)
        const side = pickDominantSide(worldLandmarks, requiredJoints)
        if (!side) {
          // Give a specific reason instead of just repeating the generic
          // positioning instructions forever with no explanation - e.g.
          // "we can't see your feet/ankles" tells the user exactly what
          // to fix (usually: back up, or reframe the camera).
          const unclear = findUnclearJoints(worldLandmarks, requiredJoints)
          onFeedbackRef.current?.(
            unclear.length > 0
              ? `We can't see your ${unclear.join(' or ')} clearly - step back so your full body is in frame.`
              : config.instructions
          )
          return highlights
        }
        activeSideRef.current = side
      }
      const side = activeSideRef.current

      let feedbackMessage = null

      for (const angleDef of config.angles) {
        const [nameA, nameVertex, nameC] = angleDef.points
        const a = getJointLandmark(worldLandmarks, nameA, side)
        const vertex = getJointLandmark(worldLandmarks, nameVertex, side)
        const c = getJointLandmark(worldLandmarks, nameC, side)
        if (!a || !vertex || !c) continue

        const rawAngle = angleBetweenPoints(a, vertex, c)
        const smoothed = smoothersRef.current[angleDef.name](rawAngle)
        const result = trackersRef.current[angleDef.name].update(smoothed)

        if (result.evaluated) {
          jointStatusRef.current[angleDef.name] = result.pass ? 'pass' : 'fail'

          if (!result.pass && !feedbackMessage) {
            // A smaller angle than the target range means more joint
            // flexion than intended (e.g. squatting deeper than the
            // target knee angle) - that's the "too deep" fault, not
            // "too shallow". A larger angle means less flexion than
            // intended (didn't bend enough) - "too shallow".
            const tooDeep = result.checkpointAngle < angleDef.target[0]
            feedbackMessage = tooDeep
              ? angleDef.feedbackTooDeep
              : angleDef.feedbackTooShallow
          }
        }

        // Only the exercise's designated primary angle increments the
        // rep counter - secondary posture checks (back angle, torso
        // angle) evaluate the same physical rep and would double-count
        // it otherwise.
        if (result.repCompleted && angleDef.countsAsRep) {
          onRepCompleteRef.current?.(angleDef.name)
        }

        // Color the full two-bone segment (a-vertex-c) in the overlay
        // based on the most recent evaluation for this angle (persists
        // until the next checkpoint) - e.g. the whole hip-knee-ankle leg
        // line, not just a dot on the knee.
        const status = jointStatusRef.current[angleDef.name]
        if (status) {
          const aImage = getJointLandmark(imageLandmarks, nameA, side)
          const vertexImage = getJointLandmark(imageLandmarks, nameVertex, side)
          const cImage = getJointLandmark(imageLandmarks, nameC, side)
          if (aImage && vertexImage && cImage) {
            highlights.push({
              aIndex: imageLandmarks.indexOf(aImage),
              vertexIndex: imageLandmarks.indexOf(vertexImage),
              cIndex: imageLandmarks.indexOf(cImage),
              status,
              // Drawn last (see predictWebcam) so it wins on any bone it
              // shares with a secondary angle - e.g. kneeAngle's hip-knee
              // bone overlaps backAngle's hip-knee bone, and we want the
              // whole hip-to-ankle leg line to consistently reflect the
              // primary angle's status rather than whichever happened to
              // draw last.
              isPrimary: !!angleDef.countsAsRep,
            })
          }
        }
      }

      if (feedbackMessage) {
        onFeedbackRef.current?.(feedbackMessage)
      } else if (!activeSideRef.current) {
        onFeedbackRef.current?.(config.instructions)
      }

      return highlights
    }

    function predictWebcam() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const poseLandmarker = poseLandmarkerRef.current
      if (!video || !canvas || !poseLandmarker) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      const drawingUtils = new DrawingUtils(ctx)

      const loop = () => {
        if (cancelled) return

        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime
          const startTimeMs = performance.now()

          poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            ctx.save()
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            let visibleCount = 0
            let highlights = []

            for (let i = 0; i < result.landmarks.length; i++) {
              const landmarks = result.landmarks[i]
              const worldLandmarks = result.worldLandmarks?.[i]

              drawingUtils.drawLandmarks(landmarks, {
                radius: () => 4,
                color: '#00e5ff',
                fillColor: '#00e5ff',
              })
              drawingUtils.drawConnectors(
                landmarks,
                PoseLandmarker.POSE_CONNECTIONS,
                { color: '#7cffb2', lineWidth: 3 }
              )
              visibleCount = landmarks.filter(
                (lm) => (lm.visibility ?? 1) > 0.5
              ).length

              if (worldLandmarks && exerciseId) {
                highlights = processAngles(worldLandmarks, landmarks)
              }
            }

            // Draw the full two-bone segment (e.g. the entire hip-knee-
            // ankle leg line) in pass/fail color, on top of the base
            // skeleton, so it's clear which whole angle is being judged -
            // not just a dot on one joint. Secondary angles (back/torso
            // posture) draw first, primary (knee/arm) draws last, so it
            // wins on any bone the two share instead of getting
            // overwritten.
            const landmarks = result.landmarks[0]
            const orderedHighlights = [...highlights].sort(
              (a, b) => Number(a.isPrimary) - Number(b.isPrimary)
            )
            for (const { aIndex, vertexIndex, cIndex, status } of orderedHighlights) {
              const a = landmarks?.[aIndex]
              const vertex = landmarks?.[vertexIndex]
              const c = landmarks?.[cIndex]
              if (!a || !vertex || !c) continue

              const color = status === 'pass' ? PASS_COLOR : FAIL_COLOR
              ctx.lineWidth = 6
              ctx.strokeStyle = color
              ctx.beginPath()
              ctx.moveTo(a.x * canvas.width, a.y * canvas.height)
              ctx.lineTo(vertex.x * canvas.width, vertex.y * canvas.height)
              ctx.lineTo(c.x * canvas.width, c.y * canvas.height)
              ctx.stroke()

              // Small filled dots at all 3 points of the segment so the
              // endpoints (e.g. hip, ankle) read clearly too, not just
              // the vertex.
              for (const point of [a, vertex, c]) {
                ctx.beginPath()
                ctx.arc(point.x * canvas.width, point.y * canvas.height, 6, 0, 2 * Math.PI)
                ctx.fillStyle = color
                ctx.fill()
              }
            }

            setVisibleLandmarkCount(visibleCount)
            ctx.restore()
          })
        }

        animationFrameRef.current = requestAnimationFrame(loop)
      }

      loop()
    }

    init()

    return () => {
      cancelled = true
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
    // exerciseId intentionally omitted here - processAngles reads it
    // fresh via closure each call, and the tracker-reset effect above
    // handles state resets when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'block', width: '100%', height: 'auto', transform: 'scaleX(-1)' }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: 'scaleX(-1)',
        }}
      />
      <div style={{ marginTop: 8, fontFamily: 'sans-serif', fontSize: 14, color: '#fff' }}>
        {status === 'loading' && 'Loading pose model…'}
        {status === 'running' &&
          `Tracking: ${visibleLandmarkCount}/33 landmarks visible`}
        {status === 'error' && `Error: ${errorMessage}`}
      </div>
    </div>
  )
}

export default PoseDetector
