// NEON TIDE cartridge — the glass over ./logic.js. Every rule lives in the
// sim; this file turns a stick, keys, and one big EXTRACT button into
// commands and projects the tide onto the screen.
//
// Performance is part of the design here too: the particle system is a fixed
// pool allocated at init, the render loop builds no arrays and no closures,
// and the sim's fx ring is consumed by sequence number.

import {
  CFG,
  TYPES,
  applyCommand,
  loopScale,
  newGame,
  step,
  terminalScore,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const END_HOLD = 1.9;
const PARTICLES = 192;
const STICK = { x: 110, y: 384, r: 54 }; // fixed-base virtual stick, left half
const EXTRACT_BTN = { x: 400, y: 396, w: 220, h: 62 };
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const WEAPON_NAMES = ['PULSE', 'TWIN', 'WAVE'];

// Seeds are chosen here, outside the simulation, and shown on the HUD so a
// tide can be named and replayed. logic.js never reaches for a clock.
const pickSeed = () => 1 + (Date.now() % 899999);

export function createNeonTide() {
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
        spawnBurst(slot.x, slot.y, shell.palette.periwinkle, 7);
        shell.sfx.play('score');
      } else if (slot.kind === 'hit') {
        spawnBurst(slot.x, slot.y, shell.palette.rose, 16);
        shell.sfx.play('lose');
        shell.shake(9);
      } else if (slot.kind === 'bossdown') {
        spawnBurst(slot.x, slot.y, shell.palette.amber, 24);
        shell.sfx.play('score');
        shell.shake(6);
      } else if (slot.kind === 'pickup') {
        spawnBurst(slot.x, slot.y, shell.palette.amber, 6);
        shell.sfx.play('click');
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
      let mvx = 0;
      let mvy = 0;
      let firing = false;
      let wantExtract = false;
      for (const t of touches) {
        if (state.phase === 'window' && inside(t, EXTRACT_BTN)) {
          wantExtract = true;
        } else if (t.x < CFG.W / 2) {
          mvx = (t.x - STICK.x) / STICK.r;
          mvy = (t.y - STICK.y) / STICK.r;
        } else {
          firing = true;
        }
      }
      applyCommand(state, { k: 'move', x: mvx, y: mvy });
      applyCommand(state, { k: 'fire', on: firing });
      if (wantExtract) {
        if (applyCommand(state, { k: 'extract' })) {
          shell.sfx.play('score');
          endHold = END_HOLD;
        }
      }
      return;
    }

    // Desktop: arrows or WASD move, space or click fires, X extracts.
    let mx = 0;
    let my = 0;
    if (input.down('left')) mx -= 1;
    if (input.down('right')) mx += 1;
    if (input.down('up')) my -= 1;
    if (input.down('down')) my += 1;
    applyCommand(state, { k: 'move', x: mx, y: my });
    const clickExtract =
      state.phase === 'window' && input.pointer.justDown && inside(input.pointer, EXTRACT_BTN);
    applyCommand(state, { k: 'fire', on: input.down('space') || (input.pointer.down && !clickExtract) });
    if (input.pressed('x') || clickExtract) {
      if (applyCommand(state, { k: 'extract' })) {
        shell.sfx.play('score');
        endHold = END_HOLD;
      }
    }
  };

  return {
    id: 'neon-tide',
    title: 'NEON TIDE',
    blurb: 'Ride the tide, drop both bosses, extract or go deeper.',

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
        if (events.includes('lost')) {
          shell.sfx.play('lose');
          endHold = END_HOLD;
        } else if (events.includes('boss')) {
          shell.sfx.play('start');
          shell.shake(4);
        } else if (events.includes('window')) {
          shell.sfx.play('score');
        } else if (events.includes('loop')) {
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
      const { x0, y0, x1, y1 } = CFG.FIELD;

      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, pal.ink);
      sky.addColorStop(0.6, '#0e1130');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      // The tide: two parallax bands of drifting neon dashes.
      ctx.strokeStyle = 'rgba(159,168,232,0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i += 1) {
        const speed = i % 2 === 0 ? 90 : 45;
        const lx = x1 - (((state.t * speed + i * 137) % (x1 - x0)) | 0);
        const ly = y0 + 20 + ((i * 811) % (y1 - y0 - 40));
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + (i % 2 === 0 ? 26 : 14), ly);
        ctx.stroke();
      }

      drawEntities(ctx, pal);
      drawParticles(ctx);
      if (state.status !== 'lost') drawShip(ctx, pal);
      drawHud(ctx, text, pal);
      if (touching && state.status === 'running') {
        ctx.strokeStyle = 'rgba(159,168,232,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(STICK.x, STICK.y, STICK.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (state.status === 'running' && state.phase === 'window') drawWindow(ctx, text, pal);

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
      ctx.fillRect(b.x - 3, b.y - 1, 6, 2);
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
      if (e.type === 0) {
        ctx.fillStyle = pal.periwinkle;
        ctx.beginPath();
        ctx.moveTo(e.x - spec.r, e.y);
        ctx.lineTo(e.x + spec.r, e.y - spec.r * 0.8);
        ctx.lineTo(e.x + spec.r, e.y + spec.r * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (e.type === 1) {
        ctx.fillStyle = pal.rose;
        ctx.beginPath();
        ctx.moveTo(e.x - spec.r - 3, e.y);
        ctx.lineTo(e.x + spec.r, e.y - spec.r * 0.5);
        ctx.lineTo(e.x + spec.r, e.y + spec.r * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (e.type === 2) {
        ctx.fillStyle = '#3a3f6c';
        ctx.beginPath();
        ctx.arc(e.x, e.y, spec.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pal.rose;
        ctx.beginPath();
        ctx.arc(e.x, e.y, spec.r - 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#4a3550';
        ctx.beginPath();
        ctx.roundRect(e.x - spec.r, e.y - spec.r * 0.7, spec.r * 2, spec.r * 1.4, 5);
        ctx.fill();
        ctx.strokeStyle = pal.amber;
        ctx.strokeRect(e.x - 5, e.y - 5, 10, 10);
      }
    }
    // The boss.
    if (state.boss.on) {
      const b = state.boss;
      ctx.fillStyle = b.kind === 1 ? '#3a3f6c' : '#4a3550';
      ctx.beginPath();
      ctx.roundRect(b.x - 26, b.y - 34, 52, 68, 8);
      ctx.fill();
      ctx.strokeStyle = b.kind === 1 ? pal.periwinkle : pal.rose;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = pal.rose;
      ctx.fillRect(b.x - 30, b.y - 44, 60 * (b.hp / b.hpMax), 4);
      ctx.strokeStyle = pal.hairline;
      ctx.strokeRect(b.x - 30, b.y - 44, 60, 4);
    }
    // Pickups.
    for (let i = 0; i < state.pickups.length; i += 1) {
      const p = state.pickups[i];
      if (!p.on) continue;
      ctx.fillStyle = pal.amber;
      ctx.shadowColor = pal.amber;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 9);
      ctx.lineTo(p.x + 9, p.y);
      ctx.lineTo(p.x, p.y + 9);
      ctx.lineTo(p.x - 9, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
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

  function drawShip(ctx, pal) {
    const blink = state.invuln > 0 && Math.floor(state.t * 12) % 2 === 0;
    if (blink) return;
    ctx.fillStyle = pal.cream;
    ctx.beginPath();
    ctx.moveTo(state.px + CFG.PLAYER_R + 4, state.py);
    ctx.lineTo(state.px - CFG.PLAYER_R, state.py - CFG.PLAYER_R * 0.9);
    ctx.lineTo(state.px - CFG.PLAYER_R * 0.4, state.py);
    ctx.lineTo(state.px - CFG.PLAYER_R, state.py + CFG.PLAYER_R * 0.9);
    ctx.closePath();
    ctx.fill();
    // Engine wash.
    ctx.fillStyle = pal.periwinkle;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(state.px - CFG.PLAYER_R - 7 - Math.sin(state.t * 30) * 2, state.py - 1, 6, 2);
    ctx.globalAlpha = 1;
  }

  function drawWindow(ctx, text, pal) {
    ctx.fillStyle = 'rgba(230,193,126,0.14)';
    ctx.beginPath();
    ctx.roundRect(EXTRACT_BTN.x, EXTRACT_BTN.y, EXTRACT_BTN.w, EXTRACT_BTN.h, 10);
    ctx.fill();
    ctx.strokeStyle = pal.amber;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(`EXTRACT · ${Math.ceil(state.windowT)}s`, EXTRACT_BTN.x + EXTRACT_BTN.w / 2, EXTRACT_BTN.y + 28, {
      size: 16,
      bold: true,
      color: pal.amber,
      glow: 10,
    });
    text('X · OR RIDE INTO THE NEXT LOOP', EXTRACT_BTN.x + EXTRACT_BTN.w / 2, EXTRACT_BTN.y + 48, {
      size: 9,
      color: pal.cream,
    });
  }

  function drawHud(ctx, text, pal) {
    const pips = '▲'.repeat(Math.max(0, state.lives)) + '△'.repeat(CFG.LIVES - Math.max(0, state.lives));
    text(`SHIPS ${pips}`, 14, 26, {
      align: 'left',
      bold: true,
      size: 13,
      color: state.lives <= 1 ? pal.rose : pal.cream,
    });
    text(`${WEAPON_NAMES[state.weapon]} · TIDE ${state.seed}`, 14, 44, {
      align: 'left',
      size: 10,
      color: pal.periwinkle,
    });

    const label = state.boss.on
      ? state.boss.kind === 1
        ? 'MID-BOSS'
        : 'END-BOSS'
      : state.phase === 'window'
        ? 'SLACK WATER'
        : `LOOP ${state.loop + 1}`;
    text(label, CFG.W / 2, 32, {
      size: 22,
      bold: true,
      color: state.boss.on ? pal.rose : pal.periwinkle,
      glow: state.boss.on ? 12 : 6,
    });
    if (state.loop > 0) {
      text(`EVERYTHING ×${loopScale(state).toFixed(1)}`, CFG.W / 2, 50, { size: 9, color: pal.amber });
    }

    // The shell parks its eject button over canvas x 602–634, y 6–38, so the
    // top-right HUD stops short of it rather than hiding under it.
    text(`SCORE ${terminalScore(state)}`, 590, 26, { align: 'right', bold: true, size: 13 });
    text(`KILL VALUE ×${1 + state.loop}`, 590, 44, {
      align: 'right',
      size: 10,
      color: state.loop > 0 ? pal.amber : pal.periwinkle,
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
    text('NEON TIDE', CFG.W / 2, 82, { size: 34, bold: true, color: pal.periwinkle, glow: 14 });
    text(`TIDE ${state.seed} · THE WATER GLOWS TONIGHT`, CFG.W / 2, 110, {
      size: 12,
      color: pal.amber,
    });

    const lines = [
      ['FLY', 'stick or arrows/WASD · hold the right side, SPACE, or click to fire'],
      ['ARM UP', 'amber carriers drop weapon cores: PULSE → TWIN → WAVE'],
      ['THE BOSSES', 'a mid-boss guards the channel, an end-boss guards the deep'],
      ['THE CHOICE', 'drop the end-boss and EXTRACT to win — or ride the next loop,', 'where everything is faster, tougher, and worth double'],
    ];
    let y = 172;
    for (const [head, body, more] of lines) {
      text(head, 96, y, { size: 12, bold: true, color: pal.amber, align: 'left' });
      text(body, 96, y + 17, { size: 10, color: pal.cream, align: 'left' });
      if (more) {
        y += 17;
        text(more, 96, y + 17, { size: 10, color: pal.cream, align: 'left' });
      }
      y += 46;
    }

    text('THREE SHIPS · DYING COSTS A WEAPON TIER', CFG.W / 2, 402, {
      size: 10,
      color: pal.rose,
    });
    text('TAP OR PRESS SPACE TO DIVE IN', CFG.W / 2, 440, {
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
    text(won ? 'EXTRACTED' : 'LOST TO THE TIDE', CFG.W / 2, 92, {
      size: won ? 26 : 22,
      bold: true,
      color: won ? pal.amber : pal.rose,
      glow: 12,
    });
    text(
      `${state.kills} KILLS · ${state.bossesDown} BOSSES · LOOP ${state.loop + 1}`,
      CFG.W / 2,
      118,
      { size: 12, color: pal.cream },
    );
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createNeonTide;
