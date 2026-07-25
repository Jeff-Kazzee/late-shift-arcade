// The sim purity gate (DS-0 D5, GDD §13.2): sim/ must import cleanly in
// Node with zero browser globals, zero renderer knowledge, no wall clocks,
// no Math.random, and no implementation-defined transcendentals. Enforced
// by scanning every sim source file — a violation names its file and line.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SIM_DIR = fileURLToPath(new URL('./sim', import.meta.url));

function simFiles(dir = SIM_DIR) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...simFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const BANNED = [
  [/\bMath\.random\b/, 'Math.random'],
  [/\bMath\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|cbrt|hypot|fround)\b/,
    'Math transcendental (implementation-defined per engine)'],
  [/\bDate\b/, 'wall-clock time'],
  [/\bperformance\b/, 'performance timer'],
  [/\bwindow\b/, 'browser global window'],
  [/\bdocument\b/, 'browser global document'],
  [/\bnavigator\b/, 'browser global navigator'],
  [/\blocalStorage\b|\bindexedDB\b/, 'direct storage access (adapters only)'],
  [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/, 'scheduler access'],
  [/\brequire\s*\(/, 'CommonJS require'],
  [/\bfetch\s*\(/, 'network access'],
  // DS-1b: meshing moved to workers — worker plumbing is view-side
  // presentation and may never leak into the deterministic sim.
  [/\bWorker\b/, 'worker construction (presentation-side only)'],
  [/\bpostMessage\b|\bonmessage\b/, 'worker messaging (presentation-side only)'],
  [/\bSharedArrayBuffer\b/, 'shared memory (presentation-side only)'],
];

test('sim/ contains no randomness, clocks, browser globals, or libm', () => {
  const files = simFiles();
  assert.ok(files.length >= 10, 'expected the sim tree to be scanned');
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      for (const [pattern, why] of BANNED) {
        assert.ok(!pattern.test(lines[i]), `${file}:${i + 1} uses ${why}: ${lines[i].trim()}`);
      }
    }
  }
});

test('sim/ imports only sim/ — no three, no view/, no bare or builtin specifiers', () => {
  const importRe = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  for (const file of simFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importRe)) {
      const spec = match[1];
      assert.ok(spec.startsWith('./') || spec.startsWith('../'),
        `${file} imports non-relative specifier: ${spec}`);
      assert.ok(!/(^|\/)three(\.|\/|$)/.test(spec) && !spec.includes('/view/') && !spec.includes('/vendor/'),
        `${file} imports renderer code: ${spec}`);
      assert.ok(!spec.split('/').includes('..') || !spec.includes('/view'),
        `${file} escapes sim/ toward view/: ${spec}`);
    }
  }
});

test('sim/ never references the mesh worker pipeline by name', () => {
  // Belt and braces over the import scan: the worker files themselves must
  // be unreachable from sim/ even via computed specifiers.
  for (const file of simFiles()) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/mesh-worker|mesh-pool|mesh-snapshot|mesh-transports|render-set/.test(source),
      `${file} references worker/render-set code`);
  }
});

test('the mesh worker chain stays dependency-free: no three, no vendor, no sim, no DOM', () => {
  // The worker must remain a plain ES module over pure geometry code so it
  // loads fast, transfers cleanly, and can never smuggle sim truth.
  const chain = ['mesh-worker.js', 'mesh-snapshot.js', 'mesh-pool.js', 'mesher.js'];
  const importRe = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  for (const name of chain) {
    const file = fileURLToPath(new URL(`./view/${name}`, import.meta.url));
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importRe)) {
      const spec = match[1];
      assert.ok(spec.startsWith('./'), `${name} imports non-local specifier: ${spec}`);
      assert.ok(!/(^|\/)three(\.|\/|$)/.test(spec) && !spec.includes('vendor') && !spec.includes('sim'),
        `${name} imports outside the pure mesh chain: ${spec}`);
      const target = spec.replace('./', '');
      assert.ok(chain.includes(target), `${name} imports ${spec}, outside the audited chain`);
    }
    assert.ok(!/\bdocument\b|\bwindow\b/.test(source), `${name} touches the DOM`);
  }
});

test('the verifier imports sim/ only (no renderer, no vendor)', () => {
  const verifier = readFileSync(
    fileURLToPath(new URL('./tools/verify-run.mjs', import.meta.url)), 'utf8',
  );
  for (const match of verifier.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    assert.ok(spec.startsWith('node:') || spec.includes('/sim/'),
      `verify-run.mjs may import node builtins and sim/ only, found: ${spec}`);
  }
});
