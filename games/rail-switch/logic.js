// RAIL SWITCH simulation — the whole shift as plain serializable data.
//
// Determinism is the point of this cartridge, so three rules are load-bearing
// rather than stylistic:
//
// 1. No `Math.random`. Scenarios come from a seeded PRNG (`mulberry32`), so a
//    seed names a shift exactly.
// 2. No canvas, DOM, clock, or input. Trains are one-dimensional — an edge id
//    and a distance along it. Every coordinate in here is authored map data
//    consumed only by the renderer.
// 3. Time advances in fixed `CFG.TICK` steps and player intent arrives as
//    serializable commands. Seed + command log ⇒ identical final state, which
//    is what makes replays and daily boards verifiable later.
//
// Avoid `Math.hypot` and trigonometry in this file: edge lengths are computed
// once with `Math.sqrt`, which is exactly specified, and braking curves use the
// same. Everything else is plain arithmetic on doubles.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  // Both numbers are measured, not guessed. A deliberately dim reference
  // dispatcher (test/rail-switch.test.js) that serialises the whole network
  // and never uses a bypass finishes 300 seeds with at most 46.1 delay-seconds
  // spent and at least 35.8 seconds spare. The budget and the clock sit just
  // outside that envelope: a simple policy always survives, a sloppy one does
  // not, and the -20/delay-second penalty does the rest of the work.
  SHIFT_SECONDS: 110,
  DELAY_BUDGET: 55, // delay-seconds before the controller pulls the shift
  OVERRIDES: 2,
  OVERRIDE_WINDOW: 1.6, // seconds of dropped interlocks per override

  LOCK_DIST: 46, // interlocking zone AND the signal's stand-off from a junction
  TRAIN_GAP: 24, // closer than this on one edge is a collision
  ACCEL: 90,
  DECEL: 150,

  FUEL_START: 20,
  FUEL_RUN: 1, // per second in motion
  FUEL_IDLE: 0.35, // per second stopped on the network

  TRAIN_COUNT: 11,
  REQUIRED_COUNT: 7,

  SCORE_DELIVERY: 10000,
  SCORE_SECOND: 50,
  SCORE_FUEL: 100,
  PENALTY_DELAY: 20,
  PENALTY_OVERRIDE: 2000,
};

// --- The network ----------------------------------------------------------
//
//   NORTH YARD ─ JN ────── bypass (slow, conflict-free) ─────────┐
//                └─ trunk ─┐                                     ├─ PLATFORM A
//                          TW ══ TRUNK (shared) ══ TE ───────────┤─ PLATFORM B
//                └─ trunk ─┘                                     ├─ PLATFORM C
//   SOUTH YARD ─ JS ────── bypass (slow, conflict-free) ─────────┘
//
// A bypass reaches exactly one platform, so anything else must fight for the
// trunk. That single shared segment is the whole game.

export const NODES = Object.freeze({
  'n-yard': { x: 46, y: 148, kind: 'yard', side: 'n', label: 'NORTH YARD' },
  's-yard': { x: 46, y: 324, kind: 'yard', side: 's', label: 'SOUTH YARD' },
  jn: {
    x: 166,
    y: 148,
    kind: 'switch',
    label: 'JN',
    options: ['n-trunk-in', 'n-bypass-a'],
    optionLabels: ['TRUNK', 'BYPASS'],
  },
  js: {
    x: 166,
    y: 324,
    kind: 'switch',
    label: 'JS',
    options: ['s-trunk-in', 's-bypass-a'],
    optionLabels: ['TRUNK', 'BYPASS'],
  },
  bn1: { x: 250, y: 96, kind: 'bend', next: 'n-bypass-b' },
  bn2: { x: 474, y: 96, kind: 'bend', next: 'n-bypass-c' },
  bs1: { x: 250, y: 376, kind: 'bend', next: 's-bypass-b' },
  bs2: { x: 474, y: 376, kind: 'bend', next: 's-bypass-c' },
  tw: { x: 296, y: 236, kind: 'merge', next: 'trunk' },
  te: {
    x: 430,
    y: 236,
    kind: 'switch',
    label: 'TE',
    options: ['exit-a', 'exit-b', 'exit-c'],
    optionLabels: ['A', 'B', 'C'],
  },
  pa: { x: 596, y: 148, kind: 'platform', platform: 'A' },
  pb: { x: 596, y: 236, kind: 'platform', platform: 'B' },
  pc: { x: 596, y: 324, kind: 'platform', platform: 'C' },
});

