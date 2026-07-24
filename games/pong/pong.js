// PONG cartridge. All rules live in ./logic.js; this file is glue: mode
// select, input mapping (1P: any control; 2P: W/S vs arrows, split-screen
// touch), and drawing.

import { CFG, newGame, step, movePaddle, movePaddleTo, cpuDir } from './logic.js';

const CPU_SPEED = 0.82; // fraction of a human paddle's speed

export function createPong() {
  let shell = null;
  let state = null;
  let mode = null; // null = mode select, 1 = vs CPU, 2 = local 2P
  let sel = 0;
  let reported = false;
  let t = 0;

  const optionRect = (i) => ({
    x: CFG.W / 2 - 150,
    y: CFG.H / 2 - 10 + i * 70,
    w: 300,
    h: 54,
  });

  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  function begin(chosen) {
    mode = chosen;
    state = newGame();
    reported = false;
  }

  function updateModeSelect(input) {
    if (input.pressed('up', 'down')) sel = 1 - sel;
    if (input.pressed('1')) return begin(1);
    if (input.pressed('2')) return begin(2);
    if (input.pressed('action')) return begin(sel + 1);
    if (input.pointer.justDown) {
      for (let i = 0; i < 2; i += 1) {
        if (inRect(input.pointer, optionRect(i))) return begin(i + 1);
      }
    }
  }

  function updatePlay(dt, input) {
    let p1 = 0;
    if (input.down('w')) p1 -= 1;
    if (input.down('s')) p1 += 1;

    if (mode === 1) {
      if (input.down('arrowup')) p1 -= 1;
      if (input.down('arrowdown')) p1 += 1;
      if (input.pointer.down) movePaddleTo(state, 0, input.pointer.y);
      movePaddle(state, 1, cpuDir(state) * CPU_SPEED, dt);
    } else {
      let p2 = 0;
      if (input.down('arrowup')) p2 -= 1;
      if (input.down('arrowdown')) p2 += 1;
      movePaddle(state, 1, p2, dt);
      if (input.pointer.down) {
        if (input.pointer.x < CFG.W / 2) movePaddleTo(state, 0, input.pointer.y);
        else movePaddleTo(state, 1, input.pointer.y);
      }
    }
    movePaddle(state, 0, p1, dt);

    step(state, dt);

    if (state.winner !== null && mode === 1 && !reported) {
      reported = true;
      const bonus = state.winner === 0 ? 500 : 0;
      shell.endGame(state.scores[0] * 100 + bonus);
    }
    // In 2P the win banner is drawn here and R (shell restart) starts over.
  }

  return {
    id: 'pong',
    title: 'PONG',
    blurb: 'First to 7. Ball speeds up every rally.',
    init(ctx) {
      shell = ctx;
      state = null;
      mode = null;
      sel = 0;
      reported = false;
      t = 0;
    },
    update(dt, input) {
      t += dt;
      if (mode === null) updateModeSelect(input);
      else updatePlay(dt, input);
    },
    draw(ctx) {
      const pal = shell.palette;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      const text = (str, x, y, { size = 16, color = pal.cream, bold = false, glow = 0, align = 'center' } = {}) => {
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

      if (mode === null) {
        text('PONG', CFG.W / 2, 150, { size: 52, color: pal.amber, bold: true, glow: 16 });
        text('first to 7 · ball speeds up every rally', CFG.W / 2, 190, {
          size: 13,
          color: pal.rose,
        });
        const labels = ['1 PLAYER  vs CPU', '2 PLAYERS  W/S vs ↑/↓'];
        for (let i = 0; i < 2; i += 1) {
          const r = optionRect(i);
          ctx.beginPath();
          ctx.roundRect(r.x, r.y, r.w, r.h, 8);
          if (sel === i) {
            ctx.fillStyle = 'rgba(230,193,126,0.07)';
            ctx.fill();
          }
          ctx.strokeStyle = sel === i ? pal.amber : pal.hairline;
          ctx.stroke();
          text(labels[i], CFG.W / 2, r.y + 34, {
            size: 16,
            color: sel === i ? pal.cream : pal.periwinkle,
            bold: sel === i,
          });
        }
        text('SPACE or tap to start', CFG.W / 2, CFG.H - 40, { size: 12, color: pal.rose });
        return;
      }

      // center line
      ctx.strokeStyle = pal.hairline;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(CFG.W / 2, 20);
      ctx.lineTo(CFG.W / 2, CFG.H - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      text(String(state.scores[0]), CFG.W / 2 - 70, 70, {
        size: 44,
        color: pal.cream,
        bold: true,
        glow: 6,
      });
      text(String(state.scores[1]), CFG.W / 2 + 70, 70, {
        size: 44,
        color: pal.periwinkle,
        bold: true,
        glow: 6,
      });

      // paddles
      ctx.shadowBlur = 10;
      ctx.shadowColor = pal.cream;
      ctx.fillStyle = pal.cream;
      ctx.beginPath();
      ctx.roundRect(CFG.PADDLE_X, state.paddles[0] - CFG.PADDLE_H / 2, CFG.PADDLE_W, CFG.PADDLE_H, 4);
      ctx.fill();
      ctx.shadowColor = pal.periwinkle;
      ctx.fillStyle = pal.periwinkle;
      ctx.beginPath();
      ctx.roundRect(
        CFG.W - CFG.PADDLE_X - CFG.PADDLE_W,
        state.paddles[1] - CFG.PADDLE_H / 2,
        CFG.PADDLE_W,
        CFG.PADDLE_H,
        4,
      );
      ctx.fill();

      // ball
      if (state.serveIn <= 0 && state.winner === null) {
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 14;
        ctx.fillStyle = pal.amber;
        ctx.beginPath();
        ctx.arc(state.ball.x, state.ball.y, CFG.BALL_R, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (state.serveIn > 0 && state.winner === null && Math.floor(t * 3) % 2 === 0) {
        text('READY', CFG.W / 2, CFG.H / 2 - 20, { size: 20, color: pal.amber, glow: 8 });
      }

      if (state.winner !== null && mode === 2) {
        ctx.fillStyle = 'rgba(11,12,20,0.75)';
        ctx.fillRect(0, 0, CFG.W, CFG.H);
        text(`PLAYER ${state.winner + 1} WINS`, CFG.W / 2, CFG.H / 2 - 10, {
          size: 30,
          color: pal.amber,
          bold: true,
          glow: 12,
        });
        text('R for rematch · Q to eject', CFG.W / 2, CFG.H / 2 + 26, {
          size: 14,
          color: pal.periwinkle,
        });
      }
    },
    destroy() {
      state = null;
      mode = null;
    },
  };
}
