// AIR HOCKEY cartridge. Physics in ./logic.js; this file maps drag/keys to
// the player mallet, drives the CPU (speed ramps with games won, persisted),
// and paints the table.

import { CFG, newGame, step, setMallet, cpuTarget } from './logic.js';

const WINS_KEY = 'late-shift-arcade:air-hockey:wins';

function loadWins() {
  try {
    const n = Number(globalThis.localStorage?.getItem(WINS_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveWins(n) {
  try {
    globalThis.localStorage?.setItem(WINS_KEY, String(n));
  } catch {
    // fine — the CPU just forgets its grudge
  }
}

const PLAYER_SPEED = 1500; // fast enough to feel 1:1, slow enough not to tunnel

export function createAirHockey() {
  let shell = null;
  let state = null;
  let reported = false;
  let cpuSpeed = 240;
  let t = 0;
  let trail = [];

  return {
    id: 'air-hockey',
    title: 'AIR HOCKEY',
    blurb: 'Free mallet, real friction, first to 7.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      reported = false;
      t = 0;
      trail = [];
      cpuSpeed = Math.min(520, 240 + loadWins() * 55);
    },
    update(dt, input) {
      t += dt;

      // player mallet: keys steer directly; otherwise pursue the pointer
      // (hover or touch) at a capped speed — never teleport through the puck
      const m = state.mallets[0];
      let kx = 0;
      let ky = 0;
      if (input.down('left')) kx -= 1;
      if (input.down('right')) kx += 1;
      if (input.down('up')) ky -= 1;
      if (input.down('down')) ky += 1;
      if (kx !== 0 || ky !== 0) {
        setMallet(state, 0, m.x + kx * 420 * dt, m.y + ky * 420 * dt, dt);
      } else if (input.pointer.moved) {
        const px = input.pointer.x - m.x;
        const py = input.pointer.y - m.y;
        const dist = Math.hypot(px, py);
        if (dist > 0.5) {
          const k = Math.min(1, (PLAYER_SPEED * dt) / dist);
          setMallet(state, 0, m.x + px * k, m.y + py * k, dt);
        }
      }

      // CPU mallet: bounded pursuit of its target
      const c = state.mallets[1];
      const target = cpuTarget(state);
      const tx = target.x - c.x;
      const ty = target.y - c.y;
      const dist = Math.hypot(tx, ty);
      const reach = cpuSpeed * dt;
      if (dist > 1) {
        const k = Math.min(1, reach / dist);
        setMallet(state, 1, c.x + tx * k, c.y + ty * k, dt);
      }

      const events = step(state, dt);
      if (events.includes('hit')) shell.sfx.play('hit');
      if (events.includes('wall')) shell.sfx.play('wall');
      if (events.includes('goal')) {
        shell.sfx.play('score');
        shell.shake(6);
        trail = [];
      }

      if (Math.hypot(state.puck.vx, state.puck.vy) > 40) {
        trail.push({ x: state.puck.x, y: state.puck.y });
        if (trail.length > 12) trail.shift();
      }

      if (events.includes('win') && !reported) {
        reported = true;
        if (state.winner === 0) saveWins(loadWins() + 1);
        shell.endGame(state.scores[0] * 100 + (state.winner === 0 ? 500 : 0));
      }
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

      // table markings
      ctx.strokeStyle = pal.hairline;
      ctx.beginPath();
      ctx.moveTo(CFG.W / 2, 0);
      ctx.lineTo(CFG.W / 2, CFG.H);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(CFG.W / 2, CFG.H / 2, 60, 0, Math.PI * 2);
      ctx.stroke();

      // goal mouths
      const gTop = CFG.H / 2 - CFG.GOAL_H / 2;
      ctx.lineWidth = 4;
      ctx.strokeStyle = pal.rose;
      ctx.shadowColor = pal.rose;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(2, gTop);
      ctx.lineTo(2, gTop + CFG.GOAL_H);
      ctx.stroke();
      ctx.strokeStyle = pal.deep;
      ctx.shadowColor = pal.deep;
      ctx.beginPath();
      ctx.moveTo(CFG.W - 2, gTop);
      ctx.lineTo(CFG.W - 2, gTop + CFG.GOAL_H);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;

      text(String(state.scores[0]), CFG.W / 2 - 70, 60, { size: 40, color: pal.cream, bold: true, glow: 6 });
      text(String(state.scores[1]), CFG.W / 2 + 70, 60, { size: 40, color: pal.periwinkle, bold: true, glow: 6 });

      const mallet = (m, color) => {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, CFG.MALLET_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = pal.ink;
        ctx.beginPath();
        ctx.arc(m.x, m.y, CFG.MALLET_R * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, CFG.MALLET_R * 0.28, 0, Math.PI * 2);
        ctx.fill();
      };
      mallet(state.mallets[0], pal.cream);
      mallet(state.mallets[1], pal.periwinkle);

      // puck + trail
      trail.forEach((p, i) => {
        const f = (i + 1) / trail.length;
        ctx.fillStyle = `rgba(230,193,126,${(0.25 * f).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, CFG.PUCK_R * (0.3 + 0.7 * f), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowColor = pal.amber;
      ctx.shadowBlur = 14;
      ctx.fillStyle = pal.amber;
      ctx.beginPath();
      ctx.arc(state.puck.x, state.puck.y, CFG.PUCK_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (state.serveIn > 0 && state.winner === null && Math.floor(t * 3) % 2 === 0) {
        text('READY', CFG.W / 2, CFG.H / 2 - 80, { size: 20, color: pal.amber, glow: 8 });
      }
      text('drag your mallet — left half is yours', CFG.W / 2, CFG.H - 16, {
        size: 11,
        color: pal.rose,
      });
    },
    destroy() {
      state = null;
    },
  };
}
