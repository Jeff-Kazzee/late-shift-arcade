// GHOST FREQUENCY cartridge — the radio desk. Every rule lives in ./logic.js;
// this file turns drags and keys into commands and projects the band onto the
// glass.
//
// The contract with the player: EVERY clue is drawn. The scope trace carries
// proximity and identity, the antenna bars point the way, the meters count
// lock and containment, and the border says on-signal. The bleeps repeat what
// the glass already shows; muting them costs nothing. No microphone, ever.

import {
  CFG,
  ENTITIES,
  antennas,
  applyCommand,
  clarity,
  inBand,
  newCase,
  step,
  terminalScore,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const SCOPE = { x: 20, y: 64, w: 600, h: 140 };
const DIAL = { x: 220, y: 244, w: 400, h: 92 }; // drag anywhere here to tune
const TRACK = { x: 230, y: 300, w: 380 };
const FINE_L = { x: 8, y: 408, w: 150, h: 64, label: '◀ FINE' };
const FINE_R = { x: 482, y: 408, w: 150, h: 64, label: 'FINE ▶' };
const cardRect = (i) => ({ x: 8 + i * 158, y: 336, w: 150, h: 64 });
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const pickSeed = () => 1 + (Date.now() % 899999);
const END_HOLD = 1.9;
const COARSE_RATE = 9; // kHz per second on the arrow keys
const FINE_RATE = 2.2; // kHz per second on the held fine buttons
const TAU = Math.PI * 2;

function waveShape(wave, ph) {
  if (wave === 'square') return Math.sin(ph) >= 0 ? 0.8 : -0.8;
  if (wave === 'saw') return (((ph / TAU) % 1 + 1) % 1) * 2 - 1;
  if (wave === 'pulse') {
    const s = Math.sin(ph);
    return s > 0.93 ? 1 : s < -0.93 ? -1 : s * 0.12;
  }
  return Math.sin(ph);
}

export function createGhostFrequency() {
  let shell = null;
  let state = null;
  let acc = 0;
  let t = 0;
  let reported = false;
  let armed = 0;
  let endHold = 0;
  let flash = null;
  let wasInBand = false;
  let jumpGlow = 0; // scope flash after a frequency jump

  const say = (text, color) => {
    flash = { text, color, life: 1.6 };
  };

  const tuneTo = (freq) => applyCommand(state, { k: 'set-freq', freq });

  const name = (entity) => {
    if (state.status !== 'identify' || state.guessed[entity]) return;
    const before = state.status;
    applyCommand(state, { k: 'identify', entity });
    if (state.status === 'contain' && before === 'identify') {
      shell.sfx.play('score');
      say(`${ENTITIES[entity].name} — HOLD THE SIGNAL`, shell.palette.amber);
    } else {
      shell.sfx.play('wall');
      shell.shake(5);
      say('IT IS NOT THAT — THE ROOM SOURS', shell.palette.rose);
    }
  };

  const handle = (events) => {
    if (events.includes('locked')) {
      shell.sfx.play('capsule');
      say('SIGNAL LOCKED — NAME WHAT IS ON THE SCOPE', shell.palette.amber);
    }
    if (events.includes('jump')) {
      shell.sfx.play('zap');
      shell.shake(8);
      jumpGlow = 0.7;
      say('THE SIGNAL JUMPED — FIND IT AGAIN', shell.palette.rose);
    }
    if (events.includes('contained')) endHold = END_HOLD;
    if (events.includes('manifested')) {
      shell.sfx.play('death');
      shell.shake(12);
      endHold = END_HOLD;
    }
  };

  const readInput = (input, dt) => {
    if (state.status === 'briefing') {
      if (armed < 0.3) return;
      if (input.pressed('action') || input.pointer.justDown) {
        applyCommand(state, { k: 'begin' });
        shell.sfx.play('start');
      }
      return;
    }
    if (!['scan', 'identify', 'contain'].includes(state.status)) return;

    // keyboard: coarse on the arrows
    let nudge = 0;
    if (input.down('left')) nudge -= COARSE_RATE * dt;
    if (input.down('right')) nudge += COARSE_RATE * dt;

    // held fine buttons, mouse or thumb
    const held = input.touches();
    const heldAlso = input.pointer.down ? [...held, { x: input.pointer.x, y: input.pointer.y }] : held;
    if (heldAlso.some((p) => inside(p, FINE_L))) nudge -= FINE_RATE * dt;
    if (heldAlso.some((p) => inside(p, FINE_R))) nudge += FINE_RATE * dt;
    if (nudge !== 0) tuneTo(state.freq + nudge);

    // dragging on the dial strip sets the frequency absolutely
    for (const p of heldAlso) {
      if (inside(p, DIAL)) {
        const f = CFG.DIAL_MIN + ((p.x - TRACK.x) / TRACK.w) * (CFG.DIAL_MAX - CFG.DIAL_MIN);
        tuneTo(f);
        break;
      }
    }

    if (state.status === 'identify') {
      for (let i = 0; i < 4; i += 1) {
        if (input.pressed(String(i + 1))) name(i);
      }
      if (input.pointer.justDown) {
        const p = { x: input.pointer.x, y: input.pointer.y };
        for (let i = 0; i < 4; i += 1) {
          if (inside(p, cardRect(i))) {
            name(i);
            break;
          }
        }
      }
    }
  };

  return {
    id: 'ghost-frequency',
    title: 'GHOST FREQUENCY',
    blurb: 'Something is broadcasting. Find it, name it, hold it.',

    init(ctx) {
      shell = ctx;
      state = newCase(pickSeed());
      acc = 0;
      t = 0;
      reported = false;
      armed = 0;
      endHold = 0;
      flash = null;
      wasInBand = false;
      jumpGlow = 0;
    },

    update(dt, input) {
      t += dt;
      armed += dt;
      if (flash) {
        flash.life -= dt;
        if (flash.life <= 0) flash = null;
      }
      if (jumpGlow > 0) jumpGlow -= dt;

      readInput(input, dt);

      acc += dt;
      let guard = 0;
      while (acc >= CFG.TICK && guard < 6) {
        handle(step(state, CFG.TICK));
        acc -= CFG.TICK;
        guard += 1;
      }
      if (guard === 6) acc = 0;

      // the audible tick when the needle finds the band — the visual
      // equivalent is the scope border lighting up, drawn every frame
      const banded = ['scan', 'contain'].includes(state.status) && inBand(state);
      if (banded && !wasInBand) shell.sfx.play('move');
      wasInBand = banded;

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

      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, pal.ink);
      sky.addColorStop(0.5, '#101226');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      drawHud(ctx, text, pal);
      drawScope(ctx, text, pal);
      drawMeters(ctx, text, pal);
      drawAntennas(ctx, text, pal);
      drawDial(ctx, text, pal);
      drawPhasePanel(ctx, text, pal);
      drawFineButtons(ctx, text, pal);

      if (flash) {
        const w = flash.text.length * 7.4 + 22;
        ctx.fillStyle = 'rgba(11,12,20,0.9)';
        ctx.beginPath();
        ctx.roundRect((CFG.W - w) / 2, 208, w, 22, 6);
        ctx.fill();
        text(flash.text, CFG.W / 2, 224, { size: 12, color: flash.color, bold: true, glow: 8 });
      }

      if (state.status === 'briefing') drawBriefing(ctx, text, pal);
      if (state.status === 'won' || state.status === 'lost') drawOutcome(ctx, text, pal);
    },

    destroy() {
      state = null;
      shell = null;
      flash = null;
    },
  };

  // --- painters -------------------------------------------------------------

  function drawHud(ctx, text, pal) {
    const hot = state.haunt >= 0.7;
    text('HAUNT', 14, 24, { align: 'left', bold: true, size: 12, color: hot ? pal.rose : pal.cream });
    ctx.fillStyle = 'rgba(233,236,244,.10)';
    ctx.fillRect(70, 15, 130, 10);
    ctx.fillStyle = hot ? pal.rose : '#8c5f6e';
    ctx.fillRect(70, 15, 130 * Math.min(1, state.haunt), 10);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(70, 15, 130, 10);
    text(`${Math.round(state.haunt * 100)}%`, 70, 40, { align: 'left', size: 9, color: hot ? pal.rose : pal.periwinkle });

    const phase = { scan: 'SWEEP THE BAND', identify: 'NAME THE ENTITY', contain: 'HOLD THE SIGNAL' }[
      state.status
    ];
    text(phase ?? 'GHOST FREQUENCY', CFG.W / 2, 24, {
      size: 14,
      bold: true,
      color: state.status === 'contain' ? pal.rose : pal.amber,
    });
    text(`CASE ${state.seed}`, CFG.W / 2, 42, { size: 9, color: pal.periwinkle });

    text(`SCORE ${terminalScore(state)}`, 590, 26, { align: 'right', bold: true, size: 13 });

    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(14, 56);
    ctx.lineTo(CFG.W - 14, 56);
    ctx.stroke();
  }

  function drawScope(ctx, text, pal) {
    ctx.fillStyle = '#0d1020';
    ctx.beginPath();
    ctx.roundRect(SCOPE.x, SCOPE.y, SCOPE.w, SCOPE.h, 8);
    ctx.fill();

    // graticule
    ctx.strokeStyle = 'rgba(233,236,244,.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(SCOPE.x + (SCOPE.w / 6) * i, SCOPE.y + 4);
      ctx.lineTo(SCOPE.x + (SCOPE.w / 6) * i, SCOPE.y + SCOPE.h - 4);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(SCOPE.x + 4, SCOPE.y + SCOPE.h / 2);
    ctx.lineTo(SCOPE.x + SCOPE.w - 4, SCOPE.y + SCOPE.h / 2);
    ctx.stroke();

    // the trace: coherent entity waveform scaled by clarity, noise for the rest.
    // Noise is cosmetic (Math.random is fine here); clarity and shape are state.
    const live = ['scan', 'identify', 'contain'].includes(state.status) || state.status === 'won' || state.status === 'lost';
    if (live) {
      const c = state.status === 'identify' ? 1 : clarity(state); // a locked scope shows the shape clean
      const wave = ENTITIES[state.ghost.entity].wave;
      const mid = SCOPE.y + SCOPE.h / 2;
      const amp = 52;
      ctx.strokeStyle = c > 0.85 ? pal.amber : pal.periwinkle;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = c > 0.85 ? 9 : 4;
      ctx.beginPath();
      for (let i = 0; i <= 240; i += 1) {
        const x = SCOPE.x + 6 + (i / 240) * (SCOPE.w - 12);
        const ph = i * 0.11 + t * 5;
        const signal = waveShape(wave, ph) * amp * c;
        const noise = (Math.random() * 2 - 1) * 26 * (1 - c) + (Math.random() * 2 - 1) * 3;
        const y = mid - signal - noise;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (jumpGlow > 0) {
      ctx.fillStyle = `rgba(212,129,143,${0.35 * Math.min(1, jumpGlow / 0.7)})`;
      ctx.fillRect(SCOPE.x, SCOPE.y, SCOPE.w, SCOPE.h);
    }

    // the on-signal border — the visual twin of the audio tick
    const banded = ['scan', 'contain'].includes(state.status) && inBand(state);
    ctx.strokeStyle = banded ? pal.amber : pal.hairline;
    ctx.lineWidth = banded ? 2.5 : 1;
    if (banded) {
      ctx.shadowColor = pal.amber;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.roundRect(SCOPE.x, SCOPE.y, SCOPE.w, SCOPE.h, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (banded) {
      text('ON SIGNAL', SCOPE.x + SCOPE.w - 52, SCOPE.y + 18, { size: 9, bold: true, color: pal.amber });
    }
  }

  function drawMeters(ctx, text, pal) {
    // signal strength, left
    text('SIGNAL', 20, 224, { align: 'left', size: 9, bold: true, color: pal.periwinkle });
    ctx.fillStyle = 'rgba(233,236,244,.10)';
    ctx.fillRect(72, 216, 226, 10);
    ctx.fillStyle = pal.amber;
    ctx.fillRect(72, 216, 226 * clarity(state), 10);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(72, 216, 226, 10);

    // lock or containment, right
    const label = state.status === 'contain' || state.status === 'won' ? 'CONTAIN' : 'LOCK';
    const value = label === 'CONTAIN' ? state.contain : state.lock;
    const color = label === 'CONTAIN' ? pal.rose : pal.periwinkle;
    text(label, 340, 224, { align: 'left', size: 9, bold: true, color });
    ctx.fillStyle = 'rgba(233,236,244,.10)';
    ctx.fillRect(398, 216, 222, 10);
    ctx.fillStyle = color;
    ctx.fillRect(398, 216, 222 * value, 10);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(398, 216, 222, 10);
  }

  function drawAntennas(ctx, text, pal) {
    const bars = antennas(state);
    const labels = ['−4', 'ON', '+4'];
    text('TRIANGULATION', 100, 250, { size: 8, bold: true, color: pal.periwinkle });
    const strongest = bars.indexOf(Math.max(...bars));
    bars.forEach((value, i) => {
      const x = 40 + i * 50;
      const h = 4 + value * 52;
      const top = 316 - h;
      const lead = i === strongest && value > 0.02;
      ctx.fillStyle = lead ? pal.amber : '#2a3054';
      if (lead) {
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 7;
      }
      ctx.fillRect(x, top, 34, h);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = pal.hairline;
      ctx.strokeRect(x, 260, 34, 56);
      text(labels[i], x + 17, 330, { size: 9, bold: lead, color: lead ? pal.amber : pal.periwinkle });
    });
  }

  function drawDial(ctx, text, pal) {
    text(`${state.freq.toFixed(1)} kHz`, DIAL.x + DIAL.w / 2, 282, {
      size: 26,
      bold: true,
      color: pal.cream,
      glow: 7,
    });

    ctx.fillStyle = 'rgba(233,236,244,.08)';
    ctx.fillRect(TRACK.x, TRACK.y, TRACK.w, 6);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(TRACK.x, TRACK.y, TRACK.w, 6);
    for (let f = 40; f < CFG.DIAL_MAX; f += 10) {
      const x = TRACK.x + ((f - CFG.DIAL_MIN) / (CFG.DIAL_MAX - CFG.DIAL_MIN)) * TRACK.w;
      ctx.strokeStyle = 'rgba(233,236,244,.15)';
      ctx.beginPath();
      ctx.moveTo(x, TRACK.y - 3);
      ctx.lineTo(x, TRACK.y + 9);
      ctx.stroke();
    }
    const thumbX = TRACK.x + ((state.freq - CFG.DIAL_MIN) / (CFG.DIAL_MAX - CFG.DIAL_MIN)) * TRACK.w;
    ctx.fillStyle = pal.cream;
    ctx.shadowColor = pal.cream;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(thumbX - 5, TRACK.y - 10, 10, 26, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    text('DRAG THE DIAL · ARROW KEYS SWEEP', DIAL.x + DIAL.w / 2, 330, {
      size: 9,
      color: '#5b628c',
    });
  }

  function drawPhasePanel(ctx, text, pal) {
    if (state.status === 'identify') {
      ENTITIES.forEach((entity, i) => {
        const r = cardRect(i);
        const dead = state.guessed[i] && i !== state.ghost.entity;
        ctx.fillStyle = dead ? 'rgba(212,129,143,0.06)' : 'rgba(233,236,244,.05)';
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 8);
        ctx.fill();
        ctx.strokeStyle = dead ? pal.rose : pal.periwinkle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // the card's own miniature waveform — match it to the scope by eye
        ctx.strokeStyle = dead ? pal.rose : pal.amber;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let s = 0; s <= 60; s += 1) {
          const x = r.x + 12 + (s / 60) * (r.w - 24);
          const y = r.y + 24 - waveShape(entity.wave, s * 0.42) * 11;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (dead) {
          ctx.strokeStyle = pal.rose;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(r.x + 8, r.y + r.h - 8);
          ctx.lineTo(r.x + r.w - 8, r.y + 8);
          ctx.stroke();
        }
        text(`${i + 1} · ${entity.name}`, r.x + r.w / 2, r.y + 52, {
          size: 9,
          bold: !dead,
          color: dead ? pal.rose : pal.cream,
        });
      });
      return;
    }
    if (state.status === 'scan') {
      text('FOLLOW THE TALLEST ANTENNA · HOLD THE PEAK TO LOCK', CFG.W / 2, 370, {
        size: 11,
        color: pal.periwinkle,
      });
      text('THE ROOM SOURS ON ITS OWN — THE HAUNT METER IS THE CLOCK', CFG.W / 2, 390, {
        size: 9,
        color: pal.rose,
      });
    }
    if (state.status === 'contain') {
      const jumpsLeft = state.jumps.filter((j) => !j.done).length;
      text('STAY ON SIGNAL UNTIL CONTAINMENT FILLS', CFG.W / 2, 370, {
        size: 11,
        bold: true,
        color: pal.rose,
      });
      text(
        jumpsLeft > 0 ? `IT WILL JUMP ${jumpsLeft} MORE TIME${jumpsLeft > 1 ? 'S' : ''}` : 'NO JUMPS LEFT — IT IS CORNERED',
        CFG.W / 2,
        390,
        { size: 10, color: jumpsLeft > 0 ? pal.periwinkle : pal.amber },
      );
    }
  }

  function drawFineButtons(ctx, text, pal) {
    const active = ['scan', 'identify', 'contain'].includes(state.status);
    for (const b of [FINE_L, FINE_R]) {
      ctx.fillStyle = 'rgba(233,236,244,.05)';
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.strokeStyle = active ? pal.periwinkle : pal.hairline;
      ctx.stroke();
      text(b.label, b.x + b.w / 2, b.y + 32, {
        size: 14,
        bold: true,
        color: active ? pal.cream : '#5b628c',
      });
      text('HOLD', b.x + b.w / 2, b.y + 50, { size: 8, color: '#5b628c' });
    }
    text('SOUND IS GARNISH — EVERY CLUE IS ON THE GLASS', CFG.W / 2, 452, {
      size: 9,
      color: '#5b628c',
    });
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('GHOST FREQUENCY', CFG.W / 2, 82, { size: 34, bold: true, color: pal.rose, glow: 14 });
    text(`CASE ${state.seed} · SOMETHING IS BROADCASTING IN THE SMALL HOURS`, CFG.W / 2, 110, {
      size: 12,
      color: pal.periwinkle,
    });

    const lines = [
      ['SWEEP', 'drag the dial — the antennas point at the peak, the trace firms up'],
      ['LOCK', 'hold the peak until the lock meter fills'],
      ['NAME IT', 'the clean waveform is the entity — pick its card, wrong names feed it'],
      ['HOLD IT', 'it drifts and it jumps; stay on signal until containment fills'],
    ];
    lines.forEach(([head, body], i) => {
      const y = 170 + i * 44;
      text(head, 84, y, { size: 13, bold: true, color: pal.amber, align: 'left' });
      text(body, 180, y, { size: 10.5, color: pal.cream, align: 'left' });
    });

    text('THE HAUNT METER ONLY RISES. AT 100% IT MANIFESTS.', CFG.W / 2, 372, {
      size: 11,
      bold: true,
      color: pal.rose,
    });
    text('FULLY PLAYABLE WITH SOUND OFF · NO MICROPHONE, EVER', CFG.W / 2, 396, {
      size: 10,
      color: pal.periwinkle,
    });
    text('TAP OR PRESS SPACE TO PUT THE HEADPHONES DOWN', CFG.W / 2, 440, {
      size: 14,
      bold: true,
      color: pal.cream,
      glow: 8,
    });
  }

  function drawOutcome(ctx, text, pal) {
    const won = state.status === 'won';
    ctx.fillStyle = won ? 'rgba(230,193,126,0.12)' : 'rgba(212,129,143,0.16)';
    ctx.fillRect(0, 62, CFG.W, 64);
    text(won ? 'CONTAINED' : 'MANIFESTATION', CFG.W / 2, 92, {
      size: won ? 26 : 24,
      bold: true,
      color: won ? pal.amber : pal.rose,
      glow: 12,
    });
    text(
      won
        ? `${ENTITIES[state.ghost.entity].name} · ROOM AT ${Math.round(state.haunt * 100)}% HAUNT`
        : `THE ${ENTITIES[state.ghost.entity].name} IS LOOSE IN THE BUILDING`,
      CFG.W / 2,
      116,
      { size: 12, color: pal.cream },
    );
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createGhostFrequency;
