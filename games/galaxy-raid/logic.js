// Galaga-style formation shooter, pure. Enemies swoop in along staggered
// curves, breathe in formation, peel off into dive runs, and loop back to
// their slots. All rng injected; node --test drives every rule.

export const CFG = {
  W: 640,
  H: 480,
  PLAYER_Y: 440,
  PLAYER_SPEED: 340,
  PLAYER_HALF: 14,
  BULLET_SPEED: 520,
  MAX_BULLETS: 2,
  ENEMY_BULLET_SPEED: 215,
  FORMATION_TOP: 90,
  SLOT_W: 48,
  SLOT_H: 36,
  ENTER_TIME: 1.6,
  ENTER_STAGGER: 0.12,
  DIVE_TIME: 2.2,
  RETURN_TIME: 1.4,
  SWAY: 14,
  SWAY_SPEED: 0.7,
  HIT_R: 16,
  CRASH_R: 18,
  INVULN: 2.0,
  LIVES: 3,
  WAVE_BONUS: 500,
};

export const TYPES = {
  bee: { hp: 1, formationScore: 50, divingScore: 100 },
  butterfly: { hp: 1, formationScore: 80, divingScore: 160 },
  boss: { hp: 2, formationScore: 150, divingScore: 400 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = (p) => p * p * (3 - 2 * p);

export function waveLayout(wave) {
  const full = [
    { type: 'boss', count: 4 },
    { type: 'butterfly', count: 8 },
    { type: 'butterfly', count: 8 },
    { type: 'bee', count: 8 },
    { type: 'bee', count: 8 },
  ];
  if (wave === 1) return full.slice(2);
  if (wave === 2) return full.slice(1);
  return full;
}

export function slotPos(enemy, swayT) {
  return {
    x:
      CFG.W / 2 +
      (enemy.col - (enemy.rowCount - 1) / 2) * CFG.SLOT_W +
      Math.sin(swayT * CFG.SWAY_SPEED * Math.PI * 2) * CFG.SWAY,
    y: CFG.FORMATION_TOP + enemy.row * CFG.SLOT_H,
  };
}

function spawnWave(state) {
  const rows = waveLayout(state.wave);
  let index = 0;
  state.enemies = [];
  rows.forEach(({ type, count }, row) => {
    for (let col = 0; col < count; col += 1) {
      state.enemies.push({
        type,
        hp: TYPES[type].hp,
        row,
        col,
        rowCount: count,
        mode: 'entering',
        t: -index * CFG.ENTER_STAGGER,
        from: { x: index % 2 === 0 ? -40 : CFG.W + 40, y: -30 },
        x: -100,
        y: -100,
        diveFrom: null,
        diveTargetX: 0,
      });
      index += 1;
    }
  });
  state.diveTimer = 2.5;
}

export function newGame() {
  const state = {
    player: { x: CFG.W / 2, lives: CFG.LIVES, inv: 1.0 },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    wave: 1,
    score: 0,
    swayT: 0,
    diveTimer: 2.5,
    over: false,
  };
  spawnWave(state);
  return state;
}

export function movePlayer(state, dir, dt) {
  movePlayerTo(state, state.player.x + dir * CFG.PLAYER_SPEED * dt);
}

export function movePlayerTo(state, x) {
  state.player.x = clamp(x, CFG.PLAYER_HALF, CFG.W - CFG.PLAYER_HALF);
}

export function fire(state) {
  if (state.over || state.bullets.length >= CFG.MAX_BULLETS) return false;
  state.bullets.push({ x: state.player.x, y: CFG.PLAYER_Y - 16 });
  return true;
}

function hitPlayer(state, events) {
  if (state.player.inv > 0) return;
  state.player.lives -= 1;
  state.player.inv = CFG.INVULN;
  events.push('player-hit');
  if (state.player.lives <= 0) {
    state.over = true;
    events.push('game-over');
  }
}

function updateEnemy(state, e, dt, rng, events) {
  if (e.mode === 'entering') {
    e.t += dt;
    if (e.t < 0) return;
    const p = Math.min(1, e.t / CFG.ENTER_TIME);
    const slot = slotPos(e, state.swayT);
    const eased = ease(p);
    e.x = lerp(e.from.x, slot.x, eased) + Math.sin(p * Math.PI * 2) * 60 * (1 - p);
    e.y = lerp(e.from.y, slot.y, eased) + Math.sin(p * Math.PI) * 40;
    if (p >= 1) e.mode = 'formation';
    return;
  }
  if (e.mode === 'formation') {
    const slot = slotPos(e, state.swayT);
    e.x = slot.x;
    e.y = slot.y;
    return;
  }
  if (e.mode === 'diving') {
    e.t += dt / CFG.DIVE_TIME;
    const p = Math.min(1, e.t);
    const c = { x: e.diveTargetX, y: CFG.H * 0.55 };
    const end = { x: e.diveTargetX + (e.col % 2 === 0 ? 90 : -90), y: CFG.H + 60 };
    const q = 1 - p;
    e.x = q * q * e.diveFrom.x + 2 * q * p * c.x + p * p * end.x;
    e.y = q * q * e.diveFrom.y + 2 * q * p * c.y + p * p * end.y;
    if (rng() < 1.1 * dt && e.y < CFG.PLAYER_Y - 60) {
      const aim = clamp((state.player.x - e.x) / 240, -1, 1) * 70;
      state.enemyBullets.push({ x: e.x, y: e.y + 10, vx: aim, vy: CFG.ENEMY_BULLET_SPEED });
    }
    if (p >= 1) {
      e.mode = 'returning';
      e.t = 0;
      const slot = slotPos(e, state.swayT);
      e.from = { x: slot.x, y: -40 };
    }
    return;
  }
  // returning
  e.t += dt / CFG.RETURN_TIME;
  const p = Math.min(1, e.t);
  const slot = slotPos(e, state.swayT);
  e.x = lerp(e.from.x, slot.x, ease(p));
  e.y = lerp(e.from.y, slot.y, ease(p));
  if (p >= 1) e.mode = 'formation';
}

export function step(state, dt, rng = Math.random) {
  const events = [];
  if (state.over) return events;

  state.swayT += dt;
  if (state.player.inv > 0) state.player.inv -= dt;

  // send divers
  state.diveTimer -= dt;
  if (state.diveTimer <= 0) {
    const formation = state.enemies.filter((e) => e.mode === 'formation');
    if (formation.length > 0) {
      const diver = formation[Math.floor(rng() * formation.length) % formation.length];
      diver.mode = 'diving';
      diver.t = 0;
      diver.diveFrom = { x: diver.x, y: diver.y };
      diver.diveTargetX = state.player.x;
      events.push('dive');
    }
    state.diveTimer = Math.max(0.55, 2.3 - state.wave * 0.2);
  }

  for (const e of state.enemies) updateEnemy(state, e, dt, rng, events);

  // player bullets
  state.bullets = state.bullets.filter((b) => {
    b.y -= CFG.BULLET_SPEED * dt;
    if (b.y < -10) return false;
    for (const e of state.enemies) {
      if (e.mode === 'entering' && e.t < 0) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) <= CFG.HIT_R) {
        e.hp -= 1;
        if (e.hp <= 0) {
          const table = TYPES[e.type];
          state.score += e.mode === 'diving' ? table.divingScore : table.formationScore;
          e.dead = true;
          events.push('enemy-down');
        } else {
          events.push('enemy-hit'); // boss armor clang
        }
        return false;
      }
    }
    return true;
  });
  state.enemies = state.enemies.filter((e) => !e.dead);

  // enemy bullets
  state.enemyBullets = state.enemyBullets.filter((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > CFG.H + 10) return false;
    if (
      Math.abs(b.x - state.player.x) < CFG.PLAYER_HALF &&
      Math.abs(b.y - CFG.PLAYER_Y) < 12
    ) {
      hitPlayer(state, events);
      return false;
    }
    return true;
  });
  if (state.over) return events;

  // diving enemies crashing into the ship
  for (const e of state.enemies) {
    if (e.mode !== 'diving') continue;
    if (Math.hypot(e.x - state.player.x, e.y - CFG.PLAYER_Y) <= CFG.CRASH_R) {
      e.dead = true;
      hitPlayer(state, events);
      events.push('enemy-down');
    }
  }
  state.enemies = state.enemies.filter((e) => !e.dead);
  if (state.over) return events;

  if (state.enemies.length === 0) {
    state.score += CFG.WAVE_BONUS;
    state.wave += 1;
    state.bullets = [];
    state.enemyBullets = [];
    spawnWave(state);
    events.push('wave-clear');
  }

  return events;
}
