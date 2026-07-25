// RAGDOLL RELAY simulation — a floppy night courier, one parcel, one rooftop
// course, all as plain serializable data. The body is a three-point verlet
// chain, the parcel hangs off the chest on a rope, and the only verbs are
// FLING (from the ground), NUDGE (in the air), and RESET (swallow the
// penalty). Cross the depot line with the parcel still on the rope.
//
// The physics is pure fixed-tick verlet — no solver objects, no allocation
// in the hot loop, wind gusts precomputed from the seed at newGame. Same
// seed + same command log ⇒ the exact same delivery, every time.
//
// Rules of the file, same as every cartridge here:
// 1. No Math.random — a seed names one exact night of wind (mulberry32).
// 2. No canvas, DOM, clock, or input. Player intent arrives as commands.
// 3. Time advances in fixed steps; seed + command log ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  WORLD_W: 2400,
  OOB_Y: 500, // below the city: automatic reset

  TIME_LIMIT: 120, // seconds before the parcel is officially late
  MAX_RESETS: 6, // wipeouts the courier's knees survive

  GRAVITY: 520,
  DAMPING: 0.996,
  FRICTION: 0.72, // ground grip, applied to the horizontal glide on contact
  SOLVER_PASSES: 4,

  FLING_V: 430, // full-power launch speed, px/s
  NUDGE_A: 230, // airborne drift authority, px/s²
  REST_SPEED: 14, // slower than this (with ground contact) counts as landed
  COYOTE: 0.25, // seconds of "recently grounded" that still allow a fling

  ROPE: 26, // parcel tether length
  SEG: 17, // body segment length

  PARCEL_HP: 100,
  IMPACT_SOFT: 400, // impact speed the packing foam absorbs, px/s
  IMPACT_SCALE: 8, // integrity lost per 100 px/s beyond the foam
  SPIKE_DMG: 26, // integrity lost per spike bite

  WIND_MAX: 46, // px/s² gust ceiling, seeded per night

  // SCORE (the documented formula, from the roadmap):
  //   won:  max(0, 200000 - elapsed_ms / 10)
  //         + parcel integrity × 200      (an intact parcel is worth 20000)
  //         - 15000 per reset
  //         floored at 0; tie-break by fewer resets.
  //   lost: 0 — a parcel that never arrives pays nothing.
  //   (The roadmap's authored style bonuses and optional gates are cut at
  //   Shorts scope; the formula above is the whole truth.)
  SCORE_TIME_MAX: 200000,
  SCORE_INTEGRITY: 200,
  PENALTY_RESET: 15000,
};

// The course: rooftops (solid rects, y is the roof line), one spike pit,
// relay gates that double as checkpoints, and the depot line.
export const COURSE = Object.freeze({
  platforms: Object.freeze([
    Object.freeze({ x0: 0, y: 380, x1: 360 }), // start roof
    Object.freeze({ x0: 440, y: 340, x1: 820 }),
    Object.freeze({ x0: 820, y: 455, x1: 950 , spikes: true }), // the pit
    Object.freeze({ x0: 950, y: 360, x1: 1360 }),
    Object.freeze({ x0: 1520, y: 340, x1: 1900 }),
    Object.freeze({ x0: 1980, y: 380, x1: 2400 }), // depot roof
  ]),
  // Relay gates, crossed in order. Each is a checkpoint spawn.
  gates: Object.freeze([
    Object.freeze({ x: 480, spawnX: 500, spawnY: 320 }),
    Object.freeze({ x: 990, spawnX: 1010, spawnY: 340 }),
    Object.freeze({ x: 1560, spawnX: 1580, spawnY: 320 }),
  ]),
  start: Object.freeze({ spawnX: 60, spawnY: 360 }),
  finishX: 2300,
});

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

// Points: 0 head, 1 chest, 2 hips, 3 parcel.
const HEAD = 0;
const CHEST = 1;
const HIPS = 2;
const PARCEL = 3;

function makePoint(x, y) {
  return { x, y, px: x, py: y };
}

function placeCourier(state, sx, sy) {
  const p = state.points;
  p[HEAD].x = sx;
  p[HEAD].y = sy - CFG.SEG * 2;
  p[CHEST].x = sx;
  p[CHEST].y = sy - CFG.SEG;
  p[HIPS].x = sx;
  p[HIPS].y = sy;
  p[PARCEL].x = sx - 10;
  p[PARCEL].y = sy - CFG.SEG - 6;
  for (const pt of p) {
    pt.px = pt.x;
    pt.py = pt.y;
  }
}