const EDGE_SPEC = {
  'n-approach': { from: 'n-yard', to: 'jn', limit: 82 },
  's-approach': { from: 's-yard', to: 'js', limit: 82 },
  'n-trunk-in': { from: 'jn', to: 'tw', limit: 82 },
  's-trunk-in': { from: 'js', to: 'tw', limit: 82 },
  'n-bypass-a': { from: 'jn', to: 'bn1', limit: 38 },
  'n-bypass-b': { from: 'bn1', to: 'bn2', limit: 38 },
  'n-bypass-c': { from: 'bn2', to: 'pa', limit: 38 },
  's-bypass-a': { from: 'js', to: 'bs1', limit: 38 },
  's-bypass-b': { from: 'bs1', to: 'bs2', limit: 38 },
  's-bypass-c': { from: 'bs2', to: 'pc', limit: 38 },
  trunk: { from: 'tw', to: 'te', limit: 82, shared: true },
  'exit-a': { from: 'te', to: 'pa', limit: 70 },
  'exit-b': { from: 'te', to: 'pb', limit: 70 },
  'exit-c': { from: 'te', to: 'pc', limit: 70 },
};

export const EDGES = Object.freeze(
  Object.fromEntries(
    Object.entries(EDGE_SPEC).map(([id, spec]) => {
      const a = NODES[spec.from];
      const b = NODES[spec.to];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return [id, Object.freeze({ id, ...spec, len: Math.sqrt(dx * dx + dy * dy) })];
    }),
  ),
);

// Two signals, each standing exactly LOCK_DIST short of the junction it
// protects. That coincidence is deliberate: a train held at the signal is
// parked just outside the interlocking, so the switch beyond it is free to
// throw. Holding a train is how you buy the right to change your mind, and
// delay-seconds are what it costs.
export const SIGNALS = Object.freeze({
  n: Object.freeze({ edge: 'n-approach', node: 'jn', label: 'HOLD NORTH' }),
  s: Object.freeze({ edge: 's-approach', node: 'js', label: 'HOLD SOUTH' }),
});

export const SWITCH_NODES = Object.freeze(['jn', 'js', 'te']);
export const PLATFORMS = Object.freeze(['A', 'B', 'C']);

export const signalPos = (edgeId) => EDGES[edgeId].len - CFG.LOCK_DIST;
const signalForEdge = (edgeId) =>
  Object.keys(SIGNALS).find((key) => SIGNALS[key].edge === edgeId) ?? null;
const onTrack = (train) => train.state === 'run' || train.state === 'stalled';

// --- Seeded scenario ------------------------------------------------------

// mulberry32: integer-only state, one division to produce the float. Identical
// on every engine, which is the whole reason a seed can name a shift.
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

// Arrivals come in bursts, not evenly spread. An even schedule would let a
// player park every switch on TRUNK and never make a decision; a burst forces
// a choice between holding one train (delay) and sending it the slow way
// round (fuel and clock).
export function buildSchedule(seed) {
  const rng = mulberry32(seed);

  const flags = Array.from({ length: CFG.TRAIN_COUNT }, (_, i) => i < CFG.REQUIRED_COUNT);
  for (let i = flags.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = flags[i];
    flags[i] = flags[j];
    flags[j] = swap;
  }

  const trains = [];
  let clock = 3;
  let burstLeft = 0;
  for (let i = 0; i < CFG.TRAIN_COUNT; i += 1) {
    if (i > 0) {
      if (burstLeft > 0) {
        clock += 1.8 + rng() * 1.8; // inside a burst
        burstLeft -= 1;
      } else {
        clock += 8 + rng() * 4; // between bursts
        burstLeft = 1 + Math.floor(rng() * 3);
      }
    }
    const required = flags[i];
    trains.push({
      id: i + 1,
      side: rng() < 0.5 ? 'n' : 's',
      dest: PLATFORMS[Math.floor(rng() * PLATFORMS.length)],
      required,
      value: required ? 0 : 2000 + Math.floor(rng() * 5) * 500,
      releaseAt: Math.round(clock * 100) / 100,
      state: 'yard',
      edge: null,
      dist: 0,
      speed: 0,
      fuel: CFG.FUEL_START,
      held: false,
      delivered: false,
      misrouted: false,
    });
  }
  return trains;
}

