// NEON SNAKE cartridge: swipe once to turn, then survive the accelerating grid.

import {
  CFG,
  currentTickSeconds,
  newGame,
  queueTurn,
  step,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const SWIPE_MIN = 22;

const gridPoint = (cell) => ({
  x: CFG.OFFSET_X + cell.x * CFG.CELL + CFG.CELL / 2,
  y: CFG.OFFSET_Y + cell.y * CFG.CELL + CFG.CELL / 2,
});

function swipeDirection(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function createNeonSnake() {
  let shell = null;
  let state = null;
  let reported = false;
  let t = 0;
  let swipeStart = null;
  let headTrail = [];
  let lastHead = '';

  const rememberHead = () => {
    const head = state.snake[0];
    const key = `${head.x},${head.y}`;
    if (key === lastHead) return;
    lastHead = key;
    headTrail.push({ ...gridPoint(head), life: 0.36 });
    while (headTrail.length > 10) headTrail.shift();
  };

  const readDirection = (input) => {
    for (const direction of ['up', 'down', 'left', 'right']) {
      if (input.pressed(direction)) return direction;
    }
    if (input.pointer.justDown) swipeStart = { x: input.pointer.x, y: input.pointer.y };
    if (input.pointer.justUp && swipeStart) {
      const direction = swipeDirection(input.pointer.x - swipeStart.x, input.pointer.y - swipeStart.y);
      swipeStart = null;
      return direction;
    }
    return null;
  };

  return {
    id: 'neon-snake',
    title: 'NEON SNAKE',
    blurb: 'Swipe turns. Chain meals. Don’t touch the grid.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      reported = false;
      t = 0;
      swipeStart = null;
      headTrail = [];
      lastHead = '';
      rememberHead();
    },
    restart() {
      state = newGame();
      reported = false;
      t = 0;
      swipeStart = null;
      headTrail = [];
      lastHead = '';
      rememberHead();
    },
    update(dt, input) {
      t += dt;
      const direction = readDirection(input);
      if (direction && queueTurn(state, direction)) shell.sfx.play('move');

      const events = step(state, dt);
      if (events.includes('move')) rememberHead();
      if (events.includes('eat')) shell.sfx.play('score');
      if (events.includes('bonus-spawn')) shell.sfx.play('launch');
      if (events.includes('bonus')) {
        shell.sfx.play('capsule');
        shell.shake(4);
      }
      if (events.includes('level-up')) shell.sfx.play('fanfare');
      if (events.includes('game-over')) {
        shell.sfx.play('death');
        shell.shake(10);
      }

      headTrail = headTrail.filter((point) => (point.life -= dt) > 0);
      if (state.over && !reported) {
        reported = true;
        shell.endGame(state.terminalScore);
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      const text = createTextPainter(ctx, pal);

      // dark playfield, faint grid, and a deliberately clear HUD band
      ctx.fillStyle = '#10132a';
      ctx.fillRect(CFG.OFFSET_X, CFG.OFFSET_Y, CFG.COLS * CFG.CELL, CFG.ROWS * CFG.CELL);
      ctx.strokeStyle = 'rgba(159,168,232,0.10)';
      for (let x = 0; x <= CFG.COLS; x += 1) {
        const px = CFG.OFFSET_X + x * CFG.CELL;
        ctx.beginPath();
        ctx.moveTo(px, CFG.OFFSET_Y);
        ctx.lineTo(px, CFG.OFFSET_Y + CFG.ROWS * CFG.CELL);
        ctx.stroke();
      }
      for (let y = 0; y <= CFG.ROWS; y += 1) {
        const py = CFG.OFFSET_Y + y * CFG.CELL;
        ctx.beginPath();
        ctx.moveTo(CFG.OFFSET_X, py);
        ctx.lineTo(CFG.OFFSET_X + CFG.COLS * CFG.CELL, py);
        ctx.stroke();
      }
      ctx.strokeStyle = pal.hairline;
      ctx.strokeRect(CFG.OFFSET_X, CFG.OFFSET_Y, CFG.COLS * CFG.CELL, CFG.ROWS * CFG.CELL);

      text(`SCORE ${state.score}`, 22, 34, { align: 'left', bold: true });
      text(`LEVEL ${state.level}`, CFG.W / 2, 34, { color: pal.amber, bold: true, glow: 6 });
      text(`HI ${shell.highScore ?? 0}`, CFG.W - 88, 34, { align: 'right', color: pal.periwinkle });
      if (state.combo > 1 && state.comboTimer > 0) {
        text(`×${state.combo} CHAIN`, CFG.W / 2, 56, { size: 12, color: pal.rose, bold: true, glow: 5 });
      }

      if (!state.started && Math.floor(t * 2) % 2 === 0) {
        text('SWIPE OR PRESS A DIRECTION', CFG.W / 2, CFG.OFFSET_Y + 34, {
          size: 16, color: pal.amber, bold: true, glow: 8,
        });
      }

      // head echo makes discrete movement read as a living neon trail.
      for (const point of headTrail) {
        ctx.globalAlpha = Math.max(0, Math.min(0.22, point.life * 0.55));
        ctx.fillStyle = pal.periwinkle;
        ctx.beginPath();
        ctx.arc(point.x, point.y, CFG.CELL * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (state.food) {
        const food = gridPoint(state.food);
        const pulse = 7 + Math.sin(t * 8) * 2;
        ctx.shadowColor = pal.rose;
        ctx.shadowBlur = 14;
        ctx.fillStyle = pal.rose;
        ctx.beginPath();
        ctx.arc(food.x, food.y, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (state.bonus) {
        const bonus = gridPoint(state.bonus);
        ctx.save();
        ctx.translate(bonus.x, bonus.y);
        ctx.rotate(Math.PI / 4 + t * 0.8);
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 14;
        ctx.fillStyle = pal.amber;
        ctx.fillRect(-8, -8, 16, 16);
        ctx.restore();
        text(`BONUS ${Math.ceil(state.bonus.ttl)}`, bonus.x, bonus.y + 4, { size: 8, color: pal.ink, bold: true });
      }

      state.snake.slice().reverse().forEach((part, reverseIndex) => {
        const index = state.snake.length - 1 - reverseIndex;
        const p = gridPoint(part);
        const isHead = index === 0;
        const color = isHead ? pal.cream : index % 2 === 0 ? pal.periwinkle : pal.deep;
        ctx.shadowColor = color;
        ctx.shadowBlur = isHead ? 14 : 7;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(p.x - 9, p.y - 9, 18, 18, isHead ? 6 : 4);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (isHead) {
          ctx.fillStyle = pal.ink;
          ctx.fillRect(p.x - 4, p.y - 3, 2, 3);
          ctx.fillRect(p.x + 2, p.y - 3, 2, 3);
        }
      });

      text(`SWIPE or ARROWS · ${Math.round(1 / currentTickSeconds(state))} cells/s`, CFG.W / 2, CFG.H - 18, {
        size: 11,
        color: pal.rose,
      });
    },
    destroy() {
      state = null;
      shell = null;
      headTrail = [];
      swipeStart = null;
    },
  };
}
