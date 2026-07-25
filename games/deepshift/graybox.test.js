// Gate 2 — the eight-minute graybox, headless (DS-0 D4): one resource
// (fieldstone), one enemy (the Hollowed), day/night, mine/place, a quota
// win and both loss modes, proven winnable AND losable across seeds by
// scripted policies. Score formula per README.md §Score.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RULESET } from './sim/constants.js';
import { floorDiv, FP_ONE, FP_HALF } from './sim/math/fixed.js';
import { createSim, tickSim, snapshot, isNight, PLAYER_ID } from './sim/sim.js';
import { CMD } from './sim/commands.js';
import { runWinPolicy, runIdlePolicy, runTimeoutPolicy } from './tools/policies.mjs';

const SEEDS = ['00c0ffee00c0ffee', '0badc0de0badc0de', 'deadbeefcafef00d'];

function expectedScore(state) {
  let score = state.bankedDay * RULESET.scorePerBankedDay
    + state.bankedNight * RULESET.scorePerBankedNight
    + floorDiv(state.tick, RULESET.tickHz) * RULESET.scorePerSurvivedSecond;
  if (state.status === 'won') score += RULESET.scoreWinBonus;
  return score;
}

test('the graybox is winnable across seeds (scripted miner-banker)', () => {
  for (const seed of SEEDS) {
    const { state } = runWinPolicy(seed);
    assert.equal(state.status, 'won', seed);
    assert.equal(state.endReason, 'quota-banked', seed);
    assert.ok(state.bankedDay + state.bankedNight >= RULESET.fieldstoneQuota, seed);
    assert.equal(state.score, expectedScore(state), seed);
    assert.ok(state.tick < RULESET.runTicks, seed);
  }
});

test('the graybox is losable by death: the night finds an idle player', () => {
  for (const seed of SEEDS) {
    const { state } = runIdlePolicy(seed);
    assert.equal(state.status, 'lost', seed);
    assert.equal(state.endReason, 'death', seed);
    assert.ok(state.tick >= RULESET.dayTicks, `died at night, not by day (${seed})`);
    assert.equal(state.player.hp, 0, seed);
    assert.equal(state.score, expectedScore(state), seed);
  }
});

test('the graybox is losable by timeout: a sealed shaft survives to dawn unpaid', () => {
  const { state } = runTimeoutPolicy(SEEDS[0]);
  assert.equal(state.status, 'lost');
  assert.equal(state.endReason, 'dawn-timeout');
  assert.equal(state.tick, RULESET.runTicks);
  assert.ok(state.player.hp > 0, 'the shaft kept the Hollowed out');
});

test('day/night cycle: spawns only at night, and the clock is the ruleset', () => {
  assert.ok(!isNight(0));
  assert.ok(!isNight(RULESET.dayTicks - 1));
  assert.ok(isNight(RULESET.dayTicks));
  assert.ok(isNight(RULESET.runTicks - 1));
  const { state } = runIdlePolicy(SEEDS[0]);
  let earliestSpawn = Infinity;
  for (const id of Object.keys(state.entities)) {
    earliestSpawn = Math.min(earliestSpawn, state.entities[id].spawnTick);
  }
  assert.ok(earliestSpawn >= RULESET.dayTicks, 'no Hollowed walked in daylight');
});

test('night banking pays 1.5x (the ranked knob, integer form)', () => {
  const state = createSim(SEEDS[0]);
  // White-box: state is plain data (D2). Warp to night, hand the player
  // fieldstone, stand at spawn (the cache is in reach), and bank.
  state.tick = RULESET.dayTicks;
  state.player.inventory.fieldstone = 4;
  tickSim(state, [{ t: RULESET.dayTicks, p: PLAYER_ID, s: 0, type: CMD.BANK }]);
  assert.equal(state.bankedNight, 4);
  assert.equal(state.bankedDay, 0);
  // 4 night stones at 150 vs 4 day stones at 100.
  assert.equal(4 * RULESET.scorePerBankedNight, 600);
  assert.equal(4 * RULESET.scorePerBankedDay, 400);
});

test('mine and place round-trip through inventory and the world', () => {
  const state = createSim(SEEDS[0]);
  const snap0 = snapshot(state);
  const px = floorDiv(snap0.player.x, FP_ONE);
  const py = floorDiv(snap0.player.y, FP_ONE);
  const pz = floorDiv(snap0.player.z, FP_ONE);
  // Mine the dirt underfoot, then place it back one cell in front.
  tickSim(state, [{ t: 0, p: PLAYER_ID, s: 0, type: CMD.MINE, x: px, y: py - 1, z: pz }]);
  assert.equal(state.player.inventory.dirt, 1);
  const target = { x: px + 1, y: py + 1, z: pz };
  tickSim(state, [{ t: 1, p: PLAYER_ID, s: 0, type: CMD.PLACE, ...target, block: 'dirt' }]);
  assert.equal(state.player.inventory.dirt, 0);
  const snap = snapshot(state);
  assert.equal(snap.tick, 2);
  // Placement must never intersect the player: placing into the feet cell
  // is a deterministic no-op.
  state.player.inventory.dirt = 1;
  const feet = { x: px, y: py, z: pz };
  const before = state.hash;
  tickSim(state, [{ t: 2, p: PLAYER_ID, s: 0, type: CMD.PLACE, ...feet, block: 'dirt' }]);
  assert.equal(state.player.inventory.dirt, 1, 'no-op placement consumed nothing');
  assert.notEqual(state.hash, before, 'the hash chain still advanced');
});

test('the snapshot is a plain-data WorldView: JSON-safe and renderer-free', () => {
  const { state } = runWinPolicy(SEEDS[0]);
  const snap = snapshot(state);
  const roundTrip = JSON.parse(JSON.stringify(snap));
  assert.deepEqual(roundTrip, snap);
  assert.equal(snap.status, 'won');
  assert.equal(snap.quota, RULESET.fieldstoneQuota);
  assert.ok(snap.player.hp > 0);
});
