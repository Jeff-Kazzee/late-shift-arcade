// STRATOFIRE simulation — a Luftrausers-lineage momentum dogfighter as plain
// serializable data. One plane, gravity that never blinks, a sea that ends
// the run in one touch, and an endless seeded air force. Thrust is a vector,
// altitude is a bank account, and the gun and the repair crew share a switch:
// the hull only heals while you are not shooting.
//
// PERFORMANCE CONTRACT (this is the point of the game):
// - Every entity lives in a fixed-size pool allocated once in newGame().
//   The hot loop (step) allocates NOTHING: no arrays, no objects, no
//   closures, no string building. Effects go through a fixed ring.
// - The stress test in stratofire.test.js steps 500+ live entities for 60
//   simulated seconds and asserts bounded step time and zero pool growth.
//
// Rules of the file, same as every cartridge here:
// 1. No Math.random — a seed names one exact sortie (mulberry32).
// 2. No canvas, DOM, clock, or input. Player intent arrives as commands.
// 3. Time advances in fixed steps; seed + command log ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  SEA_Y: 430, // touch it and the run is over
  CEIL_Y: 16, // thin air: the climb stops, nothing dies

  SORTIE_KILLS: 40, // the win: complete the sortie and turn for home
  HULL: 100,
  REGEN: 14, // hull per second, but ONLY while the trigger is released
  BULLET_DMG: 12,
  RAM_DMG: 30,
  HIT_GRACE: 0.5, // seconds the airframe shrugs off follow-up hits

  GRAVITY: 240,
  THRUST: 340,
  TURN_RATE: 3.6, // radians per second
  DRAG: 0.55, // proportional air resistance per second

  FIRE_INTERVAL: 1 / 10,
  PBULLET_SPEED: 520,
  PBULLET_TTL: 1.5,
  EBULLET_TTL: 3.2,

  PLAYER_R: 9,

  // Fixed pool capacities — allocated once, never resized.
  ENEMY_POOL: 256,
  PBULLET_POOL: 128,
  EBULLET_POOL: 256,
  FX_RING: 64,

  // Seeded spawning.
  FIGHTER_START: 2.0,
  FIGHTER_MIN: 1.0,
  AIRCRAFT_MAX: 5, // live planes at once — pressure, never a firing squad
  BOAT_EVERY: 10,
  BOAT_MAX: 3,
  ACE_AFTER: 15, // kills before aces join
  ACE_CHANCE: 0.15,

  CHAIN_WINDOW: 3.5, // seconds between kills that keep the chain alive
  CHAIN_CAP: 10,

  // SCORE (the documented formula):
  //   every kill pays its value × the chain multiplier at the moment of the
  //   kill, where multiplier = min(10, 1 + chain) and the chain dies 3.5s
  //   after the last kill. Damage does not break the chain — only silence.
  //   won (sortie complete): + 20000 + 100 × hull remaining
  //   lost: you keep what you shot down — the sea keeps the rest.
  WIN_BASE: 20000,
  WIN_PER_HULL: 100,
};

// type: 0 fighter, 1 ace, 2 boat
export const TYPES = Object.freeze([
  Object.freeze({ name: 'FIGHTER', r: 11, hp: 2, speed: 130, turn: 1.8, fireEvery: 2.6, shot: 260, value: 200 }),
  Object.freeze({ name: 'ACE', r: 10, hp: 3, speed: 190, turn: 2.6, fireEvery: 1.4, shot: 300, value: 500 }),
  Object.freeze({ name: 'BOAT', r: 16, hp: 6, speed: 40, turn: 0, fireEvery: 2.8, shot: 200, value: 400 }),
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
    enemies.push({ on: false, type: 0, x: 0, y: 0, a: 0, hp: 0, cd: 0 });
  }
  const pbullets = [];
  for (let i = 0; i < CFG.PBULLET_POOL; i += 1) {
    pbullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, ttl: 0 });
  }
  const ebullets = [];
  for (let i = 0; i < CFG.EBULLET_POOL; i += 1) {
    ebullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, ttl: 0 });
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
    failure: null, // splashed | shot-down
    px: CFG.W / 2,
    py: 200,
    pvx: 0,
    pvy: 0,
    pa: -Math.PI / 2, // nose up at launch
    hull: CFG.HULL,
    grace: 0,
    fireCooldown: 0,
    kills: 0,
    score: 0,
    chain: 0,
    chainT: 0,
    bestMultiplier: 1,
    fighterT: 1.2,
    boatT: 4,
    boats: 0,
    aircraft: 0,
    liveEnemies: 0,
    input: { turn: 0, thrust: false, firing: false },
    enemies,
    pbullets,
    ebullets,
    fx,
    fxSeq: 0,
    events: [],
  };
}

