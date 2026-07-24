// LUNAR DESCENT rules. Rendering and input stay in lunar-descent.js; all
// randomness enters through rng so landings and terrain are repeatable.

export const CFG = {
  W: 640,
  H: 480,
  LANDER_R: 13,
  GRAVITY: 46,
  GRAVITY_PER_LEVEL: 5,
  THRUST: 102,
  ROTATE_SPEED: 2.45,
  FUEL: 100,
  FUEL_BURN: 18,
  PAD_WIDTH: 104,
  MIN_PAD_WIDTH: 58,
  SAFE_VX: 42,
  SAFE_VY: 54,
  SAFE_TILT: Math.PI / 10,
  SETTLE_TIME: 1.25,
  TERRAIN_STEP: 40,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value, width) => ((value % width) + width) % width;

export function levelSpec(level) {
  return {
    gravity: CFG.GRAVITY + (level - 1) * CFG.GRAVITY_PER_LEVEL,
    fuel: Math.max(58, CFG.FUEL - (level - 1) * 5),
    padWidth: Math.max(CFG.MIN_PAD_WIDTH, CFG.PAD_WIDTH - (level - 1) * 7),
  };
}

export function generateTerrain(level = 1, rng = Math.random) {
  const step = CFG.TERRAIN_STEP;
  const count = CFG.W / step;
  const padWidth = levelSpec(level).padWidth;
  const padX = clamp((2 + Math.floor(rng() * (count - 4))) * step - padWidth / 2, 24, CFG.W - padWidth - 24);
  const padY = 378 + Math.floor(rng() * 34);
  const roughness = 16 + level * 3;
  let y = 404;
  const points = [];

  for (let i = 0; i <= count; i += 1) {
    const x = i * step;
    y = clamp(y + (rng() - 0.5) * roughness, 336, 442);
    points.push({ x, y: Math.round(y) });
  }

  return {
    points,
    pad: { x: padX, width: padWidth, y: padY },
  };
}

export function terrainHeight(terrain, x) {
  const wrappedX = wrap(x, CFG.W);
  const { pad } = terrain;
  if (wrappedX >= pad.x && wrappedX <= pad.x + pad.width) return pad.y;

  const index = Math.min(terrain.points.length - 2, Math.floor(wrappedX / CFG.TERRAIN_STEP));
  const a = terrain.points[index];
  const b = terrain.points[index + 1];
  const amount = (wrappedX - a.x) / (b.x - a.x);
  return a.y + (b.y - a.y) * amount;
}

export function newGame(rng = Math.random) {
  const state = {
    level: 1,
    score: 0,
    terrain: null,
    lander: null,
    fuel: 0,
    phase: 'flying',
    settle: 0,
    over: false,
  };
  startLevel(state, rng);
  return state;
}

export function startLevel(state, rng = Math.random) {
  const spec = levelSpec(state.level);
  state.terrain = generateTerrain(state.level, rng);
  state.lander = {
    x: CFG.W / 2,
    y: 118,
    vx: (rng() - 0.5) * 28,
    vy: 0,
    angle: 0,
  };
  state.fuel = spec.fuel;
  state.phase = 'flying';
  state.settle = 0;
  state.over = false;
  return state;
}

export function landingAssessment(state) {
  const { lander, terrain } = state;
  const { pad } = terrain;
  const onPad = lander.x - CFG.LANDER_R >= pad.x && lander.x + CFG.LANDER_R <= pad.x + pad.width;
  const speedSafe = Math.abs(lander.vx) <= CFG.SAFE_VX && Math.abs(lander.vy) <= CFG.SAFE_VY;
  const tiltSafe = Math.abs(lander.angle) <= CFG.SAFE_TILT;
  return { onPad, speedSafe, tiltSafe, safe: onPad && speedSafe && tiltSafe };
}

function integrate(lander, dt, ax, ay) {
  lander.x += lander.vx * dt + 0.5 * ax * dt * dt;
  lander.y += lander.vy * dt + 0.5 * ay * dt * dt;
  lander.vx += ax * dt;
  lander.vy += ay * dt;
  lander.x = wrap(lander.x, CFG.W);
}

export function step(state, dt, controls = {}, rng = Math.random) {
  const events = [];
  if (state.over || !Number.isFinite(dt) || dt <= 0) return events;

  if (state.phase === 'settling') {
    state.settle -= dt;
    if (state.settle <= 0) {
      state.level += 1;
      startLevel(state, rng);
      events.push('level-up');
    }
    return events;
  }
  if (state.phase !== 'flying') return events;

  const lander = state.lander;
  const turn = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
  lander.angle = clamp(lander.angle + turn * CFG.ROTATE_SPEED * dt, -Math.PI * 0.8, Math.PI * 0.8);

  const burning = Boolean(controls.thrust) && state.fuel > 0;
  const burn = burning ? Math.min(state.fuel, CFG.FUEL_BURN * dt) : 0;
  const thrust = burn / (CFG.FUEL_BURN * dt || 1);
  state.fuel -= burn;
  const ax = Math.sin(lander.angle) * CFG.THRUST * thrust;
  const ay = levelSpec(state.level).gravity - Math.cos(lander.angle) * CFG.THRUST * thrust;
  integrate(lander, dt, ax, ay);
  if (burning) events.push('thrust');
  if (state.fuel <= 0 && burning) events.push('fuel-empty');

  const ground = terrainHeight(state.terrain, lander.x);
  if (lander.y + CFG.LANDER_R < ground) return events;

  lander.y = ground - CFG.LANDER_R;
  const assessment = landingAssessment(state);
  if (assessment.safe) {
    const precision = Math.max(0, Math.round(140 - Math.abs(lander.vx) - Math.abs(lander.vy)));
    state.score += 500 * state.level + precision;
    state.phase = 'settling';
    state.settle = CFG.SETTLE_TIME;
    lander.vx = 0;
    lander.vy = 0;
    events.push('landed');
  } else {
    state.phase = 'crashed';
    state.over = true;
    events.push('crash', 'game-over');
  }
  return events;
}
