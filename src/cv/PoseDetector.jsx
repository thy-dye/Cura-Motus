import { useEffect, useRef, useState } from 'react'
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision'
import { EXERCISE_ANGLE_CONFIG, jointsUsedBy } from './exerciseAngleConfig'
import { pickDominantSide, getJointLandmark } from './poseLandmarks'
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
     * Returns a map of vertex landmark index -> 'pass' | 'fail', used to
     * color-code the skeleton overlay for whichever joints are actively
     * being evaluated.
     */
    function processAngles(worldLandmarks, imageLandmarks) {
      const config = EXERCISE_ANGLE_CONFIG[exerciseId]
      const highlightByIndex = {}
      if (!config) return highlightByIndex

      // Lock which side of the body we're tracking, once, based on
      // whichever side is more visible - avoids flip-flopping mid-session.
      if (!activeSideRef.current) {
        const side = pickDominantSide(worldLandmarks, jointsUsedBy(exerciseId))
        if (!side) {
          onFeedbackRef.current?.(config.instructions)
          return highlightByIndex
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
            const tooLow = result.checkpointAngle < angleDef.target[0]
            feedbackMessage = tooLow
              ? angleDef.feedbackTooShallow
              : angleDef.feedbackTooDeep
          }
        }

        if (result.repCompleted) {
          onRepCompleteRef.current?.(angleDef.name)
        }

        // Color the vertex joint in the overlay based on the most recent
        // evaluation for this angle (persists until the next checkpoint).
        const vertexImageLandmark = getJointLandmark(imageLandmarks, nameVertex, side)
        if (vertexImageLandmark) {
          const status = jointStatusRef.current[angleDef.name]
          if (status) {
            highlightByIndex[imageLandmarks.indexOf(vertexImageLandmark)] = status
          }
        }
      }

      if (feedbackMessage) {
        onFeedbackRef.current?.(feedbackMessage)
      } else if (!activeSideRef.current) {
        onFeedbackRef.current?.(config.instructions)
      }

      return highlightByIndex
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
            let highlightByIndex = {}

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
                highlightByIndex = processAngles(worldLandmarks, landmarks)
              }
            }

            // Draw a colored ring over whichever joints are actively
            // being evaluated, on top of the base skeleton, so the
            // feedback points at exactly what's being measured.
            for (const [indexStr, statusValue] of Object.entries(highlightByIndex)) {
              const index = Number(indexStr)
              const landmarks = result.landmarks[0]
              const lm = landmarks?.[index]
              if (!lm) continue
              ctx.beginPath()
              ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 12, 0, 2 * Math.PI)
              ctx.lineWidth = 4
              ctx.strokeStyle = statusValue === 'pass' ? PASS_COLOR : FAIL_COLOR
              ctx.stroke()
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
