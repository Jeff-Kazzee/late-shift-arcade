// GRAVEYARD SHIFT simulation — a Robotron-lineage twin-stick arena as plain
// serializable data. One watchman, one walled cemetery lot, ninety seconds of
// night; everything that crawls out of the ground is pooled, stepped at a
// fixed tick, and killed without a single allocation.
//
// PERFORMANCE CONTRACT (this is the point of the game):
// - Every entity lives in a fixed-size pool allocated once in newGame().
//   The hot loop (step) allocates NOTHING: no arrays, no objects, no
//   closures, no string building. Events are preallocated constant strings
//   pushed into a reused buffer; kill/hit effects go through a fixed ring.
// - The stress test in graveyard-shift.test.js steps 500+ live entities for
//   60 simulated seconds and asserts bounded step time and zero pool growth.
//
// Rules of the file, same as every cartridge here:
// 1. No Math.random — a seed names one exact night (mulberry32).
// 2. No canvas, DOM, clock, or input. Player intent arrives as commands.
// 3. Time advances in fixed steps; seed + command log ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  ARENA: { x0: 14, y0: 66, x1: 626, y1: 466 },

  SHIFT_SECONDS: 90, // midnight to dawn — survive it and the shift is won
  LIVES: 3,
  HIT_INVULN: 2.0, // seconds of grace after losing a life
  MERCY_RADIUS: 130, // the lantern flare that clears space after a hit

  PLAYER_R: 10,
  PLAYER_SPEED: 175,

  FIRE_INTERVAL: 1 / 9,
  BULLET_SPEED: 460,
  BULLET_R: 3,

  // Fixed pool capacities — allocated once, never resized.
  ENEMY_POOL: 512,
  BULLET_POOL: 160,
  FX_RING: 64,

  // Spawning: a steady drip that tightens as dawn approaches, plus a burst
  // every WAVE_EVERY seconds. All of it seeded.
  SPAWN_START: 1.1,
  SPAWN_END: 0.25,
  WAVE_EVERY: 15,
  WAVE_BASE: 6,

  COMBO_WINDOW: 2.0, // seconds between kills that keep the chain alive
  COMBO_PER_STEP: 5, // kills per extra ×1 on the multiplier
  COMBO_CAP: 8,

  // SCORE (the documented formula):
  //   every kill pays its value × the combo multiplier at the moment of the
  //   kill, where multiplier = min(8, 1 + floor(chain / 5)) and the chain
  //   breaks after 2s without a kill or whenever the watchman is hit.
  //   won (dawn reached):  + 15000 + 10000 × lives remaining
  //   lost: you keep what you killed — the night keeps the rest.
  WIN_BASE: 15000,
  WIN_PER_LIFE: 10000,
};

// type: 0 shambler, 1 wisp, 2 brute
export const TYPES = Object.freeze([
  Object.freeze({ name: 'SHAMBLER', r: 11, hp: 1, speed: 55, value: 100 }),
  Object.freeze({ name: 'WISP', r: 8, hp: 1, speed: 120, value: 150 }),
  Object.freeze({ name: 'BRUTE', r: 17, hp: 5, speed: 38, value: 400 }),
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

// The sim owns its rng cursor as plain state so a JSON round-trip resumes the
// exact same random stream: mulberry32's whole state is one uint32.
function nextRand(state) {
  let a = (state.rngState + 0x6d2b79f5) >>> 0;
  state.rngState = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function newGame(seed = 1) {
  const enemies = [];
  for (let i = 0; i < CFG.ENEMY_POOL; i += 1) {
    enemies.push({ on: false, type: 0, x: 0, y: 0, hp: 0, phase: 0 });
  }
  const bullets = [];
  for (let i = 0; i < CFG.BULLET_POOL; i += 1) {
    bullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0 });
  }
  const fx = [];
  for (let i = 0; i < CFG.FX_RING; i += 1) {
    fx.push({ seq: 0, kind: '', x: 0, y: 0 });
  }
  return {
    seed: seed >>> 0,
    rngState: seed >>> 0,
    tick: 0,
    t: 0,
    status: 'briefing', // briefing | running | won | lost
    lives: CFG.LIVES,
    invuln: 0,
    score: 0,
    kills: 0,
    chain: 0,
    chainT: 0,
    bestMultiplier: 1,
    px: CFG.W / 2,
    py: (CFG.ARENA.y0 + CFG.ARENA.y1) / 2,
    fireCooldown: 0,
    spawnT: 0.5,
    waveT: CFG.WAVE_EVERY,
    wave: 0,
    liveEnemies: 0,
    input: { mx: 0, my: 0, ax: 1, ay: 0, firing: false },
    enemies,
    bullets,
    fx,
    fxSeq: 0,
    events: [],
  };
}

export const multiplier = (state) =>
  Math.min(CFG.COMBO_CAP, 1 + Math.floor(state.chain / CFG.COMBO_PER_STEP));

// --- Commands ------------------------------------------------------------------

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'running';
  return true;
}