export const multiplier = (state) => Math.min(CFG.CHAIN_CAP, 1 + state.chain);

// --- Commands ------------------------------------------------------------------

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'running';
  return true;
}

export function setTurn(state, dir) {
  if (dir !== -1 && dir !== 0 && dir !== 1) return false;
  state.input.turn = dir;
  return true;
}

export function setThrust(state, on) {
  state.input.thrust = !!on;
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
    case 'turn':
      return setTurn(state, command.dir);
    case 'thrust':
      return setThrust(state, command.on);
    case 'fire':
      return setFire(state, command.on);
    default:
      return false;
  }
}

// --- Spawning ----------------------------------------------------------------------

// Exported so the stress test floods the sky through the same door the sim
// uses. Returns the slot index or -1 when the pool is saturated.
export function spawnEnemy(state, type, x, y, a = 0) {
  const pool = state.enemies;
  for (let i = 0; i < pool.length; i += 1) {
    if (!pool[i].on) {
      const e = pool[i];
      e.on = true;
      e.type = type;
      e.x = x;
      e.y = type === 2 ? CFG.SEA_Y - 10 : y;
      e.a = a;
      e.hp = TYPES[type].hp;
      e.cd = TYPES[type].fireEvery;
      state.liveEnemies += 1;
      if (type === 2) state.boats += 1;
      else state.aircraft += 1;
      return i;
    }
  }
  return -1;
}

