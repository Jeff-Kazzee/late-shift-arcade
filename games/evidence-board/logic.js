// EVIDENCE BOARD simulation — one theft case as plain serializable data.
//
// The generator works BACKWARD from a proven solution: it first picks the
// culprit, method, and motive, then writes the evidence — an alibi for every
// innocent suspect, a forensic card ruling out every wrong method, a
// background card ruling out every wrong motive. Elimination therefore always
// leaves exactly one consistent theory, which is what makes every seeded case
// honestly solvable rather than merely plausible.
//
// Rules of the file, same as every cartridge here:
// 1. No Math.random — a seed names one exact case (mulberry32).
// 2. No canvas, DOM, clock, or input. Player intent arrives as commands.
// 3. Time advances in fixed steps; seed + command log ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  CASE_SECONDS: 180, // the whole shift you get before the trail goes cold
  REVEAL_COST: 8, // chasing a lead costs legwork time off the same clock
  CREDIBILITY: 3, // wrong accusations the precinct tolerates

  // SCORE (the documented formula):
  //   won:  6000 base
  //         + floor(timeLeft) * 25        — fast work pays
  //         + unrevealed leads * 250      — winning on fewer reveals pays more
  //         - wrong accusations * 1500    — sloppy warrants are expensive
  //         floored at 0
  //   lost: 0 — a case you did not close scores nothing.
  SCORE_BASE: 6000,
  SCORE_SECOND: 25,
  SCORE_UNREVEALED: 250,
  PENALTY_WRONG: 1500,
};

export const SUSPECTS = Object.freeze(['ROOK', 'VERA', 'SILAS', 'MARLOW', 'IVY', 'DANTE']);
export const METHODS = Object.freeze(['STOLEN KEY', 'LOCKPICK', 'CROWBAR', 'FIRE ESCAPE']);
export const MOTIVES = Object.freeze(['DEBT', 'REVENGE', 'BLACKMAIL', 'COVER-UP']);

// Where each innocent suspect verifiably was. Assigned by the seeded rng, so
// the same seed deals the same alibis in the same order.
const ALIBIS = Object.freeze([
  'ON THE NIGHT BUS AT 2:10',
  'CLOSING THE DINER TILL 3',
  'IN THE ER WAITING ROOM',
  'LIVE ON A RADIO CALL-IN',
  'AT THE 24HR LAUNDROMAT',
  'PLAYING CARDS AT THE DOCK',
  'ASLEEP IN THE PAWNSHOP',
  'STUCK ON A STALLED TRAM',
]);

// One physical finding per method that rules that method out.
const METHOD_XS = Object.freeze([
  'KEY NEVER LEFT THE SAFE',
  'LOCK FACE UNSCRATCHED',
  'NO PRY MARKS ANYWHERE',
  'FIRE ESCAPE RUSTED SHUT',
]);

// One background finding per motive that rules that motive out.
const MOTIVE_XS = Object.freeze([
  'THE BOOKS BALANCE',
  'NO GRUDGE ON RECORD',
  'NO LETTERS, NO PHOTOS',
  'THE LEDGER HIDES NOTHING',
]);

// mulberry32: integer-only state, one division to produce the float.
// Identical on every engine, which is why a seed can name a case.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the deck backward from the solution. 12 cards: 5 alibis (everyone but
// the culprit), 3 forensic eliminations (every method but the real one),
// 3 background eliminations (every motive but the real one), and 1 witness
// sighting that points straight at the culprit — the jackpot lead.
export function buildCase(seed) {
  const rng = mulberry32(seed);
  const solution = {
    suspect: Math.floor(rng() * SUSPECTS.length),
    method: Math.floor(rng() * METHODS.length),
    motive: Math.floor(rng() * MOTIVES.length),
  };

  // Deal alibis without repeats: shuffle the template list, hand them out.
  const alibiOrder = ALIBIS.map((_, i) => i);
  for (let i = alibiOrder.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = alibiOrder[i];
    alibiOrder[i] = alibiOrder[j];
    alibiOrder[j] = swap;
  }

  const cards = [];
  let alibiAt = 0;
  for (let s = 0; s < SUSPECTS.length; s += 1) {
    if (s === solution.suspect) continue;
    cards.push({
      kind: 'alibi',
      subject: s,
      detail: ALIBIS[alibiOrder[alibiAt]],
      note: `CLEARS ${SUSPECTS[s]}`,
    });
    alibiAt += 1;
  }
  for (let m = 0; m < METHODS.length; m += 1) {
    if (m === solution.method) continue;
    cards.push({
      kind: 'method',
      subject: m,
      detail: METHOD_XS[m],
      note: `RULES OUT ${METHODS[m]}`,
    });
  }
  for (let m = 0; m < MOTIVES.length; m += 1) {
    if (m === solution.motive) continue;
    cards.push({
      kind: 'motive',
      subject: m,
      detail: MOTIVE_XS[m],
      note: `RULES OUT ${MOTIVES[m]}`,
    });
  }
  cards.push({
    kind: 'sighting',
    subject: solution.suspect,
    detail: 'SEEN AT THE SERVICE DOOR',
    note: `POINTS AT ${SUSPECTS[solution.suspect]}`,
  });

  // Shuffle board positions so the jackpot is never in the same corner twice.
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = cards[i];
    cards[i] = cards[j];
    cards[j] = swap;
  }
  cards.forEach((card, i) => {
    card.id = i;
    card.revealed = false;
  });

  return { solution, cards };
}

