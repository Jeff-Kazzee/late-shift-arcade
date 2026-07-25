// Headless replay + verifier proof (DS-0 D1 consequences, D4 Gates 1 & 4):
// same seed + same canonical command log => identical per-tick hash chain,
// with no renderer imported anywhere in the process.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { RULESET_HASH } from './sim/constants.js';
import { runReplay, verifyRunLog, makeRunLog } from './sim/replay.js';
import { normalizeLog, CMD } from './sim/commands.js';
import { runWinPolicy } from './tools/policies.mjs';

const goldenPath = fileURLToPath(new URL('./fixtures/golden-run.json', import.meta.url));
const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));

test('a live run and its replayed log produce the identical hash chain', () => {
  const seed = '5eed5eed5eed5eed';
  const live = runWinPolicy(seed);
  assert.equal(live.state.status, 'won');
  const chainA = [];
  const chainB = [];
  const a = runReplay(seed, live.log, { onTick: (s) => chainA.push(s.hash) });
  const b = runReplay(seed, live.log, { onTick: (s) => chainB.push(s.hash) });
  assert.equal(a.hash, live.state.hash);
  assert.equal(chainA.length, live.state.tick);
  assert.deepEqual(chainA, chainB); // every tick, not just the head
});

test('the golden run fixture replays to its recorded terminal state', () => {
  const state = verifyRunLog(golden.runLog);
  assert.equal(state.tick, golden.expected.tick);
  assert.equal(state.status, golden.expected.status);
  assert.equal(state.endReason, golden.expected.endReason);
  assert.equal(state.score, golden.expected.score);
  assert.equal(state.bankedDay, golden.expected.bankedDay);
  assert.equal(state.bankedNight, golden.expected.bankedNight);
  assert.equal(state.hash, golden.expected.hash);
});

test('any tampering with the log changes the terminal hash', () => {
  const tampered = golden.runLog.commands.map((c) => ({ ...c }));
  const mine = tampered.find((c) => c.type === CMD.MINE);
  mine.y += 1;
  const state = runReplay(golden.runLog.seed, tampered);
  assert.notEqual(state.hash, golden.expected.hash);
});

test('a different seed under the same log diverges', () => {
  const state = runReplay('0badc0de0badc0de', golden.runLog.commands);
  assert.notEqual(state.hash, golden.expected.hash);
});

test('commands after the run ends are dead weight, not divergence', () => {
  const padded = [...golden.runLog.commands,
    { t: 9000, p: 1, s: 0, type: CMD.BANK }];
  const state = runReplay(golden.runLog.seed, padded);
  assert.equal(state.hash, golden.expected.hash);
});

test('non-canonical logs are refused, never repaired', () => {
  assert.throws(() => normalizeLog([{ t: 0, p: 1, s: 0, type: CMD.MOVE, buttons: 0, yaw: 4096, pitch: 0 }]),
    /yaw off-lattice/);
  assert.throws(() => normalizeLog([{ t: 0, p: 1, s: 0, type: CMD.MOVE, buttons: 0, yaw: 1.5, pitch: 0 }]));
  assert.throws(() => normalizeLog([
    { t: 3, p: 1, s: 2, type: CMD.BANK },
    { t: 3, p: 1, s: 2, type: CMD.BANK },
  ]), /duplicate command key/);
  assert.throws(() => verifyRunLog({ ...golden.runLog, rulesetHash: '0000000000000000' }),
    /ruleset mismatch/);
  assert.throws(() => verifyRunLog({ ...golden.runLog, format: 'other' }), /unknown run format/);
});

test('makeRunLog stamps the current ruleset hash', () => {
  const log = makeRunLog('00c0ffee00c0ffee', []);
  assert.equal(log.rulesetHash, RULESET_HASH);
  assert.equal(log.format, 'deepshift-run-v1');
});

test('the verifier CLI replays byte-identically with no renderer imported', () => {
  const tool = fileURLToPath(new URL('./tools/verify-run.mjs', import.meta.url));
  const out = execFileSync(process.execPath, [tool, goldenPath, '--expect-hash', golden.expected.hash]);
  const result = JSON.parse(out.toString());
  assert.equal(result.ok, true);
  assert.equal(result.hash, golden.expected.hash);
  assert.equal(result.score, golden.expected.score);
  // A wrong expectation exits nonzero.
  assert.throws(() => execFileSync(
    process.execPath, [tool, goldenPath, '--expect-hash', '0000000000000000'],
  ));
});
