import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  advanceTick,
  comboMultiplier,
  currentTickSeconds,
  newGame,
  queueTurn,
  spawnFood,
  step,
} from '../games/neon-snake/logic.js';

const firstCell = () => 0;

test('every first direction starts safely, then reversal and double-turn gates apply', () => {
  const expectedHeads = {
    right: { x: 13, y: 7 }, left: { x: 9, y: 7 }, up: { x: 12, y: 6 }, down: { x: 12, y: 8 },
  };
  for (const direction of Object.keys(expectedHeads)) {
    const state = newGame(firstCell);
    assert.equal(queueTurn(state, direction), true, `${direction} starts the run`);
    assert.equal(queueTurn(state, 'up'), false, 'one turn per grid step');
    advanceTick(state, firstCell);
    assert.equal(state.direction, direction);
    assert.deepEqual(state.snake[0], expectedHeads[direction]);
  }

  const moving = newGame(firstCell);
  queueTurn(moving, 'right');
  advanceTick(moving, firstCell);
  assert.equal(queueTurn(moving, 'left'), false, 'a moving snake cannot reverse');
});

test('frame dt accumulates to discrete movement, independent of small frames', () => {
  const state = newGame(firstCell);
  assert.deepEqual(step(state, 10, firstCell), [], 'the run waits for first input');
  assert.equal(queueTurn(state, 'right'), true);
  const tick = currentTickSeconds(state);
  const start = { ...state.snake[0] };
  step(state, tick * 0.49, firstCell);
  assert.deepEqual(state.snake[0], start);
  step(state, tick * 0.51, firstCell);
  assert.deepEqual(state.snake[0], { x: start.x + 1, y: start.y });
});

test('eating grows the body, starts the score chain, and raises level speed', () => {
  const state = newGame(firstCell);
  state.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  state.food = { x: 6, y: 5 };
  const events = advanceTick(state, firstCell);
  assert.ok(events.includes('eat'));
  assert.equal(state.snake.length, 4);
  assert.equal(state.score, CFG.FOOD_SCORE);
  assert.equal(state.combo, 1);

  const baseTick = currentTickSeconds(state);
  state.foodsEaten = CFG.LEVEL_EVERY - 1;
  state.food = { x: 7, y: 5 };
  advanceTick(state, firstCell);
  assert.equal(state.level, 2);
  assert.ok(currentTickSeconds(state) < baseTick);
  assert.equal(comboMultiplier(state), 2);
});

test('wall and self collisions terminally preserve the final score', () => {
  const wall = newGame(firstCell);
  wall.snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  wall.direction = 'left';
  wall.score = 700;
  assert.deepEqual(advanceTick(wall, firstCell), ['wall', 'game-over']);
  assert.equal(wall.terminalScore, 700);

  const self = newGame(firstCell);
  self.snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  self.direction = 'right';
  assert.ok(advanceTick(self, firstCell).includes('self'));
  assert.equal(self.over, true);
});

test('injectable rng gives deterministic food placement', () => {
  const a = newGame(firstCell);
  const b = newGame(firstCell);
  assert.deepEqual(a.food, { x: 0, y: 0 });
  assert.deepEqual(a.food, b.food);
  a.food = null;
  assert.deepEqual(spawnFood(a, () => 0.999999), { x: CFG.COLS - 1, y: CFG.ROWS - 1 });
});

test('combo and bonus pickup expire on time, while each fifth meal spawns a bonus', () => {
  const state = newGame(firstCell);
  state.started = true;
  state.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  state.foodsEaten = CFG.BONUS_EVERY - 1;
  state.food = { x: 6, y: 5 };
  const events = advanceTick(state, firstCell);
  assert.ok(events.includes('bonus-spawn'));
  assert.ok(state.bonus && state.bonus.ttl === CFG.BONUS_TTL);

  state.combo = 3;
  state.comboTimer = 0.02;
  state.bonus.ttl = 0.02;
  const timerEvents = step(state, 0.03, firstCell);
  assert.ok(timerEvents.includes('combo-expired'));
  assert.ok(timerEvents.includes('bonus-expired'));
  assert.equal(state.combo, 0);
  assert.equal(state.bonus, null);
});
