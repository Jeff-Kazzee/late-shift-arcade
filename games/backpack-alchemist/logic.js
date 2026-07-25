// BACKPACK ALCHEMIST simulation — the whole night as plain serializable data.
//
// The one idea: the backpack IS the build. Ingredients have modest stats on
// their own; what they sit NEXT TO decides the fight. Packing is the circuit
// diagram, combat just runs the current through it.
//
// Rules of the file, same as every cartridge here:
// 1. No Math.random — a seed pre-rolls every draft and every creature up
//    front (mulberry32), so a seed names one exact night.
// 2. No canvas, DOM, clock, or input. Player intent arrives as commands.
// 3. Time advances in fixed steps; seed + command log ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  COLS: 4,
  ROWS: 4,
  ROUNDS: 6, // five creatures, then the Warden
  DRAFTS_PER_ROUND: 2,
  MAX_HP: 30,
  TOSS_HEAL: 2, // brewing a drafted ingredient into a quick tonic instead

  PULSE: 0.9, // seconds between combat exchanges
  GRACE: 1.2, // seconds before a new creature's first exchange
  ENRAGE_EVERY: 6, // pulses per +1 creature attack — no fight stalls forever

  // SCORE (the documented formula):
  //   fights cleared * 600
  //   + distinct positive reaction pairs in the final pack * 150
  //   + remaining HP * 40
  //   + 2000 boss bonus when the Warden falls
  // A dead alchemist keeps the fight and reaction points earned so far.
  SCORE_FIGHT: 600,
  SCORE_REACTION: 150,
  SCORE_HP: 40,
  SCORE_BOSS: 2000,
};

export const CELLS = CFG.COLS * CFG.ROWS;

// The ingredient catalog. `w`/`h` are footprint in cells before rotation.
export const TYPES = Object.freeze([
  { id: 0, name: 'EMBER MOSS', el: 'fire', w: 1, h: 1, atk: 2, armor: 0, heal: 0, weight: 3 },
  { id: 1, name: 'CINDER ROOT', el: 'fire', w: 2, h: 1, atk: 4, armor: 0, heal: 0, weight: 2 },
  { id: 2, name: 'STORM SPORE', el: 'bolt', w: 1, h: 1, atk: 2, armor: 0, heal: 0, weight: 3 },
  { id: 3, name: 'ARC FERN', el: 'bolt', w: 2, h: 1, atk: 3, armor: 0, heal: 0, weight: 2 },
  { id: 4, name: 'FROST CAP', el: 'frost', w: 1, h: 1, atk: 0, armor: 2, heal: 0, weight: 3 },
  { id: 5, name: 'GLACIER KELP', el: 'frost', w: 2, h: 1, atk: 0, armor: 3, heal: 0, weight: 2 },
  { id: 6, name: 'MOON SAGE', el: 'herb', w: 1, h: 1, atk: 0, armor: 0, heal: 2, weight: 3 },
  { id: 7, name: 'WILLOW BRAID', el: 'herb', w: 2, h: 1, atk: 0, armor: 0, heal: 3, weight: 1 },
  { id: 8, name: 'VITRIOL GLAND', el: 'volatile', w: 1, h: 1, atk: 6, armor: 0, heal: 0, weight: 2 },
]);

// What happens when two elements touch. Keyed by the sorted element pair,
// applied once per touching ITEM pair, however many cell edges they share.
export const REACTIONS = Object.freeze({
  'bolt+fire': { kind: 'PLASMA ARC', atk: 3, armor: 0, heal: 0, self: 0 },
  'frost+frost': { kind: 'ICE WALL', atk: 0, armor: 2, heal: 0, self: 0 },
  'frost+herb': { kind: 'TINCTURE', atk: 0, armor: 0, heal: 2, self: 0 },
  'fire+volatile': { kind: 'UNSTABLE MIX', atk: 5, armor: 0, heal: 0, self: 1 },
  'volatile+volatile': { kind: 'MELTDOWN', atk: 0, armor: 0, heal: 0, self: 4 },
  'fire+herb': { kind: 'SCORCHED', atk: 0, armor: 0, heal: -1, self: 0 },
});

