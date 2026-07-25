import test from 'node:test';
import assert from 'node:assert/strict';

import { xxh64, hashInts, hashAscii, toHex64, fromHex64 } from './sim/math/xxhash64.js';
import { FP_ONE, floorDiv, fpMul, fpDiv, fpFloor, chebyshev3 } from './sim/math/fixed.js';
import { fpSin, fpCos, ANGLE_TURN, ANGLE_QUARTER } from './sim/math/trig.js';
import { createStreams, nextU32, nextInt } from './sim/math/prng.js';
import { RULESET, RULESET_HASH } from './sim/constants.js';

function ascii(text) {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

test('xxh64 matches the reference vectors', () => {
  assert.equal(toHex64(xxh64(ascii(''), 0n)), 'ef46db3751d8e999');
  assert.equal(toHex64(xxh64(ascii(''), 1n)), 'd5afba1336a3be4b');
  assert.equal(toHex64(xxh64(ascii('a'), 0n)), 'd24ec4f1a98c6e5b');
  assert.equal(toHex64(xxh64(ascii('abc'), 0n)), '44bc2cf5ad770999');
  // >32 bytes exercises the four-lane path.
  assert.equal(
    toHex64(xxh64(ascii('The quick brown fox jumps over the lazy dog'), 0n)),
    '0b242d361fda71bc',
  );
});

test('hashInts is order- and value-sensitive and stable', () => {
  const a = hashInts(0n, [1, 2, 3]);
  assert.equal(hashInts(0n, [1, 2, 3]), a);
  assert.notEqual(hashInts(0n, [3, 2, 1]), a);
  assert.notEqual(hashInts(1n, [1, 2, 3]), a);
  assert.notEqual(hashInts(0n, [1, 2, 3, 0]), a);
  // Negative ints encode as two's complement, deterministically.
  assert.equal(hashInts(5n, [-7, -1]), hashInts(5n, [-7, -1]));
});

test('hashAscii rejects non-ASCII and hex helpers round-trip', () => {
  assert.throws(() => hashAscii(0n, 'café'));
  assert.equal(fromHex64('00ff00ff00ff00ff'), 0xff00ff00ff00ffn);
  assert.equal(toHex64(fromHex64('deadbeefcafef00d')), 'deadbeefcafef00d');
  assert.throws(() => fromHex64('not hex'));
  assert.throws(() => fromHex64(''));
});

test('floorDiv floors toward -infinity for all sign combinations', () => {
  assert.equal(floorDiv(7, 2), 3);
  assert.equal(floorDiv(-7, 2), -4);
  assert.equal(floorDiv(7, -2), -4);
  assert.equal(floorDiv(-7, -2), 3);
  assert.equal(floorDiv(-65536, 65536), -1);
  assert.equal(floorDiv(-1, 65536), -1);
});

test('fixed-point mul/div/floor behave per the documented convention', () => {
  assert.equal(fpMul(3 * FP_ONE, 2 * FP_ONE), 6 * FP_ONE);
  assert.equal(fpMul(-3 * FP_ONE, FP_ONE / 2), -98304); // -1.5
  assert.equal(fpDiv(3 * FP_ONE, 2 * FP_ONE), 98304); // 1.5
  assert.equal(fpFloor(-1), -1); // -epsilon lives in block -1
  assert.equal(fpFloor(0), 0);
  assert.equal(fpFloor(FP_ONE - 1), 0);
});

test('chebyshev3 is the integer max metric', () => {
  assert.equal(chebyshev3(0, 0, 0, 3, -2, 1), 3);
  assert.equal(chebyshev3(-5, 0, 0, -5, 0, 0), 0);
  assert.equal(chebyshev3(1, 1, 1, -1, 4, 1), 3);
});

test('fpSin/fpCos are bounded, symmetric, and hit the lattice points', () => {
  assert.equal(fpSin(0), 0);
  assert.equal(fpSin(ANGLE_QUARTER), FP_ONE);
  assert.equal(fpSin(2 * ANGLE_QUARTER), 0);
  assert.equal(fpCos(0), FP_ONE);
  for (let a = -ANGLE_TURN; a <= 2 * ANGLE_TURN; a += 37) {
    const s = fpSin(a);
    assert.ok(s >= -FP_ONE && s <= FP_ONE);
    assert.equal(fpSin(a + ANGLE_TURN), s); // periodic
    assert.equal(fpSin(-a), 0 - s); // odd (0 - s: SameValue treats -0 !== 0)
  }
});

test('PRNG streams are independent, counter-shaped, and resumable', () => {
  const seed = fromHex64('00c0ffee00c0ffee');
  const s1 = createStreams(['spawn', 'ai']);
  const s2 = createStreams(['spawn', 'ai']);
  const draws = [];
  for (let i = 0; i < 8; i += 1) draws.push(nextU32(s1, seed, 'spawn'));
  // Interleaving another stream must not disturb this one.
  for (let i = 0; i < 3; i += 1) nextU32(s2, seed, 'ai');
  for (let i = 0; i < 8; i += 1) assert.equal(nextU32(s2, seed, 'spawn'), draws[i]);
  // Save-shape: restoring the counter reproduces the tail exactly.
  const resumed = { spawn: 4, ai: 0 };
  for (let i = 4; i < 8; i += 1) assert.equal(nextU32(resumed, seed, 'spawn'), draws[i]);
  assert.throws(() => nextU32(s1, seed, 'nope'));
  const v = nextInt(s1, seed, 'ai', 8);
  assert.ok(v >= 0 && v < 8);
  assert.throws(() => nextInt(s1, seed, 'ai', 0));
});

test('the ruleset is frozen and carries a stable 64-bit hash', () => {
  assert.ok(Object.isFrozen(RULESET));
  assert.equal(RULESET.simRadius, 3); // D1 launch value
  assert.match(RULESET_HASH, /^[0-9a-f]{16}$/);
});