export function newCase(seed = 1) {
  const { solution, cards } = buildCase(seed >>> 0);
  return {
    seed: seed >>> 0,
    tick: 0,
    status: 'briefing', // briefing | running | won | lost
    failure: null, // discredited | cold
    timeLeft: CFG.CASE_SECONDS,
    credibility: CFG.CREDIBILITY,
    wrongAccusations: 0,
    reveals: 0,
    lastVerdict: null, // { suspect, method, motive, correct } after each accusation
    solution,
    cards,
  };
}

// --- Reading the board ------------------------------------------------------

export const cardById = (state, id) => state.cards.find((card) => card.id === id);

const revealedOf = (state, kind) => state.cards.filter((c) => c.revealed && c.kind === kind);

// Who could still have done it, on revealed evidence alone. A revealed
// sighting outranks elimination: it names the culprit outright.
export function candidateSuspects(state) {
  const seen = revealedOf(state, 'sighting');
  if (seen.length > 0) return [seen[0].subject];
  const cleared = new Set(revealedOf(state, 'alibi').map((c) => c.subject));
  return SUSPECTS.map((_, i) => i).filter((i) => !cleared.has(i));
}

export function candidateMethods(state) {
  const out = new Set(revealedOf(state, 'method').map((c) => c.subject));
  return METHODS.map((_, i) => i).filter((i) => !out.has(i));
}

export function candidateMotives(state) {
  const out = new Set(revealedOf(state, 'motive').map((c) => c.subject));
  return MOTIVES.map((_, i) => i).filter((i) => !out.has(i));
}

// --- Commands ----------------------------------------------------------------
//
// Every player action is one of these; the cartridge converts input into
// commands and tests replay a recorded log. Nothing else may touch state.

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'running';
  return true;
}

// Chasing a lead spends REVEAL_COST seconds of the same clock that is already
// running. A lead you cannot afford stays face down — the refusal is the
// signal that it is accusation time.
export function reveal(state, id) {
  if (state.status !== 'running') return false;
  const card = cardById(state, id);
  if (!card || card.revealed) return false;
  if (state.timeLeft <= CFG.REVEAL_COST) return false;
  card.revealed = true;
  state.reveals += 1;
  state.timeLeft -= CFG.REVEAL_COST;
  return true;
}

export function accuse(state, suspect, method, motive) {
  if (state.status !== 'running') return false;
  if (!Number.isInteger(suspect) || suspect < 0 || suspect >= SUSPECTS.length) return false;
  if (!Number.isInteger(method) || method < 0 || method >= METHODS.length) return false;
  if (!Number.isInteger(motive) || motive < 0 || motive >= MOTIVES.length) return false;

  const correct =
    (suspect === state.solution.suspect ? 1 : 0) +
    (method === state.solution.method ? 1 : 0) +
    (motive === state.solution.motive ? 1 : 0);
  state.lastVerdict = { suspect, method, motive, correct };

  if (correct === 3) {
    state.status = 'won';
    return true;
  }
  state.wrongAccusations += 1;
  state.credibility -= 1;
  if (state.credibility <= 0) {
    state.status = 'lost';
    state.failure = 'discredited';
  }
  return true;
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'reveal':
      return reveal(state, command.card);
    case 'accuse':
      return accuse(state, command.suspect, command.method, command.motive);
    default:
      return false;
  }
}

// --- The tick ----------------------------------------------------------------

export function step(state, dt = CFG.TICK) {
  const events = [];
  if (state.status !== 'running') return events;
  state.tick += 1;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.status = 'lost';
    state.failure = 'cold';
    events.push('case-cold');
    events.push('case-over');
  }
  return events;
}

// --- Score ---------------------------------------------------------------

export function scoreParts(state) {
  return {
    seconds: Math.max(0, Math.floor(state.timeLeft)),
    unrevealed: state.cards.filter((card) => !card.revealed).length,
    wrong: state.wrongAccusations,
  };
}

export function terminalScore(state) {
  if (state.status !== 'won') return 0;
  const p = scoreParts(state);
  const raw =
    CFG.SCORE_BASE +
    p.seconds * CFG.SCORE_SECOND +
    p.unrevealed * CFG.SCORE_UNREVEALED -
    p.wrong * CFG.PENALTY_WRONG;
  return Math.max(0, Math.round(raw));
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    failure: state.failure,
    score: terminalScore(state),
    wrongAccusations: state.wrongAccusations,
  };
}

// Shared score contract: closed cases rank ahead of blown ones, then score,
// then this game's stated tie-break — fewer wrong accusations.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return a.wrongAccusations - b.wrongAccusations;
}
