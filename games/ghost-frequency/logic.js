// GHOST FREQUENCY simulation — one containment case as plain serializable data.
//
// Sound-off is the design constraint, not an afterthought: every clue in this
// simulation is a NUMBER the renderer can draw — signal clarity, three offset
// antenna readings, lock and containment meters, a waveform id. The cartridge
// may garnish those numbers with bleeps; it may never hide information in
// them. Microphone access is neither requested nor required, here or anywhere.
//
// Rules of the file, same as every cartridge here:
// 1. No Math.random — the ghost's berth, drift, jumps, and identity are all
//    rolled from the seed up front (mulberry32).
// 2. No canvas, DOM, clock, audio, or input. Player intent arrives as commands.
// 3. Time advances in fixed steps; seed + command log ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  DIAL_MIN: 30,
  DIAL_MAX: 130,
  START_FREQ: 80,

  FALLOFF: 12, // kHz over which the signal fades to nothing
  BAND: 1.5, // inside this of the ghost counts as on-signal
  ANTENNA_OFFSET: 4, // the triangulation rigs listen at −4 / 0 / +4 kHz

  LOCK_TIME: 2.5, // seconds on-signal to lock during the scan
  CONTAIN_TIME: 8, // seconds on-signal to complete containment
  CONTAIN_DRAIN: 0.5, // containment lost per off-signal second, relative

  HAUNT_RATE: 1 / 150, // the room sours on its own: full haunt in 150 quiet seconds
  OFFBAND_HAUNT: 0.02, // extra haunt per second spent off-signal during containment
  WRONG_ID_HAUNT: 0.12, // naming the wrong entity feeds it

  // SCORE (the documented formula):
  //   won:  3000 base
  //         + round((1 − haunt) * 5000)   — the calmer the room, the better
  //         + 1000 clean-sweep bonus when no wrong entity was named
  //   lost: 0 — a manifested ghost scores nothing.
  SCORE_BASE: 3000,
  SCORE_CALM: 5000,
  SCORE_CLEAN_ID: 1000,
};

// Four entities, each named by the shape its carrier wave draws on the scope.
// The waveform IS the identification — eyes only, ears optional.
export const ENTITIES = Object.freeze([
  { name: 'LANTERN WISP', wave: 'sine', tell: 'a smooth, even roll' },
  { name: 'GRID WALKER', wave: 'square', tell: 'hard flat steps' },
  { name: 'THE RASP', wave: 'saw', tell: 'a climb and a cliff' },
  { name: 'KNOCKER', wave: 'pulse', tell: 'silence, then spikes' },
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

const TAU = Math.PI * 2;

// Everything the ghost will ever do, rolled up front from the seed.
export function buildGhost(seed) {
  const rng = mulberry32(seed);
  const ghost = {
    base: 45 + rng() * 70, // somewhere in 45–115, clear of the dial stops
    // Drift is tuned to be chaseable: worst-case slope ~4 kHz/s against a
    // 9 kHz/s keyboard sweep and direct touch drag. Cornered, not uncatchable.
    a1: 1.6 + rng() * 1.0, // slow wander
    w1: TAU / (7 + rng() * 3),
    p1: rng() * TAU,
    a2: 0.5 + rng() * 0.4, // nervous shiver on top
    w2: TAU / (3 + rng() * 1.2),
    p2: rng() * TAU,
    entity: Math.floor(rng() * ENTITIES.length),
  };
  // Jumps are bounded CUMULATIVELY: each is checked against where the ghost
  // will actually be, not its original berth, so three same-way jumps can
  // never carry it off the dial into an uncontainable corner.
  const jumps = [];
  let landing = ghost.base;
  for (let i = 0; i < 3; i += 1) {
    let delta = (rng() < 0.5 ? -1 : 1) * (6 + rng() * 8);
    if (landing + delta < 40 || landing + delta > 120) delta = -delta;
    landing += delta;
    jumps.push({ at: 1.5 + i * 2 + rng() * 1.5, delta, done: false });
  }
  return { ghost, jumps };
}

export function newCase(seed = 1) {
  const { ghost, jumps } = buildGhost(seed >>> 0);
  return {
    seed: seed >>> 0,
    tick: 0,
    status: 'briefing', // briefing | scan | identify | contain | won | lost
    failure: null, // manifested
    time: 0,
    containClock: 0, // seconds spent in the containment phase
    freq: CFG.START_FREQ,
    ghost,
    jumps,
    lock: 0, // 0..1
    contain: 0, // 0..1
    haunt: 0, // 0..1 — the loss meter
    wrongIds: 0,
    guessed: [false, false, false, false],
  };
}

// --- Reading the band -------------------------------------------------------

// Where the ghost actually sits right now. It holds still for the scan and
// starts wandering once containment begins — cornered things move.
export function ghostFreq(state) {
  const g = state.ghost;
  const t = state.containClock;
  if (t === 0) return g.base;
  return g.base + g.a1 * Math.sin(g.w1 * t + g.p1) + g.a2 * Math.sin(g.w2 * t + g.p2);
}

// Signal clarity at an arbitrary dial position, 0..1. This one number drives
// the scope trace, the strength meter, and all three antenna bars.
export function clarityAt(state, freq) {
  return Math.max(0, 1 - Math.abs(freq - ghostFreq(state)) / CFG.FALLOFF);
}

export const clarity = (state) => clarityAt(state, state.freq);

export const inBand = (state) => Math.abs(state.freq - ghostFreq(state)) <= CFG.BAND;

// The triangulation rigs: one listening below the dial, one on it, one above.
// Whichever reads strongest is the way to turn — a compass drawn as bars.
export function antennas(state) {
  return [
    clarityAt(state, state.freq - CFG.ANTENNA_OFFSET),
    clarity(state),
    clarityAt(state, state.freq + CFG.ANTENNA_OFFSET),
  ];
}

// --- Commands ----------------------------------------------------------------

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'scan';
  return true;
}

export function setFreq(state, freq) {
  if (!['scan', 'identify', 'contain'].includes(state.status)) return false;
  if (typeof freq !== 'number' || !Number.isFinite(freq)) return false;
  state.freq = Math.min(CFG.DIAL_MAX, Math.max(CFG.DIAL_MIN, freq));
  return true;
}

export function identify(state, entity) {
  if (state.status !== 'identify') return false;
  if (!Number.isInteger(entity) || entity < 0 || entity >= ENTITIES.length) return false;
  if (state.guessed[entity]) return false;
  state.guessed[entity] = true;
  if (entity === state.ghost.entity) {
    state.status = 'contain';
    return true;
  }
  state.wrongIds += 1;
  state.haunt = Math.min(1, state.haunt + CFG.WRONG_ID_HAUNT);
  return true;
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'set-freq':
      return setFreq(state, command.freq);
    case 'identify':
      return identify(state, command.entity);
    default:
      return false;
  }
}

