// ASTEROID DEFENDER cartridge — aim anywhere, the interceptor detonates
// there. Rules in ./logic.js; this is input, skyline, and pyrotechnics.

import { CFG, newGame, step, fire, blockX } from './logic.js';

export function createAsteroidDefender() {
  let shell = null;
  let state = null;
  let reported = false;
  let t = 0;
  let aim = { x: CFG.W / 2, y: 200 };
  let boomCooldown = 0; // rate-limit blast noise during big chains

  return {
    id: 'asteroid-defender',
    title: 'ASTEROID DEFENDER',
    blurb: 'Six city blocks. Limited missiles. Chain blasts.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      reported = false;
      t = 0;
    },
    update(dt, input) {
      t += dt;
      boomCooldown -= dt;
      aim = { x: input.pointer.x, y: input.pointer.y };
      if (input.pointer.justDown && fire(state, input.pointer.x, input.pointer.y)) {
        shell.sfx.play('launch');
      }

      const events = step(state, dt);
      if (events.includes('blast') && boomCooldown <= 0) {
        shell.sfx.play('boom');
        boomCooldown = 0.09;
      }
      if (events.includes('building-lost')) {
        shell.sfx.play('bigboom');
        shell.shake(8);
      }
      if (events.includes('wave-clear')) shell.sfx.play('fanfare');

      if (state.over && !reported) {
        reported = true;
        shell.shake(10);
        shell.endGame(state.score);
      }
    },
    draw(ctx) {
      const pal = shell.palette;

      // night sky with a faint ground haze
      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, pal.ink);
      sky.addColorStop(0.85, '#11132a');
      sky.addColorStop(1, '#161936');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      const text = (str, x, y, { size = 14, color = pal.cream, bold = false, glow = 0, align = 'center' } = {}) => {
        ctx.font = `${bold ? 'bold ' : ''}${size}px "Courier New", monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        if (glow) {
          ctx.shadowColor = color;
          ctx.shadowBlur = glow;
        }
        ctx.fillText(str, x, y);
        ctx.shadowBlur = 0;
      };

      // HUD
      text(`SCORE ${state.score}`, 22, 34, { align: 'left', bold: true });
      text(`WAVE ${state.wave}`, CFG.W / 2, 34, { color: pal.amber, bold: true, glow: 6 });
      text(`AMMO ${'▲'.repeat(Math.min(state.ammo, 14))}${state.ammo > 14 ? '+' : ''}`, CFG.W - 88, 34, {
        align: 'right',
        color: pal.rose,
        size: 12,
      });

      // ground
      ctx.fillStyle = '#181b38';
      ctx.fillRect(0, CFG.GROUND, CFG.W, CFG.H - CFG.GROUND);
      ctx.strokeStyle = pal.hairline;
      ctx.beginPath();
      ctx.moveTo(0, CFG.GROUND);
      ctx.lineTo(CFG.W, CFG.GROUND);
      ctx.stroke();

      // city blocks with lit windows
      for (let i = 0; i < CFG.BLOCKS; i += 1) {
        if (!state.buildings[i]) continue;
        const bx = blockX(i);
        const by = CFG.GROUND - CFG.BLOCK_H;
        ctx.fillStyle = '#232752';
        ctx.fillRect(bx, by, CFG.BLOCK_W, CFG.BLOCK_H);
        ctx.fillStyle = pal.amber;
        for (let wx = 6; wx < CFG.BLOCK_W - 6; wx += 12) {
          for (let wy = 6; wy < CFG.BLOCK_H - 4; wy += 10) {
            if ((i * 7 + wx + wy) % 3 !== 0) ctx.fillRect(bx + wx, by + wy, 4, 5);
          }
        }
      }

      // launcher
      ctx.fillStyle = pal.deep;
      ctx.beginPath();
      ctx.moveTo(CFG.LAUNCHER_X - 16, CFG.GROUND);
      ctx.lineTo(CFG.LAUNCHER_X, CFG.GROUND - 18);
      ctx.lineTo(CFG.LAUNCHER_X + 16, CFG.GROUND);
      ctx.fill();

      // missiles + tracers
      for (const m of state.missiles) {
        ctx.strokeStyle = 'rgba(230,193,126,0.35)';
        ctx.beginPath();
        ctx.moveTo(m.sx, m.sy);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 10;
        ctx.fillStyle = pal.amber;
        ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
        ctx.shadowBlur = 0;
        // the aimed point, marked
        ctx.strokeStyle = 'rgba(230,193,126,0.5)';
        ctx.beginPath();
        ctx.moveTo(m.tx - 5, m.ty);
        ctx.lineTo(m.tx + 5, m.ty);
        ctx.moveTo(m.tx, m.ty - 5);
        ctx.lineTo(m.tx, m.ty + 5);
        ctx.stroke();
      }

      // blasts
      for (const b of state.blasts) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(243,235,221,0.9)');
        g.addColorStop(0.5, 'rgba(230,193,126,0.55)');
        g.addColorStop(1, 'rgba(212,129,143,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // asteroids with tails
      for (const a of state.asteroids) {
        ctx.strokeStyle = 'rgba(212,129,143,0.35)';
        ctx.beginPath();
        ctx.moveTo(a.x - a.vx * 0.25, a.y - a.vy * 0.25);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
        ctx.shadowColor = pal.rose;
        ctx.shadowBlur = 10;
        ctx.fillStyle = pal.rose;
        ctx.beginPath();
        ctx.arc(a.x, a.y, CFG.ASTEROID_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // crosshair
      ctx.strokeStyle = 'rgba(159,168,232,0.6)';
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 8, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 12, aim.y);
      ctx.lineTo(aim.x + 12, aim.y);
      ctx.moveTo(aim.x, aim.y - 12);
      ctx.lineTo(aim.x, aim.y + 12);
      ctx.stroke();

      if (state.intermission > 0 && Math.floor(t * 3) % 2 === 0) {
        text(`WAVE ${state.wave} CLEAR`, CFG.W / 2, 200, {
          size: 24,
          color: pal.amber,
          bold: true,
          glow: 12,
        });
      }
      if (state.ammo === 0 && state.missiles.length === 0 && !state.over) {
        text('OUT OF MISSILES', CFG.W / 2, 230, { size: 14, color: pal.rose, glow: 6 });
      }
    },
    destroy() {
      state = null;
    },
  };
}
