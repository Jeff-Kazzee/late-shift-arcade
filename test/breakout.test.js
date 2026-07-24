import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  newGame,
  buildLevel,
  speedScale,
  step,
  movePaddleTo,
  launch,
  brickX,
  brickY,
} from '../games/breakout/logic.js';

const noPower = () => 0.99; // rng above POWER_CHANCE: plain bricks
const allWide = () => 0; // rng of 0: every brick drops 'wide'

test('level 1 is 4 plain rows; level 5 stacks tougher rows', () => {
  const l1 = buildLevel(1, noPower);
  assert.equal(l1.length, 4 * CFG.COLS);
  assert.ok(l1.every((b) => b.hp === 1 && b.power === null));
  const l5 = buildLevel(5, noPower);
  assert.equal(l5.length, 8 * CFG.COLS);
  assert.ok(l5.some((b) => b.hp === 3));
});

test('endless levels scale speed, campaign levels do not', () => {
  assert.equal(speedScale(1), 1);
  assert.equal(speedScale(5), 1);
  assert.ok(speedScale(8) > 1.15);
});

test('launch fires the stuck ball upward and off-center steering works', () => {
  const state = newGame(noPower);
  state.balls[0].stickOffset = state.paddle.w / 2; // right edge
  assert.equal(launch(state), true);
  assert.ok(state.balls[0].vy < 0, 'launched upward');
  assert.ok(state.balls[0].vx > 0, 'steered toward the offset side');
  assert.equal(launch(state), false, 'nothing left to launch');
});

test('paddle bounce steers by contact point', () => {
  const state = newGame(noPower);
  movePaddleTo(state, 320);
  state.balls[0] = { x: 290, y: CFG.PADDLE_Y - CFG.BALL_R, vx: 0, vy: 300, stuck: false, stickOffset: 0 };
  const events = step(state, 1 / 60);
  assert.ok(events.includes('paddle'));
  assert.ok(state.balls[0].vy < 0);
  assert.ok(state.balls[0].vx < 0, 'left-of-center contact sends ball left');
});

test('brick takes the hit, dies at 0 hp, and pays out', () => {
  const state = newGame(noPower);
  const brick = state.bricks.find((b) => b.row === 3 && b.col === 5);
  state.balls[0] = {
    x: brickX(5) + CFG.BRICK_W / 2,
    y: brickY(3) + CFG.BRICK_H + CFG.BALL_R - 1,
    vx: 0,
    vy: -300,
    stuck: false,
    stickOffset: 0,
  };
  const events = step(state, 1 / 60);
  assert.ok(events.includes('brick'));
  assert.equal(brick.alive, false);
  assert.equal(state.score, CFG.SCORE_BRICK);
  assert.ok(state.balls[0].vy > 0, 'reflected downward off the brick bottom');
});

test('wide capsule widens the paddle for a while, then it snaps back', () => {
  const state = newGame(allWide);
  state.capsules.push({ x: state.paddle.x, y: CFG.PADDLE_Y - 2, type: 'wide' });
  step(state, 1 / 60);
  assert.equal(state.paddle.w, CFG.PADDLE_WIDE_W);
  step(state, CFG.WIDE_TIME + 1);
  assert.equal(state.paddle.w, CFG.PADDLE_W);
});

test('multi capsule adds a live ball', () => {
  const state = newGame(noPower);
  state.balls[0] = { x: 320, y: 300, vx: 100, vy: -300, stuck: false, stickOffset: 0 };
  state.capsules.push({ x: state.paddle.x, y: CFG.PADDLE_Y - 2, type: 'multi' });
  step(state, 1 / 60);
  assert.equal(state.balls.length, 2);
  assert.ok(state.balls.every((b) => !b.stuck));
});

test('sticky capsule catches the next ball on the paddle', () => {
  const state = newGame(noPower);
  state.capsules.push({ x: state.paddle.x, y: CFG.PADDLE_Y - 2, type: 'sticky' });
  step(state, 1 / 60);
  assert.equal(state.paddle.sticky, true);
  state.balls[0] = { x: state.paddle.x, y: CFG.PADDLE_Y - CFG.BALL_R, vx: 50, vy: 300, stuck: false, stickOffset: 0 };
  step(state, 1 / 60);
  assert.equal(state.balls[0].stuck, true, 'ball caught, ready to aim');
});

test('losing the last ball costs a life; the last life ends the game', () => {
  const state = newGame(noPower);
  state.balls[0] = { x: 320, y: CFG.H + 50, vx: 0, vy: 300, stuck: false, stickOffset: 0 };
  const events = step(state, 1 / 60);
  assert.ok(events.includes('life-lost'));
  assert.equal(state.lives, CFG.LIVES - 1);
  assert.equal(state.balls.length, 1);
  assert.equal(state.balls[0].stuck, true);

  state.lives = 1;
  state.balls[0] = { x: 320, y: CFG.H + 50, vx: 0, vy: 300, stuck: false, stickOffset: 0 };
  const finalEvents = step(state, 1 / 60);
  assert.ok(finalEvents.includes('game-over'));
  assert.equal(state.over, true);
});

test('clearing the wall advances the level with a fresh serve and bonus', () => {
  const state = newGame(noPower);
  for (const b of state.bricks) b.alive = false;
  const events = step(state, 1 / 60, noPower);
  assert.ok(events.includes('level-clear'));
  assert.equal(state.level, 2);
  assert.equal(state.score, CFG.SCORE_LEVEL);
  assert.ok(state.bricks.length > 0);
  assert.equal(state.balls[0].stuck, true);
});
