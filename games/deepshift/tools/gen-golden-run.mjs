// Regenerates fixtures/golden-run.json: a canonical winning run log (from
// the scripted win policy) plus its expected terminal state. The replay
// test and the verifier CLI test both pin against this file.
//
//   node games/deepshift/tools/gen-golden-run.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRunLog } from '../sim/replay.js';
import { runWinPolicy } from './policies.mjs';

const seed = '00c0ffee00c0ffee';
const { state, log } = runWinPolicy(seed);
if (state.status !== 'won') throw new Error(`golden run must win, got ${state.status}`);

const fixture = {
  description: 'golden winning Dawn Run graybox: replay must reproduce `expected` exactly',
  runLog: makeRunLog(seed, log),
  expected: {
    tick: state.tick,
    status: state.status,
    endReason: state.endReason,
    score: state.score,
    bankedDay: state.bankedDay,
    bankedNight: state.bankedNight,
    hash: state.hash,
  },
};

const out = fileURLToPath(new URL('../fixtures/golden-run.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`);
process.stdout.write(`wrote ${out}: ${log.length} commands, final hash ${state.hash}\n`);
