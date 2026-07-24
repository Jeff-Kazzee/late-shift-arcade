// Breakout rules as pure state transitions. No canvas, no DOM, rng injected
// so every behavior is testable under node --test.

export const CFG = {
  W: 640,
  H: 480,
  PADDLE_Y: 446,
  PADDLE_W: 90,
  PADDLE_WIDE_W: 140,
  PADDLE_H: 12,
  PADDLE_SPEED: 460,
  BALL_R: 6,
  BASE_SPEED: 330,
  SPEED_STEP: 1.02,
  MAX_SPEED: 620,
  MAX_BOUNCE_ANGLE: Math.PI / 3, // off vertical, at paddle edge
  COLS: 10,
  BRICK_W: 56,
  BRICK_H: 18,
  BRICK_GAP: 4,
  TOP: 76,
  LEFT: 22,
  CAPSULE_VY: 150,
  CAPSULE_HALF: 10,
  POWER_CHANCE: 0.14,
  WIDE_TIME: 10,
  STICKY_TIME: 10,
  LIVES: 3,
  LEVELS: 5,
  ENDLESS_SPEED_STEP: 0.06,
  SCORE_BRICK: 50,
  SCORE_CAPSULE: 100,
  SCORE_LEVEL: 500,
};

const POWERS = ['wide', 'multi', 'sticky'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const brickX = (col) => CFG.LEFT + col * (CFG.BRICK_W + CFG.BRICK_GAP);
export const brickY = (row) => CFG.TOP + row * (CFG.BRICK_H + CFG.BRICK_GAP);

// Row-count and hp pattern per level; level > LEVELS reuses the last
// pattern and endless speed scaling takes over.
function levelPattern(level) {
  const n = Math.min(level, CFG.LEVELS);
  return {
    rows: 3 + n,
    hpAt: (row, col) => {
      if (n <= 1) return 1;
      if (n === 2) return row === 0 ? 2 : 1;
      if (n === 3) return (row + col) % 2 === 0 ? 2 : 1;
      if (n === 4) return row < 2 ? 2 : 1;
      return row === 0 ? 3 : row < 3 ? 2 : 1;
    },
  };
}

export function buildLevel(level, rng = Math.random) {
  const { rows, hpAt } = levelPattern(level);
  const bricks = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < CFG.COLS; col += 1) {
      const power =
        rng() < CFG.POWER_CHANCE
          ? POWERS[Math.floor(rng() * POWERS.length) % POWERS.length]
          : null;
      bricks.push({ row, col, hp: hpAt(row, col), power, alive: true });
    }
  }
  return bricks;
}

export function speedScale(level) {
  return level <= CFG.LEVELS ? 1 : 1 + (level - CFG.LEVELS) * CFG.ENDLESS_SPEED_STEP;
}

const newBall = () => ({ x: 0, y: 0, vx: 0, vy: 0, stuck: true, stickOffset: 0 });

export function newGame(rng = Math.random) {
  return {
    paddle: { x: CFG.W / 2, w: CFG.PADDLE_W, sticky: false },
    balls: [newBall()],
    bricks: buildLevel(1, rng),
    capsules: [],
    timers: { wide: 0, sticky: 0 },
    lives: CFG.LIVES,
    score: 0,
    level: 1,
    over: false,
  };
}

export function movePaddle(state, dir, dt) {
  movePaddleTo(state, state.paddle.x + dir * CFG.PADDLE_SPEED * dt);
}

export function movePaddleTo(state, x) {
  state.paddle.x = clamp(x, state.paddle.w / 2, CFG.W - state.paddle.w / 2);
}

export function launch(state) {
  let fired = false;
  for (const ball of state.balls) {
    if (!ball.stuck) continue;
    const off = clamp(ball.stickOffset / (state.paddle.w / 2), -1, 1);
    const angle = off * CFG.MAX_BOUNCE_ANGLE;
    const speed = CFG.BASE_SPEED * speedScale(state.level);
    ball.stuck = false;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    fired = true;
  }
  return fired;
}

function paddleRect(state) {
  return {
    x: state.paddle.x - state.paddle.w / 2,
    y: CFG.PADDLE_Y,
    w: state.paddle.w,
    h: CFG.PADDLE_H,
  };
}

function bounceOffPaddle(state, ball) {
  const off = clamp((ball.x - state.paddle.x) / (state.paddle.w / 2), -1, 1);
  if (state.paddle.sticky) {
    ball.stuck = true;
    ball.stickOffset = ball.x - state.paddle.x;
    ball.vx = 0;
    ball.vy = 0;
    return;
  }
  const speed = Math.min(
    Math.hypot(ball.vx, ball.vy) * CFG.SPEED_STEP,
    CFG.MAX_SPEED * speedScale(state.level),
  );
  const angle = off * CFG.MAX_BOUNCE_ANGLE;
  ball.vx = Math.sin(angle) * speed;
  ball.vy = -Math.cos(angle) * speed;
}