export function newGame(seed = 1) {
  // Precompute the night's wind: gust segments covering the whole shift.
  const rng = mulberry32(seed >>> 0);
  const wind = [];
  let t = 0;
  while (t < CFG.TIME_LIMIT + 10) {
    const span = 2.5 + rng() * 3.5;
    t += span;
    wind.push({ until: Math.round(t * 100) / 100, ax: Math.round((rng() * 2 - 1) * CFG.WIND_MAX * 10) / 10 });
  }
  const state = {
    seed: seed >>> 0,
    tick: 0,
    t: 0,
    status: 'briefing', // briefing | running | won | lost
    failure: null, // shattered | wrecked | late
    points: [makePoint(0, 0), makePoint(0, 0), makePoint(0, 0), makePoint(0, 0)],
    grounded: 0, // seconds since last ground contact (0 while touching)
    nudge: 0, // held airborne drift: -1 | 0 | 1
    integrity: CFG.PARCEL_HP,
    spikeCd: 0, // one bite per touch, not per tick
    gate: 0, // next gate index to cross
    resets: 0,
    flings: 0,
    wind,
    windAt: 0,
    events: [],
  };
  placeCourier(state, COURSE.start.spawnX, COURSE.start.spawnY);
  return state;
}

// --- Reading the body -------------------------------------------------------------

export const courierX = (state) => state.points[CHEST].x;
export const courierY = (state) => state.points[CHEST].y;

export function pointSpeed(point, dt = CFG.TICK) {
  return Math.hypot(point.x - point.px, point.y - point.py) / dt;
}

// A fling is legal when the body has (nearly) settled and touched a roof
// recently — coyote time keeps the verb forgiving without making it flight.
export function canFling(state) {
  if (state.status !== 'running') return false;
  if (state.grounded > CFG.COYOTE) return false;
  for (let i = 0; i < 3; i += 1) {
    if (pointSpeed(state.points[i]) > CFG.REST_SPEED * 3) return false;
  }
  return true;
}

// --- Commands ----------------------------------------------------------------------

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'running';
  return true;
}

export function fling(state, ang, pow) {
  if (!canFling(state)) return false;
  if (!Number.isFinite(ang) || !Number.isFinite(pow)) return false;
  const power = Math.min(1, Math.max(0.15, pow));
  const v = CFG.FLING_V * power;
  const vx = Math.cos(ang) * v;
  const vy = Math.sin(ang) * v;
  const dt = CFG.TICK;
  for (let i = 0; i < 3; i += 1) {
    const p = state.points[i];
    p.px = p.x - vx * dt;
    p.py = p.y - vy * dt;
  }
  // The parcel gets half the send-off and catches up on the rope.
  const parcel = state.points[PARCEL];
  parcel.px = parcel.x - vx * 0.5 * dt;
  parcel.py = parcel.y - vy * 0.5 * dt;
  state.grounded = CFG.COYOTE + 1; // airborne now
  state.flings += 1;
  return true;
}

export function nudge(state, dir) {
  if (state.status !== 'running') return false;
  if (dir !== -1 && dir !== 0 && dir !== 1) return false;
  state.nudge = dir;
  return true;
}

// Back to the last gate. Costs score; too many cost the run.
export function reset(state, events = state.events) {
  if (state.status !== 'running') return false;
  state.resets += 1;
  if (state.resets > CFG.MAX_RESETS) {
    state.status = 'lost';
    state.failure = 'wrecked';
    events.push('lost');
    return true;
  }
  const spawn = state.gate === 0 ? COURSE.start : COURSE.gates[state.gate - 1];
  placeCourier(state, spawn.spawnX, spawn.spawnY);
  state.nudge = 0;
  state.grounded = 0;
  events.push('reset');
  return true;
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'fling':
      return fling(state, command.ang, command.pow);
    case 'nudge':
      return nudge(state, command.dir);
    case 'reset':
      return reset(state);
    default:
      return false;
  }
}

// --- The tick ------------------------------------------------------------------------

function currentWind(state) {
  const wind = state.wind;
  while (state.windAt < wind.length - 1 && state.t > wind[state.windAt].until) {
    state.windAt += 1;
  }
  return wind[state.windAt].ax;
}

function damageParcel(state, amount, events) {
  state.integrity -= amount;
  events.push('crack');
  if (state.integrity <= 0) {
    state.integrity = 0;
    state.status = 'lost';
    state.failure = 'shattered';
    events.push('lost');
    return true;
  }
  return false;
}

