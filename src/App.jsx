import PoseDetector from './cv/PoseDetector'
import './App.css'

function App() {
  return (
    <>
      <h1>CuraMotus: Pose Detection (CV MVP: Step 1)</h1>
      <p>
        Live MediaPipe Pose tracking: landmarks drawn over the webcam feed.
        Detection only, no joint-angle scoring yet.
      </p>
      <PoseDetector />
    </>
  )
}

export default App