// The night's roster. Bands, not fixed stats: the seed rolls inside them.
const ROSTER = Object.freeze([
  { name: 'GUTTER WISP', hp: [12, 16], atk: [2, 2], boss: false },
  { name: 'MIRE HOUND', hp: [20, 26], atk: [3, 3], boss: false },
  { name: 'BONE SWARM', hp: [30, 38], atk: [4, 4], boss: false },
  { name: 'LANTERN SHADE', hp: [42, 52], atk: [5, 6], boss: false },
  { name: 'TALLOW GOLEM', hp: [56, 68], atk: [6, 7], boss: false },
  { name: 'WARDEN OF THE STILL', hp: [76, 92], atk: [8, 9], boss: true },
]);

// mulberry32: integer-only state, one division to produce the float.
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

const rollBetween = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

function rollType(rng) {
  const total = TYPES.reduce((sum, type) => sum + type.weight, 0);
  let at = rng() * total;
  for (const type of TYPES) {
    at -= type.weight;
    if (at < 0) return type.id;
  }
  return TYPES.length - 1;
}

// Everything random is rolled here, up front: every creature and every draft
// the night will ever offer. After this, the simulation is pure consequence.
export function buildNight(seed) {
  const rng = mulberry32(seed);
  const enemies = ROSTER.map((spec) => ({
    name: spec.name,
    boss: spec.boss,
    maxHp: rollBetween(rng, spec.hp),
    atk: rollBetween(rng, spec.atk),
  }));
  const drafts = [];
  for (let i = 0; i < CFG.ROUNDS * CFG.DRAFTS_PER_ROUND; i += 1) {
    const options = [];
    while (options.length < 3) {
      const type = rollType(rng);
      if (!options.includes(type)) options.push(type);
    }
    drafts.push(options);
  }
  // Fairness guarantee: a pack with zero attack can never win a fight, so the
  // OPENING draft must offer at least one attacking ingredient. Later rounds
  // build on an armed pack; only the first offer can doom a night by itself.
  if (!drafts[0].some((type) => TYPES[type].atk > 0)) {
    drafts[0][0] = 0; // EMBER MOSS — cannot duplicate: any attacker present would have tripped the check
  }
  return { enemies, drafts };
}

export function newNight(seed = 1) {
  const { enemies, drafts } = buildNight(seed >>> 0);
  return {
    seed: seed >>> 0,
    tick: 0,
    status: 'briefing', // briefing | draft | place | combat | won | lost
    failure: null, // slain
    round: 0,
    draftsDone: 0,
    hp: CFG.MAX_HP,
    maxHp: CFG.MAX_HP,
    items: [], // { id, type, cells: [cellIndex, ...] }
    nextItemId: 1,
    draft: null, // the three type ids on offer
    holding: null, // type id picked and awaiting placement
    rot: 0, // 0 horizontal, 1 vertical (only matters for 1x2)
    enemy: null, // { name, boss, hp, maxHp, atk }
    pulses: 0,
    pulseTimer: 0,
    fightsWon: 0,
    tosses: 0,
    lastPulse: null, // { dealt, taken, selfHit, healed } for the renderer
    enemies,
    drafts,
  };
}

// --- Reading the pack -------------------------------------------------------

export const cellAt = (col, row) => row * CFG.COLS + col;

export function occupiedCells(state) {
  const owner = new Array(CELLS).fill(null);
  for (const item of state.items) {
    for (const cell of item.cells) owner[cell] = item.id;
  }
  return owner;
}

// Footprint of a type placed with its origin at `cell` under rotation `rot`,
// or null when it would leave the pack or wrap an edge.
export function footprint(type, cell, rot) {
  const spec = TYPES[type];
  if (!spec) return null;
  const w = rot === 1 ? spec.h : spec.w;
  const h = rot === 1 ? spec.w : spec.h;
  const col = cell % CFG.COLS;
  const row = Math.floor(cell / CFG.COLS);
  if (col < 0 || row < 0 || col + w > CFG.COLS || row + h > CFG.ROWS) return null;
  const cells = [];
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) cells.push(cellAt(col + dx, row + dy));
  }
  return cells;
}