const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

export function setMove(state, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  state.input.mx = clamp1(x);
  state.input.my = clamp1(y);
  return true;
}

export function setAim(state, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const len = Math.hypot(x, y);
  if (len < 1e-6) return false;
  state.input.ax = x / len;
  state.input.ay = y / len;
  return true;
}

export function setFire(state, on) {
  state.input.firing = !!on;
  return true;
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'move':
      return setMove(state, command.x, command.y);
    case 'aim':
      return setAim(state, command.x, command.y);
    case 'fire':
      return setFire(state, command.on);
    default:
      return false;
  }
}

// --- Spawning ---------------------------------------------------------------------

// Exported so the stress test can flood the arena through the same door the
// sim uses. Returns the slot index or -1 when the pool is saturated (a full
// pool is a spawn skipped, never a resize).
export function spawnEnemy(state, type, x, y, phase = 0) {
  const pool = state.enemies;
  for (let i = 0; i < pool.length; i += 1) {
    if (!pool[i].on) {
      const e = pool[i];
      e.on = true;
      e.type = type;
      e.x = x;
      e.y = y;
      e.hp = TYPES[type].hp;
      e.phase = phase;
      state.liveEnemies += 1;
      return i;
    }
  }
  return -1;
}

function pushFx(state, kind, x, y) {
  const slot = state.fx[state.fxSeq % CFG.FX_RING];
  state.fxSeq += 1;
  slot.seq = state.fxSeq;
  slot.kind = kind;
  slot.x = x;
  slot.y = y;
}

// Pick a seeded point on the arena rim.
function spawnAtEdge(state, type) {
  const side = Math.floor(nextRand(state) * 4);
  const u = nextRand(state);
  const { x0, y0, x1, y1 } = CFG.ARENA;
  let x = x0;
  let y = y0;
  if (side === 0) {
    x = x0 + (x1 - x0) * u;
    y = y0 + 2;
  } else if (side === 1) {
    x = x0 + (x1 - x0) * u;
    y = y1 - 2;
  } else if (side === 2) {
    x = x0 + 2;
    y = y0 + (y1 - y0) * u;
  } else {
    x = x1 - 2;
    y = y0 + (y1 - y0) * u;
  }
  spawnEnemy(state, type, x, y, nextRand(state) * Math.PI * 2);
}

// Escalation: shamblers first, wisps from a third in, brutes in the back half.
function pickType(state) {
  const p = state.t / CFG.SHIFT_SECONDS;
  const roll = nextRand(state);
  if (p > 0.5 && roll < 0.18) return 2;
  if (p > 0.3 && roll < 0.5) return 1;
  return 0;
}

// --- Events: constant strings only, reused buffer -----------------------------------

const EV_WON = 'won';
const EV_LOST = 'lost';
const EV_HIT = 'hit';
const EV_WAVE = 'wave';
const EV_FIRE = 'fire';
const EV_KILL = 'kill';

// --- The tick ------------------------------------------------------------------------

