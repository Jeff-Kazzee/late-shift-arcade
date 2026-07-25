// GRAVEYARD SHIFT cartridge — lantern light over ./logic.js. Every rule lives
// in the sim; this file turns sticks, keys, and the mouse into commands and
// projects the lot onto the glass.
//
// Performance is part of the design here too: the particle system is a fixed
// pool allocated at init, the render loop builds no arrays and no closures,
// and the sim's fx ring is consumed by sequence number so effects cost the
// same whether five things died this frame or fifty.

import {
  CFG,
  TYPES,
  applyCommand,
  multiplier,
  newGame,
  step,
  terminalScore,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const END_HOLD = 1.9;
const PARTICLES = 192;
// Fixed virtual stick bases: left half moves, right half aims and fires.
const STICK_L = { x: 110, y: 384, r: 54 };
const STICK_R = { x: 530, y: 384, r: 54 };

// Seeds are chosen here, outside the simulation, and shown on the HUD so a
// night can be named and replayed. logic.js never reaches for a clock.
const pickSeed = () => 1 + (Date.now() % 899999);

// 90 shift seconds map onto a 12:00AM → 6:00AM dial.
function shiftClock(t) {
  const frac = Math.min(1, t / CFG.SHIFT_SECONDS);
  const minutes = Math.floor(frac * 360); // six night hours
  const hour = ((Math.floor(minutes / 60) + 11) % 12) + 1;
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hour}:${mm}AM`;
}

export function createGraveyardShift() {
  let shell = null;
  let state = null;
  let acc = 0;
  let reported = false;
  let armed = 0;
  let endHold = 0;
  let fxRead = 0; // last consumed sim fx seq
  let touching = false; // whether the last input frame came from touch
  let particles = null; // fixed pool, allocated in init

  const spawnBurst = (x, y, color, count) => {
    for (let i = 0; i < particles.length && count > 0; i += 1) {
      const p = particles[i];
      if (p.life > 0) continue;
      const a = (count * 2.399) + x * 0.01; // cheap deterministic-ish spread
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a + count) * (60 + 40 * ((count * 7) % 3));
      p.vy = Math.sin(a * 1.7 + count) * (60 + 40 * ((count * 5) % 3));
      p.life = 0.5;
      p.color = color;
      count -= 1;
    }
  };

  const drainFx = () => {
    // Consume the sim's fx ring strictly by sequence number.
    const behind = state.fxSeq - fxRead;
    const start = behind > CFG.FX_RING ? state.fxSeq - CFG.FX_RING : fxRead;
    for (let s = start; s < state.fxSeq; s += 1) {
      const slot = state.fx[s % CFG.FX_RING];
      if (slot.kind === 'kill') {
        spawnBurst(slot.x, slot.y, shell.palette.amber, 7);
        shell.sfx.play('score');
      } else if (slot.kind === 'hit') {
        spawnBurst(slot.x, slot.y, shell.palette.rose, 14);
        shell.sfx.play('zap');
        shell.shake(8);
      }
    }
    fxRead = state.fxSeq;
  };

  const readInput = (input) => {
    if (state.status === 'briefing') {
      if (armed < 0.3) return;
      if (input.pressed('action') || input.pointer.justDown) {
        applyCommand(state, { k: 'begin' });
        shell.sfx.play('start');
      }
      return;
    }
    if (state.status !== 'running') return;

    const touches = input.touches();
    touching = touches.length > 0;
    if (touching) {
      // Fixed-base virtual sticks: any touch on the left half drives, any on
      // the right half aims and holds the trigger.
      let mvx = 0;
      let mvy = 0;
      let amx = 0;
      let amy = 0;
      let aiming = false;
      for (const t of touches) {
        if (t.x < CFG.W / 2) {
          mvx = (t.x - STICK_L.x) / STICK_L.r;
          mvy = (t.y - STICK_L.y) / STICK_L.r;
        } else {
          amx = t.x - STICK_R.x;
          amy = t.y - STICK_R.y;
          aiming = true;
        }
      }
      applyCommand(state, { k: 'move', x: mvx, y: mvy });
      if (aiming) applyCommand(state, { k: 'aim', x: amx, y: amy });
      applyCommand(state, { k: 'fire', on: aiming });
      return;
    }

    // Desktop: WASD or arrows move, the mouse aims, click or space fires.
    let mx = 0;
    let my = 0;
    if (input.down('a', 'arrowleft')) mx -= 1;
    if (input.down('d', 'arrowright')) mx += 1;
    if (input.down('w', 'arrowup')) my -= 1;
    if (input.down('s', 'arrowdown')) my += 1;
    applyCommand(state, { k: 'move', x: mx, y: my });
    if (input.pointer.moved) {
      applyCommand(state, { k: 'aim', x: input.pointer.x - state.px, y: input.pointer.y - state.py });
    }
    applyCommand(state, { k: 'fire', on: input.pointer.down || input.down('space') });
  };

  return {
    id: 'graveyard-shift',
    title: 'GRAVEYARD SHIFT',
    blurb: 'Ninety seconds to dawn. The ground disagrees.',

    init(ctx) {
      shell = ctx;
      state = newGame(pickSeed());
      acc = 0;
      reported = false;
      armed = 0;
      endHold = 0;
      fxRead = 0;
      touching = false;
      particles = [];
      for (let i = 0; i < PARTICLES; i += 1) {
        particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, color: '' });
      }
    },

    update(dt, input) {
      armed += dt;
      readInput(input);

      acc += dt;
      let guard = 0;
      while (acc >= CFG.TICK && guard < 6) {
        const events = step(state, CFG.TICK);
        if (events.includes('won')) {
          shell.sfx.play('score');
          endHold = END_HOLD;
        } else if (events.includes('lost')) {
          shell.sfx.play('lose');
          endHold = END_HOLD;
        } else if (events.includes('wave')) {
          shell.sfx.play('start');
        }
        acc -= CFG.TICK;
        guard += 1;
      }
      if (guard === 6) acc = 0;
      drainFx();

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }

      if ((state.status === 'won' || state.status === 'lost') && !reported) {
        endHold -= dt;
        if (endHold <= 0) {
          reported = true;
          shell.endGame(terminalScore(state));
        }
      }
    },

    draw(ctx) {
      const pal = shell.palette;
      const text = createTextPainter(ctx, pal);
      const { x0, y0, x1, y1 } = CFG.ARENA;

      // Night over the lot, paling as dawn approaches.
      const dawn = Math.min(1, state.t / CFG.SHIFT_SECONDS);
      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, pal.ink);
      sky.addColorStop(1, dawn > 0.75 ? '#1c1a2e' : '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      // The fence.
      ctx.strokeStyle = pal.hairline;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      // Headstones (fixed decor derived from the seed, drawn cheap).
      ctx.fillStyle = 'rgba(159,168,232,0.07)';
      for (let i = 0; i < 7; i += 1) {
        const gx = x0 + 60 + ((state.seed + i * 977) % (x1 - x0 - 120));
        const gy = y0 + 50 + ((state.seed + i * 613) % (y1 - y0 - 100));
        ctx.fillRect(gx, gy, 14, 20);
      }

      drawEntities(ctx, pal);
      drawParticles(ctx);
      drawPlayer(ctx, pal);
      drawHud(ctx, text, pal);
      if (touching && state.status === 'running') drawSticks(ctx, pal);

      if (state.status === 'briefing') drawBriefing(ctx, text, pal);
      if (state.status === 'won' || state.status === 'lost') drawOutcome(ctx, text, pal);
    },

    destroy() {
      state = null;
      shell = null;
      particles = null;
    },
  };

  // --- painters -------------------------------------------------------------

  function drawEntities(ctx, pal) {
    // Bullets.
    ctx.fillStyle = pal.cream;
    for (let i = 0; i < state.bullets.length; i += 1) {
      const b = state.bullets[i];
      if (!b.on) continue;
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    // Night-things, one pass per pool, no sorting.
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      if (!e.on) continue;
      const spec = TYPES[e.type];
      if (e.type === 0) {
        ctx.fillStyle = '#3c3f6e';
        ctx.beginPath();
        ctx.arc(e.x, e.y, spec.r, Math.PI, 0);
        ctx.lineTo(e.x + spec.r, e.y + spec.r * 0.8);
        ctx.lineTo(e.x - spec.r, e.y + spec.r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.periwinkle;
        ctx.fillRect(e.x - 4, e.y - 3, 2, 2);
        ctx.fillRect(e.x + 2, e.y - 3, 2, 2);
      } else if (e.type === 1) {
        ctx.fillStyle = 'rgba(159,168,232,0.85)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, spec.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(159,168,232,0.25)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, spec.r + 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#4a3550';
        ctx.beginPath();
        ctx.roundRect(e.x - spec.r, e.y - spec.r, spec.r * 2, spec.r * 2, 6);
        ctx.fill();
        ctx.strokeStyle = pal.rose;
        ctx.strokeRect(e.x - spec.r + 4, e.y - spec.r + 4, spec.r * 2 - 8, spec.r * 2 - 8);
        // A brute wears its remaining hits.
        ctx.fillStyle = pal.rose;
        for (let h = 0; h < e.hp; h += 1) {
          ctx.fillRect(e.x - spec.r + 3 + h * 6, e.y + spec.r - 6, 4, 3);
        }
      }
    }
  }

  function drawParticles(ctx) {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(ctx, pal) {
    if (state.status === 'lost') return;
    const blink = state.invuln > 0 && Math.floor(state.t * 12) % 2 === 0;
    if (blink) return;
    // Lantern pool.
    const glow = ctx.createRadialGradient(state.px, state.py, 4, state.px, state.py, 70);
    glow.addColorStop(0, 'rgba(230,193,126,0.16)');
    glow.addColorStop(1, 'rgba(230,193,126,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(state.px - 70, state.py - 70, 140, 140);
    // The watchman.
    ctx.fillStyle = pal.cream;
    ctx.beginPath();
    ctx.arc(state.px, state.py, CFG.PLAYER_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.arc(state.px, state.py, CFG.PLAYER_R - 4, 0, Math.PI * 2);
    ctx.fill();
    // Gun barrel shows the aim.
    ctx.strokeStyle = pal.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(state.px + state.input.ax * 6, state.py + state.input.ay * 6);
    ctx.lineTo(state.px + state.input.ax * 18, state.py + state.input.ay * 18);
    ctx.stroke();
  }

  function drawSticks(ctx, pal) {
    ctx.strokeStyle = 'rgba(159,168,232,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(STICK_L.x, STICK_L.y, STICK_L.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,193,126,0.35)';
    ctx.beginPath();
    ctx.arc(STICK_R.x, STICK_R.y, STICK_R.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawHud(ctx, text, pal) {
    const pips = '●'.repeat(Math.max(0, state.lives)) + '○'.repeat(CFG.LIVES - Math.max(0, state.lives));
    text(`WATCHMAN ${pips}`, 14, 26, {
      align: 'left',
      bold: true,
      size: 13,
      color: state.lives <= 1 ? pal.rose : pal.cream,
    });
    text(`NIGHT ${state.seed}`, 14, 44, { align: 'left', size: 10, color: pal.periwinkle });

    const late = state.t / CFG.SHIFT_SECONDS > 0.8;
    text(shiftClock(state.t), CFG.W / 2, 32, {
      size: 26,
      bold: true,
      color: late ? pal.amber : pal.periwinkle,
      glow: late ? 12 : 7,
    });
    text('DAWN AT 6:00', CFG.W / 2, 50, { size: 9, color: pal.periwinkle });

    // The shell parks its eject button over canvas x 602–634, y 6–38, so the
    // top-right HUD stops short of it rather than hiding under it.
    text(`SCORE ${terminalScore(state)}`, 590, 26, { align: 'right', bold: true, size: 13 });
    const m = multiplier(state);
    text(`×${m} CHAIN`, 590, 44, {
      align: 'right',
      size: 11,
      bold: m > 1,
      color: m > 1 ? pal.amber : pal.periwinkle,
    });

    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(14, 56);
    ctx.lineTo(CFG.W - 14, 56);
    ctx.stroke();
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('GRAVEYARD SHIFT', CFG.W / 2, 82, { size: 34, bold: true, color: pal.amber, glow: 14 });
    text(`NIGHT ${state.seed} · THE LOT IS YOURS UNTIL 6AM`, CFG.W / 2, 110, {
      size: 12,
      color: pal.periwinkle,
    });

    const lines = [
      ['MOVE', 'left stick · WASD or arrows'],
      ['SHOOT', 'right stick · mouse aims, click or SPACE holds the trigger'],
      ['CHAIN', 'kills inside 2s build a ×8 multiplier — one scratch resets it'],
      ['SURVIVE', 'three lives; the lantern flares when you are hit and clears the yard'],
    ];
    lines.forEach(([head, body], i) => {
      const y = 180 + i * 46;
      text(head, 110, y, { size: 12, bold: true, color: pal.amber, align: 'left' });
      text(body, 110, y + 17, { size: 10, color: pal.cream, align: 'left' });
    });

    text('SHAMBLERS WALK · WISPS WEAVE · BRUTES SOAK FIVE ROUNDS', CFG.W / 2, 398, {
      size: 10,
      color: pal.rose,
    });
    text('TAP OR PRESS SPACE TO CLOCK IN', CFG.W / 2, 440, {
      size: 14,
      bold: true,
      color: pal.cream,
      glow: 8,
    });
  }

  function drawOutcome(ctx, text, pal) {
    const won = state.status === 'won';
    ctx.fillStyle = won ? 'rgba(230,193,126,0.12)' : 'rgba(212,129,143,0.14)';
    ctx.fillRect(0, 62, CFG.W, 70);
    text(won ? 'DAWN CAME' : 'THE LOT KEEPS YOU', CFG.W / 2, 92, {
      size: won ? 26 : 22,
      bold: true,
      color: won ? pal.amber : pal.rose,
      glow: 12,
    });
    text(
      `${state.kills} PUT DOWN · BEST CHAIN ×${state.bestMultiplier} · ${shiftClock(state.t)}`,
      CFG.W / 2,
      118,
      { size: 12, color: pal.cream },
    );
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createGraveyardShift;
