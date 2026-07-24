// BREAKOUT cartridge — glue over ./logic.js: input mapping (keys + drag),
// launch on tap/space, HUD, and the brick wall's night-palette paint job.

import {
  CFG,
  newGame,
  step,
  movePaddle,
  movePaddleTo,
  launch,
  brickX,
  brickY,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const CAPSULE_LABEL = { wide: 'W', multi: '×2', sticky: 'S' };

export function createBreakout() {
  let shell = null;
  let state = null;
  let reported = false;
  let t = 0;
  let trail = [];
  let particles = [];
  let tapStart = null;

  const spawnBurst = (x, y, color, n) => {
    for (let i = 0; i < n; i += 1) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 260,
        vy: -Math.random() * 200 - 40,
        life: 0.4 + Math.random() * 0.25,
        color,
      });
    }
  };

  return {
    id: 'breakout',
    title: 'BREAKOUT',
    blurb: 'Bricks, power-ups, 5 levels then endless.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      reported = false;
      t = 0;
      trail = [];
      particles = [];
      tapStart = null;
    },
    update(dt, input) {
      t += dt;
      let dir = 0;
      if (input.down('left')) dir -= 1;
      if (input.down('right')) dir += 1;
      if (dir !== 0) movePaddle(state, dir, dt);
      else if (input.pointer.moved) movePaddleTo(state, input.pointer.x); // hover steers

      // touch: only a quick, still tap launches — dragging just moves the
      // paddle, so sticky catch-and-aim is actually aimable
      if (input.pointer.justDown) tapStart = { x: input.pointer.x, at: t };
      if (input.pointer.justUp && tapStart) {
        const quick = t - tapStart.at < 0.25 && Math.abs(input.pointer.x - tapStart.x) < 14;
        if (quick && launch(state)) shell.sfx.play('launch');
        tapStart = null;
      }
      if (input.pressed('action') && launch(state)) shell.sfx.play('launch');

      const events = step(state, dt);
      if (events.includes('paddle')) shell.sfx.play('hit');
      if (events.includes('wall')) shell.sfx.play('wall');
      if (events.includes('brick')) {
        shell.sfx.play('brick');
        for (const ball of state.balls) spawnBurst(ball.x, ball.y, shell.palette.periwinkle, 5);
      }
      if (events.includes('capsule')) shell.sfx.play('capsule');
      if (events.includes('life-lost')) {
        shell.sfx.play('lose');
        shell.shake(6);
        trail = [];
      }
      if (events.includes('level-clear')) {
        shell.sfx.play('fanfare');
        trail = [];
        particles = [];
      }

      for (const ball of state.balls) {
        if (!ball.stuck) trail.push({ x: ball.x, y: ball.y });
      }
      while (trail.length > 20) trail.shift();

      particles = particles.filter((p) => (p.life -= dt) > 0);
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 380 * dt;
      }

      if (state.over && !reported) {
        reported = true;
        shell.shake(8);
        shell.endGame(state.score);
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      const text = createTextPainter(ctx, pal);

      // HUD
      text(`SCORE ${state.score}`, 22, 34, { align: 'left', color: pal.cream, bold: true });
      text(
        state.level <= CFG.LEVELS ? `LEVEL ${state.level}` : `ENDLESS ${state.level - CFG.LEVELS}`,
        CFG.W / 2,
        34,
        { color: pal.amber, bold: true, glow: 6 },
      );
      // keep clear of the DOM eject button in the top-right corner
      text('●'.repeat(Math.max(0, state.lives)), CFG.W - 88, 34, {
        align: 'right',
        color: pal.rose,
      });
      ctx.strokeStyle = pal.hairline;
      ctx.beginPath();
      ctx.moveTo(0, 48);
      ctx.lineTo(CFG.W, 48);
      ctx.stroke();

      // bricks: hue by remaining hp
      const hpColor = { 1: pal.periwinkle, 2: pal.deep, 3: pal.rose };
      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        ctx.fillStyle = hpColor[brick.hp] ?? pal.rose;
        ctx.beginPath();
        ctx.roundRect(brickX(brick.col), brickY(brick.row), CFG.BRICK_W, CFG.BRICK_H, 3);
        ctx.fill();
        if (brick.power) {
          ctx.fillStyle = 'rgba(11,12,20,0.5)';
          ctx.fillRect(brickX(brick.col) + 4, brickY(brick.row) + 7, CFG.BRICK_W - 8, 4);
        }
      }

      // capsules
      for (const cap of state.capsules) {
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 8;
        ctx.fillStyle = pal.amber;
        ctx.beginPath();
        ctx.roundRect(cap.x - 14, cap.y - CFG.CAPSULE_HALF, 28, CFG.CAPSULE_HALF * 2, 6);
        ctx.fill();
        ctx.shadowBlur = 0;
        text(CAPSULE_LABEL[cap.type], cap.x, cap.y + 4, { size: 12, color: pal.ink, bold: true });
      }

      // paddle — amber glow while sticky
      ctx.shadowColor = state.paddle.sticky ? pal.amber : pal.cream;
      ctx.shadowBlur = 10;
      ctx.fillStyle = state.paddle.sticky ? pal.amber : pal.cream;
      ctx.beginPath();
      ctx.roundRect(
        state.paddle.x - state.paddle.w / 2,
        CFG.PADDLE_Y,
        state.paddle.w,
        CFG.PADDLE_H,
        6,
      );
      ctx.fill();

      // trail, shatter particles, balls
      trail.forEach((p, i) => {
        const f = (i + 1) / trail.length;
        ctx.fillStyle = `rgba(230,193,126,${(0.22 * f).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, CFG.BALL_R * (0.3 + 0.6 * f), 0, Math.PI * 2);
        ctx.fill();
      });
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = pal.amber;
      ctx.shadowBlur = 12;
      ctx.fillStyle = pal.amber;
      for (const ball of state.balls) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, CFG.BALL_R, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (state.balls.some((b) => b.stuck) && Math.floor(t * 2) % 2 === 0) {
        text('TAP or SPACE to launch', CFG.W / 2, CFG.H - 60, {
          size: 14,
          color: pal.amber,
          glow: 6,
        });
      }
    },
    destroy() {
      state = null;
    },
  };
}

// The default export is the cartridge factory: how the rack loads a game.
export default createBreakout;
