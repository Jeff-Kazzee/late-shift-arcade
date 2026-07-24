import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  newGame,
  start,
  step,
  movePlayer,
  movePlayerTo,
  spawnTraffic,
  difficulty,
  terminalScore,
} from './logic.js';

const rng = () => 0.25;

function liveGame() {
  const state = newGame();
  start(state);
  return state;
}

test('ready state is safe until steering starts the run', () => {
  const state = newGame();
  step(state, 20, rng);
  assert.equal(state.ready, true);
  assert.equal(state.distance, 0);
  assert.equal(state.traffic.length, 0);
  start(state);
  step(state, 1, rng);
  assert.ok(state.distance > 0);
});

test('distance and speed use elapsed dt rather than frame count', () => {
  const oneStep = liveGame();
  const manySteps = liveGame();
  oneStep.spawnIn = Infinity;
  manySteps.spawnIn = Infinity;
  step(oneStep, 2, rng);
  for (let i = 0; i < 120; i += 1) step(manySteps, 1 / 60, rng);
  assert.ok(Math.abs(oneStep.distance - manySteps.distance) < 1.5);
  assert.ok(Math.abs(oneStep.score - manySteps.score) < 1);
});

test('steering is clamped to the road shoulders', () => {
  const state = newGame();
  movePlayer(state, -1, 100);
  assert.equal(state.player.x, CFG.ROAD_LEFT + CFG.PLAYER_HALF_W);
  movePlayerTo(state, 10000);
  assert.equal(state.player.x, CFG.ROAD_RIGHT - CFG.PLAYER_HALF_W);
});

test('spawn is deterministic and traffic plus pickups stay bounded', () => {
  const a = liveGame();
  const b = liveGame();
  const values = [0.51, 0.2, 0.7, 0.4, 0.1, 0.76, 0.3, 0.5, 0.6, 0.12];
  const scripted = () => {
    let index = 0;
    return () => values[index++ % values.length];
  };
  const rngA = scripted();
  const rngB = scripted();
  for (let n = 0; n < 30; n += 1) {
    a.spawnIn = 0;
    b.spawnIn = 0;
    step(a, 0.01, rngA);
    step(b, 0.01, rngB);
  }
  assert.deepEqual(a.traffic, b.traffic);
  assert.deepEqual(a.pickups, b.pickups);
  assert.ok(a.traffic.length <= CFG.MAX_TRAFFIC);
  assert.ok(a.pickups.length <= CFG.MAX_PICKUPS);
  while (spawnTraffic(a, rng));
  assert.equal(spawnTraffic(a, rng), false);
});

test('a crash costs one life, applies invulnerability and eventually ends the run', () => {
  const state = liveGame();
  const crash = () => state.traffic.push({ x: state.player.x, y: CFG.PLAYER_Y, speed: 0, hue: 0, passed: false });
  crash();
  const firstCrash = step(state, 1 / 60, rng);
  assert.ok(firstCrash.includes('crash'));
  assert.ok(!firstCrash.includes('pass'), 'a collision cannot also score a pass');
  assert.equal(state.player.lives, 2);
  crash();
  assert.ok(!step(state, 1 / 60, rng).includes('crash'), 'invulnerability absorbs the follow-up');
  state.player.inv = 0;
  crash();
  step(state, 1 / 60, rng);
  state.player.inv = 0;
  crash();
  const events = step(state, 1 / 60, rng);
  assert.ok(events.includes('game-over'));
  assert.equal(state.over, true);
  assert.ok(terminalScore(state) >= 0);
});

test('passed traffic awards score and near misses build then expire a combo', () => {
  const state = liveGame();
  state.traffic.push({ x: state.player.x + 60, y: CFG.PLAYER_Y + 31, speed: 0, hue: 0, passed: false });
  const first = step(state, 1 / 60, rng);
  assert.ok(first.includes('near-miss'));
  assert.equal(state.combo, 1);
  const score = state.score;
  state.traffic.push({ x: state.player.x + 58, y: CFG.PLAYER_Y + 31, speed: 0, hue: 1, passed: false });
  const second = step(state, 1 / 60, rng);
  assert.ok(second.includes('near-miss'));
  assert.equal(state.combo, 2);
  assert.ok(state.score > score + CFG.PASS_SCORE);
  state.spawnIn = Infinity;
  step(state, CFG.COMBO_WINDOW + 0.1, rng);
  assert.equal(state.combo, 0);
});

test('distance escalation raises road speed and tightens spawn pressure', () => {
  const state = liveGame();
  state.distance = 0;
  const early = difficulty(state);
  state.distance = 5400;
  const late = difficulty(state);
  assert.ok(late > early);
  state.spawnIn = 0;
  step(state, 1 / 60, rng);
  assert.ok(state.speed > CFG.BASE_SPEED);
  assert.ok(state.spawnIn < CFG.SPAWN_START + 0.18);
});
