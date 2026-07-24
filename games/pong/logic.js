// Pong rules as pure state transitions — no canvas, no DOM, so node --test
// exercises everything here directly.

export const CFG = {
  W: 640,
  H: 480,
  PADDLE_W: 10,
  PADDLE_H: 80,
  PADDLE_X: 28, // gap between wall and paddle
  BALL_R: 6,
  BASE_SPEED: 300,
  SPEED_STEP: 1.045,
  MAX_SPEED: 660,
  PADDLE_SPEED: 380,
  MAX_BOUNCE_ANGLE: Math.PI / 3.6, // ~50° off horizontal at paddle edge
  SERVE_DELAY: 1.0,
  WIN: 7,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function newGame() {
  return {
    ball: { x: CFG.W / 2, y: CFG.H / 2, vx: 0, vy: 0 },
    paddles: [CFG.H / 2, CFG.H / 2], // paddle centers, [left, right]
    scores: [0, 0],
    serveIn: CFG.SERVE_DELAY,
    serveDir: 1, // +1 serves rightward
    rally: 0,
    winner: null,
  };
}

export function serve(state, rng = Math.random) {
  const angle = (rng() - 0.5) * (Math.PI / 3); // within ±30°
  state.ball.x = CFG.W / 2;
  state.ball.y = CFG.H / 2;
  state.ball.vx = Math.cos(angle) * CFG.BASE_SPEED * state.serveDir;
  state.ball.vy = Math.sin(angle) * CFG.BASE_SPEED;
  state.rally = 0;
}

export function movePaddle(state, i, dir, dt) {
  state.paddles[i] = clamp(
    state.paddles[i] + dir * CFG.PADDLE_SPEED * dt,
    CFG.PADDLE_H / 2,
    CFG.H - CFG.PADDLE_H / 2,
  );
}

export function movePaddleTo(state, i, y) {
  state.paddles[i] = clamp(y, CFG.PADDLE_H / 2, CFG.H - CFG.PADDLE_H / 2);
}

// CPU intent: chase the ball when it's incoming, drift home when it's not.
export function cpuDir(state, { deadzone = 12 } = {}) {
  const target = state.ball.vx > 0 ? state.ball.y : CFG.H / 2;
  const diff = target - state.paddles[1];
  if (Math.abs(diff) < deadzone) return 0;
  return Math.sign(diff);
}

function bounce(state, side, events) {
  const b = state.ball;
  const off = clamp(
    (b.y - state.paddles[side]) / (CFG.PADDLE_H / 2),
    -1.15,
    1.15,
  );
  if (Math.abs(off) > 1.15) return;
  const speed = Math.min(Math.hypot(b.vx, b.vy) * CFG.SPEED_STEP, CFG.MAX_SPEED);
  const angle = clamp(off, -1, 1) * CFG.MAX_BOUNCE_ANGLE;
  const dir = side === 0 ? 1 : -1;
  b.vx = Math.cos(angle) * speed * dir;
  b.vy = Math.sin(angle) * speed;
  state.rally += 1;
  events.push('paddle');
}

function point(state, who) {
  state.scores[who] += 1;
  state.ball.x = CFG.W / 2;
  state.ball.y = CFG.H / 2;
  state.ball.vx = 0;
  state.ball.vy = 0;
  if (state.scores[who] >= CFG.WIN) {
    state.winner = who;
  } else {
    state.serveIn = CFG.SERVE_DELAY;
    state.serveDir = who === 0 ? 1 : -1; // loser receives
  }
}

export function step(state, dt, rng = Math.random) {
  const events = [];
  if (state.winner !== null) return events;

  if (state.serveIn > 0) {
    state.serveIn -= dt;
    if (state.serveIn <= 0) {
      serve(state, rng);
      events.push('serve');
    }
    return events;
  }

  const b = state.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.y < CFG.BALL_R) {
    b.y = CFG.BALL_R;
    b.vy = Math.abs(b.vy);
    events.push('wall');
  } else if (b.y > CFG.H - CFG.BALL_R) {
    b.y = CFG.H - CFG.BALL_R;
    b.vy = -Math.abs(b.vy);
    events.push('wall');
  }

  const leftFace = CFG.PADDLE_X + CFG.PADDLE_W;
  const rightFace = CFG.W - CFG.PADDLE_X - CFG.PADDLE_W;
  const overlapsLeft =
    b.vx < 0 && b.x - CFG.BALL_R <= leftFace && b.x - CFG.BALL_R >= leftFace - 22;
  const overlapsRight =
    b.vx > 0 && b.x + CFG.BALL_R >= rightFace && b.x + CFG.BALL_R <= rightFace + 22;

  if (overlapsLeft) {
    const off = Math.abs(b.y - state.paddles[0]) / (CFG.PADDLE_H / 2);
    if (off <= 1.15) {
      bounce(state, 0, events);
      b.x = leftFace + CFG.BALL_R;
    }
  } else if (overlapsRight) {
    const off = Math.abs(b.y - state.paddles[1]) / (CFG.PADDLE_H / 2);
    if (off <= 1.15) {
      bounce(state, 1, events);
      b.x = rightFace - CFG.BALL_R;
    }
  }

  if (b.x < -CFG.BALL_R * 2) {
    point(state, 1);
    events.push('score');
  } else if (b.x > CFG.W + CFG.BALL_R * 2) {
    point(state, 0);
    events.push('score');
  }

  return events;
}
