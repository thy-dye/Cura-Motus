// Decides *when* to actually check an angle against its target range.
//
// A single angle number isn't enough on its own - "knee angle 95 degrees"
// only means something if we know we're at the bottom of a squat rep,
// not partway through standing up. This tracks the angle over time and
// figures out, from the shape of the movement itself, when a rep has
// reached its checkpoint (the bottom of a squat, the top of a raise),
// without needing any separate "rep counting" input.
//
// How it works (for phase = 'checkpoint-min', e.g. squat depth):
//   1. First few frames establish a `baseline` angle (standing position).
//   2. Once the angle drops far enough below baseline (ENGAGE_DELTA),
//      we're "engaged" in a rep - start tracking the lowest angle seen.
//   3. Once the angle starts rising again after engagement (REBOUND_DELTA
//      above the lowest point seen), that lowest point was the bottom of
//      the rep - evaluate it against the target range right then.
//   4. Once the angle returns back near baseline, the rep is complete -
//      reset and wait for the next one.
//
// 'checkpoint-max' (e.g. top of a shoulder raise) is the same logic
// mirrored (engage on rising, evaluate the highest point, reset on
// falling back to baseline).
//
// 'continuous' angles (e.g. "keep your elbow straight") skip all of this
// and are just checked against the target range every single frame.

// These were originally tuned by feel and turned out way too sensitive in
// practice - normal postural sway plus landmark/depth jitter was enough
// to trip a "rep" on its own (28 counted reps for a target of 10, from
// mostly just standing around during testing). Widened the deltas and
// added a minimum engaged-frame count below so a rep has to be a real,
// sustained movement, not a momentary angle blip.
const ENGAGE_DELTA = 25; // degrees away from baseline before we consider a rep "started"
const REBOUND_DELTA = 12; // degrees back off the extreme before we consider the checkpoint passed
const RETURN_DELTA = 12; // degrees back near baseline before we consider the rep "finished"
const BASELINE_FRAMES = 10; // frames used to average out an initial standing/resting baseline
const MIN_ENGAGED_FRAMES = 6; // consecutive frames of real movement required before a checkpoint counts
const IMPROVE_EPSILON = 3; // degrees; peak changes smaller than this count as "holding", not still moving

export function createPhaseTracker(angleDef) {
  // `holdMs` (optional): if set, once the user reaches the top/bottom of
  // the rep and holds it steady for this long, we grade that sustained
  // position instead of the single instant they start moving back. This
  // makes grading far less jittery for exercises where the checkpoint is a
  // brief peak (e.g. a shoulder raise held at shoulder height). Exercises
  // without holdMs keep the original "grade on rebound" behavior.
  const { phase, target, holdMs } = angleDef;

  if (phase === 'continuous') {
    return {
      update(angle) {
        if (angle == null) return { evaluated: false };
        const pass = angle >= target[0] && angle <= target[1];
        return { evaluated: true, pass, checkpointAngle: angle, repCompleted: false };
      },
      reset() {},
    };
  }

  const isMin = phase === 'checkpoint-min';

  let baseline = null;
  let baselineSamples = [];
  let state = 'establishing-baseline'; // -> 'waiting' -> 'engaged' -> 'evaluated'
  let extremeSeen = null;
  let framesEngaged = 0;
  let lastImprovedAt = null; // timestamp the peak last moved further out (for hold timing)

  function reset() {
    baseline = null;
    baselineSamples = [];
    state = 'establishing-baseline';
    extremeSeen = null;
    framesEngaged = 0;
    lastImprovedAt = null;
  }

  function update(angle, now) {
    if (angle == null) return { evaluated: false, repCompleted: false };

    if (state === 'establishing-baseline') {
      baselineSamples.push(angle);
      if (baselineSamples.length >= BASELINE_FRAMES) {
        baseline = baselineSamples.reduce((sum, a) => sum + a, 0) / baselineSamples.length;
        state = 'waiting';
      }
      return { evaluated: false, repCompleted: false };
    }

    if (state === 'waiting') {
      const movedAwayEnough = isMin
        ? angle < baseline - ENGAGE_DELTA
        : angle > baseline + ENGAGE_DELTA;

      if (movedAwayEnough) {
        state = 'engaged';
        extremeSeen = angle;
        framesEngaged = 1;
        lastImprovedAt = now;
      }
      return { evaluated: false, repCompleted: false };
    }

    if (state === 'engaged') {
      const newExtreme = isMin ? Math.min(extremeSeen, angle) : Math.max(extremeSeen, angle);
      // Only reset the hold clock when the peak moves out meaningfully -
      // sub-epsilon jitter at the top should count as holding, not moving.
      if (Math.abs(newExtreme - extremeSeen) >= IMPROVE_EPSILON) {
        lastImprovedAt = now;
      }
      extremeSeen = newExtreme;
      framesEngaged += 1;

      const reboundedPastCheckpoint = isMin
        ? angle > extremeSeen + REBOUND_DELTA
        : angle < extremeSeen - REBOUND_DELTA;

      // Hold-to-grade: once the peak stops improving and is held steady for
      // holdMs, grade that sustained reading right there - no need to wait
      // for the user to start coming back down, and far less jittery than
      // grading a single instant. Only active when holdMs is configured and
      // we actually have timestamps.
      const held =
        holdMs != null &&
        now != null &&
        lastImprovedAt != null &&
        now - lastImprovedAt >= holdMs;

      // Require the movement to have been sustained for a minimum number of
      // frames either way, not a single noisy spike - that was the old
      // false-rep-count cause.
      if (framesEngaged >= MIN_ENGAGED_FRAMES && (reboundedPastCheckpoint || held)) {
        state = 'evaluated';
        const pass = extremeSeen >= target[0] && extremeSeen <= target[1];
        return {
          evaluated: true,
          pass,
          checkpointAngle: extremeSeen,
          repCompleted: false,
        };
      }

      // Rebounded before it was sustained long enough - treat it as noise
      // and go back to waiting rather than staying stuck "engaged" on a
      // small wobble.
      if (reboundedPastCheckpoint) {
        state = 'waiting';
        extremeSeen = null;
        framesEngaged = 0;
        lastImprovedAt = null;
      }
      return { evaluated: false, repCompleted: false };
    }

    if (state === 'evaluated') {
      const backNearBaseline = Math.abs(angle - baseline) < RETURN_DELTA;
      if (backNearBaseline) {
        state = 'waiting';
        extremeSeen = null;
        return { evaluated: false, repCompleted: true };
      }
      return { evaluated: false, repCompleted: false };
    }

    return { evaluated: false, repCompleted: false };
  }

  return { update, reset };
}
