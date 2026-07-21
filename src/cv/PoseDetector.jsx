import { useEffect, useRef, useState } from 'react'
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision'
import { EXERCISE_ANGLE_CONFIG, jointsUsedBy } from './exerciseAngleConfig'
import { pickDominantSide, getJointLandmark, findUnclearJoints, isLandmarkVisible } from './poseLandmarks'
import { angleBetweenPoints, createAngleSmoother } from './angleMath'
import { createPhaseTracker } from './repPhaseTracker'

const PASS_COLOR = '#22c55e' // green
const FAIL_COLOR = '#ef4444' // red
const NEUTRAL_COLOR = '#9ca3af' // gray - shown while still positioning
const LOCKED_COLOR = '#3b82f6' // blue - brief "locked in" confirmation
// Minimum time a pass/fail highlight + message stays visible once set,
// regardless of how quickly the rep-phase tracker cycles back to
// baseline. Without this, a fast rep could clear the highlight within a
// frame or two, making it effectively invisible in practice.
const MIN_HIGHLIGHT_MS = 1200
// How long the blue "locked in" skeleton flash shows after positioning
// passes, before handing off to normal green/red scoring.
const LOCKED_FLASH_MS = 600
// Front-view rotation gate. Facing the camera dead-on makes the arm-raise
// motion happen mostly along the camera's depth (z) axis, which MediaPipe
// estimates poorly. Facing straight on, both shoulders sit at ~the same
// depth; a slight turn puts one shoulder measurably closer than the other.
// We require at least this much world-space z-difference between shoulders
// before scoring a front-view exercise. Likely needs tuning after testing.
const MIN_SHOULDER_Z_DIFF = 0.08

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
function PoseDetector({ exerciseId, onFeedback, onRepComplete, onFaultDetected, onPositioning, isActive = true }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const poseLandmarkerRef = useRef(null)
  const animationFrameRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const streamRef = useRef(null)

  const [status, setStatus] = useState('loading') // loading | ready | running | error
  const [errorMessage, setErrorMessage] = useState('')
  const [visibleLandmarkCount, setVisibleLandmarkCount] = useState(0)
  const [currentAngle, setCurrentAngle] = useState(null)
  const [currentAngleLabel, setCurrentAngleLabel] = useState(null)

  // Angle-detection state that needs to survive across frames but
  // shouldn't trigger re-renders - refs, reset whenever exerciseId changes.
  const exerciseIdRef = useRef(exerciseId)
  const activeSideRef = useRef(null) // 'left' | 'right' | null (not locked yet)
  const positionedRef = useRef(false) // has the positioning gate passed for this exercise?
  const lockedAtRef = useRef(0) // performance.now() when positioning passed (for the blue flash)
  const lastPositioningKeyRef = useRef(null) // dedup so we don't fire onPositioning every frame
  const trackersRef = useRef({}) // angleName -> tracker from createPhaseTracker
  const smoothersRef = useRef({}) // angleName -> smoothing fn from createAngleSmoother
  const jointStatusRef = useRef({}) // angleName -> 'pass' | 'fail' | null (for coloring)
  const jointStatusSetAtRef = useRef({}) // angleName -> performance.now() when status was last set
  const lastFaultMessageRef = useRef({}) // angleName -> fault message string (for passing to onRepComplete)
  const onFeedbackRef = useRef(onFeedback)
  const onRepCompleteRef = useRef(onRepComplete)
  const onFaultDetectedRef = useRef(onFaultDetected)
  const onPositioningRef = useRef(onPositioning)
  const isActiveRef = useRef(isActive)

  useEffect(() => {
    onPositioningRef.current = onPositioning
  }, [onPositioning])
  useEffect(() => {
    onFaultDetectedRef.current = onFaultDetected
  }, [onFaultDetected])
  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    onFeedbackRef.current = onFeedback
  }, [onFeedback])
  useEffect(() => {
    onRepCompleteRef.current = onRepComplete
  }, [onRepComplete])

  // Reset all angle-tracking state whenever the exercise changes (new
  // set of a different exercise = fresh baseline, fresh side lock).
  useEffect(() => {
    exerciseIdRef.current = exerciseId
    activeSideRef.current = null
    positionedRef.current = false
    lockedAtRef.current = 0
    const config = EXERCISE_ANGLE_CONFIG[exerciseId]
    trackersRef.current = {}
    smoothersRef.current = {}
    jointStatusRef.current = {}
    jointStatusSetAtRef.current = {}
    lastFaultMessageRef.current = {}
    if (config) {
      for (const angleDef of config.angles) {
        trackersRef.current[angleDef.name] = createPhaseTracker(angleDef)
        smoothersRef.current[angleDef.name] = createAngleSmoother()
        jointStatusRef.current[angleDef.name] = null
        jointStatusSetAtRef.current[angleDef.name] = 0
      }
      // Positioning prompts now live in a banner above the camera (see
      // SessionPage), not the feedback status bar under the video.
      lastPositioningKeyRef.current = config.instructions
      onPositioningRef.current?.({ positioned: false, message: config.instructions })
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

    // Fire onPositioning only when the message/state actually changes, so
    // we're not spamming the parent every frame.
    function reportPositioning(positioned, message) {
      const key = positioned ? '__positioned__' : message || ''
      if (lastPositioningKeyRef.current === key) return
      lastPositioningKeyRef.current = key
      onPositioningRef.current?.({ positioned, message })
    }

    /**
     * Runs the full angle-detection pipeline for one frame's pose result.
     * Returns { highlights, phase }:
     *   highlights - list of { aIndex, vertexIndex, cIndex, status }, one
     *     per actively-evaluated angle, so the full two-bone segment (e.g.
     *     the entire hip-knee-ankle leg line) can be color-coded.
     *   phase - 'positioning' (not scoring yet, draw skeleton neutral gray),
     *     'locked' (brief blue "locked in" flash), or 'scoring' (normal
     *     green/red pass/fail coloring + rep scoring).
     */
    function processAngles(worldLandmarks, imageLandmarks) {
      const config = EXERCISE_ANGLE_CONFIG[exerciseIdRef.current]
      const highlights = []
      if (!config) return { highlights, phase: 'scoring' }

      // POSITIONING GATE: don't score anything until the user is framed
      // (and, for front-view exercises, turned slightly off-axis). While
      // gating, feed a positioning prompt to the banner and stay neutral.
      if (!positionedRef.current) {
        const requiredJoints = jointsUsedBy(exerciseIdRef.current)

        // Framing: are all required joints visible enough on some side?
        const unclear = findUnclearJoints(worldLandmarks, requiredJoints)
        if (unclear.length > 0) {
          reportPositioning(
            false,
            `We can't see your ${unclear.join(' or ')} clearly. Step back so your full body is in frame.`
          )
          return { highlights, phase: 'positioning' }
        }

        // Rotation (front-view only): facing the camera dead-on makes the
        // arm-raise motion happen along the depth axis, which MediaPipe
        // reads poorly. Require one shoulder measurably closer than the
        // other. Side-view exercises (squat, lunge) skip this entirely.
        if (config.cameraView === 'front') {
          const leftShoulder = getJointLandmark(worldLandmarks, 'shoulder', 'left')
          const rightShoulder = getJointLandmark(worldLandmarks, 'shoulder', 'right')
          if (
            leftShoulder &&
            rightShoulder &&
            Math.abs(leftShoulder.z - rightShoulder.z) < MIN_SHOULDER_Z_DIFF
          ) {
            reportPositioning(false, 'Turn slightly to your side.')
            return { highlights, phase: 'positioning' }
          }
        }

        // Both checks pass - lock the tracking side, once, based on
        // whichever side is more visible (avoids flip-flopping mid-session).
        const side = pickDominantSide(worldLandmarks, requiredJoints)
        if (!side) {
          reportPositioning(false, config.instructions)
          return { highlights, phase: 'positioning' }
        }
        activeSideRef.current = side
        positionedRef.current = true
        lockedAtRef.current = performance.now()
        reportPositioning(true, null)
      }

      // Brief blue "locked in" confirmation before scoring hands off.
      if (performance.now() - lockedAtRef.current < LOCKED_FLASH_MS) {
        return { highlights, phase: 'locked' }
      }

      const side = activeSideRef.current

      let feedbackMessage = null

      for (const angleDef of config.angles) {
        const [nameA, nameVertex, nameC] = angleDef.points
        const a = getJointLandmark(worldLandmarks, nameA, side)
        const vertex = getJointLandmark(worldLandmarks, nameVertex, side)
        const c = getJointLandmark(worldLandmarks, nameC, side)
        if (!a || !vertex || !c) continue
        // Skip scoring if MediaPipe isn't confident about any of the three
        // joints this frame. Occluded/out-of-frame joints still get a
        // guessed position with a low visibility score, and feeding that
        // guess into the angle math produces phantom reps and false
        // "too deep"/"too shallow" faults even when form is fine.
        if (!isLandmarkVisible(a) || !isLandmarkVisible(vertex) || !isLandmarkVisible(c)) continue

        const rawAngle = angleBetweenPoints(a, vertex, c)
        const smoothed = smoothersRef.current[angleDef.name](rawAngle)
        const result = trackersRef.current[angleDef.name].update(smoothed, performance.now())

        // Track the current angle for live display
        if (angleDef.countsAsRep) {
          setCurrentAngle(Math.round(smoothed))
          setCurrentAngleLabel(angleDef.label)
        }

        if (result.evaluated) {
          jointStatusRef.current[angleDef.name] = result.pass ? 'pass' : 'fail'
          jointStatusSetAtRef.current[angleDef.name] = performance.now()

          if (!result.pass) {
            // "Overshot" = moved further than the target range (feedbackTooDeep);
            // otherwise the user didn't move far enough (feedbackTooShallow).
            // Which side of the range counts as overshooting depends on the
            // checkpoint direction: for a min-checkpoint (squat depth) a
            // *smaller* angle overshoots (bent too far); for a max-checkpoint
            // (arm raise) a *larger* angle overshoots (raised too high). The
            // old code assumed min for everything, which inverted every
            // shoulder-raise correction.
            const overshot =
              angleDef.phase === 'checkpoint-min'
                ? result.checkpointAngle < angleDef.target[0]
                : result.checkpointAngle > angleDef.target[1]
            const faultMsg = overshot
              ? angleDef.feedbackTooDeep
              : angleDef.feedbackTooShallow

            if (faultMsg) {
              onFaultDetectedRef.current?.(faultMsg)
              lastFaultMessageRef.current[angleDef.name] = faultMsg
            }

            if (!feedbackMessage) {
              feedbackMessage = faultMsg
            }
          }
        }

        if (result.repCompleted && angleDef.countsAsRep) {
          const wasPass = jointStatusRef.current[angleDef.name] === 'pass'
          const repMessage = wasPass
            ? 'Perfect form'
            : (lastFaultMessageRef.current[angleDef.name] || 'Form issue')
          onRepCompleteRef.current?.({ passed: wasPass, message: repMessage })
          lastFaultMessageRef.current[angleDef.name] = null
          if (!feedbackMessage) {
            feedbackMessage = wasPass
              ? 'Nice rep! Get ready for the next one.'
              : "Reset. Get ready for your next rep."
          }
        }

        // Color the full two-bone segment (a-vertex-c) in the overlay
        // based on the most recent evaluation for this angle. Held for a
        // fixed minimum duration from the moment it was set (MIN_HIGHLIGHT_MS),
        // independent of how fast the rep-phase tracker cycles back to
        // baseline - without this, a quick rep could clear the color
        // within a single frame or two, making it effectively invisible
        // even though it was technically "working." After that hold
        // window, it clears back to neutral so it doesn't stay stuck
        // indefinitely either.
        const setAt = jointStatusSetAtRef.current[angleDef.name] || 0
        if (jointStatusRef.current[angleDef.name] && performance.now() - setAt > MIN_HIGHLIGHT_MS) {
          jointStatusRef.current[angleDef.name] = null
        }
        // Only the primary angle gets a colored overlay. Secondary
        // posture checks (back/torso angle) still drive feedback text,
        // but drawing their own overlapping segment too created a
        // visible double-line artifact wherever it shares a bone with
        // the primary (e.g. backAngle's hip-knee bone drawn right
        // alongside kneeAngle's) - two separate stroke calls along
        // almost-but-not-quite the same path, rather than one clean
        // hip-to-ankle line.
        const status = jointStatusRef.current[angleDef.name]
        if (status && angleDef.countsAsRep) {
          const aImage = getJointLandmark(imageLandmarks, nameA, side)
          const vertexImage = getJointLandmark(imageLandmarks, nameVertex, side)
          const cImage = getJointLandmark(imageLandmarks, nameC, side)
          if (aImage && vertexImage && cImage) {
            highlights.push({
              aIndex: imageLandmarks.indexOf(aImage),
              vertexIndex: imageLandmarks.indexOf(vertexImage),
              cIndex: imageLandmarks.indexOf(cImage),
              status,
            })
          }
        }
      }

      if (feedbackMessage) {
        onFeedbackRef.current?.(feedbackMessage)
      }

      return { highlights, phase: 'scoring' }
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
            let phase = 'scoring' // default: normal cyan/green skeleton

            const landmarks = result.landmarks[0]
            const worldLandmarks = result.worldLandmarks?.[0]

            if (landmarks) {
              visibleCount = landmarks.filter(
                (lm) => (lm.visibility ?? 1) > 0.5
              ).length

              if (worldLandmarks && exerciseIdRef.current && isActiveRef.current) {
                const res = processAngles(worldLandmarks, landmarks)
                highlights = res.highlights
                phase = res.phase
              }

              // Base skeleton color reflects the positioning phase: gray
              // while still positioning, blue for the brief locked-in
              // flash, normal cyan/green once scoring is live.
              const dotColor =
                phase === 'positioning' ? NEUTRAL_COLOR
                : phase === 'locked' ? LOCKED_COLOR
                : '#00e5ff'
              const lineColor =
                phase === 'positioning' ? NEUTRAL_COLOR
                : phase === 'locked' ? LOCKED_COLOR
                : '#7cffb2'

              drawingUtils.drawLandmarks(landmarks, {
                radius: () => 4,
                color: dotColor,
                fillColor: dotColor,
              })
              drawingUtils.drawConnectors(
                landmarks,
                PoseLandmarker.POSE_CONNECTIONS,
                { color: lineColor, lineWidth: 3 }
              )
            }

            // Draw the full two-bone segment (e.g. the entire hip-knee-
            // ankle leg line) in pass/fail color, on top of the base
            // skeleton, so it's clear which whole angle is being judged -
            // not just a dot on one joint. `highlights` is only ever
            // populated during the scoring phase (see processAngles), so
            // no red/green shows while positioning or during the flash.
            for (const { aIndex, vertexIndex, cIndex, status } of highlights) {
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
        {status === 'running' && (
          <div>
            <div>{`Tracking: ${visibleLandmarkCount}/33 landmarks visible`}</div>
            {currentAngle !== null && currentAngleLabel && (
              <div>{`${currentAngleLabel}: ${currentAngle}°`}</div>
            )}
          </div>
        )}
        {status === 'error' && `Error: ${errorMessage}`}
      </div>
    </div>
  )
}

export default PoseDetector