export function step(state, dt = CFG.TICK) {
  const events = state.events;
  events.length = 0;
  if (state.status !== 'running') return events;
  state.tick += 1;
  state.t += dt;

  const windAx = currentWind(state);
  const points = state.points;
  let touching = false;
  let spikeBite = false;
  let hardestImpact = 0;

  // Integrate.
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const vx = (p.x - p.px) * CFG.DAMPING + (windAx + (i < 3 ? state.nudge * CFG.NUDGE_A : 0)) * dt * dt;
    const vy = (p.y - p.py) * CFG.DAMPING + CFG.GRAVITY * dt * dt;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy;
  }

  // Constraints + collisions, a few relaxation passes.
  for (let pass = 0; pass < CFG.SOLVER_PASSES; pass += 1) {
    // Body segments are rods.
    constrain(points[HEAD], points[CHEST], CFG.SEG, 1);
    constrain(points[CHEST], points[HIPS], CFG.SEG, 1);
    // The rope only pulls.
    constrain(points[CHEST], points[PARCEL], CFG.ROPE, 0);

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (p.x < 6) p.x = 6;
      if (p.x > CFG.WORLD_W - 6) p.x = CFG.WORLD_W - 6;
      for (let j = 0; j < COURSE.platforms.length; j += 1) {
        const plat = COURSE.platforms[j];
        if (p.x < plat.x0 || p.x > plat.x1) continue;
        if (p.y > plat.y && p.py <= plat.y + 1) {
          // Came down through the roof line: land on it.
          const impact = (p.y - p.py) / dt;
          if (impact > hardestImpact && i === PARCEL) hardestImpact = impact;
          p.y = plat.y;
          // Friction: bleed the horizontal glide while touching.
          p.px = p.x - (p.x - p.px) * CFG.FRICTION;
          p.py = p.y + (p.y - p.py) * 0.1; // a dead, thudding landing
          if (i < 3) touching = true;
          if (plat.spikes && i === PARCEL) spikeBite = true;
        }
      }
    }
  }

  // Ground clock.
  if (touching) state.grounded = 0;
  else state.grounded += dt;

  // Parcel wear.
  if (state.spikeCd > 0) state.spikeCd -= dt;
  if (spikeBite && state.spikeCd <= 0) {
    state.spikeCd = 0.5;
    if (damageParcel(state, CFG.SPIKE_DMG, events)) return events;
  }
  if (hardestImpact > CFG.IMPACT_SOFT) {
    const dmg = Math.round(((hardestImpact - CFG.IMPACT_SOFT) / 100) * CFG.IMPACT_SCALE);
    if (dmg > 0 && damageParcel(state, dmg, events)) return events;
  }

  // Gates, in order.
  if (state.gate < COURSE.gates.length && courierX(state) >= COURSE.gates[state.gate].x) {
    state.gate += 1;
    events.push('gate');
  }

  // The depot line.
  if (courierX(state) >= COURSE.finishX) {
    state.status = 'won';
    events.push('won');
    return events;
  }

  // The long fall.
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].y > CFG.OOB_Y) {
      reset(state, events);
      return events;
    }
  }

  // The clock.
  if (state.t >= CFG.TIME_LIMIT) {
    state.status = 'lost';
    state.failure = 'late';
    events.push('lost');
  }
  return events;
}

// rigid=1: rod (pushes and pulls). rigid=0: rope (only pulls).
function constrain(a, b, length, rigid) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  if (!rigid && dist < length) return;
  const diff = ((dist - length) / dist) * 0.5;
  const ox = dx * diff;
  const oy = dy * diff;
  a.x += ox;
  a.y += oy;
  b.x -= ox;
  b.y -= oy;
}

// --- Score ------------------------------------------------------------------------

export function terminalScore(state) {
  if (state.status !== 'won') return 0;
  const time = Math.max(0, CFG.SCORE_TIME_MAX - Math.round((state.t * 1000) / 10));
  const raw = time + state.integrity * CFG.SCORE_INTEGRITY - state.resets * CFG.PENALTY_RESET;
  return Math.max(0, Math.round(raw));
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    failure: state.failure,
    integrity: state.integrity,
    resets: state.resets,
    flings: state.flings,
    time: Math.round(state.t * 100) / 100,
    score: terminalScore(state),
  };
}

// Shared score contract: deliveries rank ahead of wipeouts, then score, then
// this game's stated tie-break — fewer resets.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return a.resets - b.resets;
}
