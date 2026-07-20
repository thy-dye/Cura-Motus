// Display labels for the locked, camera-supported exercise IDs.
// Must match the ids used in backend/services/exercise_video.py and gemini_plan.py.
export const EXERCISE_LABELS = {
  squat: "Bodyweight Squat",
  lunge: "Standing Lunge",
  "shoulder-raise": "Shoulder Raise",
};

export function exerciseLabel(exerciseId) {
  return EXERCISE_LABELS[exerciseId] || exerciseId;
}
