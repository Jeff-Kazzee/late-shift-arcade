// STRATOFIRE cartridge — the cockpit glass over ./logic.js. Every rule lives
// in the sim; this file turns keys, the mouse, and four big touch buttons
// into commands and projects the sortie onto the screen.
//
// Performance is part of the design here too: the particle system is a fixed
// pool allocated at init, the render loop builds no arrays and no closures,
// and the sim's fx ring is consumed by sequence number.

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

// Touch controls: four buttons, all comfortably past the 44px bar.
const BTN_L = { x: 16, y: 398, w: 92, h: 66, label: '◀' };
const BTN_R = { x: 118, y: 398, w: 92, h: 66, label: '▶' };
const BTN_FIRE = { x: 430, y: 398, w: 92, h: 66, label: 'FIRE' };
const BTN_THRUST = { x: 532, y: 398, w: 92, h: 66, label: 'BOOST' };
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Seeds are chosen here, outside the simulation, and shown on the HUD so a
// sortie can be named and replayed. logic.js never reaches for a clock.
const pickSeed = () => 1 + (Date.now() % 899999);

export function createStratofire() {
  let shell = null;
  let state = null;
  let acc = 0;
  let reported = false;
  let armed = 0;
  let endHold = 0;
  let fxRead = 0;
  let touching = false;
  let particles = null;

  const spawnBurst = (x, y, color, count) => {
    for (let i = 0; i < particles.length && count > 0; i += 1) {
      const p = particles[i];
      if (p.life > 0) continue;
      const a = count * 2.399 + y * 0.013;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a + count) * (70 + 45 * ((count * 7) % 3));
      p.vy = Math.sin(a * 1.7 + count) * (70 + 45 * ((count * 5) % 3));
      p.life = 0.5;
      p.color = color;
      count -= 1;
    }
  };

  const drainFx = () => {
    const behind = state.fxSeq - fxRead;
    const start = behind > CFG.FX_RING ? state.fxSeq - CFG.FX_RING : fxRead;
    for (let s = start; s < state.fxSeq; s += 1) {
      const slot = state.fx[s % CFG.FX_RING];
      if (slot.kind === 'kill') {
        spawnBurst(slot.x, slot.y, shell.palette.amber, 8);
        shell.sfx.play('score');
      } else if (slot.kind === 'hit') {
        spawnBurst(slot.x, slot.y, shell.palette.rose, 12);
        shell.sfx.play('zap');
        shell.shake(6);
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

    // Buttons work for fingers and for the mouse alike.
    const points = input.touches();
    touching = points.length > 0;
    let btnL = false;
    let btnR = false;
    let btnF = false;
    let btnT = false;
    for (const t of points) {
      if (inside(t, BTN_L)) btnL = true;
      else if (inside(t, BTN_R)) btnR = true;
      else if (inside(t, BTN_FIRE)) btnF = true;
      else if (inside(t, BTN_THRUST)) btnT = true;
    }
    if (!touching && input.pointer.down) {
      const p = input.pointer;
      if (inside(p, BTN_L)) btnL = true;
      else if (inside(p, BTN_R)) btnR = true;
      else if (inside(p, BTN_FIRE)) btnF = true;
      else if (inside(p, BTN_THRUST)) btnT = true;
    }

    const left = btnL || input.down('a', 'arrowleft');
    const right = btnR || input.down('d', 'arrowright');
    applyCommand(state, { k: 'turn', dir: left === right ? 0 : left ? -1 : 1 });
    applyCommand(state, { k: 'thrust', on: btnT || input.down('w', 'arrowup') });
    applyCommand(state, { k: 'fire', on: btnF || input.down('space') });
  };

  return {
    id: 'stratofire',
    title: 'STRATOFIRE',
    blurb: 'Forty kills before the sea takes you.',

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
          shell.shake(10);
          endHold = END_HOLD;
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

      // Sky, then the sea that is always waiting.
      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, pal.ink);
      sky.addColorStop(0.7, '#101331');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      const sea = ctx.createLinearGradient(0, CFG.SEA_Y, 0, CFG.H);
      sea.addColorStop(0, 'rgba(124,136,232,0.28)');
      sea.addColorStop(1, 'rgba(124,136,232,0.06)');
      ctx.fillStyle = sea;
      ctx.fillRect(0, CFG.SEA_Y, CFG.W, CFG.H - CFG.SEA_Y);
      ctx.strokeStyle = pal.deep;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= CFG.W; x += 16) {
        const y = CFG.SEA_Y + Math.sin(x * 0.11 + state.t * 3) * 2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      drawEntities(ctx, pal);
      drawParticles(ctx);
      if (state.status !== 'lost') drawPlane(ctx, pal);
      drawHud(ctx, text, pal);
      if (state.status === 'running') drawButtons(ctx, text, pal);

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
    ctx.fillStyle = pal.cream;
    for (let i = 0; i < state.pbullets.length; i += 1) {
      const b = state.pbullets[i];
      if (!b.on) continue;
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    ctx.fillStyle = pal.rose;
    for (let i = 0; i < state.ebullets.length; i += 1) {
      const b = state.ebullets[i];
      if (!b.on) continue;
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      if (!e.on) continue;
      const spec = TYPES[e.type];
      if (e.type === 2) {
        // Gunboat: hull on the waterline, turret up.
        ctx.fillStyle = '#3a3f6c';
        ctx.beginPath();
        ctx.roundRect(e.x - spec.r, e.y - 6, spec.r * 2, 12, 4);
        ctx.fill();
        ctx.fillStyle = pal.periwinkle;
        ctx.fillRect(e.x - 3, e.y - 12, 6, 7);
      } else {
        // Aircraft: a swept dart pointed along its heading.
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.a);
        ctx.fillStyle = e.type === 1 ? pal.rose : pal.periwinkle;
        ctx.beginPath();
        ctx.moveTo(spec.r + 3, 0);
        ctx.lineTo(-spec.r + 2, -spec.r * 0.7);
        ctx.lineTo(-spec.r * 0.4, 0);
        ctx.lineTo(-spec.r + 2, spec.r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
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

  function drawPlane(ctx, pal) {
    ctx.save();
    ctx.translate(state.px, state.py);
    ctx.rotate(state.pa);
    if (state.input.thrust) {
      ctx.fillStyle = pal.amber;
      ctx.beginPath();
      ctx.moveTo(-CFG.PLAYER_R - 2, 0);
      ctx.lineTo(-CFG.PLAYER_R - 10 - Math.sin(state.t * 40) * 3, -3);
      ctx.lineTo(-CFG.PLAYER_R - 10 - Math.sin(state.t * 40) * 3, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = pal.cream;
    ctx.beginPath();
    ctx.moveTo(CFG.PLAYER_R + 4, 0);
    ctx.lineTo(-CFG.PLAYER_R, -CFG.PLAYER_R * 0.8);
    ctx.lineTo(-CFG.PLAYER_R * 0.5, 0);
    ctx.lineTo(-CFG.PLAYER_R, CFG.PLAYER_R * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawButtons(ctx, text, pal) {
    const alpha = touching ? 0.22 : 0.1;
    for (const [btn, color] of [
      [BTN_L, pal.periwinkle],
      [BTN_R, pal.periwinkle],
      [BTN_FIRE, pal.rose],
      [BTN_THRUST, pal.amber],
    ]) {
      ctx.fillStyle = `rgba(233,236,244,${alpha * 0.4})`;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 10);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 5, {
        size: btn.label.length > 1 ? 12 : 18,
        bold: true,
        color,
      });
    }
  }

  function drawHud(ctx, text, pal) {
    // Hull bar heals only while the gun is quiet — show it as a bar.
    const hullFrac = state.hull / CFG.HULL;
    ctx.fillStyle = 'rgba(233,236,244,0.10)';
    ctx.fillRect(14, 16, 150, 12);
    ctx.fillStyle = hullFrac < 0.3 ? pal.rose : pal.amber;
    ctx.fillRect(14, 16, 150 * hullFrac, 12);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(14, 16, 150, 12);
    text(state.input.firing ? 'HULL — GUNS HOT' : 'HULL — MENDING', 14, 44, {
      align: 'left',
      size: 9,
      color: state.input.firing ? pal.rose : pal.periwinkle,
    });

    text(`${state.kills}/${CFG.SORTIE_KILLS}`, CFG.W / 2, 32, {
      size: 26,
      bold: true,
      color: state.kills >= CFG.SORTIE_KILLS - 5 ? pal.amber : pal.cream,
      glow: 8,
    });
    text(`SORTIE ${state.seed}`, CFG.W / 2, 50, { size: 9, color: pal.periwinkle });

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
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('STRATOFIRE', CFG.W / 2, 82, { size: 34, bold: true, color: pal.rose, glow: 14 });
    text(`SORTIE ${state.seed} · FORTY DOWN, THEN HOME`, CFG.W / 2, 110, {
      size: 12,
      color: pal.amber,
    });

    const lines = [
      ['FLY', '◀ ▶ turn · BOOST thrusts along the nose — gravity does the rest'],
      ['SHOOT', 'FIRE streams rounds · the hull only mends while the gun is quiet'],
      ['CHAIN', 'every kill inside 3.5s raises the multiplier toward ×10'],
      ['THE SEA', 'touch the water once and the sortie is over — altitude is life'],
    ];
    lines.forEach(([head, body], i) => {
      const y = 180 + i * 46;
      text(head, 96, y, { size: 12, bold: true, color: pal.amber, align: 'left' });
      text(body, 96, y + 17, { size: 10, color: pal.cream, align: 'left' });
    });

    text('FIGHTERS HUNT · ACES HUNT FASTER · GUNBOATS HOLD THE WATER', CFG.W / 2, 398, {
      size: 10,
      color: pal.rose,
    });
    text('TAP OR PRESS SPACE TO SCRAMBLE', CFG.W / 2, 440, {
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
    text(
      won ? 'SORTIE COMPLETE' : state.failure === 'splashed' ? 'THE SEA TAKES YOU' : 'SHOT DOWN',
      CFG.W / 2,
      92,
      { size: won ? 26 : 22, bold: true, color: won ? pal.amber : pal.rose, glow: 12 },
    );
    text(
      `${state.kills} DOWN · BEST CHAIN ×${state.bestMultiplier} · HULL ${Math.round(state.hull)}`,
      CFG.W / 2,
      118,
      { size: 12, color: pal.cream },
    );
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createStratofire;
