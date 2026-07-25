// Fixed-point conventions for the DEEPSHIFT sim (documented in README.md).
//
// Q16.16: one block = 65536 units. All positions, velocities, and distances
// in the sim are integers in this format, stored in ordinary JS numbers
// (exact integer arithmetic below 2^53; our magnitudes stay under 2^48).
// Rounding convention for every narrowing operation: floor (toward -inf),
// matching arithmetic-shift semantics, so the same code path is exact on any
// engine. No Math transcendentals, no float accumulation — ever.

export const FP_SHIFT = 16;
export const FP_ONE = 65536;
export const FP_HALF = 32768;

// Floor division of exact integers. Implemented via truncation + remainder
// correction rather than Math.floor(a / b): float quotients can round across
// an integer boundary; the corrected form never can for |a| < 2^52.
export function floorDiv(a, b) {
  let q = Math.trunc(a / b);
  const r = a - q * b;
  if (r !== 0 && (r < 0) !== (b < 0)) q -= 1;
  return q;
}

export function fpFromInt(i) {
  return i * FP_ONE;
}

// Fixed -> integer block coordinate (floor).
export function fpFloor(a) {
  return floorDiv(a, FP_ONE);
}

// Q16.16 multiply, floor-rounded. |a*b| stays < 2^52 for all sim magnitudes
// (positions < 2^26, velocities < 2^20).
export function fpMul(a, b) {
  return floorDiv(a * b, FP_ONE);
}

// Q16.16 divide, floor-rounded.
export function fpDiv(a, b) {
  return floorDiv(a * FP_ONE, b);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Integer Chebyshev distance on any integer lattice (D1: the activation
// metric on the chunk lattice). Pure integers, no floats, no libm.
export function chebyshev3(ax, ay, az, bx, by, bz) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dy, dz);
}
