import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  generateTerrain,
  landingAssessment,
  newGame,
  startLevel,
  step,
  terrainHeight,
} from '../games/lunar-descent/logic.js';

const rng = () => 0.5;
const near = (actual, expected, tolerance = 1e-7) => Math.abs(actual - expected) <= tolerance;

function flatTerrain(pad = { x: 260, width: 120, y: 400 }) {
  return { points: Array.from({ length: 17 }, (_, i) => ({ x: i * 40, y: 400 })), pad };
}

test('gravity and thrust integrate over dt without frame-rate assumptions', () => {
  const state = newGame(rng);
  state.terrain = flatTerrain({ x: 0, width: 640, y: 460 });
  state.lander = { x: 200, y: 100, vx: 0, vy: 0, angle: 0 };
  step(state, 0.5, {});
  assert.ok(near(state.lander.vy, CFG.GRAVITY * 0.5));
  assert.ok(near(state.lander.y, 100 + 0.5 * CFG.GRAVITY * 0.25));

  const rising = newGame(rng);
  rising.terrain = flatTerrain({ x: 0, width: 640, y: 460 });
  rising.lander = { x: 200, y: 100, vx: 0, vy: 0, angle: 0 };
  step(rising, 0.5, { thrust: true });
  assert.ok(rising.lander.vy < 0, 'full thrust overcomes level-one gravity');
});

test('fuel burns only while thrusting and thrust stops at empty', () => {
  const state = newGame(rng);
  state.terrain = flatTerrain({ x: 0, width: 640, y: 460 });
  state.lander.y = 100;
  const initial = state.fuel;
  step(state, 1, {});
  assert.equal(state.fuel, initial);
  step(state, 1, { thrust: true });
  assert.ok(state.fuel < initial);
  state.fuel = 0;
  const vy = state.lander.vy;
  step(state, 0.2, { thrust: true });
  assert.ok(state.lander.vy > vy, 'empty tank leaves gravity in charge');
});

test('rotation steers thrust and horizontal travel wraps', () => {
  const state = newGame(rng);
  state.terrain = flatTerrain({ x: 0, width: 640, y: 460 });
  state.lander = { x: 639, y: 100, vx: 20, vy: 0, angle: 0 };
  step(state, 0.5, { right: true, thrust: true });
  assert.ok(state.lander.angle > 0);
  assert.ok(state.lander.vx > 20, 'rotated thrust has a rightward component');
  assert.ok(state.lander.x < 30, 'crossing the right edge wraps to the left');
});

test('injected rng produces stable terrain and a level narrows the pad', () => {
  const first = generateTerrain(1, rng);
  const second = generateTerrain(1, rng);
  assert.deepEqual(first, second);
  assert.ok(generateTerrain(4, rng).pad.width < first.pad.width);
  assert.equal(terrainHeight(first, first.pad.x + first.pad.width / 2), first.pad.y);
});

test('a pad touchdown within velocity and tilt limits settles safely', () => {
  const state = newGame(rng);
  state.terrain = flatTerrain();
  state.lander = { x: 320, y: 400 - CFG.LANDER_R - 0.1, vx: 12, vy: 25, angle: 0.04 };
  const events = step(state, 0.01, {});
  assert.ok(events.includes('landed'));
  assert.equal(state.phase, 'settling');
  assert.equal(landingAssessment(state).safe, true);
});

test('unsafe speed, tilt, or position turns contact into a terminal crash', () => {
  const state = newGame(rng);
  state.terrain = flatTerrain();
  state.lander = { x: 320, y: 400 - CFG.LANDER_R - 0.1, vx: CFG.SAFE_VX + 15, vy: 20, angle: 0 };
  const events = step(state, 0.01, {});
  assert.ok(events.includes('crash'));
  assert.equal(state.over, true);
  assert.equal(state.phase, 'crashed');
});

test('a successful settle advances level and refreshes a harder descent', () => {
  const state = newGame(rng);
  state.terrain = flatTerrain();
  state.lander = { x: 320, y: 400 - CFG.LANDER_R - 0.1, vx: 0, vy: 20, angle: 0 };
  step(state, 0.01, {}, rng);
  assert.equal(state.phase, 'settling');
  const score = state.score;
  const events = step(state, CFG.SETTLE_TIME + 0.01, {}, rng);
  assert.ok(events.includes('level-up'));
  assert.equal(state.level, 2);
  assert.ok(state.score >= score);
  assert.ok(state.fuel < CFG.FUEL);
});
