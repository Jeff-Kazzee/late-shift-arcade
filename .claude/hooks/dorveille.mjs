#!/usr/bin/env node
// Dorveille enforcement hook. Judgment lives in skills/dorveille/SKILL.md;
// this only guarantees the wake-up call fires even when the model forgets.
// SKILL.md's own rule: mechanize a trigger once the hypnogram proves it was
// missed. Hypnogram s2026-07-24 47 (whole session ran undisciplined) is that
// proof. No bash, no shell payloads — plain node, the repo's only runtime.
//
// Registered for SessionStart only: that event fires on startup, resume, AND
// after compaction (source "compact"), and its stdout enters model context.
// PreCompact stdout does not reach the model, so it is not used here.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(rel) {
  try { return readFileSync(join(root, rel), 'utf8'); } catch { return ''; }
}

console.log(
  '[dorveille] SessionStart: this repo runs under the dorveille discipline ' +
  '(AGENTS.md). DAWN is mandatory — this fires on fresh starts, resumes, and ' +
  'post-compaction alike: read skills/dorveille/SKILL.md, ' +
  '.dorveille/calibration.md, and the active stream handoff in docs/handoffs/; ' +
  'deliver the morning brief before any work; nothing irreversible until then.'
);

const open = [...read('.dorveille/ledger.md').matchAll(/^- \[ \] .*$/gm)]
  .map((m) => m[0]);
if (open.length) {
  console.log('[dorveille] Open sleep debt:');
  for (const line of open) console.log('  ' + line);
} else {
  console.log('[dorveille] Ledger clean.');
}

const tail = read('.dorveille/hypnogram.md').trim().split('\n')
  .filter(Boolean).slice(-3);
if (tail.length) {
  console.log('[dorveille] Hypnogram tail:');
  for (const line of tail) console.log('  ' + line);
}
