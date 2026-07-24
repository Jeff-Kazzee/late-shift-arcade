// GALAXY RAID cartridge — Galaga homage. Rules in ./logic.js; this file is
// starfield, chunky sprites, input mapping, and pyrotechnics.

import { CFG, TYPES, newGame, step, fire, movePlayer, movePlayerTo } from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const SPRITE_COLOR = { bee: 'amber', butterfly: 'periwinkle', boss: 'rose' };

export function createGalaxyRaid() {
  let shell = null;
  let state = null;
  let reported = false;
  let t = 0;
  let stars = [];
  let sparks = [];

  const burst = (x, y, color, n) => {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 160;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.2, color });
    }
  };

  return {
    id: 'galaxy-raid',
    title: 'GALAXY RAID',
    blurb: 'Formation divers. Two shots in the air.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      reported = false;
      t = 0;
      sparks = [];
      stars = Array.from({ length: 60 }, () => ({
        x: Math.random() * CFG.W,
        y: Math.random() * CFG.H,
        speed: 30 + Math.random() * 90,
        size: Math.random() < 0.2 ? 2 : 1,
      }));
    },
    update(dt, input) {
      t += dt;

      let dir = 0;
      if (input.down('left')) dir -= 1;
      if (input.down('right')) dir += 1;
      if (dir !== 0) movePlayer(state, dir, dt);
      else if (input.pointer.moved) movePlayerTo(state, input.pointer.x); // hover steers

      if ((input.pressed('action') || input.pointer.justDown) && fire(state)) {
        shell.sfx.play('pew');
      }

      const before = state.enemies.slice();
      const events = step(state, dt);
      if (events.includes('enemy-down')) {
        shell.sfx.play('zap');
        for (const e of before) {
          if (!state.enemies.includes(e)) {
            burst(e.x, e.y, shell.palette[SPRITE_COLOR[e.type]], 10);
          }
        }
      }
      if (events.includes('enemy-hit')) shell.sfx.play('wall');
      if (events.includes('dive')) shell.sfx.play('move');
      if (events.includes('player-hit')) {
        shell.sfx.play('bigboom');
        shell.shake(8);
        burst(state.player.x, CFG.PLAYER_Y, shell.palette.cream, 16);
      }
      if (events.includes('wave-clear')) shell.sfx.play('fanfare');

      for (const s of stars) {
        s.y += s.speed * dt;
        if (s.y > CFG.H) {
          s.y = 0;
          s.x = Math.random() * CFG.W;
        }
      }
      sparks = sparks.filter((p) => (p.life -= dt) > 0);
      for (const p of sparks) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      if (state.over && !reported) {
        reported = true;
        shell.endGame(state.score);
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      const text = createTextPainter(ctx, pal);

      // starfield
      for (const s of stars) {
        ctx.fillStyle = `rgba(243,235,221,${s.size === 2 ? 0.5 : 0.25})`;
        ctx.fillRect(s.x, s.y, s.size, s.size + 1);
      }

      // HUD
      text(`SCORE ${state.score}`, 22, 34, { align: 'left', bold: true });
      text(`WAVE ${state.wave}`, CFG.W / 2, 34, { color: pal.amber, bold: true, glow: 6 });
      for (let i = 0; i < Math.max(0, state.player.lives - 1); i += 1) {
        ctx.fillStyle = pal.cream;
        ctx.beginPath();
        ctx.moveTo(CFG.W - 100 - i * 22, 36);
        ctx.lineTo(CFG.W - 108 - i * 22, 22);
        ctx.lineTo(CFG.W - 116 - i * 22, 36);
        ctx.fill();
      }

      // enemies: chunky two-tone sprites, wing wobble by phase
      for (const e of state.enemies) {
        if (e.mode === 'entering' && e.t < 0) continue;
        const color = pal[SPRITE_COLOR[e.type]];
        const wob = Math.sin(t * 6 + e.col) > 0 ? 1 : 0;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = color;
        ctx.fillRect(e.x - 8, e.y - 6, 16, 12); // body
        ctx.fillRect(e.x - 14, e.y - 2 - wob * 2, 6, 6); // wings
        ctx.fillRect(e.x + 8, e.y - 2 - wob * 2, 6, 6);
        if (e.type === 'boss') {
          ctx.fillRect(e.x - 5, e.y - 12, 10, 6); // crown
          if (e.hp > 1) {
            ctx.fillStyle = pal.cream;
            ctx.fillRect(e.x - 3, e.y - 3, 6, 6); // armored core
          }
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = pal.ink;
        ctx.fillRect(e.x - 3, e.y + 1, 2, 3); // eyes
        ctx.fillRect(e.x + 1, e.y + 1, 2, 3);
      }

      // bullets
      ctx.fillStyle = pal.cream;
      for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y - 8, 3, 10);
      ctx.fillStyle = pal.rose;
      for (const b of state.enemyBullets) ctx.fillRect(b.x - 2, b.y - 4, 4, 7);

      // sparks
      for (const p of sparks) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 3, 3);
      }
      ctx.globalAlpha = 1;

      // player ship (blinks while invulnerable)
      if (!state.over && (state.player.inv <= 0 || Math.floor(t * 10) % 2 === 0)) {
        const px = state.player.x;
        ctx.shadowColor = pal.cream;
        ctx.shadowBlur = 10;
        ctx.fillStyle = pal.cream;
        ctx.beginPath();
        ctx.moveTo(px, CFG.PLAYER_Y - 14);
        ctx.lineTo(px - CFG.PLAYER_HALF, CFG.PLAYER_Y + 10);
        ctx.lineTo(px + CFG.PLAYER_HALF, CFG.PLAYER_Y + 10);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = pal.amber;
        ctx.fillRect(px - 2, CFG.PLAYER_Y + 10, 4, 3 + (Math.floor(t * 20) % 2) * 2); // thruster
      }

      text('move: hover / arrows · fire: tap / SPACE', CFG.W / 2, CFG.H - 14, {
        size: 11,
        color: pal.rose,
      });
    },
    destroy() {
      state = null;
    },
  };
}

// The default export is the cartridge factory: how the rack loads a game.
export default createGalaxyRaid;
