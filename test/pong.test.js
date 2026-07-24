import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  newGame,
  serve,
  step,
  movePaddle,
  movePaddleTo,
  cpuDir,
} from '../games/pong/logic.js';

const midRng = () => 0.5; // serve() with this rng produces a flat serve

function liveGame(overrides = {}) {
  const state = newGame();
  state.serveIn = 0;
  serve(state, midRng);
  Object.assign(state.ball, overrides.ball ?? {});
  return state;
}

test('serve with centered rng is flat and honors serve direction', () => {
  const state = newGame();
  state.serveDir = -1;
  serve(state, midRng);
  assert.equal(state.ball.vy, 0);
  assert.ok(state.ball.vx < 0);
  assert.equal(Math.round(Math.abs(state.ball.vx)), CFG.BASE_SPEED);
});

test('ball bounces off top and bottom walls', () => {
  const state = liveGame({ ball: { x: 320, y: CFG.BALL_R + 1, vx: 100, vy: -200 } });
  const events = step(state, 1 / 60);
  assert.ok(events.includes('wall'));
  assert.ok(state.ball.vy > 0);
  assert.ok(state.ball.y >= CFG.BALL_R);
});

test('paddle hit reflects the ball and angle follows the contact offset', () => {
  const leftFace = CFG.PADDLE_X + CFG.PADDLE_W;
  const state = liveGame({
    ball: { x: leftFace + CFG.BALL_R + 2, y: 240, vx: -300, vy: 0 },
  });
  movePaddleTo(state, 0, 270); // ball hits the upper half of the paddle
  const events = step(state, 1 / 60);
  assert.ok(events.includes('paddle'));
  assert.ok(state.ball.vx > 0, 'ball reflected rightward');
  assert.ok(state.ball.vy < 0, 'upper-half contact sends the ball upward');
});

test('rally speeds the ball up but never past MAX_SPEED', () => {
  const leftFace = CFG.PADDLE_X + CFG.PADDLE_W;
  const state = liveGame();
  let speed = CFG.BASE_SPEED;
  for (let i = 0; i < 40; i += 1) {
    state.ball.x = leftFace + CFG.BALL_R + 2;
    state.ball.y = state.paddles[0];
    state.ball.vx = -speed;
    state.ball.vy = 0;
    step(state, 1 / 60);
    const next = Math.hypot(state.ball.vx, state.ball.vy);
    assert.ok(next >= speed - 1e-9);
    assert.ok(next <= CFG.MAX_SPEED + 1e-9);
    speed = next;
  }
  assert.ok(Math.abs(speed - CFG.MAX_SPEED) < 1);
});

test('ball leaving the left edge scores for the right player and re-serves', () => {
  const state = liveGame({ ball: { x: -CFG.BALL_R * 2 - 1, y: 240, vx: -300, vy: 0 } });
  const events = step(state, 1 / 60);
  assert.ok(events.includes('score'));
  assert.equal(state.scores[1], 1);
  assert.ok(state.serveIn > 0);
  assert.equal(state.ball.x, CFG.W / 2);
});

test('seventh point wins and freezes the game', () => {
  const state = liveGame({ ball: { x: CFG.W + CFG.BALL_R * 2 + 1, y: 240, vx: 300, vy: 0 } });
  state.scores[0] = CFG.WIN - 1;
  step(state, 1 / 60);
  assert.equal(state.winner, 0);
  const events = step(state, 1 / 60);
  assert.deepEqual(events, []);
});

test('paddles clamp to the court', () => {
  const state = newGame();
  movePaddle(state, 0, -1, 100);
  assert.equal(state.paddles[0], CFG.PADDLE_H / 2);
  movePaddleTo(state, 1, 10_000);
  assert.equal(state.paddles[1], CFG.H - CFG.PADDLE_H / 2);
});

test('cpu chases an incoming ball, holds inside the deadzone, drifts home otherwise', () => {
  const state = newGame();
  state.ball = { x: 400, y: 400, vx: 200, vy: 0 };
  state.paddles[1] = 100;
  assert.equal(cpuDir(state), 1);
  state.paddles[1] = 398;
  assert.equal(cpuDir(state), 0);
  state.ball.vx = -200; // ball moving away → return to center
  state.paddles[1] = 100;
  assert.equal(cpuDir(state), 1);
  state.paddles[1] = CFG.H / 2;
  assert.equal(cpuDir(state), 0);
});
