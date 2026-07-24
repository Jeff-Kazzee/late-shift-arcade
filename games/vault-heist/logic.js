// VAULT HEIST — pure simulation. No canvas, no DOM, no clock, no Math.random.
//
// The whole game rests on one promise: what the plan overlay shows you is what
// the turn does. That promise is kept structurally, not by discipline —
// `resolveTurn` is `applyProjection(projectTurn(state, orders))`, so the
// preview and the resolution are literally the same computation. There is no
// second code path that could drift.
//
// The consequence is deliberate: a careful player is never surprised into a
// capture. The game is not "guess the guard", it is "spend eighteen turns, four
// tools and three people well". Loss comes from the shift clock, the lockdown,
// and the noise you made two turns ago — never from hidden information.

// --- Seeded randomness ------------------------------------------------------

// mulberry32: 32 bits of state, identical across engines, no ambient entropy.
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

export const CFG = Object.freeze({
  TURN_LIMIT: 16,
  LOCKDOWN_TURNS: 5,
  CAMERA_EMP_TURNS: 3,
  LIGHTS_OUT_TURNS: 3,
  DRILL_TURNS: 2,
  SCORE_PER_LOOT: 10,
  SCORE_PER_CREW: 50000,
  SCORE_PER_OBJECTIVE: 20000,
  SCORE_PER_UNUSED_TOOL: 5000,
  SCORE_PER_TURN: -2000,
  SCORE_PER_ALARM: -25000,
});

// --- The vault --------------------------------------------------------------
//
// One authored floorplan (ticket G-016). Seeds vary guard phase, loot values
// and whether the target survives a breaching charge — never the walls, so a
// player who learns this building keeps that knowledge.
//
// `col`/`row` are the renderer's 6x3 lattice. Logic never reads them.

export const ROOMS = Object.freeze([
  { id: 'alley', name: 'ALLEY', col: 0, row: 0, cover: true, extraction: true },
  { id: 'loading', name: 'LOADING', col: 1, row: 0, cover: true },
  { id: 'archive', name: 'ARCHIVE', col: 2, row: 0, cover: true },
  { id: 'gallery', name: 'GALLERY', col: 3, row: 0, cover: true },
  { id: 'office', name: 'OFFICE', col: 4, row: 0, cover: true },
  { id: 'stair', name: 'STAIR', col: 5, row: 0, cover: true },
  { id: 'street', name: 'STREET', col: 0, row: 1, cover: true, start: true },
  { id: 'hallw', name: 'HALL W', col: 1, row: 1, cover: false },
  { id: 'atrium', name: 'ATRIUM', col: 2, row: 1, cover: false },
  { id: 'halle', name: 'HALL E', col: 3, row: 1, cover: false },
  { id: 'security', name: 'SECURITY', col: 4, row: 1, cover: false, console: 'cameras' },
  { id: 'landing', name: 'LANDING', col: 5, row: 1, cover: true },
  { id: 'server', name: 'SERVER', col: 1, row: 2, cover: true },
  { id: 'lobby', name: 'LOBBY', col: 2, row: 2, cover: false },
  { id: 'vault', name: 'VAULT', col: 3, row: 2, cover: true },
  { id: 'maint', name: 'MAINT', col: 4, row: 2, cover: true, console: 'lights' },
]);

// `vault` is the one door that starts locked; `vent` is passable only by crew
// with the vents ability. Everything else is an ordinary doorway.
export const EDGES = Object.freeze([
  ['alley', 'street'],
  ['alley', 'loading'],
  ['street', 'hallw'],
  ['loading', 'hallw'],
  ['loading', 'archive'],
  ['archive', 'atrium'],
  ['archive', 'gallery'],
  ['gallery', 'halle'],
  ['gallery', 'office'],
  ['office', 'security'],
  ['office', 'stair'],
  ['stair', 'landing'],
  ['landing', 'security'],
  ['hallw', 'atrium'],
  ['atrium', 'halle'],
  ['halle', 'security'],
  ['hallw', 'server'],
  ['atrium', 'lobby'],
  ['server', 'lobby'],
  ['lobby', 'vault', 'vault'],
  ['security', 'maint'],
  ['alley', 'archive', 'vent'],
]);

