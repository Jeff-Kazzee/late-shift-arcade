// NEON TIDE simulation — a Gradius-lineage horizontal shmup as plain
// serializable data, kept Shorts-simple: three weapon tiers, seeded wave
// formations, one mid-boss and one end-boss per loop. Clearing the end-boss
// opens an extraction window: bank the run and win, or ride the tide into
// the next loop, where everything is faster, tougher, and worth more.
//
// PERFORMANCE CONTRACT (this is the point of the game):
// - Every entity lives in a fixed-size pool allocated once in newGame().
//   The hot loop (step) allocates NOTHING: no arrays, no objects, no
//   closures, no string building. Effects go through a fixed ring.
// - The stress test in neon-tide.test.js steps 500+ live entities for 60
//   simulated seconds and asserts bounded step time and zero pool growth.
//
// Rules of the file, same as every cartridge here:
// 1. No Math.random — a seed names one exact tide (mulberry32).
// 2. No canvas, DOM, clock, or input. Player intent arrives as commands.
// 3. Time advances in fixed steps; seed + command log ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  FIELD: { x0: 16, y0: 66, x1: 624, y1: 462 },
  PLAYER_MAX_X: 320, // the ship owns the left half of the water

  LIVES: 3,
  RESPAWN_INVULN: 3.0,
  PLAYER_SPEED: 220,
  PLAYER_R: 8, // the hull you see
  PLAYER_HIT: 5, // the hull that counts — shmup-standard small hitbox

  FIRE_INTERVAL: 1 / 8,
  PBULLET_SPEED: 480,

  // Weapon tiers: 0 PULSE (single), 1 TWIN (parallel pair), 2 WAVE (3-way).
  WEAPON_MAX: 2,

  // The loop timeline, in seconds from the top of each loop.
  WAVE_GAP: 3.2,
  BOSS1_T: 45,
  BOSS2_T: 100,
  EXTRACT_WINDOW: 8, // seconds to bank the run after the end-boss falls

  BOSS1_HP: 60,
  BOSS2_HP: 90,

  LOOP_SCALE: 0.5, // +50% enemy hp/speed and +100% value weight per loop

  // Fixed pool capacities — allocated once, never resized.
  ENEMY_POOL: 224,
  PBULLET_POOL: 96,
  EBULLET_POOL: 320,
  PICKUP_POOL: 8,
  FX_RING: 64,

  // SCORE (the documented formula):
  //   every kill pays its value × (1 + loop)
  //   mid-boss 5000 × (1 + loop) · end-boss 15000 × (1 + loop)
  //   extraction (the win): + 10000 + 5000 × loops cleared + 2000 × lives left
  //   lost: you keep what the tide paid — nothing else.
  BOSS1_VALUE: 5000,
  BOSS2_VALUE: 15000,
  EXTRACT_BASE: 10000,
  EXTRACT_PER_LOOP: 5000,
  EXTRACT_PER_LIFE: 2000,
};

