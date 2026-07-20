import { useEffect, useRef, useState } from 'react'
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision'

/**
 * PoseDetector
 *
 * CV MVP step 1 (per CuraMotus project plan, Thursday goal):
 * Get MediaPipe Pose running in LIVE_STREAM mode, with the 33 body
 * landmarks drawn live over the webcam feed. Detection only, no
 * joint-angle scoring yet. That comes once this is solid for all
 * 5 locked exercises.
 */
function PoseDetector() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const poseLandmarkerRef = useRef(null)
  const animationFrameRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const streamRef = useRef(null)

  const [status, setStatus] = useState('loading') // loading | ready | running | error
  const [errorMessage, setErrorMessage] = useState('')
  const [visibleLandmarkCount, setVisibleLandmarkCount] = useState(0)

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
            for (const landmarks of result.landmarks) {
              drawingUtils.drawLandmarks(landmarks, {
                radius: (data) => 4,
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