function hitBricks(state, ball, events, rng) {
  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    const bx = brickX(brick.col);
    const by = brickY(brick.row);
    const nx = clamp(ball.x, bx, bx + CFG.BRICK_W);
    const ny = clamp(ball.y, by, by + CFG.BRICK_H);
    const dx = ball.x - nx;
    const dy = ball.y - ny;
    if (dx * dx + dy * dy > CFG.BALL_R * CFG.BALL_R) continue;

    // reflect off the shallower penetration axis
    const penX = CFG.BALL_R - Math.abs(dx);
    const penY = CFG.BALL_R - Math.abs(dy);
    if (dx !== 0 || dy !== 0 ? Math.abs(dx) > Math.abs(dy) : penX < penY) {
      ball.vx = dx >= 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
    } else {
      ball.vy = dy >= 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
    }

    brick.hp -= 1;
    events.push('brick');
    if (brick.hp <= 0) {
      brick.alive = false;
      state.score += CFG.SCORE_BRICK;
      if (brick.power) {
        state.capsules.push({
          x: bx + CFG.BRICK_W / 2,
          y: by + CFG.BRICK_H / 2,
          type: brick.power,
        });
      }
    }
    return; // one brick per ball per step keeps reflection sane
  }
}

function applyCapsule(state, type, events) {
  state.score += CFG.SCORE_CAPSULE;
  events.push('capsule');
  if (type === 'wide') {
    state.paddle.w = CFG.PADDLE_WIDE_W;
    state.timers.wide = CFG.WIDE_TIME;
    movePaddleTo(state, state.paddle.x);
  } else if (type === 'sticky') {
    state.paddle.sticky = true;
    state.timers.sticky = CFG.STICKY_TIME;
  } else if (type === 'multi') {
    const src = state.balls.find((b) => !b.stuck) ?? state.balls[0];
    const speed = Math.max(Math.hypot(src.vx, src.vy), CFG.BASE_SPEED);
    state.balls.push({
      x: src.x,
      y: src.y,
      vx: -(src.vx || speed * 0.5),
      vy: src.vy === 0 ? -speed : src.vy,
      stuck: false,
      stickOffset: 0,
    });
  }
}

export function step(state, dt, rng = Math.random) {
  const events = [];
  if (state.over) return events;

  // power timers
  if (state.timers.wide > 0) {
    state.timers.wide -= dt;
    if (state.timers.wide <= 0) {
      state.paddle.w = CFG.PADDLE_W;
      movePaddleTo(state, state.paddle.x);
    }
  }
  if (state.timers.sticky > 0) {
    state.timers.sticky -= dt;
    if (state.timers.sticky <= 0) state.paddle.sticky = false;
  }

  // balls
  for (const ball of state.balls) {
    if (ball.stuck) {
      ball.x = state.paddle.x + ball.stickOffset;
      ball.y = CFG.PADDLE_Y - CFG.BALL_R;
      continue;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < CFG.BALL_R) {
      ball.x = CFG.BALL_R;
      ball.vx = Math.abs(ball.vx);
      events.push('wall');
    } else if (ball.x > CFG.W - CFG.BALL_R) {
      ball.x = CFG.W - CFG.BALL_R;
      ball.vx = -Math.abs(ball.vx);
      events.push('wall');
    }
    if (ball.y < CFG.BALL_R) {
      ball.y = CFG.BALL_R;
      ball.vy = Math.abs(ball.vy);
      events.push('wall');
    }

    const p = paddleRect(state);
    if (
      ball.vy > 0 &&
      ball.y + CFG.BALL_R >= p.y &&
      ball.y + CFG.BALL_R <= p.y + p.h + 8 &&
      ball.x >= p.x - CFG.BALL_R &&
      ball.x <= p.x + p.w + CFG.BALL_R
    ) {
      bounceOffPaddle(state, ball);
      ball.y = p.y - CFG.BALL_R;
      events.push('paddle');
    }

    hitBricks(state, ball, events, rng);
  }

  // lost balls
  const before = state.balls.length;
  state.balls = state.balls.filter((b) => b.stuck || b.y < CFG.H + CFG.BALL_R * 2);
  if (state.balls.length < before && state.balls.length === 0) {
    state.lives -= 1;
    events.push('life-lost');
    if (state.lives <= 0) {
      state.over = true;
      events.push('game-over');
      return events;
    }
    state.balls = [newBall()];
  }

  // capsules
  for (const cap of state.capsules) cap.y += CFG.CAPSULE_VY * dt;
  const p = paddleRect(state);
  const kept = [];
  for (const cap of state.capsules) {
    const caught =
      cap.y + CFG.CAPSULE_HALF >= p.y &&
      cap.y - CFG.CAPSULE_HALF <= p.y + p.h &&
      cap.x >= p.x - CFG.CAPSULE_HALF &&
      cap.x <= p.x + p.w + CFG.CAPSULE_HALF;
    if (caught) applyCapsule(state, cap.type, events);
    else if (cap.y < CFG.H + CFG.CAPSULE_HALF) kept.push(cap);
  }
  state.capsules = kept;

  // level clear
  if (state.bricks.every((b) => !b.alive)) {
    state.level += 1;
    state.score += CFG.SCORE_LEVEL;
    state.bricks = buildLevel(state.level, rng);
    state.capsules = [];
    state.balls = [newBall()];
    state.paddle.w = CFG.PADDLE_W;
    state.paddle.sticky = false;
    state.timers.wide = 0;
    state.timers.sticky = 0;
    events.push('level-clear');
  }

  return events;
}
