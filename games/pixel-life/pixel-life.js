// PIXEL LIFE cartridge — text-first: stat bars, the year log, one big
// AGE UP button, and an obituary card at the end. Engine in ./logic.js.

import { newLife, ageUp, obituary, lifeScore, STATS } from './logic.js';

const W = 640;
const H = 480;
const BUTTON = { x: W / 2 - 110, y: H - 64, w: 220, h: 44 };

const STAT_LABEL = { health: 'HEALTH', smarts: 'SMARTS', money: 'MONEY', happiness: 'HAPPY' };

function wrap(text, max) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max) {
      lines.push(line.trim());
      line = word;
    } else {
      line += ' ' + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export function createPixelLife() {
  let shell = null;
  let state = null;
  let reported = false;
  let t = 0;

  const inButton = (p) =>
    p.x >= BUTTON.x && p.x <= BUTTON.x + BUTTON.w && p.y >= BUTTON.y && p.y <= BUTTON.y + BUTTON.h;

  return {
    id: 'pixel-life',
    title: 'PIXEL LIFE',
    blurb: 'One AGE UP button. Death writes your obituary.',
    init(ctx) {
      shell = ctx;
      state = newLife();
      reported = false;
      t = 0;
    },
    update(dt, input) {
      t += dt;
      const pressed =
        input.pressed('action') || (input.pointer.justDown && (state.alive ? inButton(input.pointer) : true));
      if (!pressed) return;
      if (state.alive) {
        ageUp(state);
      } else if (!reported) {
        reported = true;
        shell.endGame(lifeScore(state));
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, W, H);

      const text = (str, x, y, { size = 13, color = pal.cream, bold = false, glow = 0, align = 'left' } = {}) => {
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

      if (!state.alive) {
        // obituary card
        const o = obituary(state);
        ctx.strokeStyle = pal.hairline;
        ctx.beginPath();
        ctx.roundRect(90, 70, W - 180, 320, 10);
        ctx.stroke();
        text('IN LOVING MEMORY', W / 2, 110, { align: 'center', size: 20, color: pal.amber, bold: true, glow: 10 });
        text(`Dead at ${o.age} — ${o.cause}`, W / 2, 145, { align: 'center', size: 14, color: pal.rose });
        text(
          `Peak: HP ${o.peak.health} · IQ ${o.peak.smarts} · $ ${o.peak.money} · :) ${o.peak.happiness}`,
          W / 2,
          180,
          { align: 'center', size: 13, color: pal.periwinkle },
        );
        text('Weirdest thing that ever happened:', W / 2, 220, { align: 'center', size: 12, color: pal.deep });
        wrap(o.weirdest, 48).forEach((line, i) => {
          text(line, W / 2, 244 + i * 18, { align: 'center', size: 13, color: pal.cream });
        });
        text(`FINAL SCORE ${o.score}`, W / 2, 340, { align: 'center', size: 18, color: pal.amber, bold: true, glow: 8 });
        if (Math.floor(t * 2) % 2 === 0) {
          text('tap or SPACE to enter the record books', W / 2, 420, { align: 'center', size: 13, color: pal.rose });
        }
        return;
      }

      // header: age + stat bars
      text(`AGE ${state.age}`, 24, 40, { size: 26, color: pal.amber, bold: true, glow: 8 });
      const barColors = { health: pal.rose, smarts: pal.periwinkle, money: pal.amber, happiness: pal.cream };
      // second column stops short of the DOM eject button
      STATS.forEach((stat, i) => {
        const bx = 190 + (i % 2) * 200;
        const by = 22 + Math.floor(i / 2) * 22;
        text(STAT_LABEL[stat], bx, by + 10, { size: 10, color: pal.deep });
        ctx.strokeStyle = pal.hairline;
        ctx.strokeRect(bx + 58, by, 108, 12);
        ctx.fillStyle = barColors[stat];
        ctx.fillRect(bx + 58, by, (108 * state.stats[stat]) / 100, 12);
      });
      ctx.strokeStyle = pal.hairline;
      ctx.beginPath();
      ctx.moveTo(0, 64);
      ctx.lineTo(W, 64);
      ctx.stroke();

      // the year log, newest brightest
      const entries = state.log.slice(-6);
      let y = H - 100;
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        const lines = wrap(entry.text, 62);
        y -= lines.length * 16 + 10;
        const fade = 1 - (entries.length - 1 - i) * 0.16;
        const color = i === entries.length - 1 ? pal.cream : `rgba(159,168,232,${Math.max(0.25, fade).toFixed(2)})`;
        text(`— ${entry.age} —`, 24, y, { size: 10, color: pal.deep });
        lines.forEach((line, j) => {
          text(line, 60, y + j * 16, { size: 13, color });
        });
      }
      if (state.log.length === 0) {
        text('A whole life ahead of you. Regrettably, it starts now.', 60, 200, { size: 13, color: pal.periwinkle });
      }

      // AGE UP button
      ctx.beginPath();
      ctx.roundRect(BUTTON.x, BUTTON.y, BUTTON.w, BUTTON.h, 10);
      ctx.fillStyle = 'rgba(230,193,126,0.1)';
      ctx.fill();
      ctx.strokeStyle = pal.amber;
      ctx.shadowColor = pal.amber;
      ctx.shadowBlur = Math.floor(t * 2) % 2 === 0 ? 10 : 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      text('AGE UP', W / 2, BUTTON.y + 28, { align: 'center', size: 18, color: pal.amber, bold: true });
    },
    destroy() {
      state = null;
    },
  };
}