// type: 0 swooper, 1 rusher, 2 turret, 3 carrier
export const TYPES = Object.freeze([
  Object.freeze({ name: 'SWOOPER', r: 10, hp: 1, vx: -110, value: 100 }),
  Object.freeze({ name: 'RUSHER', r: 9, hp: 1, vx: -260, value: 150 }),
  Object.freeze({ name: 'TURRET', r: 13, hp: 3, vx: -40, value: 300, fireEvery: 2.0, shot: 210 }),
  Object.freeze({ name: 'CARRIER', r: 14, hp: 4, vx: -60, value: 200 }),
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
    enemies.push({ on: false, type: 0, x: 0, y: 0, baseY: 0, phase: 0, hp: 0, cd: 0 });
  }
  const pbullets = [];
  for (let i = 0; i < CFG.PBULLET_POOL; i += 1) {
    pbullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0 });
  }
  const ebullets = [];
  for (let i = 0; i < CFG.EBULLET_POOL; i += 1) {
    ebullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0 });
  }
  const pickups = [];
  for (let i = 0; i < CFG.PICKUP_POOL; i += 1) {
    pickups.push({ on: false, x: 0, y: 0 });
  }
  const fx = [];
  for (let i = 0; i < CFG.FX_RING; i += 1) {
    fx.push({ seq: 0, kind: '', x: 0, y: 0 });
  }
  return {
    seed: seed >>> 0,
    rngState: seed >>> 0,
    tick: 0,
    t: 0, // seconds inside the CURRENT loop
    status: 'briefing', // briefing | running | won | lost
    phase: 'wave', // wave | boss | window
    loop: 0,
    lives: CFG.LIVES,
    invuln: 1.0,
    px: 70,
    py: (CFG.FIELD.y0 + CFG.FIELD.y1) / 2,
    weapon: 0,
    fireCooldown: 0,
    waveT: 1.2,
    windowT: 0,
    boss: { on: false, kind: 0, x: 0, y: 0, dy: 1, hp: 0, hpMax: 0, cd: 0 },
    bossesDown: 0,
    kills: 0,
    score: 0,
    liveEnemies: 0,
    input: { mx: 0, my: 0, firing: false },
    enemies,
    pbullets,
    ebullets,
    pickups,
    fx,
    fxSeq: 0,
    events: [],
  };
}

export const loopScale = (state) => 1 + state.loop * CFG.LOOP_SCALE;
export const killValue = (state, base) => base * (1 + state.loop);

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

export function setFire(state, on) {
  state.input.firing = !!on;
  return true;
}

// Bank the run. Only legal inside the extraction window.
export function extract(state) {
  if (state.status !== 'running' || state.phase !== 'window') return false;
  state.status = 'won';
  return true;
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'move':
      return setMove(state, command.x, command.y);
    case 'fire':
      return setFire(state, command.on);
    case 'extract':
      return extract(state);
    default:
      return false;
  }
}

// --- Spawning ----------------------------------------------------------------------

// Exported so the stress test floods the water through the same door the sim
// uses. Returns the slot index or -1 when the pool is saturated.
export function spawnEnemy(state, type, x, y, phase = 0) {
  const pool = state.enemies;
  for (let i = 0; i < pool.length; i += 1) {
    if (!pool[i].on) {
      const e = pool[i];
      e.on = true;
      e.type = type;
      e.x = x;
      e.y = y;
      e.baseY = y;
      e.phase = phase;
      e.hp = Math.ceil(TYPES[type].hp * loopScale(state));
      e.cd = TYPES[type].fireEvery ?? 0;
      state.liveEnemies += 1;
      return i;
    }
  }
  return -1;
}

// Exported for the stress test: hostile fire goes through this same slot hunt.
export function spawnEnemyBullet(state, x, y, vx, vy) {
  const pool = state.ebullets;
  for (let i = 0; i < pool.length; i += 1) {
    if (!pool[i].on) {
      const b = pool[i];
      b.on = true;
      b.x = x;
      b.y = y;
      b.vx = vx;
      b.vy = vy;
      return i;
    }
  }
  return -1;
}

