import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeInitials,
  qualifies,
  insertScore,
  topScore,
  MAX_ENTRIES,
} from '../shell/scores.js';

test('sanitizeInitials uppercases, strips non-letters, pads to 3', () => {
  assert.equal(sanitizeInitials('jk!'), 'JKA');
  assert.equal(sanitizeInitials('abcd'), 'ABC');
  assert.equal(sanitizeInitials(''), 'AAA');
  assert.equal(sanitizeInitials(null), 'AAA');
  assert.equal(sanitizeInitials('x1y2z3'), 'XYZ');
});

test('qualifies: empty and short tables accept any positive score', () => {
  assert.equal(qualifies([], 1), true);
  assert.equal(qualifies([{ initials: 'AAA', score: 10 }], 1), true);
});

test('qualifies: zero, negative, and non-finite scores never qualify', () => {
  assert.equal(qualifies([], 0), false);
  assert.equal(qualifies([], -5), false);
  assert.equal(qualifies([], NaN), false);
  assert.equal(qualifies([], Infinity), false);
});

test('qualifies: full table requires beating an existing score', () => {
  const full = [50, 40, 30, 20, 10].map((score) => ({ initials: 'AAA', score }));
  assert.equal(full.length, MAX_ENTRIES);
  assert.equal(qualifies(full, 10), false); // tie with the floor loses
  assert.equal(qualifies(full, 11), true);
  assert.equal(qualifies(full, 60), true);
});

test('insertScore sorts descending and truncates to max', () => {
  let list = [];
  for (const score of [30, 10, 50, 20, 40, 60]) {
    list = insertScore(list, { initials: 'jk', score });
  }
  assert.equal(list.length, MAX_ENTRIES);
  assert.deepEqual(
    list.map((e) => e.score),
    [60, 50, 40, 30, 20],
  );
  assert.ok(list.every((e) => e.initials === 'JKA'));
});

test('insertScore keeps earlier entry ahead on ties', () => {
  const first = insertScore([], { initials: 'AAA', score: 10 });
  const both = insertScore(first, { initials: 'BBB', score: 10 });
  assert.deepEqual(
    both.map((e) => e.initials),
    ['AAA', 'BBB'],
  );
});

test('topScore reads the head of the table', () => {
  assert.equal(topScore([]), 0);
  assert.equal(topScore([{ initials: 'AAA', score: 42 }]), 42);
});
