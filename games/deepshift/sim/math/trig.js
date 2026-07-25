// Deterministic fixed-point direction math. GDD §5.2/§13.2 bans Math.sin/cos
// in the sim (implementation-defined per engine); we ship our own integer
// approximation instead. Angles are quantized: a full turn = 4096 units
// (ANGLE_TURN), which is also the look-command quantization step.
//
// fpSin uses the Bhaskara I approximation evaluated in pure integer
// arithmetic. Absolute error < 0.002 — irrelevant for gameplay, and byte-
// identical everywhere, which is the property that matters.

import { FP_ONE, floorDiv } from './fixed.js';

export const ANGLE_TURN = 4096; // full circle
export const ANGLE_HALF = 2048; // pi
export const ANGLE_QUARTER = 1024; // pi/2

// sin of (angle / 4096 turns), result Q16.16 in [-FP_ONE, FP_ONE].
export function fpSin(angle) {
  let a = ((angle % ANGLE_TURN) + ANGLE_TURN) % ANGLE_TURN;
  let sign = 1;
  if (a >= ANGLE_HALF) {
    a -= ANGLE_HALF;
    sign = -1;
  }
  // Bhaskara I over the half-turn: sin(x) ~= 16x(pi-x) / (5pi^2 - 4x(pi-x))
  // with x in angle units: numerator/denominator kept exactly in integers.
  const t = a * (ANGLE_HALF - a); // <= 1024^2
  const num = 16 * t;
  const den = 5 * ANGLE_HALF * ANGLE_HALF - 4 * t;
  const v = floorDiv(num * FP_ONE, den);
  // `0 - v`, not `-v`: negative zero must never enter serializable sim state.
  return sign === 1 ? v : 0 - v;
}

export function fpCos(angle) {
  return fpSin(angle + ANGLE_QUARTER);
}