function spawnPickup(state, x, y) {
  for (let i = 0; i < state.pickups.length; i += 1) {
    if (!state.pickups[i].on) {
      const p = state.pickups[i];
      p.on = true;
      p.x = x;
      p.y = y;
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

// Formations: a handful of authored shapes, seeded onto the timeline.
function spawnFormation(state) {
  const roll = nextRand(state);
  const baseY = CFG.FIELD.y0 + 60 + nextRand(state) * (CFG.FIELD.y1 - CFG.FIELD.y0 - 120);
  const x = CFG.FIELD.x1 + 20;
  if (roll < 0.35) {
    for (let i = 0; i < 5; i += 1) spawnEnemy(state, 0, x + i * 34, baseY, i * 0.7);
  } else if (roll < 0.6) {
    for (let i = 0; i < 3; i += 1) spawnEnemy(state, 1, x + i * 20, baseY - 40 + i * 40, 0);
  } else if (roll < 0.85) {
    spawnEnemy(state, 2, x, baseY - 50, 0);
    spawnEnemy(state, 2, x + 30, baseY + 50, 0);
  } else {
    spawnEnemy(state, 3, x, baseY, 0);
    spawnEnemy(state, 0, x + 40, baseY - 50, 0.5);
    spawnEnemy(state, 0, x + 40, baseY + 50, 1.1);
  }
}

function spawnBoss(state, kind) {
  const b = state.boss;
  b.on = true;
  b.kind = kind;
  b.x = CFG.FIELD.x1 - 70;
  b.y = (CFG.FIELD.y0 + CFG.FIELD.y1) / 2;
  b.dy = 1;
  b.hpMax = Math.ceil((kind === 1 ? CFG.BOSS1_HP : CFG.BOSS2_HP) * loopScale(state));
  b.hp = b.hpMax;
  b.cd = 1.2;
}

const EV_WON = 'won';
const EV_LOST = 'lost';
const EV_HIT = 'hit';
const EV_KILL = 'kill';
const EV_FIRE = 'fire';
const EV_BOSS = 'boss';
const EV_BOSSDOWN = 'bossdown';
const EV_PICKUP = 'pickup';
const EV_WINDOW = 'window';
const EV_LOOP = 'loop';

function killPlayer(state, events) {
  state.lives -= 1;
  state.invuln = CFG.RESPAWN_INVULN;
  state.px = 70;
  state.py = (CFG.FIELD.y0 + CFG.FIELD.y1) / 2;
  if (state.weapon > 0) state.weapon -= 1;
  // The blast clears every hostile round — a classic mercy, and it keeps a
  // respawn from being an instant second death.
  for (let i = 0; i < state.ebullets.length; i += 1) state.ebullets[i].on = false;
  pushFx(state, EV_HIT, state.px, state.py);
  events.push(EV_HIT);
  if (state.lives <= 0) {
    state.status = 'lost';
    events.push(EV_LOST);
    return true;
  }
  return false;
}

function creditKill(state, spec, x, y, events) {
  state.kills += 1;
  state.score += killValue(state, spec.value);
  pushFx(state, EV_KILL, x, y);
  events.push(EV_KILL);
}

// --- The tick ------------------------------------------------------------------------

export function step(state, dt = CFG.TICK) {
  const events = state.events;
  events.length = 0;
  if (state.status !== 'running') return events;
  state.tick += 1;
  state.t += dt;

  const { x0, y0, x1, y1 } = CFG.FIELD;
  const scale = loopScale(state);

  // The ship.
  state.px += state.input.mx * CFG.PLAYER_SPEED * dt;
  state.py += state.input.my * CFG.PLAYER_SPEED * dt;
  if (state.px < x0 + CFG.PLAYER_R) state.px = x0 + CFG.PLAYER_R;
  if (state.px > CFG.PLAYER_MAX_X) state.px = CFG.PLAYER_MAX_X;
  if (state.py < y0 + CFG.PLAYER_R) state.py = y0 + CFG.PLAYER_R;
  if (state.py > y1 - CFG.PLAYER_R) state.py = y1 - CFG.PLAYER_R;
  if (state.invuln > 0) state.invuln -= dt;

  // The gun. PULSE, TWIN, or WAVE.
  state.fireCooldown -= dt;
  if (state.input.firing && state.fireCooldown <= 0) {
    state.fireCooldown = CFG.FIRE_INTERVAL;
    events.push(EV_FIRE);
    for (let shot = 0; shot < (state.weapon === 0 ? 1 : state.weapon === 1 ? 2 : 3); shot += 1) {
      for (let i = 0; i < state.pbullets.length; i += 1) {
        if (!state.pbullets[i].on) {
          const b = state.pbullets[i];
          b.on = true;
          b.x = state.px + CFG.PLAYER_R + 4;
          if (state.weapon === 1) {
            b.y = state.py + (shot === 0 ? -7 : 7);
            b.vx = CFG.PBULLET_SPEED;
            b.vy = 0;
          } else if (state.weapon === 2) {
            b.y = state.py;
            b.vx = CFG.PBULLET_SPEED;
            b.vy = shot === 0 ? 0 : shot === 1 ? -110 : 110;
          } else {
            b.y = state.py;
            b.vx = CFG.PBULLET_SPEED;
            b.vy = 0;
          }
          break;
        }
      }
    }
  }

  // Rounds out.
  for (let i = 0; i < state.pbullets.length; i += 1) {
    const b = state.pbullets[i];
    if (!b.on) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x > x1 + 10 || b.y < y0 - 10 || b.y > y1 + 10) b.on = false;
  }
  // Rounds in.
  for (let i = 0; i < state.ebullets.length; i += 1) {
    const b = state.ebullets[i];
    if (!b.on) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < x0 - 10 || b.x > x1 + 10 || b.y < y0 - 10 || b.y > y1 + 10) {
      b.on = false;
      continue;
    }
    if (state.invuln <= 0) {
      const dx = b.x - state.px;
      const dy = b.y - state.py;
      const rr = CFG.PLAYER_HIT + 3;
      if (dx * dx + dy * dy <= rr * rr) {
        b.on = false;
        if (killPlayer(state, events)) return events;
      }
    }
  }

  // The timeline: waves, then a boss, then more waves, then the end-boss,
  // then the window. Spawning pauses while a boss holds the screen.
  if (state.phase === 'wave') {
    state.waveT -= dt;
    if (state.waveT <= 0) {
      state.waveT = CFG.WAVE_GAP;
      spawnFormation(state);
    }
    if (state.t >= CFG.BOSS1_T && state.bossesDown % 2 === 0 && !state.boss.on) {
      state.phase = 'boss';
      spawnBoss(state, 1);
      events.push(EV_BOSS);
    } else if (state.t >= CFG.BOSS2_T && state.bossesDown % 2 === 1 && !state.boss.on) {
      state.phase = 'boss';
      spawnBoss(state, 2);
      events.push(EV_BOSS);
    }
  } else if (state.phase === 'window') {
    state.windowT -= dt;
    if (state.windowT <= 0) {
      // The tide comes back in: next loop, same water, harder everything.
      state.loop += 1;
      state.t = 0;
      state.phase = 'wave';
      state.waveT = 1.2;
      events.push(EV_LOOP);
    }
  }

  // The boss.
  if (state.boss.on) {
    const b = state.boss;
    const speed = (b.kind === 1 ? 70 : 95) * scale;
    b.y += b.dy * speed * dt;
    if (b.y < y0 + 60) b.dy = 1;
    if (b.y > y1 - 60) b.dy = -1;
    b.cd -= dt;
    if (b.cd <= 0) {
      b.cd = (b.kind === 1 ? 1.6 : 1.3) / scale;
      const dx = state.px - b.x;
      const dy = state.py - b.y;
      const dist = Math.hypot(dx, dy) || 1;
      const sp = 190 * scale;
      // A fan around the aim line; the end-boss throws a wider one.
      const arms = b.kind === 1 ? 3 : 5;
      for (let a = 0; a < arms; a += 1) {
        const off = (a - (arms - 1) / 2) * 0.28;
        const cos = Math.cos(off);
        const sin = Math.sin(off);
        const ux = (dx / dist) * cos - (dy / dist) * sin;
        const uy = (dx / dist) * sin + (dy / dist) * cos;
        spawnEnemyBullet(state, b.x - 20, b.y, ux * sp, uy * sp);
      }
    }
    // Player rounds on the boss.
    for (let j = 0; j < state.pbullets.length; j += 1) {
      const pb = state.pbullets[j];
      if (!pb.on) continue;
      const dx = pb.x - b.x;
      const dy = pb.y - b.y;
      if (dx * dx + dy * dy <= 26 * 26) {
        pb.on = false;
        b.hp -= 1;
        if (b.hp <= 0) {
          b.on = false;
          state.bossesDown += 1;
          state.score += killValue(state, b.kind === 1 ? CFG.BOSS1_VALUE : CFG.BOSS2_VALUE);
          pushFx(state, EV_BOSSDOWN, b.x, b.y);
          events.push(EV_BOSSDOWN);
          if (b.kind === 2) {
            state.phase = 'window';
            state.windowT = CFG.EXTRACT_WINDOW;
            events.push(EV_WINDOW);
          } else {
            state.phase = 'wave';
          }
          break;
        }
      }
    }
    // Ramming the boss.
    if (state.boss.on && state.invuln <= 0) {
      const dx = state.px - b.x;
      const dy = state.py - b.y;
      if (dx * dx + dy * dy <= (26 + CFG.PLAYER_HIT) * (26 + CFG.PLAYER_HIT)) {
        if (killPlayer(state, events)) return events;
      }
    }
  }

  // The swarm.
  for (let i = 0; i < state.enemies.length; i += 1) {
    const e = state.enemies[i];
    if (!e.on) continue;
    const spec = TYPES[e.type];
    e.x += spec.vx * scale * dt;
    if (e.type === 0) {
      e.phase += dt * 3;
      e.y = e.baseY + Math.sin(e.phase) * 42;
    }
    if (e.x < x0 - 24) {
      e.on = false;
      state.liveEnemies -= 1;
      continue;
    }
    if (e.type === 2) {
      e.cd -= dt;
      // Turrets only fire once they are actually on screen — shots from
      // beyond the right edge would be undodgeable by definition.
      if (e.cd <= 0 && e.x > state.px + 60 && e.x < x1 - 6) {
        e.cd = spec.fireEvery / scale;
        const dx = state.px - e.x;
        const dy = state.py - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        spawnEnemyBullet(state, e.x, e.y, (dx / dist) * spec.shot * scale, (dy / dist) * spec.shot * scale);
      }
    }

    // Player rounds.
    for (let j = 0; j < state.pbullets.length; j += 1) {
      const pb = state.pbullets[j];
      if (!pb.on) continue;
      const rr = spec.r + 3;
      const dx = pb.x - e.x;
      const dy = pb.y - e.y;
      if (dx * dx + dy * dy <= rr * rr) {
        pb.on = false;
        e.hp -= 1;
        if (e.hp <= 0) {
          e.on = false;
          state.liveEnemies -= 1;
          creditKill(state, spec, e.x, e.y, events);
          if (e.type === 3) spawnPickup(state, e.x, e.y);
          break;
        }
      }
    }
    if (!e.on) continue;

    // Hull contact.
    if (state.invuln <= 0) {
      const rr = spec.r + CFG.PLAYER_HIT;
      const dx = e.x - state.px;
      const dy = e.y - state.py;
      if (dx * dx + dy * dy <= rr * rr) {
        e.on = false;
        state.liveEnemies -= 1;
        if (killPlayer(state, events)) return events;
      }
    }
  }

  // Pickups drift home.
  for (let i = 0; i < state.pickups.length; i += 1) {
    const p = state.pickups[i];
    if (!p.on) continue;
    p.x -= 55 * dt;
    if (p.x < x0 - 16) {
      p.on = false;
      continue;
    }
    const dx = p.x - state.px;
    const dy = p.y - state.py;
    if (dx * dx + dy * dy <= (CFG.PLAYER_R + 12) * (CFG.PLAYER_R + 12)) {
      p.on = false;
      if (state.weapon < CFG.WEAPON_MAX) state.weapon += 1;
      state.score += 500;
      pushFx(state, EV_PICKUP, p.x, p.y);
      events.push(EV_PICKUP);
    }
  }

  return events;
}

// --- Score ------------------------------------------------------------------------

export function terminalScore(state) {
  let total = state.score;
  if (state.status === 'won') {
    total +=
      CFG.EXTRACT_BASE + CFG.EXTRACT_PER_LOOP * state.loop + CFG.EXTRACT_PER_LIFE * state.lives;
  }
  return Math.max(0, Math.round(total));
}

export function runSummary(state) {
  return {
    seed: state.seed,
    status: state.status,
    loops: state.loop,
    kills: state.kills,
    bossesDown: state.bossesDown,
    score: terminalScore(state),
  };
}

// Shared score contract: extracted runs rank ahead of drowned ones, then
// score, then this game's stated tie-break — deeper loops, then more kills.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  if (a.loops !== b.loops) return b.loops - a.loops;
  return b.kills - a.kills;
}
