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

const CAPSULE_LABEL = { wide: 'W', multi: '×2', sticky: 'S' };

export function createBreakout() {
  let shell = null;
  let state = null;
  let reported = false;
  let t = 0;

  return {
    id: 'breakout',
    title: 'BREAKOUT',
    blurb: 'Bricks, power-ups, 5 levels then endless.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      reported = false;
      t = 0;
    },
    update(dt, input) {
      t += dt;
      let dir = 0;
      if (input.down('left')) dir -= 1;
      if (input.down('right')) dir += 1;
      if (dir !== 0) movePaddle(state, dir, dt);
      if (input.pointer.down) movePaddleTo(state, input.pointer.x);
      if (input.pressed('action') || input.pointer.justDown) launch(state);

      step(state, dt);

      if (state.over && !reported) {
        reported = true;
        shell.endGame(state.score);
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      ctx.fillStyle = pal.ink;
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

      // balls
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