export function newShift(seed = 1) {
  return {
    seed: seed >>> 0,
    tick: 0,
    time: 0, // train time — frozen by the planning zoom
    timeLeft: CFG.SHIFT_SECONDS, // shift clock — never frozen
    status: 'briefing', // briefing | running | won | lost
    failure: null, // collision | stranded | delay-budget | timeout
    planning: false,
    switches: { jn: 0, js: 0, te: 1 },
    signals: { n: false, s: false },
    overrides: 0,
    overridesLeft: CFG.OVERRIDES,
    overrideUntil: -1,
    delay: 0,
    wreck: null, // { edge, dist } for the renderer's blast marker
    trains: buildSchedule(seed),
  };
}

// --- Routing --------------------------------------------------------------

export function nextEdgeFrom(state, nodeId) {
  const node = NODES[nodeId];
  if (!node) return null;
  if (node.kind === 'switch') return node.options[state.switches[nodeId]] ?? null;
  return node.next ?? null;
}

// Where a train on `edgeId` ends up if nobody touches another switch. The
// renderer lights this path so the board can be read at a glance instead of
// traversed in the player's head.
export function projectedRoute(state, edgeId, limit = 8) {
  if (!EDGES[edgeId]) return [];
  const path = [edgeId];
  let cursor = EDGES[edgeId].to;
  while (path.length < limit) {
    if (NODES[cursor]?.kind === 'platform') break;
    const next = nextEdgeFrom(state, cursor);
    if (!next) break;
    path.push(next);
    cursor = EDGES[next].to;
  }
  return path;
}

export function projectedPlatform(state, edgeId) {
  const path = projectedRoute(state, edgeId);
  if (path.length === 0) return null;
  return NODES[EDGES[path[path.length - 1]].to]?.platform ?? null;
}

// --- Interlocking ---------------------------------------------------------

export function overrideActive(state) {
  return state.time < state.overrideUntil;
}

// A switch is locked once a train is inside its interlocking zone. The zone
// starts exactly where the protecting signal stands, so a held train sits at
// `dist === signalPos` and does not lock anything — compare with `>` and the
// float equality never matters.
export function isLocked(state, nodeId) {
  if (NODES[nodeId]?.kind !== 'switch') return false;
  if (overrideActive(state)) return false;
  return state.trains.some((train) => {
    if (!onTrack(train)) return false;
    const edge = EDGES[train.edge];
    return edge.to === nodeId && train.dist > edge.len - CFG.LOCK_DIST;
  });
}

// --- Commands -------------------------------------------------------------
//
// Every player action is one of these. The cartridge converts input into
// commands; tests replay a recorded log. Nothing else may touch state.

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'running';
  return true;
}

export function setSwitch(state, nodeId, index) {
  const node = NODES[nodeId];
  if (state.status !== 'running' || node?.kind !== 'switch') return false;
  const target = ((index % node.options.length) + node.options.length) % node.options.length;
  if (target === state.switches[nodeId]) return false;
  if (isLocked(state, nodeId)) return false;
  state.switches[nodeId] = target;
  return true;
}

export function throwSwitch(state, nodeId) {
  const node = NODES[nodeId];
  if (node?.kind !== 'switch') return false;
  return setSwitch(state, nodeId, state.switches[nodeId] + 1);
}

export function setSignal(state, side, red) {
  if (state.status !== 'running' || !SIGNALS[side]) return false;
  const next = red === true;
  if (state.signals[side] === next) return false;
  state.signals[side] = next;
  return true;
}

