#!/usr/bin/env node
// The DS-1a headless verifier (DS-0 D4 Gate 4, D1's acceptance proof).
//
// Takes a canonical run log (seed + command stream) and replays it to a
// final hash with NO renderer imported — sim/ only. A live run and this
// replay must agree byte-for-byte on the hash chain head.
//
//   node games/deepshift/tools/verify-run.mjs <run-log.json> [--expect-hash H]
//
// Exit codes: 0 verified (and matched --expect-hash when given), 1 mismatch
// or invalid log. Output: one JSON line on stdout.

import { readFileSync } from 'node:fs';
import { verifyRunLog } from '../sim/replay.js';

function fail(message) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) fail('usage: verify-run.mjs <run-log.json> [--expect-hash H]');
const expectIndex = args.indexOf('--expect-hash');
const expected = expectIndex === -1 ? null : args[expectIndex + 1];

let runLog;
try {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  // Accept a bare run log or a fixture that wraps one under `runLog`.
  runLog = parsed !== null && typeof parsed === 'object' && parsed.runLog !== undefined
    ? parsed.runLog
    : parsed;
} catch (error) {
  fail(`cannot read run log: ${error.message}`);
}

let state;
try {
  state = verifyRunLog(runLog);
} catch (error) {
  fail(`replay failed: ${error.message}`);
}

const result = {
  ok: expected === null || expected === state.hash,
  seed: state.seedHex,
  rulesetHash: state.rulesetHash,
  tick: state.tick,
  status: state.status,
  endReason: state.endReason,
  score: state.score,
  hash: state.hash,
};
if (expected !== null) result.expected = expected;
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);
