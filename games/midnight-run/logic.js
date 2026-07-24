// MIDNIGHT RUN simulation. The cartridge owns presentation; these rules have
// no canvas, clock, or ambient randomness so replay tests can drive the road.

export const CFG = {
  W: 640,
  H: 480,
  LANES: 4,
  ROAD_LEFT: 92,
  ROAD_RIGHT: 548,
  PLAYER_Y: 385,
  PLAYER_HALF_W: 20,
  PLAYER_HALF_H: 30,
  TRAFFIC_HALF_W: 20,
  TRAFFIC_HALF_H: 31,
  PLAYER_SPEED: 380,
  BASE_SPEED: 170,
  MAX_SPEED: 390,
  SPEED_PER_DISTANCE: 0.018,
  LIVES: 3,
  INVULN: 1.35,
  COLLISION_SPEED_LOSS: 0.42,
  SPEED_RECOVER: 0.24,
  PASS_SCORE: 60,
  PICKUP_SCORE: 180,
  NEAR_MISS_X: 82,
  COMBO_WINDOW: 2.4,
  MAX_TRAFFIC: 12,
  MAX_PICKUPS: 3,
  SPAWN_START: 0.88,
  SPAWN_FLOOR: 0.3,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function laneX(lane) {
  const laneW = (CFG.ROAD_RIGHT - CFG.ROAD_LEFT) / CFG.LANES;
  return CFG.ROAD_LEFT + laneW * (lane + 0.5);
}

export function difficulty(state) {
  return 1 + state.distance / 1800;
}

export function newGame() {
  return {
    ready: true,
    over: false,
    time: 0,
    distance: 0,
    score: 0,
    speed: CFG.BASE_SPEED,
    speedLoss: 0,
    player: { x: CFG.W / 2, lives: CFG.LIVES, inv: 0 },
    traffic: [],
    pickups: [],
    spawnIn: CFG.SPAWN_START,
    combo: 0,
    comboUntil: 0,
  };
}

export function start(state) {
  if (!state.over) state.ready = false;
}

export function movePlayerTo(state, x) {
  state.player.x = clamp(x, CFG.ROAD_LEFT + CFG.PLAYER_HALF_W, CFG.ROAD_RIGHT - CFG.PLAYER_HALF_W);
}

export function movePlayer(state, direction, dt) {
  movePlayerTo(state, state.player.x + direction * CFG.PLAYER_SPEED * dt);
}

export function spawnTraffic(state, rng = Math.random) {
  if (state.traffic.length >= CFG.MAX_TRAFFIC) return false;
  const lane = Math.min(CFG.LANES - 1, Math.floor(rng() * CFG.LANES));
  state.traffic.push({
    x: laneX(lane) + (rng() - 0.5) * 16,
    y: -CFG.TRAFFIC_HALF_H - rng() * 100,
    speed: 68 + rng() * 92 + difficulty(state) * 16,
    hue: Math.floor(rng() * 3),
    passed: false,
  });
  if (state.pickups.length < CFG.MAX_PICKUPS && rng() < 0.16) {
    const pickupLane = Math.min(CFG.LANES - 1, Math.floor(rng() * CFG.LANES));
    state.pickups.push({ x: laneX(pickupLane), y: -36 - rng() * 90 });
  }
  return true;
}

function registerPass(state, car, events) {
  if (car.passed || car.y < CFG.PLAYER_Y + CFG.TRAFFIC_HALF_H) return;
  car.passed = true;
  const gap = Math.abs(car.x - state.player.x);
  if (gap > CFG.PLAYER_HALF_W + CFG.TRAFFIC_HALF_W && gap <= CFG.NEAR_MISS_X) {
    state.combo = state.time <= state.comboUntil ? state.combo + 1 : 1;
    state.comboUntil = state.time + CFG.COMBO_WINDOW;
    state.score += CFG.PASS_SCORE * (1 + state.combo);
    events.push('near-miss');
  } else {
    state.score += CFG.PASS_SCORE;
    events.push('pass');
  }
}

function collide(state, car, events) {
  const hitX = Math.abs(car.x - state.player.x) < CFG.PLAYER_HALF_W + CFG.TRAFFIC_HALF_W;
  const hitY = Math.abs(car.y - CFG.PLAYER_Y) < CFG.PLAYER_HALF_H + CFG.TRAFFIC_HALF_H;
  if (!hitX || !hitY || state.player.inv > 0) return false;
  state.player.lives -= 1;
  state.player.inv = CFG.INVULN;
  state.speedLoss = Math.max(state.speedLoss, CFG.COLLISION_SPEED_LOSS);
  state.combo = 0;
  state.comboUntil = 0;
  events.push('crash');
  if (state.player.lives <= 0) {
    state.over = true;
    events.push('game-over');
  }
  return true;
}

export function step(state, dt, rng = Math.random) {
  if (state.ready || state.over || !Number.isFinite(dt) || dt <= 0) return [];
  // Keep motion and escalating speed stable when a caller delivers a long frame.
  // Each slice is still deterministic and uses the same injected RNG stream.
  if (dt > 1 / 60) {
    const events = [];
    let remaining = dt;
    while (remaining > 0) {
      const slice = Math.min(1 / 60, remaining);
      events.push(...step(state, slice, rng));
      remaining -= slice;
    }
    return events;
  }

  const events = [];
  state.time += dt;
  state.player.inv = Math.max(0, state.player.inv - dt);
  state.speedLoss = Math.max(0, state.speedLoss - CFG.SPEED_RECOVER * dt);
  const cruise = Math.min(CFG.MAX_SPEED, CFG.BASE_SPEED + state.distance * CFG.SPEED_PER_DISTANCE);
  state.speed = cruise * (1 - state.speedLoss);
  state.distance += state.speed * dt;
  state.score += state.speed * dt * 0.09;

  if (state.combo > 0 && state.time > state.comboUntil) {
    state.combo = 0;
    events.push('combo-expired');
  }

  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    if (spawnTraffic(state, rng)) events.push('spawn');
    const pressure = difficulty(state);
    state.spawnIn += Math.max(CFG.SPAWN_FLOOR, CFG.SPAWN_START / pressure) + rng() * 0.18;
  }

  for (const car of state.traffic) {
    car.y += (state.speed * 0.72 + car.speed) * dt;
    if (collide(state, car, events)) car.crashed = true;
    else registerPass(state, car, events);
  }
  state.traffic = state.traffic.filter((car) => !car.crashed && car.y < CFG.H + CFG.TRAFFIC_HALF_H + 10);

  for (const pickup of state.pickups) {
    pickup.y += state.speed * 0.72 * dt;
    if (
      Math.abs(pickup.x - state.player.x) < CFG.PLAYER_HALF_W + 14 &&
      Math.abs(pickup.y - CFG.PLAYER_Y) < CFG.PLAYER_HALF_H + 18
    ) {
      pickup.taken = true;
      state.score += CFG.PICKUP_SCORE;
      state.speedLoss = Math.max(0, state.speedLoss - 0.16);
      events.push('pickup');
    }
  }
  state.pickups = state.pickups.filter((pickup) => !pickup.taken && pickup.y < CFG.H + 30);

  return events;
}

export function terminalScore(state) {
  return Math.max(0, Math.round(state.score));
}
