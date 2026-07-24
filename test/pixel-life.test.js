import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS } from '../games/pixel-life/events.js';
import {
  newLife,
  eligible,
  ageUp,
  obituary,
  lifeScore,
  STATS,
  MAX_AGE,
} from '../games/pixel-life/logic.js';

test('the event table holds 60+ well-formed events with unique ids', () => {
  assert.ok(EVENTS.length >= 60, `only ${EVENTS.length} events`);
  const ids = new Set(EVENTS.map((e) => e.id));
  assert.equal(ids.size, EVENTS.length, 'duplicate event ids');
  for (const e of EVENTS) {
    assert.ok(Array.isArray(e.age) && e.age.length === 2 && e.age[0] <= e.age[1], `${e.id}: bad age range`);
    assert.ok(typeof e.text === 'string' && e.text.length > 10, `${e.id}: missing text`);
    for (const stat of Object.keys(e.effects ?? {})) {
      assert.ok(STATS.includes(stat), `${e.id}: unknown stat ${stat}`);
    }
    for (const stat of Object.keys({ ...e.require, ...e.forbid })) {
      assert.ok(STATS.includes(stat), `${e.id}: unknown gate stat ${stat}`);
    }
  }
});

test('eligibility gates on age, stats, and once-ness', () => {
  const state = newLife();
  state.age = 17;
  const scholarship = EVENTS.find((e) => e.id === 'scholarship');
  state.stats.smarts = 50;
  assert.equal(eligible(scholarship, state), false, 'smarts gate holds');
  state.stats.smarts = 70;
  assert.equal(eligible(scholarship, state), true);
  state.used.push('scholarship');
  assert.equal(eligible(scholarship, state), false, 'once means once');
  state.used = [];
  state.age = 30;
  assert.equal(eligible(scholarship, state), false, 'age range holds');
});

test('forbid gates exclude the too-competent', () => {
  const state = newLife();
  state.age = 30;
  const scam = EVENTS.find((e) => e.id === 'crypto-cousin');
  state.stats.smarts = 80;
  assert.equal(eligible(scam, state), false, 'smart enough to skip the dog picture');
  state.stats.smarts = 50;
  assert.equal(eligible(scam, state), true);
});

test('ageUp draws 1-2 events, applies effects, and clamps stats', () => {
  const state = newLife();
  const drawn = ageUp(state, () => 0.4); // 0.4 < 0.45 → two draws
  assert.equal(state.age, 1);
  assert.ok(drawn.length >= 1 && drawn.length <= 2);
  for (const stat of STATS) {
    assert.ok(state.stats[stat] >= 0 && state.stats[stat] <= 100);
  }
  assert.equal(state.log.length, drawn.length);
});

test('health hitting zero is fatal and writes the cause', () => {
  const state = newLife();
  state.stats.health = 1;
  state.age = 45; // aging drift alone will finish the job
  ageUp(state, () => 0.9);
  assert.equal(state.alive, false);
  assert.equal(state.cause, 'general disrepair');
  assert.equal(ageUp(state, () => 0.9).length, 0, 'the dead draw no events');
});

test('nobody outlives MAX_AGE', () => {
  const state = newLife();
  const rng = () => 0.999; // never rolls the mortality check, one event per year
  for (let i = 0; i < MAX_AGE + 10 && state.alive; i += 1) ageUp(state, rng);
  assert.equal(state.alive, false);
  assert.ok(state.age <= MAX_AGE);
});

test('the obituary remembers peaks, the weirdest event, and the score', () => {
  const state = newLife();
  state.stats.money = 90;
  state.peak.money = 90;
  state.age = 40;
  state.weirdest = 'Wrong Gary.';
  state.weirdestRank = 3;
  state.alive = false;
  state.cause = 'testing';
  const o = obituary(state);
  assert.equal(o.peak.money, 90);
  assert.equal(o.weirdest, 'Wrong Gary.');
  assert.equal(o.score, lifeScore(state));
  assert.ok(o.score >= 40 * 10);
});

test('a full simulated life is playable start to finish', () => {
  let seed = 12345;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const state = newLife();
  let years = 0;
  while (state.alive && years < 200) {
    ageUp(state, rng);
    years += 1;
  }
  assert.equal(state.alive, false);
  assert.ok(state.age > 5, 'made it out of kindergarten');
  assert.ok(state.log.length >= state.age, 'at least one event per year');
  const o = obituary(state);
  assert.ok(o.score > 0);
  assert.ok(typeof o.weirdest === 'string');
});
