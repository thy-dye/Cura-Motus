// MediaPipe Pose Landmarker outputs 33 body landmarks per detected pose.
// This file gives us names for the ones we actually need for joint-angle
// math, plus a helper to pick which side of the body (left/right) to
// track when the user is filmed from the side and only one side is
// clearly visible.
//
// Reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker

export const LANDMARK_INDEX = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
};

// Generic joint name -> { left, right } landmark index, so exercise
// configs can say "hip" / "knee" / "ankle" without hardcoding a side.
// The active side is resolved once per session via pickDominantSide().
export const JOINT_SIDES = {
  shoulder: { left: LANDMARK_INDEX.leftShoulder, right: LANDMARK_INDEX.rightShoulder },
  elbow: { left: LANDMARK_INDEX.leftElbow, right: LANDMARK_INDEX.rightElbow },
  wrist: { left: LANDMARK_INDEX.leftWrist, right: LANDMARK_INDEX.rightWrist },
  hip: { left: LANDMARK_INDEX.leftHip, right: LANDMARK_INDEX.rightHip },
  knee: { left: LANDMARK_INDEX.leftKnee, right: LANDMARK_INDEX.rightKnee },
  ankle: { left: LANDMARK_INDEX.leftAnkle, right: LANDMARK_INDEX.rightAnkle },
};

const MIN_VISIBILITY = 0.5;

/**
 * Decide which side of the body (left/right) to track for a given set of
 * joint names, based on which side's landmarks are more consistently
 * visible in this frame. This is what lets the same exercise config work
 * whether the user happens to face left or right during a side-profile
 * exercise (squat, lunge), without hardcoding "always use left".
 *
 * Returns 'left' | 'right' | null (null = not enough visibility yet,
 * caller should keep waiting rather than guessing).
 */
export function pickDominantSide(landmarks, jointNames) {
  let leftTotal = 0;
  let rightTotal = 0;
  let count = 0;

  for (const joint of jointNames) {
    const sides = JOINT_SIDES[joint];
    if (!sides) continue;
    const left = landmarks[sides.left];
    const right = landmarks[sides.right];
    if (!left || !right) continue;
    leftTotal += left.visibility ?? 0;
    rightTotal += right.visibility ?? 0;
    count += 1;
  }

  if (count === 0) return null;

  const leftAvg = leftTotal / count;
  const rightAvg = rightTotal / count;

  if (leftAvg < MIN_VISIBILITY && rightAvg < MIN_VISIBILITY) return null;

  return leftAvg >= rightAvg ? 'left' : 'right';
}

/**
 * Resolve a generic joint name ("hip") + chosen side ("left") into the
 * actual landmark for this frame.
 */
export function getJointLandmark(landmarks, jointName, side) {
  const sides = JOINT_SIDES[jointName];
  if (!sides) return null;
  const index = sides[side];
  return landmarks[index] ?? null;
}

export function isLandmarkVisible(landmark) {
  return !!landmark && (landmark.visibility ?? 0) >= MIN_VISIBILITY;
}

const JOINT_DISPLAY_NAME = {
  shoulder: 'shoulder',
  elbow: 'elbow',
  wrist: 'wrist',
  hip: 'hip',
  knee: 'knee',
  ankle: 'feet/ankles',
};

/**
 * When pickDominantSide() can't lock a side yet, this figures out *why*
 * - which specific joint(s) aren't visible on either side - so we can
 * give an actionable prompt ("we can't see your ankles - step back")
 * instead of just repeating the generic positioning instructions with
 * no explanation.
 *
 * Returns an array of joint display names that are missing/low-confidence
 * on both sides. Empty array means everything needed is actually visible
 * (pickDominantSide should be able to lock in that case).
 */
export function findUnclearJoints(landmarks, jointNames) {
  const unclear = [];

  for (const joint of jointNames) {
    const sides = JOINT_SIDES[joint];
    if (!sides) continue;
    const left = landmarks[sides.left];
    const right = landmarks[sides.right];
    const bestVisibility = Math.max(left?.visibility ?? 0, right?.visibility ?? 0);
    if (bestVisibility < MIN_VISIBILITY) {
      unclear.push(JOINT_DISPLAY_NAME[joint] || joint);
    }
  }

  return unclear;
}