// --- The tick ----------------------------------------------------------------

function manifest(state, events) {
  state.haunt = 1;
  state.status = 'lost';
  state.failure = 'manifested';
  events.push('manifested');
  events.push('case-over');
}

export function step(state, dt = CFG.TICK) {
  const events = [];
  if (!['scan', 'identify', 'contain'].includes(state.status)) return events;

  state.tick += 1;
  state.time += dt;
  state.haunt = Math.min(1, state.haunt + CFG.HAUNT_RATE * dt);

  if (state.status === 'scan') {
    const wasLocked = state.lock;
    if (inBand(state)) state.lock = Math.min(1, state.lock + dt / CFG.LOCK_TIME);
    else state.lock = Math.max(0, state.lock - (dt / CFG.LOCK_TIME) * 1.5);
    if (wasLocked < 1 && state.lock >= 1) {
      state.status = 'identify';
      events.push('locked');
    }
  } else if (state.status === 'contain') {
    state.containClock += dt;
    for (const jump of state.jumps) {
      if (!jump.done && state.containClock >= jump.at) {
        jump.done = true;
        state.ghost.base += jump.delta;
        events.push('jump');
      }
    }
    if (inBand(state)) {
      state.contain = Math.min(1, state.contain + dt / CFG.CONTAIN_TIME);
      if (state.contain >= 1) {
        state.status = 'won';
        events.push('contained');
        events.push('case-over');
        return events;
      }
    } else {
      state.contain = Math.max(0, state.contain - (dt * CFG.CONTAIN_DRAIN) / CFG.CONTAIN_TIME);
      state.haunt = Math.min(1, state.haunt + CFG.OFFBAND_HAUNT * dt);
    }
  }

  if (state.haunt >= 1 && state.status !== 'lost') manifest(state, events);
  return events;
}

// --- Score ---------------------------------------------------------------

export function scoreParts(state) {
  return {
    calm: Math.max(0, 1 - state.haunt),
    cleanSweep: state.wrongIds === 0 ? 1 : 0,
  };
}

export function terminalScore(state) {
  if (state.status !== 'won') return 0;
  const p = scoreParts(state);
  return Math.max(
    0,
    CFG.SCORE_BASE + Math.round(p.calm * CFG.SCORE_CALM) + p.cleanSweep * CFG.SCORE_CLEAN_ID,
  );
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    failure: state.failure,
    score: terminalScore(state),
    wrongIds: state.wrongIds,
  };
}

// Shared score contract: contained cases rank ahead of manifested ones, then
// score, then this game's stated tie-break — fewer wrong identifications.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return a.wrongIds - b.wrongIds;
}
