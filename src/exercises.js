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

// Hand-written, verified instructions for the 3 locked exercises. These are
// the only exercises with live camera tracking, so getting the form
// guidance right matters more here than anywhere else in the app. Kept
// static/hardcoded instead of running them through the ExerciseDB fuzzy
// matcher used for PT-prescribed and AI-suggested catalog exercises, since
// that matcher can return a wrong or mismatched exercise (confirmed during
// testing), which is an unacceptable risk for the app's core 3 exercises.
export const EXERCISE_STEPS = {
  squat: [
    "Stand with feet shoulder-width apart, toes pointing slightly outward.",
    "Keep your chest up and core engaged as you lower your hips back and down, as if sitting into a chair.",
    "Lower until your thighs are roughly parallel to the floor, or as low as feels comfortable.",
    "Keep your knees tracking over your toes, not caving inward.",
    "Push through your heels to return to standing.",
  ],
  lunge: [
    "Stand tall with feet hip-width apart.",
    "Step one foot forward and lower your body until both knees are bent around 90 degrees.",
    "Keep your front knee aligned over your ankle, not pushing past your toes.",
    "Keep your torso upright throughout the movement.",
    "Push through your front heel to return to standing, then switch legs.",
  ],
  "shoulder-raise": [
    "Stand with feet shoulder-width apart, holding light weights or no weight at your sides.",
    "Keep a slight bend in your elbows.",
    "Raise your arms out to the sides until they reach shoulder height.",
    "Pause briefly at the top, keeping your shoulders down, not shrugged.",
    "Lower your arms back down with control.",
  ],
};

export function exerciseSteps(exerciseId) {
  return EXERCISE_STEPS[exerciseId] || [];
}

// Only these ids have live camera pose-tracking. Anything else (an
// ExerciseDB catalog pick, or an unmatched PT-prescribed name) gets the
// video/gif-only view instead.
export function isLockedExercise(exerciseId) {
  return Object.prototype.hasOwnProperty.call(EXERCISE_LABELS, exerciseId);
}

// What EXERCISE_COMPLETION rows are logged/matched under. Locked exercises
// log under their clean id ("squat"); everything else (a catalog pick or a
// PT-typed name) logs under its readable name instead of a cryptic
// ExerciseDB id. SessionPage (logging) and Homepage (reading today's
// progress) both need to agree on this exact scheme, or set counts drift.
export function exerciseIdentifier(exerciseId, name) {
  return isLockedExercise(exerciseId) ? exerciseId : name;
}