// Fixed camera posts. LOBBY is unavoidable — it is the vault's only doorway —
// so every plan has to answer the cameras somehow. That is the puzzle, and
// there are three different answers (EMP, the SECURITY console, MAINT lights).
export const CAMERAS = Object.freeze(['lobby', 'gallery', 'archive']);

export const ROOM_IDS = Object.freeze(ROOMS.map((r) => r.id));
const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

export function room(id) {
  const found = ROOM_BY_ID.get(id);
  if (!found) throw new Error(`Unknown room: ${id}`);
  return found;
}

export const roomIndex = (id) => ROOM_IDS.indexOf(id);

// Adjacency, built once. Sorted by room index so every traversal in this file
// has one deterministic tie-break and no dependency on insertion order.
const ADJ = new Map(ROOM_IDS.map((id) => [id, []]));
for (const [a, b, kind] of EDGES) {
  ADJ.get(a).push({ to: b, kind: kind ?? 'open' });
  ADJ.get(b).push({ to: a, kind: kind ?? 'open' });
}
for (const list of ADJ.values()) list.sort((x, y) => roomIndex(x.to) - roomIndex(y.to));

export function edgeKind(a, b) {
  const link = ADJ.get(a)?.find((e) => e.to === b);
  return link ? link.kind : null;
}

// Who may walk an edge right now. The vault door opens once; vents stay a
// Vane-only shortcut; guards use neither vents nor a locked vault door.
function passable(state, kind, mover) {
  if (kind === 'open') return true;
  if (kind === 'vault') return state.vaultOpen;
  if (kind === 'vent') return mover === 'vane';
  return false;
}

export function neighbors(state, from, mover = 'guard') {
  return ADJ.get(from)
    .filter((e) => passable(state, e.kind, mover))
    .map((e) => e.to);
}

// Breadth-first, expanding rooms in room-index order, so the returned path is
// a pure function of the arguments — the same route every time, on every
// engine. Guards and the preview both depend on this.
export function shortestPath(state, from, to, mover = 'guard') {
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  let frontier = [from];
  while (frontier.length > 0) {
    const next = [];
    for (const at of frontier) {
      for (const step of neighbors(state, at, mover)) {
        if (prev.has(step)) continue;
        prev.set(step, at);
        if (step === to) {
          const path = [to];
          let cursor = at;
          while (cursor !== null) {
            path.push(cursor);
            cursor = prev.get(cursor);
          }
          return path.reverse();
        }
        next.push(step);
      }
    }
    next.sort((a, b) => roomIndex(a) - roomIndex(b));
    frontier = next;
  }
  return [];
}

export function hops(state, from, to, mover = 'guard') {
  const path = shortestPath(state, from, to, mover);
  return path.length === 0 ? Infinity : path.length - 1;
}

