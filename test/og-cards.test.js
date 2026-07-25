// The social cards are committed PNGs pressed by tools/generate-og-cards.mjs.
// The pages point at assets/og/<slug>.png (test/site-pages.test.js pins the
// tags); this file pins the files themselves: every rack slug plus the
// site-wide card exists, is a real PNG, and is not a blank screenshot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cartridges } from '../games/registry.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIN_BYTES = 10 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const cardNames = ['site', ...cartridges.map((entry) => entry.manifest.slug)];

test('every rack game and the site have a committed og card PNG over 10KB', () => {
  for (const name of cardNames) {
    const path = `${root}assets/og/${name}.png`;
    assert.ok(existsSync(path), `missing assets/og/${name}.png — run: node tools/generate-og-cards.mjs`);
    const { size } = statSync(path);
    assert.ok(size > MIN_BYTES, `assets/og/${name}.png is ${size} bytes — a blank card, not a card`);
  }
});

test('every og card is a real PNG', () => {
  for (const name of cardNames) {
    const header = readFileSync(`${root}assets/og/${name}.png`).subarray(0, 8);
    assert.ok(header.equals(PNG_MAGIC), `assets/og/${name}.png lacks the PNG signature`);
  }
});
