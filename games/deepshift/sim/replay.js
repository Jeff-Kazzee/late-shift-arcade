// Headless replay: same seed + same canonical command log => identical
// per-tick hash chain. This module is what the verifier and the tests
// share; it imports sim/ only.

import { RULESET, RULESET_HASH } from './constants.js';
import { normalizeLog } from './commands.js';
import { createSim, tickSim } from './sim.js';

// Run a full log. Returns the final state; `onTick(state)` observes each
// tick boundary (used by tests to record the whole chain).
export function runReplay(seedHex, commands, { onTick = null } = {}) {
  const log = normalizeLog(commands);
  const state = createSim(seedHex);
  let i = 0;
  while (state.status === 'running' && state.tick < RULESET.runTicks) {
    const t = state.tick;
    const batch = [];
    while (i < log.length && log[i].t === t) {
      batch.push(log[i]);
      i += 1;
    }
    if (i < log.length && log[i].t < t) throw new Error('command log is not tick-ordered');
    tickSim(state, batch);
    if (onTick !== null) onTick(state);
  }
  return state;
}

// The canonical run-log envelope (what the verifier consumes).
export function makeRunLog(seedHex, commands) {
  return {
    format: 'deepshift-run-v1',
    seed: seedHex,
    rulesetHash: RULESET_HASH,
    commands: normalizeLog(commands),
  };
}

export function verifyRunLog(runLog) {
  if (runLog === null || typeof runLog !== 'object') throw new Error('run log must be an object');
  if (runLog.format !== 'deepshift-run-v1') throw new Error(`unknown run format: ${runLog.format}`);
  if (runLog.rulesetHash !== RULESET_HASH) {
    throw new Error(
      `ruleset mismatch: log ${runLog.rulesetHash}, sim ${RULESET_HASH} — a replay never runs under different rules`,
    );
  }
  return runReplay(runLog.seed, runLog.commands);
}
