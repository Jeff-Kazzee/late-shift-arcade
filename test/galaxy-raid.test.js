import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  TYPES,
  newGame,
  waveLayout,
  slotPos,
  step,
  fire,
  movePlayer,
  movePlayerTo,
} from '../games/galaxy-raid/logic.js';

const rng = () => 0.99; // never rolls a dive-fire, picks last formation enemy

function settled() {
  // run a fresh game until the whole first wave sits in formation
  const state = newGame();
  state.diveTimer = 9999; // no dives during setup
  for (let i = 0; i < 60 * 8; i += 1) step(state, 1 / 60, rng);
  return state;
}

test('early waves are smaller; wave 3+ fields the full fleet', () => {
  const w1 = waveLayout(1).reduce((n, r) => n + r.count, 0);
  const w3 = waveLayout(3).reduce((n, r) => n + r.count, 0);
  assert.ok(w1 < w3);
  assert.equal(w3, 36);
  assert.ok(waveLayout(3).some((r) => r.type === 'boss'));
});

test('entering enemies arrive at their formation slots', () => {
  const state = settled();
  assert.ok(state.enemies.length > 0);
  for (const e of state.enemies) {
    assert.equal(e.mode, 'formation');
    const slot = slotPos(e, state.swayT);
    assert.ok(Math.abs(e.x - slot.x) < 1 && Math.abs(e.y - slot.y) < 1);
  }
});

test('fire caps at two bullets in the air', () => {
  const state = newGame();
  assert.equal(fire(state), true);
  assert.equal(fire(state), true);
  assert.equal(fire(state), false);
  assert.equal(state.bullets.length, CFG.MAX_BULLETS);
});

test('a formation kill scores the base value; a diving kill scores more', () => {
  const state = settled();
  const bee = state.enemies.find((e) => e.type === 'bee');
  state.bullets.push({ x: bee.x, y: bee.y });
  step(state, 1 / 60, rng);
  assert.equal(state.score, TYPES.bee.formationScore);

  const other = state.enemies.find((e) => e.type === 'bee');
  other.mode = 'diving';
  other.t = 0;
  other.diveFrom = { x: other.x, y: other.y };
  other.diveTargetX = 320;
  state.bullets.push({ x: other.x, y: other.y });
  step(state, 1 / 240, rng); // tiny step so the diver barely moves
  assert.equal(state.score, TYPES.bee.formationScore + TYPES.bee.divingScore);
});

test('a boss shrugs off the first hit and dies to the second', () => {
  const state = settled();
  state.wave = 3;
  const boss = state.enemies[0];
  boss.type = 'boss';
  boss.hp = TYPES.boss.hp;
  state.bullets.push({ x: boss.x, y: boss.y });
  const first = step(state, 1 / 60, rng);
  assert.ok(first.includes('enemy-hit'));
  assert.ok(state.enemies.includes(boss));
  state.bullets.push({ x: boss.x, y: boss.y });
  const second = step(state, 1 / 60, rng);
  assert.ok(second.includes('enemy-down'));
  assert.ok(!state.enemies.includes(boss));
});

test('an enemy bullet costs a life and grants invulnerability', () => {
  const state = settled();
  state.player.inv = 0;
  state.enemyBullets.push({ x: state.player.x, y: CFG.PLAYER_Y, vx: 0, vy: 100 });
  const events = step(state, 1 / 60, rng);
  assert.ok(events.includes('player-hit'));
  assert.equal(state.player.lives, CFG.LIVES - 1);
  assert.ok(state.player.inv > 0);

  state.enemyBullets.push({ x: state.player.x, y: CFG.PLAYER_Y, vx: 0, vy: 100 });
  const shielded = step(state, 1 / 60, rng);
  assert.ok(!shielded.includes('player-hit'), 'invulnerability holds');
});

test('the last life ends the game and the sky freezes', () => {
  const state = settled();
  state.player.inv = 0;
  state.player.lives = 1;
  state.enemyBullets.push({ x: state.player.x, y: CFG.PLAYER_Y, vx: 0, vy: 100 });
  const events = step(state, 1 / 60, rng);
  assert.ok(events.includes('game-over'));
  assert.equal(state.over, true);
  assert.deepEqual(step(state, 1 / 60, rng), []);
});

test('clearing a wave pays the bonus and fields a bigger one', () => {
  const state = settled();
  const firstWaveSize = state.enemies.length;
  state.enemies = [];
  const events = step(state, 1 / 60, rng);
  assert.ok(events.includes('wave-clear'));
  assert.equal(state.wave, 2);
  assert.ok(state.score >= CFG.WAVE_BONUS);
  assert.ok(state.enemies.length > firstWaveSize);
});

test('the dive timer sends a formation enemy at the player', () => {
  const state = settled();
  state.diveTimer = 0.001;
  movePlayerTo(state, 200);
  const events = step(state, 1 / 60, () => 0.0);
  assert.ok(events.includes('dive'));
  const diver = state.enemies.find((e) => e.mode === 'diving');
  assert.ok(diver);
  assert.equal(diver.diveTargetX, 200);
});

test('the player ship clamps to the screen', () => {
  const state = newGame();
  movePlayer(state, -1, 100);
  assert.equal(state.player.x, CFG.PLAYER_HALF);
  movePlayerTo(state, 10_000);
  assert.equal(state.player.x, CFG.W - CFG.PLAYER_HALF);
});
