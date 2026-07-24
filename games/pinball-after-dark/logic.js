// PINBALL AFTER DARK — pure simulation.
//
// Every rule lives here and nothing in this file knows a canvas exists. State
// is plain JSON: numbers, strings, booleans, arrays, and plain objects. No
// geometry object from table.js is ever stored in it — only indices — so a
// state can be serialised, shipped, and stepped again to the same result.
// Randomness is a seeded integer in the state; there is no Math.random here.

import { TABLE, DISTRICTS, DROPS, BUMPERS, POSTS, WALLS } from './table.js';

export const CFG = {
  BALL_R: 7,
  BALLS: 3,

  // A 480px playfield stands in for a table roughly a third as tall as a real
  // one, so gravity is scaled below the ~1230px/s² a 6.5° incline would give:
  // realistic gravity on a short table just reads as "everything falls".
  GRAVITY: 820,
  // Rolling loss, applied as a per-second fraction of speed.
  FRICTION: 0.22,
  // Headroom above a full flipper shot (~1090px/s) on purpose. A cap that
  // clipped ordinary shots would make a tap and a full swing come out at
  // exactly the same speed and erase the skill gradient entirely.
  MAX_SPEED: 1350,
  // Tangential bite, as a per-SECOND rate. Applying a fixed fraction per
  // contact instead looked reasonable and was catastrophic: a resting ball
  // touches its surface every substep, so 6%-per-contact became ~500 hits a
  // second and glued the ball to any shallow slope it landed on.
  SURFACE_MU: 3,

  // Collision is substepped: no substep may advance a ball further than this,
  // which is half the ball radius and the reason nothing tunnels.
  MAX_TRAVEL: 2.5,
  MAX_SUBSTEPS: 12,

  BUMPER_E: 0.45,
  BUMPER_KICK: 330,
  POST_E: 0.72,
  TARGET_E: 0.6,
  // Nearly dead on purpose. Flipper power comes from the swing, which is what
  // lets a player dead-bounce and cradle instead of the bat acting as a
  // trampoline. Tuned against MAX_SPEED so a tip shot lands near 1090px/s and
  // a shot taken near the pivot lands near 470: a real, readable gradient.
  FLIPPER_E: 0.12,
  // 60° of sweep at 17rad/s is a 61ms stroke. The return is deliberately much
  // slower so releasing a flipper never punts the ball back up the table.
  FLIP_UP_SPEED: 17,
  FLIP_DOWN_SPEED: 9,

  LAUNCH_MIN: 980,
  LAUNCH_MAX: 1150,
  BALL_SAVE: 5,
  SAUCER_HOLD: 0.75,
  SAUCER_EJECT: 250,
  DROP_RESET: 2.5,

  NUDGE_VX: 165,
  NUDGE_VY: 60,
  NUDGE_COST: 0.45,
  NUDGE_COOLDOWN: 0.22,
  NUDGE_FX: 0.18,
  TILT_DECAY: 0.5,
  TILT_LIMIT: 3,

  // A ball that has barely moved for this long gets a seeded search kick.
  // Only a ball on a HELD flipper is exempt: that is a cradle, which is skill.
  // Exempting every flipper contact also exempted the pivot pocket, which is
  // exactly the case the search exists to rescue.
  IDLE_SPEED: 32,
  IDLE_LIMIT: 2.5,
  SEARCH_KICK: 280,

  SCORE_COOLDOWN: 0.12,
  MAX_GRID: 9,

  // Table points, all multiplied by the grid multiplier.
  P_BUMPER: 500,
  P_SLING: 210,
  P_TARGET: 2500,
  P_ARM: 12000,
  P_DROP: 1800,
  P_DROP_BANK: 18000,
  P_SAUCER: 6000,
  P_BANK: 40000,
  P_JACKPOT: 60000,

  JACKPOTS_TO_WIN: 3,

  // End-of-run bonuses, straight from the roadmap's score contract.
  B_DISTRICT: 100000,
  B_WIN: 500000,
  B_BALL: 50000,
  B_TILT: 25000,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// mulberry32 over a uint32 stored in the state. Deterministic, tiny, and it
// keeps the whole generator inside the serialisable snapshot.
function rnd(state) {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function newBall(x, y, vx = 0, vy = 0) {
  return { x, y, vx, vy, idle: 0, cradled: false };
}

export function newGame(seed = 20260724) {
  const state = {
    version: 1,
    seed: seed >>> 0,
    phase: 'ready', // ready | play | won | lost
    mode: 'normal', // normal | blackout
    elapsed: 0,
    tablePoints: 0,
    ballsLeft: CFG.BALLS,
    balls: [],
    flippers: [
      { want: false, angle: TABLE.flippers[0].rest, omega: 0 },
      { want: false, angle: TABLE.flippers[1].rest, omega: 0 },
    ],
    districts: DISTRICTS.map(() => ({ status: 'dark', charge: 0 })),
    drops: DROPS.map(() => false),
    dropTimer: 0,
    bumperCool: BUMPERS.map(() => 0),
    districtCool: DISTRICTS.map(() => 0),
    dropCool: DROPS.map(() => 0),
    slingCool: [0, 0],
    saucer: { held: false, timer: 0 },
    jackpots: 0,
    saveTimer: 0,
    saveUsed: false,
    tiltMeter: 0,
    tiltWarnings: 0,
    tiltThisBall: 0,
    tiltLocked: false,
    nudgeCooldown: 0,
    nudgeFx: 0,
    nudgeDir: 0,
    // Purely for the HUD, but it is state, not a render field: a serialised
    // run replays with the same readout.
    lastAward: '',
    lastAwardT: 0,
  };
  serve(state, true);
  return state;
}

// Put a fresh ball in the plunger lane. `consume` is false for a ball save,
// which must not cost the player one of their three balls.
function serve(state, consume = true) {
  if (consume) {
    state.ballsLeft -= 1;
    // The save belongs to the BALL, not to the launch. Re-arming it on every
    // plunge made a ball that drained quickly loop forever: save, re-serve,
    // re-launch, save again, and the run could never end.
    state.saveUsed = false;
  }
  state.balls = [newBall(TABLE.lane.restX, TABLE.lane.restY)];
  state.phase = 'ready';
  state.saveTimer = 0;
}

export function countDistricts(state) {
  let lit = 0;
  let armed = 0;
  for (const d of state.districts) {
    if (d.status === 'lit') lit += 1;
    else if (d.status === 'armed') armed += 1;
  }
  return { lit, armed };
}

// The whole risk/reward dial. A banked district is worth +1 forever; a district
// left armed is worth +2 but evaporates on the next drain. Four armed districts
// score at 9x — nearly twice the 5x a fully banked city pays — which is the
// choice the table is built around.
export function gridMultiplier(state) {
  const { lit, armed } = countDistricts(state);
  return Math.min(CFG.MAX_GRID, 1 + lit + 2 * armed);
}

function award(state, points, label) {
  if (state.tiltLocked) return;
  state.tablePoints += Math.round(points);
  if (label) {
    state.lastAward = label;
    state.lastAwardT = 1.4;
  }
}

export function finalScore(state) {
  const { lit } = countDistricts(state);
  return Math.max(0, Math.round(
    state.tablePoints
    + CFG.B_DISTRICT * lit
    + (state.phase === 'won' ? CFG.B_WIN : 0)
    + CFG.B_BALL * Math.max(0, state.ballsLeft)
    - CFG.B_TILT * state.tiltWarnings,
  ));
}

export function scoreBreakdown(state) {
  const { lit } = countDistricts(state);
  return {
    table: state.tablePoints,
    districts: CFG.B_DISTRICT * lit,
    win: state.phase === 'won' ? CFG.B_WIN : 0,
    balls: CFG.B_BALL * Math.max(0, state.ballsLeft),
    // Guarded so a clean run reads "0" rather than JavaScript's "-0".
    tilt: state.tiltWarnings ? -CFG.B_TILT * state.tiltWarnings : 0,
    total: finalScore(state),
  };
}

// --- player actions -------------------------------------------------------

export function setFlipper(state, side, on) {
  state.flippers[side].want = Boolean(on);
}

export function launch(state, power = 1) {
  if (state.phase !== 'ready' || state.balls.length === 0) return false;
  const ball = state.balls[0];
  ball.vx = 0;
  ball.vy = -(CFG.LAUNCH_MIN + (CFG.LAUNCH_MAX - CFG.LAUNCH_MIN) * clamp(power, 0, 1));
  ball.idle = 0;
  state.phase = 'play';
  state.saveTimer = state.saveUsed ? 0 : CFG.BALL_SAVE;
  return true;
}

// Returns the event the nudge produced, or null when it was ignored. A nudge
// is never free: it always feeds the tilt meter, and three warnings on one
// ball kill the flippers until that ball drains.
export function nudge(state, dir) {
  if (state.phase !== 'play' || state.tiltLocked || state.nudgeCooldown > 0) return null;
  state.nudgeCooldown = CFG.NUDGE_COOLDOWN;
  state.nudgeFx = CFG.NUDGE_FX;
  state.nudgeDir = dir;
  for (const ball of state.balls) {
    ball.vx += dir * CFG.NUDGE_VX;
    ball.vy -= CFG.NUDGE_VY;
    ball.idle = 0;
  }
  state.tiltMeter += CFG.NUDGE_COST;
  if (state.tiltMeter < 1) return 'nudge';
  state.tiltMeter = 0;
  state.tiltWarnings += 1;
  state.tiltThisBall += 1;
  if (state.tiltThisBall >= CFG.TILT_LIMIT) {
    state.tiltLocked = true;
    return 'tilt';
  }
  return 'tiltwarn';
}

// --- collision primitives -------------------------------------------------

// Closest point on a segment, then a radial normal from it. Returns null when
// the ball is clear, so callers never branch on distances themselves.
function hitSegment(ball, seg, radius) {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((ball.x - seg.ax) * dx + (ball.y - seg.ay) * dy) / len2, 0, 1) : 0;
  const cx = seg.ax + dx * t;
  const cy = seg.ay + dy * t;
  let nx = ball.x - cx;
  let ny = ball.y - cy;
  let d = Math.hypot(nx, ny);
  if (d >= radius) return null;
  if (d < 1e-6) {
    // Dead centre on the line: fall back to the segment's own perpendicular.
    const l = Math.hypot(dx, dy) || 1;
    nx = -dy / l;
    ny = dx / l;
    d = 0;
  } else {
    nx /= d;
    ny /= d;
  }
  return { nx, ny, depth: radius - d, cx, cy };
}

function hitCircle(ball, circle, radius) {
  let nx = ball.x - circle.x;
  let ny = ball.y - circle.y;
  let d = Math.hypot(nx, ny);
  if (d >= radius) return null;
  if (d < 1e-6) {
    nx = 0;
    ny = -1;
    d = 0;
  } else {
    nx /= d;
    ny /= d;
  }
  return { nx, ny, depth: radius - d };
}

// Positional correction first, then the impulse. Doing it the other way round
// is how balls sink into geometry and stick there.
function resolve(ball, hit, e, kick, h, sx = 0, sy = 0) {
  ball.x += hit.nx * hit.depth;
  ball.y += hit.ny * hit.depth;
  const vn = (ball.vx - sx) * hit.nx + (ball.vy - sy) * hit.ny;
  if (vn < 0) {
    const j = -(1 + e) * vn;
    ball.vx += hit.nx * j;
    ball.vy += hit.ny * j;
    const tx = -hit.ny;
    const ty = hit.nx;
    const vt = (ball.vx - sx) * tx + (ball.vy - sy) * ty;
    const mu = Math.min(0.5, CFG.SURFACE_MU * h);
    ball.vx -= tx * vt * mu;
    ball.vy -= ty * vt * mu;
  }
  if (kick) {
    ball.vx += hit.nx * kick;
    ball.vy += hit.ny * kick;
  }
}

function capSpeed(ball) {
  const s = Math.hypot(ball.vx, ball.vy);
  if (s > CFG.MAX_SPEED) {
    ball.vx = (ball.vx / s) * CFG.MAX_SPEED;
    ball.vy = (ball.vy / s) * CFG.MAX_SPEED;
  }
}

// --- table rules ----------------------------------------------------------

function armIfCharged(state, index, events) {
  const district = state.districts[index];
  if (district.status !== 'dark') return;
  if (district.charge < DISTRICTS[index].need) return;
  district.charge = DISTRICTS[index].need;
  district.status = 'armed';
  award(state, CFG.P_ARM * gridMultiplier(state), `${DISTRICTS[index].name} ARMED`);
  events.push('arm');
}

function hitDistrict(state, index, events) {
  if (state.districtCool[index] > 0) return;
  state.districtCool[index] = CFG.SCORE_COOLDOWN;
  const district = state.districts[index];
  const grid = gridMultiplier(state);
  if (district.status === 'lit') {
    // A banked district keeps paying, at double. Banking is progress AND
    // income, which is what stops "hoard everything armed" being strictly best.
    award(state, CFG.P_TARGET * 2 * grid, DISTRICTS[index].name);
    events.push('target');
    return;
  }
  award(state, CFG.P_TARGET * grid, DISTRICTS[index].name);
  events.push('target');
  if (district.status === 'dark') {
    district.charge += 1;
    armIfCharged(state, index, events);
  }
}

function hitDrop(state, index, events) {
  if (state.drops[index] || state.dropCool[index] > 0) return;
  state.dropCool[index] = CFG.SCORE_COOLDOWN;
  state.drops[index] = true;
  const grid = gridMultiplier(state);
  award(state, CFG.P_DROP * grid, 'SUBSTATION FEED');
  events.push('drop');
  if (!state.drops.every(Boolean)) return;
  // The bank is the second route onto the grid: it charges every dark district
  // at once, so a player who cannot hit an outer target can still make progress.
  award(state, CFG.P_DROP_BANK * grid, 'FEEDER BANK');
  events.push('drop-bank');
  for (let i = 0; i < state.districts.length; i += 1) {
    if (state.districts[i].status !== 'dark') continue;
    state.districts[i].charge += 1;
    armIfCharged(state, i, events);
  }
  state.dropTimer = CFG.DROP_RESET;
}

function startBlackout(state, events) {
  state.mode = 'blackout';
  state.jackpots = 0;
  events.push('blackout-start');
  state.lastAward = 'BLACKOUT';
  state.lastAwardT = 2;
  // Two extra balls fall in from the top lanes. Multiball balls are free: they
  // never touch ballsLeft, so a blackout drain does not cost a ball by itself.
  state.balls.push(newBall(150, 90, 40, 60));
  state.balls.push(newBall(450, 90, -40, 60));
}

function awardSaucer(state, events) {
  const grid = gridMultiplier(state);
  if (state.mode === 'blackout') {
    state.jackpots += 1;
    award(state, CFG.P_JACKPOT * grid, `JACKPOT ${state.jackpots}/${CFG.JACKPOTS_TO_WIN}`);
    events.push('jackpot');
    if (state.jackpots >= CFG.JACKPOTS_TO_WIN) {
      state.phase = 'won';
      events.push('win');
    }
    return;
  }
  const { lit, armed } = countDistricts(state);
  if (armed > 0) {
    // Scored at the pre-bank multiplier: the payout for having carried the
    // risk this far, collected at the moment the risk ends.
    award(state, CFG.P_BANK * armed * grid, `${armed} DISTRICT${armed > 1 ? 'S' : ''} BANKED`);
    for (const district of state.districts) {
      if (district.status === 'armed') district.status = 'lit';
    }
    events.push('bank');
    return;
  }
  if (lit === DISTRICTS.length) {
    startBlackout(state, events);
    return;
  }
  award(state, CFG.P_SAUCER * grid, 'SUBSTATION');
  events.push('saucer');
}

function captureSaucer(state, index, events) {
  state.balls.splice(index, 1);
  state.saucer.held = true;
  state.saucer.timer = CFG.SAUCER_HOLD;
  awardSaucer(state, events);
}

function ejectSaucer(state) {
  state.saucer.held = false;
  state.saucer.timer = 0;
  const dir = rnd(state) < 0.5 ? -1 : 1;
  state.balls.push(newBall(
    TABLE.saucer.x + dir * 6,
    TABLE.saucer.y + 22,
    dir * CFG.SAUCER_EJECT,
    190,
  ));
}

function endBall(state, events) {
  if (state.saveTimer > 0 && state.mode === 'normal' && state.phase === 'play') {
    state.saveTimer = 0;
    state.saveUsed = true;
    events.push('ball-save');
    state.lastAward = 'BALL SAVED';
    state.lastAwardT = 1.6;
    serve(state, false);
    return;
  }
  if (state.mode === 'blackout') {
    state.mode = 'normal';
    state.jackpots = 0;
    events.push('blackout-end');
  }
  let lostGrid = false;
  for (const district of state.districts) {
    if (district.status !== 'armed') continue;
    district.status = 'dark';
    district.charge = 0;
    lostGrid = true;
  }
  if (lostGrid) {
    events.push('grid-lost');
    state.lastAward = 'GRID LOST';
    state.lastAwardT = 2;
  }
  state.tiltMeter = 0;
  state.tiltThisBall = 0;
  state.tiltLocked = false;
  state.drops = DROPS.map(() => false);
  state.dropTimer = 0;
  if (state.ballsLeft <= 0) {
    state.phase = 'lost';
    events.push('lose');
    return;
  }
  serve(state, true);
}

// --- integration ----------------------------------------------------------

function advanceFlippers(state, h) {
  for (let i = 0; i < state.flippers.length; i += 1) {
    const flipper = state.flippers[i];
    const spec = TABLE.flippers[i];
    const up = flipper.want && !state.tiltLocked && state.phase === 'play';
    const target = up ? spec.up : spec.rest;
    const maxStep = (up ? CFG.FLIP_UP_SPEED : CFG.FLIP_DOWN_SPEED) * h;
    const delta = clamp(target - flipper.angle, -maxStep, maxStep);
    flipper.angle += delta;
    flipper.omega = h > 0 ? delta / h : 0;
  }
}

function collideFlipper(state, ball, index, h) {
  const spec = TABLE.flippers[index];
  const flipper = state.flippers[index];
  const tipX = spec.px + Math.cos(flipper.angle) * spec.len;
  const tipY = spec.py + Math.sin(flipper.angle) * spec.len;
  const hit = hitSegment(
    ball,
    { ax: spec.px, ay: spec.py, bx: tipX, by: tipY },
    CFG.BALL_R + spec.r,
  );
  if (!hit) return false;
  // Surface velocity at the contact point: omega x r. This, not restitution,
  // is where a flipper's power comes from, so a tip hit on a full swing and a
  // base hit on a half swing produce measurably different shots.
  const rx = hit.cx - spec.px;
  const ry = hit.cy - spec.py;
  resolve(ball, hit, CFG.FLIPPER_E, 0, h, -flipper.omega * ry, flipper.omega * rx);
  return true;
}

function collideWalls(state, ball, events, h) {
  for (const seg of WALLS) {
    const hit = hitSegment(ball, seg, CFG.BALL_R);
    if (!hit) continue;
    if (seg.oneWayX !== undefined) {
      // One-way: only exists for balls sitting on, and moving into, the
      // blocked face. Skipping the positional push for a ball leaving through
      // the gate is what stops the gate spitting it back into the lane.
      if (hit.nx * seg.oneWayX + hit.ny * seg.oneWayY <= 0) continue;
      if (ball.vx * hit.nx + ball.vy * hit.ny >= 0) continue;
    }
    let kick = seg.kick;
    if (seg.kind === 'sling') {
      if (state.slingCool[seg.slot] > 0) {
        kick = 0;
      } else {
        state.slingCool[seg.slot] = CFG.SCORE_COOLDOWN;
        award(state, CFG.P_SLING * gridMultiplier(state), null);
        events.push('sling');
      }
    }
    resolve(ball, hit, seg.e, kick, h);
  }
}

function collideRound(state, ball, events, h) {
  for (let i = 0; i < BUMPERS.length; i += 1) {
    const hit = hitCircle(ball, BUMPERS[i], CFG.BALL_R + BUMPERS[i].r);
    if (!hit) continue;
    resolve(ball, hit, CFG.BUMPER_E, CFG.BUMPER_KICK, h);
    if (state.bumperCool[i] > 0) continue;
    state.bumperCool[i] = CFG.SCORE_COOLDOWN;
    award(state, CFG.P_BUMPER * gridMultiplier(state), null);
    events.push('bumper');
  }
  for (const post of POSTS) {
    const hit = hitCircle(ball, post, CFG.BALL_R + post.r);
    if (hit) resolve(ball, hit, CFG.POST_E, 0, h);
  }
  for (let i = 0; i < DISTRICTS.length; i += 1) {
    const hit = hitCircle(ball, DISTRICTS[i], CFG.BALL_R + DISTRICTS[i].r);
    if (!hit) continue;
    resolve(ball, hit, CFG.TARGET_E, 0, h);
    hitDistrict(state, i, events);
  }
  for (let i = 0; i < DROPS.length; i += 1) {
    if (state.drops[i]) continue; // a dropped target is not there any more
    const hit = hitCircle(ball, DROPS[i], CFG.BALL_R + DROPS[i].r);
    if (!hit) continue;
    resolve(ball, hit, CFG.TARGET_E, 0, h);
    hitDrop(state, i, events);
  }
}

function substep(state, h, events) {
  advanceFlippers(state, h);
  const playing = state.phase === 'play';

  for (let i = state.balls.length - 1; i >= 0; i -= 1) {
    const ball = state.balls[i];
    if (playing) {
      ball.vy += CFG.GRAVITY * h;
      const decay = Math.max(0, 1 - CFG.FRICTION * h);
      ball.vx *= decay;
      ball.vy *= decay;
    } else if (ball.y < TABLE.lane.restY) {
      // A parked ball still settles onto the plunger, so 'ready' never shows
      // a ball floating in the lane after a save.
      ball.vy += CFG.GRAVITY * h;
    } else {
      ball.vy = 0;
      ball.y = TABLE.lane.restY;
    }
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    ball.cradled = false;
    for (let f = 0; f < TABLE.flippers.length; f += 1) {
      if (collideFlipper(state, ball, f, h) && state.flippers[f].want) ball.cradled = true;
    }
    collideWalls(state, ball, events, h);
    if (playing) collideRound(state, ball, events, h);
    capSpeed(ball);

    if (playing && !state.saucer.held) {
      const d = Math.hypot(ball.x - TABLE.saucer.x, ball.y - TABLE.saucer.y);
      if (d < TABLE.saucer.r) {
        captureSaucer(state, i, events);
        continue;
      }
    }

    if (ball.y > TABLE.drainY) {
      state.balls.splice(i, 1);
      events.push('drain');
      continue;
    }

    if (playing) {
      const speed = Math.hypot(ball.vx, ball.vy);
      ball.idle = speed < CFG.IDLE_SPEED && !ball.cradled ? ball.idle + h : 0;
      if (ball.idle > CFG.IDLE_LIMIT) {
        ball.idle = 0;
        const angle = -Math.PI / 2 + (rnd(state) - 0.5) * 1.8;
        ball.vx += Math.cos(angle) * CFG.SEARCH_KICK;
        ball.vy += Math.sin(angle) * CFG.SEARCH_KICK;
        events.push('search');
      }
    }
  }
}

function tickTimers(state, dt) {
  for (const list of [state.bumperCool, state.districtCool, state.dropCool, state.slingCool]) {
    for (let i = 0; i < list.length; i += 1) if (list[i] > 0) list[i] = Math.max(0, list[i] - dt);
  }
  if (state.nudgeCooldown > 0) state.nudgeCooldown = Math.max(0, state.nudgeCooldown - dt);
  if (state.nudgeFx > 0) state.nudgeFx = Math.max(0, state.nudgeFx - dt);
  if (state.lastAwardT > 0) state.lastAwardT = Math.max(0, state.lastAwardT - dt);
  if (state.tiltMeter > 0) state.tiltMeter = Math.max(0, state.tiltMeter - CFG.TILT_DECAY * dt);
  if (state.phase === 'play' && state.saveTimer > 0) {
    state.saveTimer = Math.max(0, state.saveTimer - dt);
  }
  if (state.dropTimer > 0) {
    state.dropTimer = Math.max(0, state.dropTimer - dt);
    if (state.dropTimer === 0) state.drops = DROPS.map(() => false);
  }
}

export function step(state, dt) {
  const events = [];
  if (state.phase === 'won' || state.phase === 'lost') return events;

  state.elapsed += dt;
  tickTimers(state, dt);

  if (state.saucer.held) {
    state.saucer.timer -= dt;
    if (state.saucer.timer <= 0 && state.phase !== 'won') {
      ejectSaucer(state);
      events.push('saucer-kick');
    }
  }

  // Substep on the fastest thing in the frame, which is not always the ball.
  // A flipper tip crosses 24px in one 60Hz frame; at one step per frame it
  // swept straight past a ball resting mid-bat and resolved on the far side,
  // punting the ball DOWNWARD into the drain. Only contacts near the pivot
  // ever worked, which read as "the flippers are dead" rather than as a bug.
  let travel = 0;
  for (const ball of state.balls) travel = Math.max(travel, Math.hypot(ball.vx, ball.vy) * dt);
  for (let i = 0; i < state.flippers.length; i += 1) {
    const spec = TABLE.flippers[i];
    const target = state.flippers[i].want && !state.tiltLocked && state.phase === 'play'
      ? spec.up
      : spec.rest;
    if (state.flippers[i].angle === target) continue;
    const rate = state.flippers[i].want ? CFG.FLIP_UP_SPEED : CFG.FLIP_DOWN_SPEED;
    travel = Math.max(travel, rate * spec.len * dt);
  }
  const substeps = Math.min(
    CFG.MAX_SUBSTEPS,
    Math.max(1, Math.ceil(travel / CFG.MAX_TRAVEL)),
  );
  const h = dt / substeps;
  for (let i = 0; i < substeps; i += 1) {
    if (state.phase === 'won' || state.phase === 'lost') break;
    substep(state, h, events);
  }

  if (state.phase === 'play' && state.balls.length === 0 && !state.saucer.held) {
    endBall(state, events);
  }

  // A weak launch that rolls back down the lane must not soft-lock the table:
  // the plunger simply becomes available again.
  if (state.phase === 'play' && state.mode === 'normal' && state.balls.length === 1) {
    const ball = state.balls[0];
    if (ball.x > TABLE.lane.x && ball.y > TABLE.lane.y && Math.hypot(ball.vx, ball.vy) < 60) {
      ball.x = TABLE.lane.restX;
      ball.y = TABLE.lane.restY;
      ball.vx = 0;
      ball.vy = 0;
      state.phase = 'ready';
    }
  }

  return events;
}