// Every room within `radius` doorways. Noise uses it; so does the UI.
export function withinHops(state, from, radius, mover = 'guard') {
  const seen = [from];
  let frontier = [from];
  for (let step = 0; step < radius; step += 1) {
    const next = [];
    for (const at of frontier) {
      for (const to of neighbors(state, at, mover)) {
        if (!seen.includes(to)) {
          seen.push(to);
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  return seen.sort((a, b) => roomIndex(a) - roomIndex(b));
}

// --- Crew and guards --------------------------------------------------------

export const CREW_TEMPLATES = Object.freeze([
  {
    id: 'vane', name: 'VANE', role: 'GHOST', speed: 2, capacity: 2,
    can: { vents: true, hack: false, drill: false }, quiet: true,
  },
  {
    id: 'spark', name: 'SPARK', role: 'TECH', speed: 1, capacity: 2,
    can: { vents: false, hack: true, drill: false }, quiet: false,
  },
  {
    id: 'bruno', name: 'BRUNO', role: 'MUSCLE', speed: 1, capacity: 3,
    can: { vents: false, hack: false, drill: true }, quiet: false,
  },
]);

// Cyclic patrols. A guard walks its loop one room per turn and looks at the
// room it will step into next — own room plus one, never a whole cone. Six
// watched rooms out of sixteen leaves the building navigable while making
// every corridor a timing problem.
export const GUARD_TEMPLATES = Object.freeze([
  { id: 'g1', name: 'ROVER', route: ['hallw', 'atrium', 'halle', 'atrium'] },
  { id: 'g2', name: 'WARDEN', route: ['lobby', 'atrium', 'archive', 'gallery', 'halle', 'atrium'] },
  { id: 'g3', name: 'DESK', route: ['security', 'office', 'security', 'maint'] },
]);

const NOISE = Object.freeze({ drill: 3, grab: 2, hack: 2, charge: 5, noisemaker: 4, force: 3 });

// --- Building a heist -------------------------------------------------------

export function newHeist(seed = 1) {
  const rnd = mulberry32(seed);
  const jitter = (base, spread) => base + Math.floor(rnd() * (spread * 2 + 1)) - spread;

  // Guard phase is the seed's sharpest lever: the same floorplan with the
  // patrols offset is a genuinely different timing puzzle.
  const guards = GUARD_TEMPLATES.map((tpl) => {
    const idx = Math.floor(rnd() * tpl.route.length);
    return {
      id: tpl.id, name: tpl.name, route: [...tpl.route], idx,
      room: tpl.route[idx], alertTo: null, pause: 0,
    };
  });

  const fragile = rnd() < 0.5;
  const loot = [
    {
      id: 'target', name: fragile ? 'GLASS CROWN' : 'BEARER BONDS', room: 'vault',
      value: jitter(4200, 400), target: true, objective: false,
      carriedBy: null, extracted: false, fragile,
    },
    {
      id: 'ledger', name: 'LEDGER', room: 'archive', value: jitter(300, 100),
      target: false, objective: true, carriedBy: null, extracted: false, fragile: false,
    },
    {
      id: 'canvas', name: 'CANVAS', room: 'gallery', value: jitter(1100, 300),
      target: false, objective: false, carriedBy: null, extracted: false, fragile: false,
    },
    {
      id: 'cash', name: 'CASH BOX', room: 'office', value: jitter(700, 200),
      target: false, objective: false, carriedBy: null, extracted: false, fragile: false,
    },
  ];

  const start = ROOMS.find((r) => r.start).id;
  return {
    version: 1,
    seed,
    turn: 0,
    over: false,
    outcome: null, // 'win' | 'loss'
    reason: '',
    alarms: 0,
    lockdown: -1, // -1 until the first alarm, then counts down to 0
    extractionOpen: true,
    camerasDead: false,
    cameraBlindTurns: 0,
    lightsOutTurns: 0,
    vaultOpen: false,
    drillProgress: 0,
    targetDestroyed: false,
    crew: CREW_TEMPLATES.map((tpl) => ({
      id: tpl.id, name: tpl.name, role: tpl.role, speed: tpl.speed,
      capacity: tpl.capacity, can: { ...tpl.can }, quiet: tpl.quiet,
      room: start, captured: false, extracted: false, hiding: false, carrying: [],
    })),
    guards,
    loot,
    tools: { emp: 1, noisemaker: 2, smoke: 1, charge: 1 },
    toolsStart: { emp: 1, noisemaker: 2, smoke: 1, charge: 1 },
    smokeRoom: null,
    smokeTurns: 0,
    recorderWiped: false,
    log: [],
  };
}

export const totalTools = (tools) => Object.values(tools).reduce((sum, n) => sum + n, 0);

// --- Reading the state ------------------------------------------------------

export const crewById = (state, id) => state.crew.find((c) => c.id === id) ?? null;
export const activeCrew = (state) => state.crew.filter((c) => !c.captured && !c.extracted);
export const lootInRoom = (state, id) =>
  state.loot.filter((l) => l.room === id && l.carriedBy === null && !l.extracted);
export const carriedBy = (state, crewId) => state.loot.filter((l) => l.carriedBy === crewId);

export function camerasLive(state) {
  return !state.camerasDead && state.cameraBlindTurns <= 0 && state.lightsOutTurns <= 0;
}

// Rooms a crew member can legally end this turn in.
export function reachable(state, crew) {
  if (crew.captured || crew.extracted) return [];
  return withinHops(state, crew.room, crew.speed, crew.id);
}

// What `act` would actually do here — resolved once, so the button label the
// player taps and the effect the turn applies can never disagree.
export function actionAt(state, crew) {
  const here = room(crew.room);
  if (here.console === 'cameras' && crew.can.hack) return { kind: 'hack-cameras' };
  if (here.console === 'lights' && crew.can.hack) return { kind: 'hack-lights' };
  const spoils = lootInRoom(state, crew.room);
  if (spoils.length > 0 && carriedBy(state, crew.id).length < crew.capacity) {
    return { kind: 'grab', loot: spoils[0].id };
  }
  if (crew.room === 'lobby' && !state.vaultOpen && crew.can.drill) return { kind: 'drill' };
  return { kind: 'none' };
}

// The order menu the cabinet renders and the bots plan against — one source of
// truth for "what may I do", so an illegal order cannot reach the resolver.
export function legalOrders(state, crewId) {
  const crew = crewById(state, crewId);
  if (!crew || crew.captured || crew.extracted || state.over) return [];
  const orders = [{ kind: 'wait' }];
  if (room(crew.room).cover) orders.push({ kind: 'hide' });
  for (const to of reachable(state, crew)) {
    if (to !== crew.room) orders.push({ kind: 'move', to });
  }
  if (actionAt(state, crew).kind !== 'none') orders.push({ kind: 'act' });
  if (room(crew.room).extraction && state.extractionOpen) orders.push({ kind: 'extract' });
  if (state.tools.emp > 0) orders.push({ kind: 'tool', tool: 'emp' });
  if (state.tools.smoke > 0) orders.push({ kind: 'tool', tool: 'smoke' });
  if (state.tools.noisemaker > 0) {
    for (const to of neighbors(state, crew.room, crew.id)) {
      orders.push({ kind: 'tool', tool: 'noisemaker', to });
    }
  }
  if (state.tools.charge > 0 && crew.room === 'lobby' && !state.vaultOpen) {
    orders.push({ kind: 'tool', tool: 'charge' });
  }
  return orders;
}

export function orderIsLegal(state, crewId, order) {
  if (!order) return true; // an absent order is a WAIT
  return legalOrders(state, crewId).some((o) => sameOrder(o, order));
}

export function sameOrder(a, b) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && (a.to ?? null) === (b.to ?? null) && (a.tool ?? null) === (b.tool ?? null);
}

// --- Guard motion -----------------------------------------------------------
//
// One step, from guard state alone. The overlay and the resolver call this
// same function, which is why "previewed behaviour matches resolved behaviour"
// is a property of the code rather than a thing to remember.
export function guardStep(state, guard) {
  if (guard.pause > 0) return guard.room;
  if (guard.alertTo !== null && guard.alertTo !== guard.room) {
    const path = shortestPath(state, guard.room, guard.alertTo);
    return path.length > 1 ? path[1] : guard.room;
  }
  const want = guard.route[(guard.idx + 1) % guard.route.length];
  if (want === guard.room) return guard.room;
  const path = shortestPath(state, guard.room, want);
  return path.length > 1 ? path[1] : guard.room;
}

// A guard's position after stepping, plus the room it is then looking into.
// Both are shown on the overlay before the player commits.
export function guardOutlook(state, guard) {
  const to = guardStep(state, guard);
  const moved = { ...guard, room: to };
  if (guard.pause > 0) {
    moved.pause = guard.pause - 1;
  } else if (guard.alertTo !== null) {
    if (to === guard.alertTo) {
      moved.alertTo = null;
      moved.pause = 1;
      // Resume from whichever point of the loop is nearest to where the
      // investigation left them.
      let best = 0;
      let bestHops = Infinity;
      guard.route.forEach((stop, i) => {
        const d = hops(state, to, stop);
        if (d < bestHops) {
          bestHops = d;
          best = i;
        }
      });
      moved.idx = best;
    }
  } else if (to === guard.route[(guard.idx + 1) % guard.route.length]) {
    moved.idx = (guard.idx + 1) % guard.route.length;
  }
  return { to, facing: guardStep(state, moved), moved };
}

// Smoke kills the peripheral glance; darkness kills it everywhere.
function guardWatches(state, outlook) {
  const watched = [outlook.to];
  const blindPeriphery =
    state.lightsOutTurns > 0 ||
    (state.smokeTurns > 0 && (state.smokeRoom === outlook.to || state.smokeRoom === outlook.facing));
  if (!blindPeriphery && outlook.facing !== outlook.to) watched.push(outlook.facing);
  return watched;
}

// --- The turn ---------------------------------------------------------------
//
// `projectTurn` is the single description of what a turn does. It mutates
// nothing. `resolveTurn` applies it. The overlay draws it.
export function projectTurn(state, orders = {}) {
  const issues = [];
  const noises = [];
  const events = [];

  const moves = [];
  const crewAfter = state.crew.map((c) => ({ ...c, can: { ...c.can }, carrying: [...c.carrying] }));
  const byId = new Map(crewAfter.map((c) => [c.id, c]));
  const lootAfter = state.loot.map((l) => ({ ...l }));
  const lootById = new Map(lootAfter.map((l) => [l.id, l]));

  const next = {
    vaultOpen: state.vaultOpen,
    drillProgress: state.drillProgress,
    camerasDead: state.camerasDead,
    cameraBlindTurns: Math.max(0, state.cameraBlindTurns - 1),
    lightsOutTurns: Math.max(0, state.lightsOutTurns - 1),
    smokeTurns: Math.max(0, state.smokeTurns - 1),
    smokeRoom: state.smokeTurns - 1 > 0 ? state.smokeRoom : null,
    recorderWiped: state.recorderWiped,
    targetDestroyed: state.targetDestroyed,
    tools: { ...state.tools },
    alarms: state.alarms,
  };

  const addNoise = (at, magnitude) => {
    const existing = noises.find((n) => n.room === at);
    if (existing) existing.magnitude = Math.max(existing.magnitude, magnitude);
    else noises.push({ room: at, magnitude });
  };

  // 1. Crew, in fixed roster order.
  for (const crew of crewAfter) {
    crew.hiding = false;
    if (crew.captured || crew.extracted) {
      moves.push({ id: crew.id, from: crew.room, to: crew.room, act: 'idle', order: null });
      continue;
    }
    const order = orders[crew.id] ?? { kind: 'wait' };
    if (!orderIsLegal(state, crew.id, order)) {
      issues.push(`${crew.name}: illegal order ${order.kind}`);
      moves.push({ id: crew.id, from: crew.room, to: crew.room, act: 'wait', order });
      continue;
    }
    const from = crew.room;
    let act = order.kind;

    if (order.kind === 'move') {
      crew.room = order.to;
    } else if (order.kind === 'hide') {
      crew.hiding = true;
    } else if (order.kind === 'extract') {
      crew.extracted = true;
      for (const held of lootAfter) {
        if (held.carriedBy === crew.id) {
          held.carriedBy = null;
          held.extracted = true;
        }
      }
      events.push(`${crew.name} is out`);
    } else if (order.kind === 'act') {
      const resolved = actionAt(state, crew);
      act = resolved.kind;
      if (resolved.kind === 'grab') {
        const prize = lootById.get(resolved.loot);
        // Two people ordered onto the same prize in one turn: the first in
        // roster order takes it, the second comes up empty rather than
        // duplicating it.
        if (prize.carriedBy === null && !prize.extracted) {
          prize.room = null;
          prize.carriedBy = crew.id;
          addNoise(from, NOISE.grab);
          events.push(`${crew.name} takes the ${prize.name}`);
        } else {
          act = 'none';
        }
      } else if (resolved.kind === 'drill') {
        next.drillProgress = state.drillProgress + 1;
        addNoise(from, NOISE.drill);
        if (next.drillProgress >= CFG.DRILL_TURNS) {
          next.vaultOpen = true;
          events.push('the vault door swings open');
        }
      } else if (resolved.kind === 'hack-cameras') {
        next.camerasDead = true;
        next.recorderWiped = true;
        addNoise(from, NOISE.hack);
        events.push('cameras dead, recorder wiped');
      } else if (resolved.kind === 'hack-lights') {
        next.lightsOutTurns = CFG.LIGHTS_OUT_TURNS;
        addNoise(from, NOISE.hack);
        events.push('lights out');
      }
    } else if (order.kind === 'tool') {
      act = `tool:${order.tool}`;
      next.tools[order.tool] -= 1;
      if (order.tool === 'emp') {
        next.cameraBlindTurns = CFG.CAMERA_EMP_TURNS;
        events.push('EMP: cameras blind');
      } else if (order.tool === 'smoke') {
        next.smokeTurns = 2;
        next.smokeRoom = from;
        events.push(`smoke fills ${room(from).name}`);
      } else if (order.tool === 'noisemaker') {
        addNoise(order.to, NOISE.noisemaker);
        events.push(`a clatter in ${room(order.to).name}`);
      } else if (order.tool === 'charge') {
        next.vaultOpen = true;
        next.alarms += 1;
        addNoise(from, NOISE.charge);
        const prize = lootById.get('target');
        if (prize.fragile && !prize.extracted && prize.carriedBy === null) {
          prize.room = null;
          next.targetDestroyed = true;
          events.push(`the ${prize.name} is blown to dust`);
        } else {
          events.push('the charge tears the vault door off');
        }
      }
    }
    moves.push({ id: crew.id, from, to: crew.room, act, order });
  }

  // 2. Guards step. This depends only on the state the player is looking at,
  //    which is what makes the overlay honest.
  const guardMoves = state.guards.map((guard) => {
    const outlook = guardOutlook(state, guard);
    return {
      id: guard.id, name: guard.name, from: guard.room,
      to: outlook.to, facing: outlook.facing, moved: outlook.moved,
      watches: guardWatches({ ...state, ...next }, outlook),
    };
  });

  // 3. Detection, on the end-of-turn snapshot only.
  const detections = [];
  for (const crew of crewAfter) {
    if (crew.captured || crew.extracted) continue;
    for (const guard of guardMoves) {
      const caught = guard.to === crew.room || (guard.watches.includes(crew.room) && !crew.hiding);
      if (caught) {
        detections.push({ crew: crew.id, name: crew.name, by: 'guard', who: guard.name, room: crew.room });
        break;
      }
    }
  }
  const cameraLive = !next.camerasDead && next.cameraBlindTurns <= 0 && next.lightsOutTurns <= 0;
  const spotted = [];
  if (cameraLive) {
    for (const crew of crewAfter) {
      if (crew.captured || crew.extracted || crew.hiding) continue;
      if (CAMERAS.includes(crew.room) && !detections.some((d) => d.crew === crew.id)) {
        spotted.push({ crew: crew.id, name: crew.name, by: 'camera', room: crew.room });
      }
    }
  }

  for (const caught of detections) {
    const crew = byId.get(caught.crew);
    crew.captured = true;
    next.alarms += 1;
    for (const held of lootAfter) {
      if (held.carriedBy === crew.id) {
        held.carriedBy = null;
        held.room = crew.room;
        if (held.target) next.targetDestroyed = true;
      }
    }
    events.push(`${crew.name} taken in ${room(caught.room).name}`);
  }
  if (spotted.length > 0) {
    next.alarms += 1;
    events.push(`a camera has you in ${room(spotted[0].room).name}`);
  }

  // 4. Noise redirects patrols — from next turn, which is why the overlay can
  //    promise this turn exactly and still leave you something to worry about.
  const alerted = [];
  for (const guard of guardMoves) {
    let pick = null;
    for (const noise of noises) {
      if (noise.magnitude <= 0) continue;
      const radius = Math.max(0, noise.magnitude - 1);
      if (hops({ ...state, ...next }, guard.to, noise.room) > radius) continue;
      if (
        pick === null ||
        noise.magnitude > pick.magnitude ||
        (noise.magnitude === pick.magnitude && roomIndex(noise.room) < roomIndex(pick.room))
      ) {
        pick = noise;
      }
    }
    if (pick !== null && pick.room !== guard.to) {
      guard.moved = { ...guard.moved, alertTo: pick.room, pause: 0 };
      alerted.push({ id: guard.id, to: pick.room });
    }
  }

  // 5. Lockdown. The first alarm starts a clock that closes the way out.
  let lockdown = state.lockdown;
  if (next.alarms > 0 && lockdown < 0) lockdown = CFG.LOCKDOWN_TURNS;
  else if (lockdown > 0) lockdown -= 1;
  const extractionOpen = !(lockdown === 0);

  const turn = state.turn + 1;
  const stillInside = crewAfter.filter((c) => !c.captured && !c.extracted);
  const target = lootById.get('target');

  let outcome = null;
  let reason = '';
  if (next.targetDestroyed) {
    outcome = 'loss';
    reason = 'THE TAKE IS GONE';
  } else if (crewAfter.every((c) => c.captured)) {
    outcome = 'loss';
    reason = 'THE CREW IS IN CUFFS';
  } else if (!extractionOpen && stillInside.length > 0) {
    outcome = 'loss';
    reason = 'LOCKDOWN SEALED THE ALLEY';
  } else if (target.extracted && stillInside.length === 0) {
    outcome = 'win';
    reason = 'CLEAN AWAY';
  } else if (stillInside.length === 0) {
    outcome = 'loss';
    reason = 'YOU LEFT THE TAKE BEHIND';
  } else if (turn >= CFG.TURN_LIMIT) {
    outcome = 'loss';
    reason = 'THE SHIFT CHANGED';
  }

  return {
    turn,
    moves,
    guards: guardMoves.map(({ id, name, from, to, facing, watches }) => ({
      id, name, from, to, facing, watches,
    })),
    guardsAfter: guardMoves.map((g) => ({
      id: g.id, name: g.moved.name, route: [...g.moved.route], idx: g.moved.idx,
      room: g.to, alertTo: g.moved.alertTo, pause: g.moved.pause,
    })),
    crewAfter,
    lootAfter,
    detections,
    spotted,
    alerted,
    noises,
    issues,
    events,
    next: { ...next, lockdown, extractionOpen },
    outcome,
    reason,
    safe: detections.length === 0 && spotted.length === 0,
  };
}

// Apply a projection. Deliberately trivial: every decision was made above.
export function applyProjection(state, projection) {
  const after = {
    ...state,
    turn: projection.turn,
    crew: projection.crewAfter,
    guards: projection.guardsAfter,
    loot: projection.lootAfter,
    ...projection.next,
    over: projection.outcome !== null,
    outcome: projection.outcome,
    reason: projection.reason,
    log: [...state.log, ...projection.events].slice(-40),
  };
  return after;
}

export function resolveTurn(state, orders = {}) {
  if (state.over) return { state, projection: null };
  const projection = projectTurn(state, orders);
  return { state: applyProjection(state, projection), projection };
}

// --- Score ------------------------------------------------------------------
//
// The formula on the cabinet card, and nothing else. A failed heist scores
// zero: the shared score contract puts completed runs ahead of failed ones, so
// a lockdown that traps two people cannot outrank a clean getaway.
export function scoreBreakdown(state) {
  const lootValue = state.loot
    .filter((l) => l.extracted)
    .reduce((sum, l) => sum + l.value, 0);
  const survivors = state.crew.filter((c) => c.extracted).length;
  const objectives =
    state.loot.filter((l) => l.objective && l.extracted).length + (state.recorderWiped ? 1 : 0);
  const unusedTools = totalTools(state.tools);
  return {
    lootValue,
    loot: CFG.SCORE_PER_LOOT * lootValue,
    survivors,
    crew: CFG.SCORE_PER_CREW * survivors,
    objectives,
    objectiveBonus: CFG.SCORE_PER_OBJECTIVE * objectives,
    unusedTools,
    toolBonus: CFG.SCORE_PER_UNUSED_TOOL * unusedTools,
    turns: state.turn,
    turnCost: CFG.SCORE_PER_TURN * state.turn,
    alarms: state.alarms,
    alarmCost: CFG.SCORE_PER_ALARM * state.alarms,
  };
}

export function terminalScore(state) {
  if (state.outcome !== 'win') return 0;
  const b = scoreBreakdown(state);
  const total = b.loot + b.crew + b.objectiveBonus + b.toolBonus + b.turnCost + b.alarmCost;
  return Math.max(0, Math.round(total));
}

// Ranking for a board: completed runs first, then score, then fewer turns.
export function compareRuns(a, b) {
  const done = (r) => (r.outcome === 'win' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return a.turns - b.turns;
}
