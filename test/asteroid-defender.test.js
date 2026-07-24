import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  newGame,
  startWave,
  waveSpec,
  step,
  fire,
  blockX,
} from '../games/asteroid-defender/logic.js';

const rng = () => 0.5;

function quietGame() {
  const state = newGame(rng);
  state.pending = []; // control the sky manually
  return state;
}

test('waves scale up in count, speed, and ammo', () => {
  const w1 = waveSpec(1);
  const w4 = waveSpec(4);
  assert.ok(w4.count > w1.count);
  assert.ok(w4.speed > w1.speed);
  assert.ok(w4.ammo > w1.ammo);
});

test('firing consumes ammo and refuses when dry or aimed at the ground', () => {
  const state = quietGame();
  const ammo = state.ammo;
  assert.equal(fire(state, 300, 200), true);
  assert.equal(state.ammo, ammo - 1);
  assert.equal(fire(state, 300, CFG.GROUND - 5), false, 'ground-level shots refused');
  state.ammo = 0;
  assert.equal(fire(state, 300, 200), false);
});

test('a missile flies to its aim point and detonates there', () => {
  const state = quietGame();
  fire(state, 320, 240);
  let made = false;
  for (let i = 0; i < 120 && !made; i += 1) {
    step(state, 1 / 60, rng);
    made = state.blasts.length > 0;
  }
  assert.ok(made, 'blast created');
  assert.equal(state.missiles.length, 0);
  const blast = state.blasts[0];
  assert.ok(Math.hypot(blast.x - 320, blast.y - 240) < 1);
});

test('a blast kills an asteroid and the kill spawns a chain blast', () => {
  const state = quietGame();
  state.blasts.push({ x: 300, y: 200, r: 40, phase: 'hold', hold: 1 });
  state.asteroids.push({ x: 310, y: 210, vx: 0, vy: 50 });
  const events = step(state, 1 / 60, rng);
  assert.ok(events.includes('asteroid-down'));
  assert.equal(state.asteroids.length, 0);
  assert.equal(state.score, CFG.SCORE_ASTEROID);
  assert.equal(state.blasts.length, 2, 'original blast plus the chain blast');
});

test('the chain reaches asteroids the first blast could not touch', () => {
  const state = quietGame();
  state.blasts.push({ x: 300, y: 200, r: 30, phase: 'hold', hold: 5 });
  state.asteroids.push({ x: 320, y: 210, vx: 0, vy: 0 }); // inside first blast
  state.asteroids.push({ x: 380, y: 215, vx: 0, vy: 0 }); // only the chain reaches it
  step(state, 1 / 60, rng); // first dies, chain blast born at 320
  let chained = false;
  for (let i = 0; i < 60 && !chained; i += 1) {
    step(state, 1 / 60, rng);
    chained = state.asteroids.length === 0;
  }
  assert.ok(chained, 'second asteroid consumed by the growing chain blast');
  assert.equal(state.score, CFG.SCORE_ASTEROID * 2);
});

test('an asteroid that reaches a building levels it', () => {
  const state = quietGame();
  const targetX = blockX(2) + CFG.BLOCK_W / 2;
  state.asteroids.push({ x: targetX, y: CFG.GROUND - CFG.BLOCK_H - 5, vx: 0, vy: 400 });
  const events = step(state, 1 / 10, rng);
  assert.ok(events.includes('building-lost'));
  assert.equal(state.buildings[2], false);
});

test('losing all six blocks ends the game', () => {
  const state = quietGame();
  state.buildings = state.buildings.map(() => false);
  state.buildings[5] = true;
  const targetX = blockX(5) + CFG.BLOCK_W / 2;
  state.asteroids.push({ x: targetX, y: CFG.GROUND - CFG.BLOCK_H - 5, vx: 0, vy: 400 });
  const events = step(state, 1 / 10, rng);
  assert.ok(events.includes('game-over'));
  assert.equal(state.over, true);
});

test('clearing the sky pays survival and ammo bonuses, then the next wave arms', () => {
  const state = quietGame();
  state.ammo = 3;
  const events = step(state, 1 / 60, rng);
  assert.ok(events.includes('wave-clear'));
  assert.equal(
    state.score,
    6 * CFG.BONUS_BUILDING + 3 * CFG.BONUS_MISSILE,
  );
  let started = false;
  for (let i = 0; i < 400 && !started; i += 1) {
    started = step(state, 1 / 60, rng).includes('wave-start');
  }
  assert.ok(started);
  assert.equal(state.wave, 2);
  assert.equal(state.ammo, waveSpec(2).ammo);
});
