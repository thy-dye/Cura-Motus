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
        feedbackTooShallow: 'Bend your knees more. Squat lower.',
        feedbackTooDeep: "That's too deep. Ease up slightly.",
        // The primary movement angle for this exercise - only this one
        // increments the rep counter. backAngle below evaluates the same
        // physical rep (it shares the hip-knee bone with kneeAngle), so
        // letting it *also* count reps would double-count every squat.
        countsAsRep: true,
      },
      {
        name: 'backAngle',
        points: ['shoulder', 'hip', 'knee'],
        phase: 'checkpoint-min',
        target: [50, 180],
        label: 'back angle',
        feedbackTooShallow: null, // no upper-bound fault for this one
        feedbackTooDeep: 'Keep your chest up. Try not to lean so far forward.',
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
        feedbackTooDeep: "That's too deep. Ease up slightly.",
        countsAsRep: true,
      },
      {
        name: 'torsoAngle',
        points: ['shoulder', 'hip', 'knee'],
        phase: 'checkpoint-min',
        target: [60, 180],
        label: 'torso angle',
        feedbackTooShallow: null,
        feedbackTooDeep: 'Keep your torso upright. Avoid leaning forward.',
      },
    ],
  },

  'shoulder-raise': {
    cameraView: 'front',
    instructions:
      'Turn slightly so one shoulder is a bit closer to the camera, upper body in frame. Raise to shoulder height and hold for a second.',
    angles: [
      {
        name: 'armElevationAngle',
        points: ['hip', 'shoulder', 'wrist'],
        phase: 'checkpoint-max',
        target: [80, 100],
        label: 'arm height',
        // Grade the position once it's been held at the top for ~1s, rather
        // than the instant the arm starts dropping - the peak of a raise is
        // a brief, jittery moment otherwise. See createPhaseTracker.
        holdMs: 1000,
        feedbackTooShallow: 'Raise your arm higher, up to shoulder height.',
        feedbackTooDeep: "That's a bit high. Lower to shoulder height.",
        countsAsRep: true,
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