export function canPlace(state, type, cell, rot) {
  const cells = footprint(type, cell, rot);
  if (!cells) return false;
  const owner = occupiedCells(state);
  return cells.every((c) => owner[c] === null);
}

// The circuit: base stats plus one reaction per touching item pair. This is
// the single source of truth the combat pulse, the HUD, and the score read.
export function computePack(state) {
  let atk = 0;
  let armor = 0;
  let heal = 0;
  let self = 0;
  for (const item of state.items) {
    const spec = TYPES[item.type];
    atk += spec.atk;
    armor += spec.armor;
    heal += spec.heal;
  }

  const owner = occupiedCells(state);
  const byId = new Map(state.items.map((item) => [item.id, item]));
  const seen = new Set();
  const reactions = [];
  for (let row = 0; row < CFG.ROWS; row += 1) {
    for (let col = 0; col < CFG.COLS; col += 1) {
      const here = owner[cellAt(col, row)];
      if (here === null) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (col + dx >= CFG.COLS || row + dy >= CFG.ROWS) continue;
        const there = owner[cellAt(col + dx, row + dy)];
        if (there === null || there === here) continue;
        const pairKey = here < there ? `${here}:${there}` : `${there}:${here}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const elA = TYPES[byId.get(here).type].el;
        const elB = TYPES[byId.get(there).type].el;
        const reaction = REACTIONS[[elA, elB].sort().join('+')];
        if (!reaction) continue;
        reactions.push({ kind: reaction.kind, a: here, b: there });
        atk += reaction.atk;
        armor += reaction.armor;
        heal += reaction.heal;
        self += reaction.self;
      }
    }
  }
  return { atk, armor, heal: Math.max(0, heal), self, reactions };
}

// Positive circuit pairs, the ones the score pays for. Meltdowns and scorch
// marks are consequences, not achievements.
export function positiveReactions(state) {
  return computePack(state).reactions.filter(
    (r) => r.kind !== 'MELTDOWN' && r.kind !== 'SCORCHED',
  ).length;
}

// --- Commands ----------------------------------------------------------------

const currentDraftIndex = (state) => state.round * CFG.DRAFTS_PER_ROUND + state.draftsDone;

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'draft';
  state.draft = state.drafts[0];
  return true;
}

export function pick(state, option) {
  if (state.status !== 'draft') return false;
  if (!Number.isInteger(option) || option < 0 || option > 2) return false;
  state.holding = state.draft[option];
  state.rot = 0;
  state.draft = null;
  state.status = 'place';
  return true;
}

export function rotate(state) {
  if (state.status !== 'place' || state.holding === null) return false;
  const spec = TYPES[state.holding];
  if (spec.w === spec.h) return false; // rotating a 1x1 is not an action
  state.rot = state.rot === 0 ? 1 : 0;
  return true;
}

function afterPlacement(state) {
  state.holding = null;
  state.rot = 0;
  state.draftsDone += 1;
  if (state.draftsDone >= CFG.DRAFTS_PER_ROUND) {
    startFight(state);
    return;
  }
  state.status = 'draft';
  state.draft = state.drafts[currentDraftIndex(state)];
}

export function place(state, cell) {
  if (state.status !== 'place' || state.holding === null) return false;
  if (!canPlace(state, state.holding, cell, state.rot)) return false;
  state.items.push({
    id: state.nextItemId,
    type: state.holding,
    cells: footprint(state.holding, cell, state.rot),
  });
  state.nextItemId += 1;
  afterPlacement(state);
  return true;
}

// The relief valve: any drafted ingredient can be brewed into a quick tonic
// instead of packed. A full pack is never a dead end — but tonics do not
// fight, and a pack of nothing but tonics is a short night.
export function toss(state) {
  if (state.status !== 'place' || state.holding === null) return false;
  state.hp = Math.min(state.maxHp, state.hp + CFG.TOSS_HEAL);
  state.tosses += 1;
  afterPlacement(state);
  return true;
}

function startFight(state) {
  const spec = state.enemies[state.round];
  state.enemy = { name: spec.name, boss: spec.boss, hp: spec.maxHp, maxHp: spec.maxHp, atk: spec.atk };
  state.pulses = 0;
  state.pulseTimer = -CFG.GRACE;
  state.status = 'combat';
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'pick':
      return pick(state, command.option);
    case 'rotate':
      return rotate(state);
    case 'place':
      return place(state, command.cell);
    case 'toss':
      return toss(state);
    default:
      return false;
  }
}

// --- The combat pulse --------------------------------------------------------

export const enrage = (state) => Math.floor(state.pulses / CFG.ENRAGE_EVERY);

function resolvePulse(state, events) {
  state.pulses += 1;
  const pack = computePack(state);

  // The alchemist strikes first: a dead creature never swings back.
  state.enemy.hp -= pack.atk;
  const dealt = pack.atk;
  if (state.enemy.hp <= 0) {
    state.enemy.hp = 0;
    state.fightsWon += 1;
    events.push('enemy-down');
    if (state.round >= CFG.ROUNDS - 1) {
      state.status = 'won';
      events.push('night-clear');
      events.push('night-over');
      return;
    }
    state.round += 1;
    state.draftsDone = 0;
    state.enemy = null;
    state.status = 'draft';
    state.draft = state.drafts[currentDraftIndex(state)];
    return;
  }

  // The creature swings, angrier every ENRAGE_EVERY pulses — armor can blunt
  // it, but no wall outlasts the night.
  const taken = Math.max(0, state.enemy.atk + enrage(state) - pack.armor);
  state.hp -= taken;
  if (taken > 0) events.push('player-hit');

  // Volatile chemistry burns the carrier, straight through armor.
  if (pack.self > 0) {
    state.hp -= pack.self;
    events.push('volatile');
  }

  const healed = Math.min(pack.heal, Math.max(0, state.maxHp - Math.max(0, state.hp)));
  if (state.hp > 0) state.hp = Math.min(state.maxHp, state.hp + pack.heal);

  state.lastPulse = { dealt, taken, selfHit: pack.self, healed: state.hp > 0 ? healed : 0 };

  if (state.hp <= 0) {
    state.hp = 0;
    state.status = 'lost';
    state.failure = 'slain';
    events.push('defeat');
    events.push('night-over');
  }
}

export function step(state, dt = CFG.TICK) {
  const events = [];
  if (state.status !== 'combat') return events;
  state.tick += 1;
  state.pulseTimer += dt;
  let guard = 0;
  while (state.pulseTimer >= CFG.PULSE && state.status === 'combat' && guard < 4) {
    state.pulseTimer -= CFG.PULSE;
    resolvePulse(state, events);
    guard += 1;
  }
  return events;
}

// --- Score ---------------------------------------------------------------

export function scoreParts(state) {
  return {
    fights: state.fightsWon,
    reactions: positiveReactions(state),
    hp: Math.max(0, state.hp),
    boss: state.status === 'won' ? 1 : 0,
  };
}

export function terminalScore(state) {
  const p = scoreParts(state);
  return Math.max(
    0,
    p.fights * CFG.SCORE_FIGHT +
      p.reactions * CFG.SCORE_REACTION +
      p.hp * CFG.SCORE_HP +
      p.boss * CFG.SCORE_BOSS,
  );
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    failure: state.failure,
    score: terminalScore(state),
    fightsWon: state.fightsWon,
    hp: Math.max(0, state.hp),
  };
}

// Shared score contract: finished nights rank ahead of fatal ones, then
// score, then this game's stated tie-break — more HP walked out with.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return b.hp - a.hp;
}
