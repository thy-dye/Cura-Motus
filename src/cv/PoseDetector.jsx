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

const NEUTRAL_COLOR = '#9ca3af' // gray - shown while still positioning
const LOCKED_COLOR = '#3b82f6' // blue - brief "locked in" confirmation
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
 *   setNumber    - the current set number (1, 2, 3...). Positioning and
 *                  the locked tracking side are re-armed whenever this
 *                  changes, not just when exerciseId changes, since a
 *                  person's framing/orientation commonly drifts between
 *                  sets and shouldn't keep scoring against a stale lock.
 *   onRepComplete - () => void, called each time a rep-counting angle
 *                  completes a full rep cycle. No live form-correctness
 *                  UI is surfaced from this anymore - it's purely a count.
 *   onFaultDetected - (message: string) => void, called on a failed angle
 *                  checkpoint. Not currently rendered anywhere; kept as a
 *                  hook for future audio-based corrections.
 */
function PoseDetector({ exerciseId, setNumber, onRepComplete, onFaultDetected, onPositioning, isActive = true }) {
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
  // Real aspect ratio of the incoming camera stream (defaults to the 4:3
  // we request from getUserMedia, updated once the stream's real
  // dimensions are known). Drives the video/canvas box's actual CSS size,
  // so both elements always occupy the exact same box - relying on the
  // canvas's height:100% resolving "by accident" against an auto-height
  // parent is what produced the misaligned overlay before.
  const [aspectRatio, setAspectRatio] = useState(4 / 3)

  // Angle-detection state that needs to survive across frames but
  // shouldn't trigger re-renders - refs, reset whenever exerciseId changes.
  const exerciseIdRef = useRef(exerciseId)
  const activeSideRef = useRef(null) // 'left' | 'right' | null (not locked yet)
  const positionedRef = useRef(false) // has the positioning gate passed for this exercise?
  const lockedAtRef = useRef(0) // performance.now() when positioning passed (for the blue flash)
  const lastPositioningKeyRef = useRef(null) // dedup so we don't fire onPositioning every frame
  const trackersRef = useRef({}) // angleName -> tracker from createPhaseTracker
  const smoothersRef = useRef({}) // angleName -> smoothing fn from createAngleSmoother
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
    onRepCompleteRef.current = onRepComplete
  }, [onRepComplete])

  // Reset all angle-tracking state whenever the exercise OR the set
  // changes. Framing/orientation commonly drifts between sets (people
  // step back, adjust, turn slightly), so positioning and the locked
  // tracking side need to be re-armed every set, not just every exercise,
  // otherwise later sets keep scoring against a stale lock from set 1.
  useEffect(() => {
    exerciseIdRef.current = exerciseId
    activeSideRef.current = null
    positionedRef.current = false
    lockedAtRef.current = 0
    const config = EXERCISE_ANGLE_CONFIG[exerciseId]
    trackersRef.current = {}
    smoothersRef.current = {}
    if (config) {
      for (const angleDef of config.angles) {
        trackersRef.current[angleDef.name] = createPhaseTracker(angleDef)
        smoothersRef.current[angleDef.name] = createAngleSmoother()
      }
      // Positioning prompts now live in a banner above the camera (see
      // SessionPage), not the feedback status bar under the video.
      lastPositioningKeyRef.current = config.instructions
      onPositioningRef.current?.({ positioned: false, message: config.instructions })
    }
  }, [exerciseId, setNumber])

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
          if (video.videoWidth && video.videoHeight) {
            setAspectRatio(video.videoWidth / video.videoHeight)
          }
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
     * Returns { phase }:
     *   phase - 'positioning' (not scoring yet, draw skeleton neutral gray),
     *     'locked' (brief blue "locked in" flash), or 'scoring' (normal
     *     skeleton, reps counted in the background - no pass/fail UI).
     */
    function processAngles(worldLandmarks) {
      const config = EXERCISE_ANGLE_CONFIG[exerciseIdRef.current]
      if (!config) return { phase: 'scoring' }

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
          return { phase: 'positioning' }
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
            return { phase: 'positioning' }
          }
        }

        // Both checks pass - lock the tracking side, once, based on
        // whichever side is more visible (avoids flip-flopping mid-session).
        const side = pickDominantSide(worldLandmarks, requiredJoints)
        if (!side) {
          reportPositioning(false, config.instructions)
          return { phase: 'positioning' }
        }
        activeSideRef.current = side
        positionedRef.current = true
        lockedAtRef.current = performance.now()
        reportPositioning(true, null)
      }

      // Brief blue "locked in" confirmation before scoring hands off.
      if (performance.now() - lockedAtRef.current < LOCKED_FLASH_MS) {
        return { phase: 'locked' }
      }

      const side = activeSideRef.current

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

        // Faults still drive the (currently unused) onFaultDetected hook,
        // but no longer surface as UI - no red/green coloring, no fault
        // text shown to the user.
        if (result.evaluated && !result.pass) {
          // "Overshot" = moved further than the target range (feedbackTooDeep);
          // otherwise the user didn't move far enough (feedbackTooShallow).
          // Which side of the range counts as overshooting depends on the
          // checkpoint direction: for a min-checkpoint (squat depth) a
          // *smaller* angle overshoots (bent too far); for a max-checkpoint
          // (arm raise) a *larger* angle overshoots (raised too high).
          const overshot =
            angleDef.phase === 'checkpoint-min'
              ? result.checkpointAngle < angleDef.target[0]
              : result.checkpointAngle > angleDef.target[1]
          const faultMsg = overshot
            ? angleDef.feedbackTooDeep
            : angleDef.feedbackTooShallow

          if (faultMsg) {
            onFaultDetectedRef.current?.(faultMsg)
          }
        }

        // Rep counting only - the phase tracker's pass/fail judgement no
        // longer changes what happens here, it only decides when a rep
        // cycle has completed.
        if (result.repCompleted && angleDef.countsAsRep) {
          onRepCompleteRef.current?.()
        }
      }

      return { phase: 'scoring' }
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
            let phase = 'scoring' // default: normal cyan/green skeleton

            const landmarks = result.landmarks[0]
            const worldLandmarks = result.worldLandmarks?.[0]

            if (landmarks) {
              visibleCount = landmarks.filter(
                (lm) => (lm.visibility ?? 1) > 0.5
              ).length

              if (worldLandmarks && exerciseIdRef.current && isActiveRef.current) {
                const res = processAngles(worldLandmarks)
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
    <div style={{ width: '100%' }}>
      {/* Explicit aspect-ratio box, sized from the stream's real
          dimensions - video and canvas both fill it exactly (same
          position/width/height), so the landmark overlay can't drift out
          of alignment with the visible body regardless of container size. */}
      <div style={{ position: 'relative', width: '100%', aspectRatio, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
          }}
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
      </div>
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
