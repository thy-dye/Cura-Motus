// Turns 3 landmarks into a joint angle in degrees.
//
// Every joint angle we care about (knee bend, elbow bend, arm elevation,
// torso lean) is defined the same way: pick 3 points, treat the middle
// one as the vertex, and measure the angle between the two vectors that
// run from the vertex out to the other two points.
//
// We use MediaPipe's *world* landmarks (real 3D coordinates in meters,
// centered around the hips) rather than the normalized image landmarks,
// because world landmarks aren't distorted by how close/far the person
// is from the camera - which matters for getting consistent angle
// readings across different users and setups.

/**
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} vertex
 * @param {{x:number,y:number,z:number}} c
 * @returns {number} angle at `vertex`, in degrees (0-180)
 */
export function angleBetweenPoints(a, vertex, c) {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y, z: a.z - vertex.z };
  const v2 = { x: c.x - vertex.x, y: c.y - vertex.y, z: c.z - vertex.z };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);

  if (mag1 === 0 || mag2 === 0) return null;

  // Clamp for floating-point safety - dot/(mag1*mag2) can drift slightly
  // outside [-1, 1] due to rounding, and Math.acos of anything outside
  // that range is NaN.
  const cosAngle = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));

  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Simple exponential smoothing so raw per-frame landmark jitter doesn't
 * make the computed angle flicker. Call once per frame per angle name.
 * `alpha` closer to 1 = less smoothing (more responsive, more jitter);
 * closer to 0 = more smoothing (more stable, more lag).
 */
export function createAngleSmoother(alpha = 0.25) {
  let smoothed = null;
  return function smooth(rawAngle) {
    if (rawAngle == null) return smoothed;
    smoothed = smoothed == null ? rawAngle : alpha * rawAngle + (1 - alpha) * smoothed;
    return smoothed;
  };
}
