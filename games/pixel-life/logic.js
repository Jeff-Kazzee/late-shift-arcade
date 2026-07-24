// The life engine: draws events from the table, applies and clamps stat
// effects, gates on stats, and writes the obituary. Pure; rng injected.

import { EVENTS } from './events.js';

export const STATS = ['health', 'smarts', 'money', 'happiness'];
export const MAX_AGE = 110;

const clamp = (v) => Math.min(100, Math.max(0, v));

export function newLife() {
  const stats = { health: 70, smarts: 50, money: 20, happiness: 60 };
  return {
    age: 0,
    stats,
    peak: { ...stats },
    log: [],
    used: [],
    alive: true,
    cause: null,
    weirdest: null,
    weirdestRank: -1,
  };
}

export function eligible(event, state) {
  if (state.age < event.age[0] || state.age > event.age[1]) return false;
  if (event.once && state.used.includes(event.id)) return false;
  if (event.require) {
    for (const [stat, min] of Object.entries(event.require)) {
      if (state.stats[stat] < min) return false;
    }
  }
  if (event.forbid) {
    for (const [stat, max] of Object.entries(event.forbid)) {
      if (state.stats[stat] >= max) return false;
    }
  }
  return true;
}

function applyEvent(state, event) {
  for (const [stat, delta] of Object.entries(event.effects ?? {})) {
    state.stats[stat] = clamp(state.stats[stat] + delta);
    if (state.stats[stat] > state.peak[stat]) state.peak[stat] = state.stats[stat];
  }
  state.used.push(event.id);
  state.log.push({ age: state.age, id: event.id, text: event.text });
  const rank = event.weird ?? 0;
  if (rank > state.weirdestRank) {
    state.weirdestRank = rank;
    state.weirdest = event.text;
  }
}

function die(state, cause) {
  state.alive = false;
  state.cause = cause;
  state.log.push({ age: state.age, id: 'death', text: `You die at ${state.age}. Cause: ${cause}.` });
}

export function ageUp(state, rng = Math.random, events = EVENTS) {
  if (!state.alive) return [];
  state.age += 1;

  // the body keeps the score
  if (state.age > 40) state.stats.health = clamp(state.stats.health - 1);
  if (state.age > 65) state.stats.health = clamp(state.stats.health - 1);

  const drawn = [];
  const count = 1 + (rng() < 0.45 ? 1 : 0);
  const pool = events.filter((e) => eligible(e, state));
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(rng() * pool.length) % pool.length;
    const event = pool.splice(idx, 1)[0];
    applyEvent(state, event);
    drawn.push(event);
  }

  if (state.stats.health <= 0) {
    die(state, 'general disrepair');
  } else if (state.age >= MAX_AGE) {
    die(state, 'sheer stubbornness giving out');
  } else if (state.age > 72 && rng() < (state.age - 72) * 0.015) {
    die(state, 'old age, politely');
  }

  return drawn;
}

export function lifeScore(state) {
  return (
    state.age * 10 +
    STATS.reduce((sum, stat) => sum + state.peak[stat], 0)
  );
}

export function obituary(state) {
  return {
    age: state.age,
    cause: state.cause,
    peak: { ...state.peak },
    weirdest: state.weirdest ?? 'Nothing weird ever happened to you. That itself is weird.',
    years: state.log.length,
    score: lifeScore(state),
  };
}
