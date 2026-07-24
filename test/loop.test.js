import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, STEP_MS } from '../shell/loop.js';

test('one 60Hz frame yields one step and a small remainder', () => {
  const { steps, acc } = advance(0, 16.7);
  assert.equal(steps, 1);
  assert.ok(acc >= 0 && acc < STEP_MS);
});

test('accumulator carries fractional time across frames', () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 60; i += 1) {
    const r = advance(acc, 16.6667);
    acc = r.acc;
    total += r.steps;
  }
  assert.ok(total >= 59 && total <= 61);
});

test('a fast frame can yield zero steps without losing time', () => {
  const { steps, acc } = advance(0, 8);
  assert.equal(steps, 0);
  assert.equal(acc, 8);
});

test('a huge frame is clamped and the backlog dropped, never a spiral', () => {
  const { steps, acc } = advance(0, 10_000);
  assert.equal(steps, 5); // maxSteps default
  assert.equal(acc, 0); // backlog dropped
});

test('negative frame time is treated as zero', () => {
  const { steps, acc } = advance(5, -100);
  assert.equal(steps, 0);
  assert.equal(acc, 5);
});
