// High-score table logic (pure) + localStorage persistence (guarded).
// The pure functions never touch the DOM or storage, so node --test can
// import this module directly.

export const MAX_ENTRIES = 5;

// The most a single run can be worth anywhere a score travels — the table,
// the share artifact, a dare fragment. Far above any real cartridge economy;
// a bound on untrusted and runaway values, not a target.
export const MAX_SCORE = 999_999_999;

export function sanitizeInitials(raw) {
  const letters = String(raw ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters + 'AAA').slice(0, 3);
}

export function qualifies(list, score, max = MAX_ENTRIES) {
  if (!Number.isFinite(score) || score <= 0) return false;
  if (list.length < max) return true;
  return list.some((entry) => score > entry.score);
}

export function insertScore(list, entry, max = MAX_ENTRIES) {
  const next = [
    ...list,
    { initials: sanitizeInitials(entry.initials), score: entry.score },
  ];
  next.sort((a, b) => b.score - a.score);
  return next.slice(0, max);
}

export function topScore(list) {
  return list.length ? list[0].score : 0;
}

const keyFor = (gameId) => `late-shift-arcade:scores:${gameId}`;

// When localStorage is blocked (private mode, cookie lockdown), scores fall
// back to this in-memory table so the HI column still reflects the visit —
// entering initials must never save into the void.
const memStore = new Map();

export function loadScores(gameId) {
  try {
    const raw = globalThis.localStorage?.getItem(keyFor(gameId));
    if (raw == null) return memStore.get(gameId) ?? [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.score === 'number' && typeof e.initials === 'string',
    );
  } catch {
    return memStore.get(gameId) ?? [];
  }
}

export function saveScores(gameId, list) {
  memStore.set(gameId, list);
  try {
    globalThis.localStorage?.setItem(keyFor(gameId), JSON.stringify(list));
  } catch {
    // Storage blocked: the in-memory copy carries the session.
  }
}