export function step(state, dt = CFG.TICK) {
  const events = state.events;
  events.length = 0;
  if (state.status !== 'running') return events;
  state.tick += 1;
  state.t += dt;

  const { x0, y0, x1, y1 } = CFG.ARENA;

  // Watchman.
  const mlen = Math.hypot(state.input.mx, state.input.my);
  if (mlen > 1e-6) {
    const s = (mlen > 1 ? 1 / mlen : 1) * CFG.PLAYER_SPEED * dt;
    state.px += state.input.mx * s;
    state.py += state.input.my * s;
    if (state.px < x0 + CFG.PLAYER_R) state.px = x0 + CFG.PLAYER_R;
    if (state.px > x1 - CFG.PLAYER_R) state.px = x1 - CFG.PLAYER_R;
    if (state.py < y0 + CFG.PLAYER_R) state.py = y0 + CFG.PLAYER_R;
    if (state.py > y1 - CFG.PLAYER_R) state.py = y1 - CFG.PLAYER_R;
  }
  if (state.invuln > 0) state.invuln -= dt;

  // Trigger.
  state.fireCooldown -= dt;
  if (state.input.firing && state.fireCooldown <= 0) {
    for (let i = 0; i < state.bullets.length; i += 1) {
      if (!state.bullets[i].on) {
        const b = state.bullets[i];
        b.on = true;
        b.x = state.px + state.input.ax * (CFG.PLAYER_R + 4);
        b.y = state.py + state.input.ay * (CFG.PLAYER_R + 4);
        b.vx = state.input.ax * CFG.BULLET_SPEED;
        b.vy = state.input.ay * CFG.BULLET_SPEED;
        state.fireCooldown = CFG.FIRE_INTERVAL;
        events.push(EV_FIRE);
        break;
      }
    }
  }

  // Bullets fly, walls eat them.
  for (let i = 0; i < state.bullets.length; i += 1) {
    const b = state.bullets[i];
    if (!b.on) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) b.on = false;
  }

  // The chain decays.
  if (state.chain > 0) {
    state.chainT -= dt;
    if (state.chainT <= 0) state.chain = 0;
  }

  // The ground gives up its dead.
  state.spawnT -= dt;
  if (state.spawnT <= 0) {
    const p = Math.min(1, state.t / CFG.SHIFT_SECONDS);
    state.spawnT = CFG.SPAWN_START + (CFG.SPAWN_END - CFG.SPAWN_START) * p;
    spawnAtEdge(state, pickType(state));
  }
  state.waveT -= dt;
  if (state.waveT <= 0) {
    state.waveT = CFG.WAVE_EVERY;
    state.wave += 1;
    const burst = CFG.WAVE_BASE + state.wave;
    for (let i = 0; i < burst; i += 1) spawnAtEdge(state, pickType(state));
    events.push(EV_WAVE);
  }

  // Night-things advance; bullets and the watchman meet them.
  for (let i = 0; i < state.enemies.length; i += 1) {
    const e = state.enemies[i];
    if (!e.on) continue;
    const spec = TYPES[e.type];
    let dx = state.px - e.x;
    let dy = state.py - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist;
    dy /= dist;
    if (e.type === 1) {
      // Wisps weave: a perpendicular sway on a per-spawn phase.
      const sway = Math.sin(state.t * 4 + e.phase) * 0.8;
      const wx = dx - dy * sway;
      const wy = dy + dx * sway;
      const wl = Math.hypot(wx, wy) || 1;
      dx = wx / wl;
      dy = wy / wl;
    }
    e.x += dx * spec.speed * dt;
    e.y += dy * spec.speed * dt;
    if (e.x < x0 + spec.r) e.x = x0 + spec.r;
    if (e.x > x1 - spec.r) e.x = x1 - spec.r;
    if (e.y < y0 + spec.r) e.y = y0 + spec.r;
    if (e.y > y1 - spec.r) e.y = y1 - spec.r;

    // Bullet hits.
    for (let j = 0; j < state.bullets.length; j += 1) {
      const b = state.bullets[j];
      if (!b.on) continue;
      const rr = spec.r + CFG.BULLET_R;
      const bx = b.x - e.x;
      const by = b.y - e.y;
      if (bx * bx + by * by <= rr * rr) {
        b.on = false;
        e.hp -= 1;
        if (e.hp <= 0) {
          e.on = false;
          state.liveEnemies -= 1;
          state.kills += 1;
          state.chain += 1;
          state.chainT = CFG.COMBO_WINDOW;
          const m = multiplier(state);
          if (m > state.bestMultiplier) state.bestMultiplier = m;
          state.score += spec.value * m;
          pushFx(state, EV_KILL, e.x, e.y);
          events.push(EV_KILL);
          break;
        }
      }
    }
    if (!e.on) continue;

    // Claws.
    if (state.invuln <= 0) {
      const rr = spec.r + CFG.PLAYER_R;
      const hx = e.x - state.px;
      const hy = e.y - state.py;
      if (hx * hx + hy * hy <= rr * rr) {
        state.lives -= 1;
        state.invuln = CFG.HIT_INVULN;
        state.chain = 0;
        state.chainT = 0;
        pushFx(state, EV_HIT, state.px, state.py);
        events.push(EV_HIT);
        // The lantern flares: everything close is thrown back to the fence —
        // survival, not points, so no score is awarded.
        for (let j = 0; j < state.enemies.length; j += 1) {
          const o = state.enemies[j];
          if (!o.on) continue;
          const ox = o.x - state.px;
          const oy = o.y - state.py;
          if (ox * ox + oy * oy <= CFG.MERCY_RADIUS * CFG.MERCY_RADIUS) {
            o.on = false;
            state.liveEnemies -= 1;
          }
        }
        if (state.lives <= 0) {
          state.status = 'lost';
          events.push(EV_LOST);
          return events;
        }
      }
    }
  }

  // Dawn.
  if (state.t >= CFG.SHIFT_SECONDS) {
    state.status = 'won';
    events.push(EV_WON);
  }
  return events;
}

// --- Score ------------------------------------------------------------------------

export function terminalScore(state) {
  let total = state.score;
  if (state.status === 'won') total += CFG.WIN_BASE + CFG.WIN_PER_LIFE * state.lives;
  return Math.max(0, Math.round(total));
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    kills: state.kills,
    bestMultiplier: state.bestMultiplier,
    survived: Math.round(state.t * 100) / 100,
    score: terminalScore(state),
  };
}

// Shared score contract: finished shifts rank ahead of ended ones, then
// score, then this game's stated tie-break — longer survival.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return b.survived - a.survived;
}
