import test from 'node:test';
import assert from 'node:assert/strict';

import { FP_ONE } from './sim/math/fixed.js';
import { moveBody, bodyIntersectsBlock } from './sim/physics.js';
import { createWorld, setBlock } from './sim/world/world.js';
import { RULESET } from './sim/constants.js';

// Build a test arena high above the terrain (nothing generated reaches
// y=80): a floor slab at y=80 so bodies rest on top at y=81.
function arena() {
  const world = createWorld('00c0ffee00c0ffee');
  for (let x = 8; x <= 16; x += 1) {
    for (let z = 8; z <= 16; z += 1) {
      setBlock(world, x, 80, z, 'fieldstone');
    }
  }
  return world;
}

function body(x, y, z) {
  return {
    x: Math.round(x * FP_ONE),
    y: Math.round(y * FP_ONE),
    z: Math.round(z * FP_ONE),
    halfW: RULESET.playerHalfWidth,
    height: RULESET.playerHeight,
  };
}

test('a falling body comes to rest exactly on the block boundary', () => {
  const world = arena();
  const b = body(12.5, 85.25, 12.5);
  let onGround = false;
  for (let i = 0; i < 60 && !onGround; i += 1) {
    ({ onGround } = moveBody(world, b, 0, -RULESET.terminalVelocity / 4, 0));
  }
  assert.ok(onGround);
  assert.equal(b.y, 81 * FP_ONE); // exact integer boundary, not epsilon-near
});

test('terminal velocity cannot tunnel through a one-block floor', () => {
  const world = arena();
  const b = body(12.5, 81.5, 12.5); // half a block above the floor top
  const hit = moveBody(world, b, 0, -RULESET.terminalVelocity, 0); // 2 blocks/tick
  assert.ok(hit.hitY);
  assert.ok(hit.onGround);
  assert.equal(b.y, 81 * FP_ONE);
});

test('walls clamp horizontal motion to the face minus the half width', () => {
  const world = arena();
  setBlock(world, 14, 81, 12, 'fieldstone');
  setBlock(world, 14, 82, 12, 'fieldstone');
  const b = body(12.5, 81, 12.5);
  const hit = moveBody(world, b, 2 * FP_ONE, 0, 0);
  assert.ok(hit.hitX);
  assert.equal(b.x, 14 * FP_ONE - RULESET.playerHalfWidth);
  // And from the other side, symmetric.
  const c = body(15.6, 81, 12.5);
  const hit2 = moveBody(world, c, -2 * FP_ONE, 0, 0);
  assert.ok(hit2.hitX);
  assert.equal(c.x, 15 * FP_ONE + RULESET.playerHalfWidth);
});

test('axis order is Y then X then Z: a corner move clamps X and slides Z', () => {
  const world = arena();
  setBlock(world, 14, 81, 12, 'fieldstone');
  setBlock(world, 14, 82, 12, 'fieldstone'); // wall only on the +X side
  const b = body(12.5, 81, 12.5);
  const hit = moveBody(world, b, 2 * FP_ONE, 0, FP_ONE / 2);
  assert.ok(hit.hitX);
  assert.ok(!hit.hitZ);
  assert.equal(b.x, 14 * FP_ONE - RULESET.playerHalfWidth);
  assert.equal(b.z, 13 * FP_ONE); // z advanced the full half block
});

test('the ceiling clamps upward motion to the face minus body height', () => {
  const world = arena();
  setBlock(world, 12, 84, 12, 'fieldstone');
  const b = body(12.5, 81, 12.5);
  const hit = moveBody(world, b, 0, 3 * FP_ONE, 0);
  assert.ok(hit.hitY);
  assert.equal(b.y, 84 * FP_ONE - RULESET.playerHeight);
});

test('bodyIntersectsBlock honors exclusive max faces', () => {
  const b = body(12.5, 81, 12.5);
  assert.ok(!bodyIntersectsBlock(b, 12, 80, 12)); // standing ON it, not IN it
  assert.ok(bodyIntersectsBlock(b, 12, 81, 12)); // feet cell
  assert.ok(bodyIntersectsBlock(b, 12, 82, 12)); // head cell (height 1.8125)
  assert.ok(!bodyIntersectsBlock(b, 12, 83, 12)); // above the head
  assert.ok(!bodyIntersectsBlock(b, 14, 81, 12)); // beside, out of the footprint
});
