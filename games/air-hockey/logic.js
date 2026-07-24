// Air-hockey physics as pure state transitions: puck friction, wall
// restitution, goal mouths, and circle-circle mallet impacts. Everything
// here runs under node --test.

export const CFG = {
  W: 640,
  H: 480,
  MALLET_R: 26,
  PUCK_R: 13,
  GOAL_H: 150,
  FRICTION: 0.35, // exponential damping per second
  WALL_REST: 0.85,
  HIT_REST: 0.9,
  MAX_PUCK_SPEED: 900,
  SERVE_DELAY: 0.9,
  WIN: 7,
  CPU_DEFENSE_X: 560,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function newGame() {
  return {
    mallets: [
      { x: 110, y: CFG.H / 2, vx: 0, vy: 0 },
      { x: CFG.W - 110, y: CFG.H / 2, vx: 0, vy: 0 },
    ],
    puck: { x: CFG.W / 2, y: CFG.H / 2, vx: 0, vy: 0 },
    scores: [0, 0],
    serveIn: CFG.SERVE_DELAY,
    serveSide: 0, // who receives the puck on serve
    winner: null,
  };
}

// Mallet 0 owns the left half, mallet 1 the right. dt drives the velocity
// estimate that impacts inherit; pass the real frame dt.
export function setMallet(state, i, x, y, dt) {
  const m = state.mallets[i];
  const lo = i === 0 ? CFG.MALLET_R : CFG.W / 2 + CFG.MALLET_R;
  const hi = i === 0 ? CFG.W / 2 - CFG.MALLET_R : CFG.W - CFG.MALLET_R;
  const nx = clamp(x, lo, hi);
  const ny = clamp(y, CFG.MALLET_R, CFG.H - CFG.MALLET_R);
  if (dt > 0) {
    m.vx = (nx - m.x) / dt;
    m.vy = (ny - m.y) / dt;
  } else {
    m.vx = 0;
    m.vy = 0;
  }
  m.x = nx;
  m.y = ny;
}

export function inGoalMouth(y) {
  return Math.abs(y - CFG.H / 2) < CFG.GOAL_H / 2;
}

// Where the CPU mallet wants to be. Chase-and-strike when the puck is in
// its half; otherwise hold the line between puck and goal.
export function cpuTarget(state) {
  const { puck } = state;
  if (puck.x > CFG.W / 2 + 10) {
    // get behind the puck (goal-side) so the strike sends it leftward
    return { x: puck.x + (CFG.MALLET_R + CFG.PUCK_R) * 0.55, y: puck.y };
  }
  return {
    x: CFG.CPU_DEFENSE_X,
    y: CFG.H / 2 + (puck.y - CFG.H / 2) * 0.55,
  };
}

function serve(state) {
  state.puck.x = CFG.W / 2 + (state.serveSide === 0 ? -70 : 70);
  state.puck.y = CFG.H / 2;
  state.puck.vx = 0;
  state.puck.vy = 0;
}

function goal(state, scorer, events) {
  state.scores[scorer] += 1;
  events.push('goal');
  state.mallets[0].x = 110;
  state.mallets[0].y = CFG.H / 2;
  state.mallets[1].x = CFG.W - 110;
  state.mallets[1].y = CFG.H / 2;
  state.puck.x = CFG.W / 2;
  state.puck.y = CFG.H / 2;
  state.puck.vx = 0;
  state.puck.vy = 0;
  if (state.scores[scorer] >= CFG.WIN) {
    state.winner = scorer;
    events.push('win');
  } else {
    state.serveIn = CFG.SERVE_DELAY;
    state.serveSide = scorer === 0 ? 1 : 0; // conceder receives
  }
}

function collideMallet(state, i, events) {
  const m = state.mallets[i];
  const p = state.puck;
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const dist = Math.hypot(dx, dy);
  const minDist = CFG.MALLET_R + CFG.PUCK_R;
  if (dist >= minDist || dist === 0) return;

  const nx = dx / dist;
  const ny = dy / dist;
  p.x = m.x + nx * minDist;
  p.y = m.y + ny * minDist;

  const rvn = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
  if (rvn >= 0) return; // already separating
  p.vx -= (1 + CFG.HIT_REST) * rvn * nx;
  p.vy -= (1 + CFG.HIT_REST) * rvn * ny;

  const speed = Math.hypot(p.vx, p.vy);
  if (speed > CFG.MAX_PUCK_SPEED) {
    p.vx = (p.vx / speed) * CFG.MAX_PUCK_SPEED;
    p.vy = (p.vy / speed) * CFG.MAX_PUCK_SPEED;
  }
  events.push('hit');
}

export function step(state, dt) {
  const events = [];
  if (state.winner !== null) return events;

  if (state.serveIn > 0) {
    state.serveIn -= dt;
    if (state.serveIn <= 0) {
      serve(state);
      events.push('serve');
    }
    return events;
  }

  const p = state.puck;
  const damp = Math.exp(-CFG.FRICTION * dt);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (p.y < CFG.PUCK_R) {
    p.y = CFG.PUCK_R;
    p.vy = Math.abs(p.vy) * CFG.WALL_REST;
    events.push('wall');
  } else if (p.y > CFG.H - CFG.PUCK_R) {
    p.y = CFG.H - CFG.PUCK_R;
    p.vy = -Math.abs(p.vy) * CFG.WALL_REST;
    events.push('wall');
  }

  if (p.x < CFG.PUCK_R) {
    if (inGoalMouth(p.y)) {
      if (p.x < -CFG.PUCK_R) {
        goal(state, 1, events);
        return events;
      }
    } else {
      p.x = CFG.PUCK_R;
      p.vx = Math.abs(p.vx) * CFG.WALL_REST;
      events.push('wall');
    }
  } else if (p.x > CFG.W - CFG.PUCK_R) {
    if (inGoalMouth(p.y)) {
      if (p.x > CFG.W + CFG.PUCK_R) {
        goal(state, 0, events);
        return events;
      }
    } else {
      p.x = CFG.W - CFG.PUCK_R;
      p.vx = -Math.abs(p.vx) * CFG.WALL_REST;
      events.push('wall');
    }
  }

  collideMallet(state, 0, events);
  collideMallet(state, 1, events);

  return events;
}
