// The "table" from the CV design doc, as actual data: for each of the 3
// MVP exercises, which joint angles matter, which phase of the rep to
// check them at, and what counts as correct form.
//
// `points` is always [pointA, vertex, pointC] using the generic joint
// names from poseLandmarks.js (side is resolved once per session, not
// hardcoded here).
//
// `phase`:
//   'checkpoint-min'  - evaluate at the bottom of the rep (local minimum
//                        angle), e.g. squat depth
//   'checkpoint-max'  - evaluate at the top of the rep (local maximum
//                        angle), e.g. arm raised overhead
//   'continuous'      - evaluate every frame, not tied to a rep phase,
//                        e.g. "keep your elbow straight the whole time"
//
// `target` is [min, max] in degrees. For continuous floor checks (like
// "stay above 160 degrees"), max is just 180 (the anatomical limit).

export const EXERCISE_ANGLE_CONFIG = {
  squat: {
    cameraView: 'side',
    instructions: 'Stand sideways to the camera, full body in frame.',
    angles: [
      {
        name: 'kneeAngle',
        points: ['hip', 'knee', 'ankle'],
        phase: 'checkpoint-min',
        target: [90, 110],
        label: 'knee bend',
        feedbackTooShallow: 'Bend your knees more - squat lower.',
        feedbackTooDeep: "That's too deep - ease up slightly.",
      },
      {
        name: 'backAngle',
        points: ['shoulder', 'hip', 'knee'],
        phase: 'checkpoint-min',
        target: [50, 180],
        label: 'back angle',
        feedbackTooShallow: null, // no upper-bound fault for this one
        feedbackTooDeep: 'Keep your chest up - try not to lean so far forward.',
      },
    ],
  },

  lunge: {
    cameraView: 'side',
    instructions: 'Stand sideways to the camera, full body in frame.',
    angles: [
      {
        name: 'frontKneeAngle',
        points: ['hip', 'knee', 'ankle'],
        phase: 'checkpoint-min',
        target: [80, 100],
        label: 'front knee bend',
        feedbackTooShallow: 'Lower your back knee more toward the floor.',
        feedbackTooDeep: "That's too deep - ease up slightly.",
      },
      {
        name: 'torsoAngle',
        points: ['shoulder', 'hip', 'knee'],
        phase: 'checkpoint-min',
        target: [60, 180],
        label: 'torso angle',
        feedbackTooShallow: null,
        feedbackTooDeep: 'Keep your torso upright - avoid leaning forward.',
      },
    ],
  },

  'shoulder-raise': {
    cameraView: 'front',
    instructions: 'Face the camera directly, upper body in frame.',
    angles: [
      {
        name: 'armElevationAngle',
        points: ['hip', 'shoulder', 'wrist'],
        phase: 'checkpoint-max',
        target: [80, 100],
        label: 'arm height',
        feedbackTooShallow: 'Raise your arm higher - to shoulder height.',
        feedbackTooDeep: "That's a bit high - lower to shoulder height.",
      },
      {
        name: 'elbowAngle',
        points: ['shoulder', 'elbow', 'wrist'],
        phase: 'continuous',
        target: [160, 180],
        label: 'elbow straightness',
        feedbackTooShallow: 'Keep your arm straighter as you raise it.',
        feedbackTooDeep: null,
      },
    ],
  },
};

// All joint names referenced anywhere in an exercise's angle list - used
// to decide which body side (left/right) to lock onto for the session.
export function jointsUsedBy(exerciseId) {
  const config = EXERCISE_ANGLE_CONFIG[exerciseId];
  if (!config) return [];
  const joints = new Set();
  for (const angle of config.angles) {
    for (const joint of angle.points) joints.add(joint);
  }
  return Array.from(joints);
}