// Exported for the stress test: enemy fire goes through this same slot hunt.
export function spawnEnemyBullet(state, x, y, vx, vy, ttl = CFG.EBULLET_TTL) {
  const pool = state.ebullets;
  for (let i = 0; i < pool.length; i += 1) {
    if (!pool[i].on) {
      const b = pool[i];
      b.on = true;
      b.x = x;
      b.y = y;
      b.vx = vx;
      b.vy = vy;
      b.ttl = ttl;
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

const EV_WON = 'won';
const EV_LOST = 'lost';
const EV_HIT = 'hit';
const EV_KILL = 'kill';
const EV_FIRE = 'fire';

const wrapX = (x) => ((x % CFG.W) + CFG.W) % CFG.W;

// Shortest signed angular difference a→b.
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// --- The tick ------------------------------------------------------------------------

export function step(state, dt = CFG.TICK) {
  const events = state.events;
  events.length = 0;
  if (state.status !== 'running') return events;
  state.tick += 1;
  state.t += dt;

  // The plane: turn, thrust, gravity, drag.
  if (state.grace > 0) state.grace -= dt;
  state.pa += state.input.turn * CFG.TURN_RATE * dt;
  if (state.input.thrust) {
    state.pvx += Math.cos(state.pa) * CFG.THRUST * dt;
    state.pvy += Math.sin(state.pa) * CFG.THRUST * dt;
  }
  state.pvy += CFG.GRAVITY * dt;
  const drag = 1 - CFG.DRAG * dt;
  state.pvx *= drag;
  state.pvy *= drag;
  state.px = wrapX(state.px + state.pvx * dt);
  state.py += state.pvy * dt;
  if (state.py < CFG.CEIL_Y) {
    state.py = CFG.CEIL_Y;
    if (state.pvy < 0) state.pvy = 0;
  }
  if (state.py + CFG.PLAYER_R >= CFG.SEA_Y) {
    state.status = 'lost';
    state.failure = 'splashed';
    pushFx(state, EV_HIT, state.px, CFG.SEA_Y);
    events.push(EV_LOST);
    return events;
  }

  // The gun, or the repair crew — never both.
  state.fireCooldown -= dt;
  if (state.input.firing) {
    if (state.fireCooldown <= 0) {
      for (let i = 0; i < state.pbullets.length; i += 1) {
        if (!state.pbullets[i].on) {
          const b = state.pbullets[i];
          b.on = true;
          b.x = wrapX(state.px + Math.cos(state.pa) * (CFG.PLAYER_R + 5));
          b.y = state.py + Math.sin(state.pa) * (CFG.PLAYER_R + 5);
          b.vx = state.pvx * 0.5 + Math.cos(state.pa) * CFG.PBULLET_SPEED;
          b.vy = state.pvy * 0.5 + Math.sin(state.pa) * CFG.PBULLET_SPEED;
          b.ttl = CFG.PBULLET_TTL;
          state.fireCooldown = CFG.FIRE_INTERVAL;
          events.push(EV_FIRE);
          break;
        }
      }
    }
  } else if (state.hull < CFG.HULL) {
    state.hull += CFG.REGEN * dt;
    if (state.hull > CFG.HULL) state.hull = CFG.HULL;
  }

  // Rounds in the air.
  for (let i = 0; i < state.pbullets.length; i += 1) {
    const b = state.pbullets[i];
    if (!b.on) continue;
    b.ttl -= dt;
    b.x = wrapX(b.x + b.vx * dt);
    b.y += b.vy * dt;
    if (b.ttl <= 0 || b.y < -10 || b.y > CFG.SEA_Y) b.on = false;
  }
  for (let i = 0; i < state.ebullets.length; i += 1) {
    const b = state.ebullets[i];
    if (!b.on) continue;
    b.ttl -= dt;
    b.x = wrapX(b.x + b.vx * dt);
    b.y += b.vy * dt;
    if (b.ttl <= 0 || b.y < -10 || b.y > CFG.SEA_Y + 6) {
      b.on = false;
      continue;
    }
    const dx = b.x - state.px;
    const dy = b.y - state.py;
    const rr = CFG.PLAYER_R + 3;
    if (dx * dx + dy * dy <= rr * rr) {
      b.on = false;
      if (state.grace <= 0) {
        state.hull -= CFG.BULLET_DMG;
        state.grace = CFG.HIT_GRACE;
        pushFx(state, EV_HIT, state.px, state.py);
        events.push(EV_HIT);
        if (state.hull <= 0) {
          state.hull = 0;
          state.status = 'lost';
          state.failure = 'shot-down';
          events.push(EV_LOST);
          return events;
        }
      }
    }
  }

  // The chain decays by silence alone.
  if (state.chain > 0) {
    state.chainT -= dt;
    if (state.chainT <= 0) state.chain = 0;
  }

  // The seeded air force.
  state.fighterT -= dt;
  if (state.fighterT <= 0) {
    const pressure = Math.max(
      CFG.FIGHTER_MIN,
      CFG.FIGHTER_START - state.kills * 0.02,
    );
    state.fighterT = pressure;
    if (state.aircraft < CFG.AIRCRAFT_MAX) {
      const fromLeft = nextRand(state) < 0.5;
      const y = 40 + nextRand(state) * 280;
      const type = state.kills >= CFG.ACE_AFTER && nextRand(state) < CFG.ACE_CHANCE ? 1 : 0;
      spawnEnemy(state, type, fromLeft ? 2 : CFG.W - 2, y, fromLeft ? 0 : Math.PI);
    }
  }
  state.boatT -= dt;
  if (state.boatT <= 0) {
    state.boatT = CFG.BOAT_EVERY;
    if (state.boats < CFG.BOAT_MAX) {
      const fromLeft = nextRand(state) < 0.5;
      spawnEnemy(state, 2, fromLeft ? 2 : CFG.W - 2, 0, 0);
    }
  }

  // Enemies fly, shoot, and die.
  for (let i = 0; i < state.enemies.length; i += 1) {
    const e = state.enemies[i];
    if (!e.on) continue;
    const spec = TYPES[e.type];
    if (e.type === 2) {
      // Boats crawl the sea toward the plane's shadow.
      const dir = state.px > e.x ? 1 : -1;
      e.x = wrapX(e.x + dir * spec.speed * dt);
    } else {
      // Aircraft steer toward the plane with a limited turn rate — but break
      // off inside 90px and fly past. Bandits are gunners, not missiles;
      // without the break-off they ram-chain the hull flat in seconds.
      const hdx = state.px - e.x;
      const hdy = state.py - e.y;
      if (hdx * hdx + hdy * hdy > 90 * 90) {
        const want = Math.atan2(hdy, hdx);
        const d = angleDiff(e.a, want);
        const max = spec.turn * dt;
        e.a += d > max ? max : d < -max ? -max : d;
      }
      e.x = wrapX(e.x + Math.cos(e.a) * spec.speed * dt);
      e.y += Math.sin(e.a) * spec.speed * dt;
      if (e.y < CFG.CEIL_Y) e.y = CFG.CEIL_Y;
      if (e.y > CFG.SEA_Y - 24) e.y = CFG.SEA_Y - 24;
    }

    // Trigger discipline. Gunners scatter a little — perfect aim would make
    // every slow moment lethal, and the scatter is seeded like everything.
    e.cd -= dt;
    if (e.cd <= 0) {
      e.cd = spec.fireEvery;
      const scatter = (nextRand(state) - 0.5) * 0.3;
      const aim = Math.atan2(state.py - e.y, state.px - e.x) + scatter;
      spawnEnemyBullet(state, e.x, e.y, Math.cos(aim) * spec.shot, Math.sin(aim) * spec.shot);
    }

    // Player rounds.
    for (let j = 0; j < state.pbullets.length; j += 1) {
      const b = state.pbullets[j];
      if (!b.on) continue;
      const rr = spec.r + 3;
      const bx = b.x - e.x;
      const by = b.y - e.y;
      if (bx * bx + by * by <= rr * rr) {
        b.on = false;
        e.hp -= 1;
        if (e.hp <= 0) {
          e.on = false;
          state.liveEnemies -= 1;
          if (e.type === 2) state.boats -= 1;
      else state.aircraft -= 1;
          state.kills += 1;
          state.chain += 1;
          state.chainT = CFG.CHAIN_WINDOW;
          const m = multiplier(state);
          if (m > state.bestMultiplier) state.bestMultiplier = m;
          state.score += spec.value * m;
          pushFx(state, EV_KILL, e.x, e.y);
          events.push(EV_KILL);
          if (state.kills >= CFG.SORTIE_KILLS) {
            state.status = 'won';
            events.push(EV_WON);
            return events;
          }
          break;
        }
      }
    }
    if (!e.on) continue;

    // Ramming: the enemy always loses the exchange, the hull pays for it.
    const rx = e.x - state.px;
    const ry = e.y - state.py;
    const rr = spec.r + CFG.PLAYER_R;
    if (rx * rx + ry * ry <= rr * rr) {
      e.on = false;
      state.liveEnemies -= 1;
      if (e.type === 2) state.boats -= 1;
      else state.aircraft -= 1;
      if (state.grace <= 0) {
        state.hull -= CFG.RAM_DMG;
        state.grace = CFG.HIT_GRACE;
        pushFx(state, EV_HIT, state.px, state.py);
        events.push(EV_HIT);
        if (state.hull <= 0) {
          state.hull = 0;
          state.status = 'lost';
          state.failure = 'shot-down';
          events.push(EV_LOST);
          return events;
        }
      }
    }
  }

  return events;
}

// --- Score ------------------------------------------------------------------------

export function terminalScore(state) {
  let total = state.score;
  if (state.status === 'won') {
    total += CFG.WIN_BASE + CFG.WIN_PER_HULL * Math.round(state.hull);
  }
  return Math.max(0, Math.round(total));
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    failure: state.failure,
    kills: state.kills,
    bestMultiplier: state.bestMultiplier,
    score: terminalScore(state),
  };
}

// Shared score contract: completed sorties rank ahead of ended ones, then
// score, then this game's stated tie-break — more kills.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return b.kills - a.kills;
}