export function setPlanning(state, on) {
  if (state.status !== 'running') return false;
  const next = on === true;
  if (state.planning === next) return false;
  state.planning = next;
  return true;
}

// The panic button: drop every interlock for a moment so a switch can be
// thrown under an approaching train. Costs 2,000 points and one of two.
export function useOverride(state) {
  if (state.status !== 'running' || state.overridesLeft <= 0) return false;
  state.overridesLeft -= 1;
  state.overrides += 1;
  state.overrideUntil = state.time + CFG.OVERRIDE_WINDOW;
  return true;
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'switch':
      return throwSwitch(state, command.node);
    case 'set-switch':
      return setSwitch(state, command.node, command.index);
    case 'signal':
      return setSignal(state, command.side, command.red);
    case 'plan':
      return setPlanning(state, command.on);
    case 'override':
      return useOverride(state);
    default:
      return false;
  }
}

// --- The tick -------------------------------------------------------------

function fail(state, reason, events) {
  if (state.status !== 'running') return;
  state.status = 'lost';
  state.failure = reason;
  state.planning = false;
  events.push(reason);
  events.push('shift-over');
}

function approachClear(state, edgeId) {
  return !state.trains.some((train) => onTrack(train) && train.edge === edgeId);
}

function enterEdge(train, edgeId, carry) {
  train.edge = edgeId;
  train.dist = Math.min(Math.max(carry, 0), EDGES[edgeId].len);
}

function arriveAtPlatform(state, train, node, events) {
  train.state = 'done';
  train.speed = 0;
  train.held = false;
  if (node.platform === train.dest) {
    train.delivered = true;
    events.push('deliver');
    return;
  }
  train.misrouted = true;
  events.push('misroute');
  if (train.required) fail(state, 'stranded', events);
}

function advanceTrain(state, train, dt, events) {
  const edge = EDGES[train.edge];

  // A red signal is only binding while the train is still short of it. Once
  // the points are under the wheels the decision has already been made — that
  // is the moment an override earns its 2,000 points.
  const side = signalForEdge(train.edge);
  const stop =
    side && state.signals[side] && train.dist <= signalPos(train.edge)
      ? signalPos(train.edge)
      : null;

  let allowed = edge.limit;
  if (stop !== null) {
    allowed = Math.min(allowed, Math.sqrt(2 * CFG.DECEL * Math.max(0, stop - train.dist)));
  }
  if (train.speed < allowed) train.speed = Math.min(allowed, train.speed + CFG.ACCEL * dt);
  else train.speed = Math.max(allowed, train.speed - CFG.DECEL * dt);

  train.dist += train.speed * dt;
  if (stop !== null && train.dist >= stop) {
    train.dist = stop;
    train.speed = 0;
  }
  train.held = train.speed === 0;

  train.fuel -= (train.held ? CFG.FUEL_IDLE : CFG.FUEL_RUN) * dt;
  if (train.fuel <= 0) {
    train.fuel = 0;
    train.state = 'stalled';
    train.speed = 0;
    events.push('stall');
    if (train.required) fail(state, 'stranded', events);
    return;
  }

  if (train.dist < edge.len) return;

  const carry = train.dist - edge.len;
  const node = NODES[edge.to];
  if (node.kind === 'platform') {
    arriveAtPlatform(state, train, node, events);
    return;
  }
  const next = nextEdgeFrom(state, edge.to);
  if (!next) {
    // Structurally unreachable with the authored map, but a dead end must
    // strand the train rather than silently delete it.
    train.dist = edge.len;
    train.speed = 0;
    train.state = 'stalled';
    events.push('stall');
    if (train.required) fail(state, 'stranded', events);
    return;
  }
  enterEdge(train, next, carry);
  train.speed = Math.min(train.speed, EDGES[next].limit);
}

