// NEON SNAKE rules: a deterministic, grid-based state machine with no canvas
// or DOM dependencies. Inject rng in tests/replays to make every spawn stable.

export const CFG = {
  W: 640,
  H: 480,
  COLS: 24,
  ROWS: 15,
  CELL: 24,
  OFFSET_X: 32,
  OFFSET_Y: 72,
  BASE_TICK: 0.17,
  TICK_STEP: 0.012,
  MIN_TICK: 0.07,
  LEVEL_EVERY: 5,
  FOOD_SCORE: 100,
  BONUS_SCORE: 250,
  BONUS_EVERY: 5,
  BONUS_TTL: 5,
  COMBO_WINDOW: 3.2,
  MAX_COMBO: 5,
};

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const sameCell = (a, b) => a.x === b.x && a.y === b.y;
const isDirection = (direction) => Object.hasOwn(DIRECTIONS, direction);
const opposite = (a, b) => DIRECTIONS[a].x + DIRECTIONS[b].x === 0 && DIRECTIONS[a].y + DIRECTIONS[b].y === 0;

function randomIndex(length, rng) {
  if (length === 0) return -1;
  const value = Number(rng());
  const safe = Number.isFinite(value) ? value : 0;
  return Math.min(length - 1, Math.max(0, Math.floor(safe * length)));
}

function openCells(state, { includeFood = false } = {}) {
  const cells = [];
  for (let y = 0; y < CFG.ROWS; y += 1) {
    for (let x = 0; x < CFG.COLS; x += 1) {
      const cell = { x, y };
      if (state.snake.some((part) => sameCell(part, cell))) continue;
      if (!includeFood && state.food && sameCell(state.food, cell)) continue;
      if (state.bonus && sameCell(state.bonus, cell)) continue;
      cells.push(cell);
    }
  }
  return cells;
}

export function spawnFood(state, rng = Math.random) {
  const cells = openCells(state);
  state.food = cells[randomIndex(cells.length, rng)] ?? null;
  return state.food;
}

export function spawnBonus(state, rng = Math.random) {
  const cells = openCells(state);
  const cell = cells[randomIndex(cells.length, rng)];
  state.bonus = cell ? { ...cell, ttl: CFG.BONUS_TTL } : null;
  return state.bonus;
}

export function newGame(rng = Math.random) {
  const state = {
    snake: [
      { x: 12, y: 7 },
      { x: 11, y: 7 },
      { x: 10, y: 7 },
    ],
    direction: 'right',
    pendingDirection: null,
    started: false,
    food: null,
    bonus: null,
    accumulator: 0,
    score: 0,
    terminalScore: null,
    foodsEaten: 0,
    level: 1,
    combo: 0,
    comboTimer: 0,
    over: false,
    reason: null,
  };
  spawnFood(state, rng);
  return state;
}

export function currentTickSeconds(state) {
  return Math.max(CFG.MIN_TICK, CFG.BASE_TICK - (state.level - 1) * CFG.TICK_STEP);
}

export function comboMultiplier(state) {
  return Math.max(1, Math.min(CFG.MAX_COMBO, state.combo));
}

export function queueTurn(state, direction) {
  if (state.over || !isDirection(direction) || state.pendingDirection) return false;
  if (!state.started) {
    if (opposite(state.direction, direction)) state.snake.reverse();
    state.started = true;
    state.pendingDirection = direction;
    return true;
  }
  if (opposite(state.direction, direction)) return false;
  if (direction === state.direction) return false;
  state.pendingDirection = direction;
  return true;
}

function endGame(state, reason, events) {
  state.over = true;
  state.reason = reason;
  state.terminalScore = state.score;
  events.push(reason, 'game-over');
}

function eatFood(state, rng, events) {
  state.foodsEaten += 1;
  state.combo = state.comboTimer > 0 ? Math.min(CFG.MAX_COMBO, state.combo + 1) : 1;
  state.comboTimer = CFG.COMBO_WINDOW;
  state.score += CFG.FOOD_SCORE * comboMultiplier(state);
  events.push('eat');

  const nextLevel = 1 + Math.floor(state.foodsEaten / CFG.LEVEL_EVERY);
  if (nextLevel > state.level) {
    state.level = nextLevel;
    events.push('level-up');
  }

  spawnFood(state, rng);
  if (!state.food) {
    endGame(state, 'complete', events);
    return;
  }
  if (state.foodsEaten % CFG.BONUS_EVERY === 0 && spawnBonus(state, rng)) {
    events.push('bonus-spawn');
  }
}

// Advance exactly one grid cell. Exported so tests can target collision and
// scoring rules without coupling to wall-clock accumulation.
export function advanceTick(state, rng = Math.random) {
  const events = [];
  if (state.over) return events;

  if (state.pendingDirection) {
    state.direction = state.pendingDirection;
    state.pendingDirection = null;
  }
  const head = state.snake[0];
  const delta = DIRECTIONS[state.direction];
  const next = { x: head.x + delta.x, y: head.y + delta.y };

  if (next.x < 0 || next.x >= CFG.COLS || next.y < 0 || next.y >= CFG.ROWS) {
    endGame(state, 'wall', events);
    return events;
  }

  const eats = state.food && sameCell(next, state.food);
  // Moving into the current tail is legal when it will move away this tick.
  const occupied = eats ? state.snake : state.snake.slice(0, -1);
  if (occupied.some((part) => sameCell(part, next))) {
    endGame(state, 'self', events);
    return events;
  }

  state.snake.unshift(next);
  if (!eats) state.snake.pop();
  events.push('move');

  if (eats) eatFood(state, rng, events);
  if (!state.over && state.bonus && sameCell(next, state.bonus)) {
    state.score += CFG.BONUS_SCORE * comboMultiplier(state);
    state.bonus = null;
    events.push('bonus');
  }
  return events;
}

function advanceTimers(state, dt, events) {
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.comboTimer = 0;
      state.combo = 0;
      events.push('combo-expired');
    }
  }
  if (state.bonus) {
    state.bonus.ttl -= dt;
    if (state.bonus.ttl <= 0) {
      state.bonus = null;
      events.push('bonus-expired');
    }
  }
}

// Consume arbitrary frame dt as whole grid steps. A snake's state changes
// only in advanceTick, so frame rate cannot change its path or score.
export function step(state, dt, rng = Math.random) {
  const events = [];
  if (state.over || !state.started) return events;
  let remaining = Number(dt);
  if (!Number.isFinite(remaining) || remaining <= 0) return events;

  while (remaining > 0 && !state.over) {
    const tick = currentTickSeconds(state);
    const untilTick = Math.max(0, tick - state.accumulator);
    const slice = Math.min(remaining, untilTick);
    if (slice > 0) {
      advanceTimers(state, slice, events);
      state.accumulator += slice;
      remaining -= slice;
    }
    if (state.accumulator < tick - 1e-9) break;
    state.accumulator = Math.max(0, state.accumulator - tick);
    events.push(...advanceTick(state, rng));
  }
  return events;
}
