import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  newGame,
  step,
  setMallet,
  cpuTarget,
  inGoalMouth,
} from '../games/air-hockey/logic.js';

function liveGame() {
  const state = newGame();
  state.serveIn = 0;
  return state;
}

test('friction bleeds puck speed over time', () => {
  const state = liveGame();
  state.puck.vx = 200; // slow enough to stay clear of the goal mouth
  for (let i = 0; i < 30; i += 1) step(state, 1 / 60);
  assert.ok(state.puck.vx < 200 * 0.9);
  assert.ok(state.puck.vx > 100, 'still gliding, friction is gentle');
});

test('side walls bounce the puck with restitution outside the goal mouth', () => {
  const state = liveGame();
  state.puck = { x: CFG.PUCK_R + 1, y: 60, vx: -300, vy: 0 }; // above the mouth
  const events = step(state, 1 / 60);
  assert.ok(events.includes('wall'));
  assert.ok(state.puck.vx > 0);
  assert.ok(Math.abs(state.puck.vx) < 300, 'restitution eats some speed');
});

test('puck through the left mouth is a CPU goal and resets for a serve', () => {
  const state = liveGame();
  state.puck = { x: -CFG.PUCK_R - 1, y: CFG.H / 2, vx: -300, vy: 0 };
  assert.ok(inGoalMouth(state.puck.y));
  const events = step(state, 1 / 60);
  assert.ok(events.includes('goal'));
  assert.equal(state.scores[1], 1);
  assert.ok(state.serveIn > 0);
  assert.equal(state.serveSide, 0, 'conceder receives the serve');
});

test('a moving mallet imparts momentum to a resting puck', () => {
  const state = liveGame();
  state.puck = { x: 200, y: 240, vx: 0, vy: 0 };
  state.mallets[0] = { x: 200 - CFG.MALLET_R - CFG.PUCK_R + 4, y: 240, vx: 500, vy: 0 };
  const events = step(state, 1 / 60);
  assert.ok(events.includes('hit'));
  assert.ok(state.puck.vx > 200, 'puck launched away from the strike');
});

test('puck speed is capped after a violent hit', () => {
  const state = liveGame();
  state.puck = { x: 200, y: 240, vx: 0, vy: 0 };
  state.mallets[0] = { x: 200 - CFG.MALLET_R - CFG.PUCK_R + 4, y: 240, vx: 5000, vy: 0 };
  step(state, 1 / 60);
  assert.ok(Math.hypot(state.puck.vx, state.puck.vy) <= CFG.MAX_PUCK_SPEED + 1e-9);
});

test('each mallet is confined to its own half', () => {
  const state = newGame();
  setMallet(state, 0, CFG.W - 10, 240, 1 / 60);
  assert.ok(state.mallets[0].x <= CFG.W / 2 - CFG.MALLET_R);
  setMallet(state, 1, 10, 240, 1 / 60);
  assert.ok(state.mallets[1].x >= CFG.W / 2 + CFG.MALLET_R);
});

test('seventh goal wins and the table freezes', () => {
  const state = liveGame();
  state.scores[0] = CFG.WIN - 1;
  state.puck = { x: CFG.W + CFG.PUCK_R + 1, y: CFG.H / 2, vx: 300, vy: 0 };
  const events = step(state, 1 / 60);
  assert.ok(events.includes('win'));
  assert.equal(state.winner, 0);
  assert.deepEqual(step(state, 1 / 60), []);
});

test('cpu defends its line when the puck is in the player half, chases when home', () => {
  const state = newGame();
  state.puck.x = 150;
  state.puck.y = 100;
  const defend = cpuTarget(state);
  assert.equal(defend.x, CFG.CPU_DEFENSE_X);
  state.puck.x = 500;
  const chase = cpuTarget(state);
  assert.ok(chase.x > 500, 'gets goal-side of the puck to strike leftward');
  assert.equal(chase.y, state.puck.y);
});