function detectCollision(state, events) {
  const running = state.trains.filter(onTrack);
  for (let i = 0; i < running.length; i += 1) {
    for (let j = i + 1; j < running.length; j += 1) {
      const a = running[i];
      const b = running[j];
      if (a.edge !== b.edge) continue;
      if (Math.abs(a.dist - b.dist) >= CFG.TRAIN_GAP) continue;
      a.state = 'wrecked';
      b.state = 'wrecked';
      a.speed = 0;
      b.speed = 0;
      state.wreck = { edge: a.edge, dist: (a.dist + b.dist) / 2 };
      fail(state, 'collision', events);
      return true;
    }
  }
  return false;
}

export function step(state, dt = CFG.TICK) {
  const events = [];
  if (state.status !== 'running') return events;

  state.tick += 1;
  // The planning zoom freezes the trains but never the shift clock. Studying
  // the board is unlimited and always costs you 50 points a second.
  state.timeLeft -= dt;

  if (!state.planning) {
    state.time += dt;

    for (const train of state.trains) {
      if (train.state !== 'yard') continue;
      train.held = state.time >= train.releaseAt;
      if (!train.held) continue;
      state.delay += dt;
      // Yards release into an empty block, so a queued train can never be
      // rear-ended by the schedule. It just sits there burning delay.
      const approach = SIGNALS[train.side].edge;
      if (!approachClear(state, approach)) continue;
      train.state = 'run';
      train.held = false;
      enterEdge(train, approach, 0);
      events.push('depart');
    }

    for (const train of state.trains) {
      if (train.state !== 'run') continue;
      advanceTrain(state, train, dt, events);
      if (train.held) state.delay += dt;
    }

    if (detectCollision(state, events)) return events;
    if (state.status !== 'running') return events;

    if (state.delay > CFG.DELAY_BUDGET) {
      fail(state, 'delay-budget', events);
      return events;
    }
  }

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    fail(state, 'timeout', events);
    return events;
  }

  const busy = state.trains.some((train) => train.state === 'yard' || train.state === 'run');
  if (!busy) {
    const allRequired = state.trains.every((train) => !train.required || train.delivered);
    if (allRequired) {
      state.status = 'won';
      state.planning = false;
      events.push('shift-clear');
      events.push('shift-over');
    } else {
      fail(state, 'stranded', events);
    }
  }
  return events;
}

// --- Score ----------------------------------------------------------------

export function scoreParts(state) {
  const delivered = state.trains.filter((train) => train.delivered);
  return {
    required: delivered.filter((train) => train.required).length,
    cargo: delivered.reduce((sum, train) => sum + (train.required ? 0 : train.value), 0),
    seconds: Math.max(0, Math.floor(state.timeLeft)),
    fuel: Math.floor(delivered.reduce((sum, train) => sum + train.fuel, 0)),
    delaySeconds: Math.floor(state.delay),
    overrides: state.overrides,
  };
}

export function terminalScore(state) {
  if (state.failure === 'collision') return 0;
  const p = scoreParts(state);
  const raw =
    p.required * CFG.SCORE_DELIVERY +
    p.cargo +
    p.seconds * CFG.SCORE_SECOND +
    p.fuel * CFG.SCORE_FUEL -
    p.delaySeconds * CFG.PENALTY_DELAY -
    p.overrides * CFG.PENALTY_OVERRIDE;
  return Math.max(0, Math.round(raw));
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    failure: state.failure,
    score: terminalScore(state),
    overrides: state.overrides,
  };
}

// The shared score contract in the roadmap: completed runs rank ahead of
// failed ones, then score, then this game's stated tie-break — fewer
// overrides. Negative means `a` ranks first.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return a.overrides - b.overrides;
}

// --- Read models for the renderer ----------------------------------------

export function shiftProgress(state) {
  const required = state.trains.filter((train) => train.required);
  return {
    requiredDone: required.filter((train) => train.delivered).length,
    requiredTotal: required.length,
    cargoDone: state.trains.filter((train) => !train.required && train.delivered).length,
    cargoTotal: state.trains.length - required.length,
    waiting: state.trains.filter((train) => train.state === 'yard').length,
  };
}

export function yardQueue(state, side) {
  return state.trains.filter((train) => train.state === 'yard' && train.side === side);
}
