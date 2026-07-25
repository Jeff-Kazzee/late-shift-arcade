// The share loop's pure core: dare parsing is the only place the URL
// fragment (untrusted, attacker-shaped by definition) becomes data, and the
// artifact is the only text a player pastes into the world. Both are pinned
// here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDare, formatScore, dareBannerText, shareText } from '../shell/share.js';
import { MAX_SCORE } from '../shell/scores.js';

test('parseDare accepts a plain bounded non-negative integer', () => {
  assert.equal(parseDare('#dare=12400'), 12400);
  assert.equal(parseDare('#dare=0'), 0);
  assert.equal(parseDare('#dare=1'), 1);
  assert.equal(parseDare(`#dare=${MAX_SCORE}`), MAX_SCORE);
});

test('parseDare clamps in-range digit strings to the scores.js cap', () => {
  assert.equal(parseDare('#dare=999999999999'), MAX_SCORE); // 12 digits, over cap
  assert.equal(parseDare(`#dare=${MAX_SCORE + 1}`), MAX_SCORE);
});

test('parseDare rejects markup silently (#dare=<script>)', () => {
  assert.equal(parseDare('#dare=<script>alert(1)</script>'), null);
  assert.equal(parseDare('#dare=12400<script>'), null);
});

test('parseDare rejects negative values (#dare=-5)', () => {
  assert.equal(parseDare('#dare=-5'), null);
});

test('parseDare rejects exponent and non-integer forms (#dare=1e99)', () => {
  assert.equal(parseDare('#dare=1e99'), null);
  assert.equal(parseDare('#dare=1.5'), null);
  assert.equal(parseDare('#dare=0x10'), null);
  assert.equal(parseDare('#dare=Infinity'), null);
});

test('parseDare rejects oversize digit strings and junk shapes', () => {
  assert.equal(parseDare('#dare=9999999999999'), null); // 13 digits: over the parse bound
  assert.equal(parseDare('#dare='), null);
  assert.equal(parseDare('#dare=12 400'), null);
  assert.equal(parseDare('#dare=12400&x=1'), null);
  assert.equal(parseDare('#other=5'), null);
  assert.equal(parseDare(''), null);
  assert.equal(parseDare(null), null);
  assert.equal(parseDare(undefined), null);
});

test('formatScore groups thousands without touching small numbers', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(999), '999');
  assert.equal(formatScore(12400), '12,400');
  assert.equal(formatScore(999999999), '999,999,999');
});

test('the dare banner is the fixed sentence around the number', () => {
  assert.equal(dareBannerText(12400), 'SOMEONE CLOCKED 12,400 ON THIS SHIFT. BEAT IT.');
});

const base = {
  title: 'Vault Heist',
  score: 12400,
  url: 'https://jeff-kazzee.github.io/late-shift-arcade/games/vault-heist/',
};

test('the plain artifact is three lines with the link last', () => {
  const text = shareText(base);
  assert.equal(text, [
    '🌙 VAULT HEIST — 12,400',
    'late shift survived. clock out proud.',
    'beat it: https://jeff-kazzee.github.io/late-shift-arcade/games/vault-heist/#dare=12400',
  ].join('\n'));
});

test('a personal best adds exactly one line, above the sign-off', () => {
  const lines = shareText({ ...base, personalBest: true }).split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[1], '🏆 new personal best');
  assert.ok(lines.at(-1).startsWith('beat it: '));
});

test('a dare run reports beaten or standing, session-local input only', () => {
  assert.ok(shareText({ ...base, dare: 9000 }).includes('⚡ dare beaten'));
  assert.ok(shareText({ ...base, dare: 20000 }).includes('🕯️ dare stands'));
  assert.ok(shareText({ ...base, dare: 12400 }).includes('🕯️ dare stands')); // a tie does not beat the dare
});

test('the artifact never exceeds five lines and always ends with the URL', () => {
  const text = shareText({ ...base, personalBest: true, dare: 9000 });
  const lines = text.split('\n');
  assert.equal(lines.length, 5);
  assert.equal(
    lines.at(-1),
    'beat it: https://jeff-kazzee.github.io/late-shift-arcade/games/vault-heist/#dare=12400',
  );
  assert.ok(!text.includes('#dare=') || lines.at(-1).includes('#dare=12400'));
});
