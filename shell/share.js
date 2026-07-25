// The share loop, as pure functions: parse a dare out of a URL fragment,
// format a run into a pasteable artifact. No DOM, no storage, no network —
// node --test imports this module directly, and shell/player.js wires it to
// the page.
//
// A dare is a number, not a message board. The fragment carries one bounded
// non-negative integer and nothing else; anything that is not exactly that
// is rejected silently (tickets.md C-003 discipline: untrusted input never
// becomes markup, never gets echoed back).

import { MAX_SCORE } from './scores.js';

// '#dare=12400' -> 12400. Digits only, at most 12 of them, clamped to the
// same cap scores.js enforces on every score. '-5', '1e99', '<script>…',
// '#dare=', and a missing fragment all return null.
export function parseDare(hash) {
  const match = /^#dare=(\d{1,12})$/.exec(String(hash ?? ''));
  if (match === null) return null;
  return Math.min(Number(match[1]), MAX_SCORE);
}

// 12400 -> '12,400'. Hand-rolled so the artifact never depends on the
// device's locale: the text a player pastes is the text everyone reads.
export function formatScore(score) {
  return String(score).replace(/\B(?=(\d{3})+$)/g, ',');
}

export function dareBannerText(dare) {
  return `SOMEONE CLOCKED ${formatScore(dare)} ON THIS SHIFT. BEAT IT.`;
}

// The artifact: at most five short lines, night-shift voice, the link LAST
// so chat apps unfurl it. The dare fragment carries this run's score, so
// every share is itself a dare.
export function shareText({ title, score, url, personalBest = false, dare = null }) {
  const lines = [`🌙 ${String(title).toUpperCase()} — ${formatScore(score)}`];
  if (personalBest) lines.push('🏆 new personal best');
  if (dare !== null) lines.push(score > dare ? '⚡ dare beaten' : '🕯️ dare stands');
  lines.push('late shift survived. clock out proud.');
  lines.push(`beat it: ${url}#dare=${score}`);
  return lines.join('\n');
}
