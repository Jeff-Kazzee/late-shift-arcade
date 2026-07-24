// Missile Command-style rules, pure. Interceptors detonate at the aimed
// point; blasts grow, linger, shrink; any asteroid caught in a blast dies
// and leaves a blast of its own — the chain. All rng is injected.

export const CFG = {
  W: 640,
  H: 480,
  GROUND: 452,
  BLOCKS: 6,
  BLOCK_W: 64,
  BLOCK_H: 30,
  LAUNCHER_X: 320,
  MISSILE_SPEED: 430,
  BLAST_MAX_R: 55,
  BLAST_GROW: 110, // px/s
  BLAST_HOLD: 0.25, // s at full size
  BLAST_SHRINK: 140, // px/s
  ASTEROID_R: 9,
  SCORE_ASTEROID: 100,
  BONUS_BUILDING: 100,
  BONUS_MISSILE: 50,
  INTERMISSION: 2.5,
};

// city blocks evenly spread, launcher gap in the middle
export function blockX(i) {
  const usable = CFG.W - 40;
  const slot = usable / CFG.BLOCKS;
  return 20 + i * slot + (slot - CFG.BLOCK_W) / 2;
}

export function waveSpec(wave) {
  return {
    count: 5 + wave * 2,
    speed: 42 + wave * 7,
    ammo: 4 + Math.ceil((5 + wave * 2) * 0.8),
    window: 8 + wave, // seconds over which the wave spawns
  };
}

export function newGame(rng = Math.random) {
  const state = {
    wave: 1,
    ammo: 0,
    missiles: [],
    blasts: [],
    asteroids: [],
    pending: [],
    buildings: Array.from({ length: CFG.BLOCKS }, () => true),
    score: 0,
    over: false,
    intermission: 0,
  };
  startWave(state, rng);
  return state;
}

export function startWave(state, rng = Math.random) {
  const spec = waveSpec(state.wave);
  state.ammo = spec.ammo;
  state.pending = Array.from({ length: spec.count }, () => {
    const targets = state.buildings
      .map((alive, i) => (alive ? i : -1))
      .filter((i) => i >= 0);
    const target = targets.length
      ? blockX(targets[Math.floor(rng() * targets.length) % targets.length]) + CFG.BLOCK_W / 2
      : rng() * CFG.W;
    const x = rng() * CFG.W;
    return {
      delay: rng() * spec.window,
      x,
      vx: (target - x) / ((CFG.GROUND + 10) / spec.speed),
      vy: spec.speed,
    };
  });
}

export function fire(state, tx, ty) {
  if (state.over || state.ammo <= 0 || ty > CFG.GROUND - 30) return false;
  state.ammo -= 1;
  state.missiles.push({
    x: CFG.LAUNCHER_X,
    y: CFG.GROUND,
    sx: CFG.LAUNCHER_X,
    sy: CFG.GROUND,
    tx,
    ty,
  });
  return true;
}

function detonate(state, x, y, events) {
  state.blasts.push({ x, y, r: 4, phase: 'grow', hold: CFG.BLAST_HOLD });
  events.push('blast');
}

export function step(state, dt, rng = Math.random) {
  const events = [];
  if (state.over) return events;

  if (state.intermission > 0) {
    state.intermission -= dt;
    if (state.intermission <= 0) {
      state.wave += 1;
      startWave(state, rng);
      events.push('wave-start');
    }
    return events;
  }

  // spawn queue
  for (const p of state.pending) p.delay -= dt;
  const due = state.pending.filter((p) => p.delay <= 0);
  state.pending = state.pending.filter((p) => p.delay > 0);
  for (const p of due) {
    state.asteroids.push({ x: p.x, y: -CFG.ASTEROID_R, vx: p.vx, vy: p.vy });
  }

  // missiles
  const flying = [];
  for (const m of state.missiles) {
    const dx = m.tx - m.x;
    const dy = m.ty - m.y;
    const dist = Math.hypot(dx, dy);
    const reach = CFG.MISSILE_SPEED * dt;
    if (dist <= reach) {
      detonate(state, m.tx, m.ty, events);
    } else {
      m.x += (dx / dist) * reach;
      m.y += (dy / dist) * reach;
      flying.push(m);
    }
  }
  state.missiles = flying;

  // blasts age
  const liveBlasts = [];
  for (const b of state.blasts) {
    if (b.phase === 'grow') {
      b.r += CFG.BLAST_GROW * dt;
      if (b.r >= CFG.BLAST_MAX_R) {
        b.r = CFG.BLAST_MAX_R;
        b.phase = 'hold';
      }
    } else if (b.phase === 'hold') {
      b.hold -= dt;
      if (b.hold <= 0) b.phase = 'shrink';
    } else {
      b.r -= CFG.BLAST_SHRINK * dt;
    }
    if (b.r > 0) liveBlasts.push(b);
  }
  state.blasts = liveBlasts;

  // asteroids: fall, burn in blasts (chaining), strike the city
  const surviving = [];
  for (const a of state.asteroids) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;

    const caught = state.blasts.some(
      (b) => Math.hypot(a.x - b.x, a.y - b.y) <= b.r + CFG.ASTEROID_R,
    );
    if (caught) {
      state.score += CFG.SCORE_ASTEROID;
      detonate(state, a.x, a.y, events); // the chain
      events.push('asteroid-down');
      continue;
    }

    if (a.y + CFG.ASTEROID_R >= CFG.GROUND - CFG.BLOCK_H) {
      let struck = false;
      for (let i = 0; i < CFG.BLOCKS; i += 1) {
        if (!state.buildings[i]) continue;
        const bx = blockX(i);
        if (a.x >= bx - 4 && a.x <= bx + CFG.BLOCK_W + 4) {
          state.buildings[i] = false;
          struck = true;
          events.push('building-lost');
          break;
        }
      }
      if (struck || a.y + CFG.ASTEROID_R >= CFG.GROUND) {
        detonate(state, a.x, Math.min(a.y, CFG.GROUND - 6), events);
        continue;
      }
    }
    surviving.push(a);
  }
  state.asteroids = surviving;

  if (state.buildings.every((alive) => !alive)) {
    state.over = true;
    events.push('game-over');
    return events;
  }

  // wave complete: sky and queues empty, blasts finished
  if (
    state.pending.length === 0 &&
    state.asteroids.length === 0 &&
    state.missiles.length === 0 &&
    state.blasts.length === 0
  ) {
    const buildingBonus =
      state.buildings.filter(Boolean).length * CFG.BONUS_BUILDING;
    const ammoBonus = state.ammo * CFG.BONUS_MISSILE;
    state.score += buildingBonus + ammoBonus;
    state.intermission = CFG.INTERMISSION;
    events.push('wave-clear');
  }

  return events;
}
