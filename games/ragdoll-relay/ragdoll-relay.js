// RAGDOLL RELAY cartridge — the rooftop camera over ./logic.js. Every rule
// lives in the sim; this file turns a drag (or an aim dial) into FLING, held
// input into NUDGE, and projects the night run onto the glass.
//
// The one readability idea: when the courier settles, the game visibly
// changes stance — an aim arrow and a dotted arc appear, and the world
// waits. Flight and aiming never share a control.

import {
  CFG,
  COURSE,
  applyCommand,
  canFling,
  courierX,
  courierY,
  newGame,
  step,
  terminalScore,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const END_HOLD = 1.9;
const RESET_BTN = { x: 20, y: 402, w: 130, h: 56 };
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Seeds are chosen here, outside the simulation, and shown on the HUD so a
// night of wind can be named and replayed. logic.js never reaches for a clock.
const pickSeed = () => 1 + (Date.now() % 899999);

export function createRagdollRelay() {
  let shell = null;
  let state = null;
  let acc = 0;
  let reported = false;
  let armed = 0;
  let endHold = 0;
  let camX = 0;
  let aimAng = -0.7; // keyboard aim dial
  let aimPow = 0.8;
  let drag = null; // { x, y } canvas-space anchor of a live fling drag
  let flash = null;
  // The drag preview needs the live pointer, which only update() sees; stash
  // it each frame instead of reaching outside the contract.
  const lastPointer = { x: 0, y: 0 };

  const say = (text, color) => {
    flash = { text, color, life: 1.6 };
  };

  const doFling = (ang, pow) => {
    if (applyCommand(state, { k: 'fling', ang, pow })) {
      shell.sfx.play('start');
      return true;
    }
    return false;
  };

  const doReset = () => {
    const before = state.resets;
    if (applyCommand(state, { k: 'reset' })) {
      if (state.status === 'lost') {
        endHold = END_HOLD;
        shell.sfx.play('lose');
      } else {
        say(`BACK TO THE GATE — RESET ${before + 1}/${CFG.MAX_RESETS}`, shell.palette.rose);
        shell.sfx.play('zap');
      }
    }
  };

  const readInput = (input) => {
    lastPointer.x = input.pointer.x;
    lastPointer.y = input.pointer.y;
    if (state.status === 'briefing') {
      if (armed < 0.3) return;
      if (input.pressed('action') || input.pointer.justDown) {
        applyCommand(state, { k: 'begin' });
        shell.sfx.play('start');
      }
      return;
    }
    if (state.status !== 'running') return;

    if (input.pressed('x')) doReset();
    if (input.pointer.justDown && inside(input.pointer, RESET_BTN)) {
      doReset();
      return;
    }

    const rest = canFling(state);
    if (rest) {
      // Keyboard aim dial.
      if (input.down('left')) aimAng -= 2.4 * (1 / 60);
      if (input.down('right')) aimAng += 2.4 * (1 / 60);
      if (input.down('up')) aimPow = Math.min(1, aimPow + 1.2 * (1 / 60));
      if (input.down('down')) aimPow = Math.max(0.15, aimPow - 1.2 * (1 / 60));
      if (aimAng < -Math.PI) aimAng = -Math.PI;
      if (aimAng > 0.4) aimAng = 0.4;
      if (input.pressed('action')) doFling(aimAng, aimPow);

      // Drag-to-fling: press anywhere (except the reset button), pull, release.
      if (input.pointer.justDown) drag = { x: input.pointer.x, y: input.pointer.y };
      if (drag && input.pointer.justUp) {
        const dx = input.pointer.x - drag.x;
        const dy = input.pointer.y - drag.y;
        const len = Math.hypot(dx, dy);
        if (len > 18) {
          const ang = Math.atan2(dy, dx);
          doFling(ang, Math.min(1, len / 130));
        }
        drag = null;
      }
      if (!input.pointer.down && !input.pointer.justUp) drag = null;
      applyCommand(state, { k: 'nudge', dir: 0 });
      return;
    }

    // Airborne: drift.
    drag = null;
    let dir = 0;
    if (input.down('left')) dir -= 1;
    if (input.down('right')) dir += 1;
    if (dir === 0 && input.pointer.down) {
      dir = input.pointer.x < CFG.W / 2 ? -1 : 1;
    }
    applyCommand(state, { k: 'nudge', dir });
  };

  return {
    id: 'ragdoll-relay',
    title: 'RAGDOLL RELAY',
    blurb: 'Fling the courier. Mind the parcel.',

    init(ctx) {
      shell = ctx;
      state = newGame(pickSeed());
      acc = 0;
      reported = false;
      armed = 0;
      endHold = 0;
      camX = 0;
      aimAng = -0.7;
      aimPow = 0.8;
      drag = null;
      flash = null;
    },

    update(dt, input) {
      armed += dt;
      if (flash) {
        flash.life -= dt;
        if (flash.life <= 0) flash = null;
      }

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
          shell.shake(9);
          endHold = END_HOLD;
        } else if (events.includes('gate')) {
          shell.sfx.play('score');
          say(`GATE ${state.gate} — CHECKPOINT`, shell.palette.amber);
        } else if (events.includes('reset')) {
          shell.shake(5);
          say(`LONG DROP — RESET ${state.resets}/${CFG.MAX_RESETS}`, shell.palette.rose);
        } else if (events.includes('crack')) {
          shell.sfx.play('wall');
          shell.shake(4);
        }
        acc -= CFG.TICK;
        guard += 1;
      }
      if (guard === 6) acc = 0;

      // Camera chases the chest.
      const targetCam = Math.min(Math.max(0, courierX(state) - 260), CFG.WORLD_W - CFG.W);
      camX += (targetCam - camX) * Math.min(1, dt * 6);

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
      sky.addColorStop(0.65, '#101331');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      // Distant skyline, cheap parallax.
      ctx.fillStyle = 'rgba(159,168,232,0.06)';
      for (let i = 0; i < 10; i += 1) {
        const bx = ((i * 261 - camX * 0.3) % (CFG.W + 140)) - 70;
        ctx.fillRect(bx, 200 + ((i * 97) % 90), 90, 300);
      }

      ctx.save();
      ctx.translate(-camX, 0);
      drawCourse(ctx, text, pal);
      drawCourier(ctx, pal);
      if (state.status === 'running' && canFling(state)) drawAim(ctx, pal);
      ctx.restore();

      drawHud(ctx, text, pal);
      drawResetButton(ctx, text, pal);

      if (flash) {
        const w = flash.text.length * 7.4 + 22;
        ctx.fillStyle = 'rgba(11,12,20,0.9)';
        ctx.beginPath();
        ctx.roundRect((CFG.W - w) / 2, 380, w, 22, 6);
        ctx.fill();
        text(flash.text, CFG.W / 2, 396, { size: 12, color: flash.color, bold: true, glow: 8 });
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

  function drawCourse(ctx, text, pal) {
    for (const plat of COURSE.platforms) {
      if (plat.x1 < camX - 20 || plat.x0 > camX + CFG.W + 20) continue;
      if (plat.spikes) {
        ctx.fillStyle = '#1a1030';
        ctx.fillRect(plat.x0, plat.y, plat.x1 - plat.x0, CFG.H - plat.y);
        ctx.fillStyle = pal.rose;
        for (let x = plat.x0; x < plat.x1 - 10; x += 14) {
          ctx.beginPath();
          ctx.moveTo(x, plat.y);
          ctx.lineTo(x + 7, plat.y - 10);
          ctx.lineTo(x + 14, plat.y);
          ctx.closePath();
          ctx.fill();
        }
        continue;
      }
      ctx.fillStyle = '#151936';
      ctx.fillRect(plat.x0, plat.y, plat.x1 - plat.x0, CFG.H - plat.y);
      ctx.strokeStyle = pal.hairline;
      ctx.beginPath();
      ctx.moveTo(plat.x0, plat.y);
      ctx.lineTo(plat.x1, plat.y);
      ctx.stroke();
      // Lit windows.
      ctx.fillStyle = 'rgba(230,193,126,0.14)';
      for (let x = plat.x0 + 18; x < plat.x1 - 18; x += 46) {
        ctx.fillRect(x, plat.y + 26, 10, 14);
      }
    }
    // Relay gates.
    COURSE.gates.forEach((gate, i) => {
      const crossed = state.gate > i;
      ctx.strokeStyle = crossed ? pal.hairline : pal.periwinkle;
      ctx.lineWidth = crossed ? 1 : 2;
      if (!crossed) {
        ctx.shadowColor = pal.periwinkle;
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.moveTo(gate.x, 120);
      ctx.lineTo(gate.x, CFG.H);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      text(`GATE ${i + 1}`, gate.x, 112, { size: 9, color: crossed ? '#5b628c' : pal.periwinkle });
    });
    // The depot line.
    ctx.strokeStyle = pal.amber;
    ctx.lineWidth = 3;
    ctx.shadowColor = pal.amber;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(COURSE.finishX, 100);
    ctx.lineTo(COURSE.finishX, CFG.H);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    text('DEPOT', COURSE.finishX, 92, { size: 11, bold: true, color: pal.amber, glow: 8 });
  }

  function drawCourier(ctx, pal) {
    const [head, chest, hips, parcel] = state.points;
    // The rope.
    ctx.strokeStyle = 'rgba(233,236,244,0.5)';
    ctx.beginPath();
    ctx.moveTo(chest.x, chest.y);
    ctx.lineTo(parcel.x, parcel.y);
    ctx.stroke();
    // The parcel.
    ctx.save();
    ctx.translate(parcel.x, parcel.y);
    ctx.rotate(Math.atan2(parcel.y - parcel.py, parcel.x - parcel.px) * 0.3);
    const hurt = state.integrity / CFG.PARCEL_HP;
    ctx.fillStyle = pal.amber;
    ctx.shadowColor = pal.amber;
    ctx.shadowBlur = 6 + hurt * 6;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = pal.ink;
    ctx.strokeRect(-8, -8, 16, 16);
    if (hurt < 0.7) {
      ctx.strokeStyle = pal.rose;
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(2, 3);
      ctx.lineTo(-2, 6);
      ctx.stroke();
    }
    ctx.restore();
    // The body: three linked balls and stub limbs.
    ctx.strokeStyle = pal.cream;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    ctx.lineTo(chest.x, chest.y);
    ctx.lineTo(hips.x, hips.y);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = pal.cream;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.ink;
    ctx.fillRect(head.x - 3, head.y - 2, 2, 2);
    ctx.fillRect(head.x + 1, head.y - 2, 2, 2);
    // Flailing stub arms/legs read the velocity.
    const vx = chest.x - chest.px;
    const vy = chest.y - chest.py;
    ctx.strokeStyle = 'rgba(243,235,221,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chest.x, chest.y);
    ctx.lineTo(chest.x - vx * 3 - 8, chest.y - vy * 3 + 4);
    ctx.moveTo(chest.x, chest.y);
    ctx.lineTo(chest.x - vx * 3 + 8, chest.y - vy * 3 + 6);
    ctx.moveTo(hips.x, hips.y);
    ctx.lineTo(hips.x - vx * 4 - 6, hips.y + 10);
    ctx.moveTo(hips.x, hips.y);
    ctx.lineTo(hips.x - vx * 4 + 6, hips.y + 10);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawAim(ctx, pal) {
    const cx = courierX(state);
    const cy = courierY(state);
    let ang = aimAng;
    let pow = aimPow;
    if (drag) {
      // Live drag preview overrides the dial (screen-space deltas).
      const dx = lastPointer.x - drag.x;
      const dy = lastPointer.y - drag.y;
      if (Math.hypot(dx, dy) > 18) {
        ang = Math.atan2(dy, dx);
        pow = Math.min(1, Math.hypot(dx, dy) / 130);
      }
    }
    // Ballistic dots.
    const v = CFG.FLING_V * pow;
    ctx.fillStyle = pal.periwinkle;
    for (let i = 1; i <= 8; i += 1) {
      const t = i * 0.09;
      const px = cx + Math.cos(ang) * v * t;
      const py = cy + Math.sin(ang) * v * t + 0.5 * CFG.GRAVITY * t * t;
      ctx.globalAlpha = 1 - i / 10;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // The arrow.
    ctx.strokeStyle = pal.amber;
    ctx.lineWidth = 3;
    ctx.shadowColor = pal.amber;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (26 + pow * 26), cy + Math.sin(ang) * (26 + pow * 26));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
  }

  function drawHud(ctx, text, pal) {
    const left = Math.max(0, CFG.TIME_LIMIT - state.t);
    const mm = Math.floor(left / 60);
    const ss = String(Math.floor(left % 60)).padStart(2, '0');
    text(`${mm}:${ss}`, CFG.W / 2, 32, {
      size: 26,
      bold: true,
      color: left < 20 ? pal.rose : pal.amber,
      glow: left < 20 ? 12 : 7,
    });
    text(`NIGHT ${state.seed} · GATE ${Math.min(state.gate + 1, 3)}/3`, CFG.W / 2, 50, {
      size: 9,
      color: pal.periwinkle,
    });

    // Parcel integrity.
    const frac = state.integrity / CFG.PARCEL_HP;
    ctx.fillStyle = 'rgba(233,236,244,0.10)';
    ctx.fillRect(14, 16, 130, 12);
    ctx.fillStyle = frac < 0.35 ? pal.rose : pal.amber;
    ctx.fillRect(14, 16, 130 * frac, 12);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(14, 16, 130, 12);
    text('PARCEL', 14, 44, { align: 'left', size: 9, color: pal.periwinkle });

    // The shell parks its eject button over canvas x 602–634, y 6–38, so the
    // top-right HUD stops short of it rather than hiding under it.
    text(`SCORE ${terminalScore(state) || '—'}`, 590, 26, { align: 'right', bold: true, size: 13 });
    const resetsLeft = Math.max(0, CFG.MAX_RESETS - state.resets);
    text(`RESETS LEFT ${resetsLeft}`, 590, 44, {
      align: 'right',
      size: 10,
      color: resetsLeft <= 1 ? pal.rose : pal.periwinkle,
    });

    // Wind sock.
    const wind = state.wind[state.windAt].ax;
    const wx = CFG.W / 2 + 140;
    text('WIND', wx - 26, 30, { size: 9, color: pal.periwinkle, align: 'right' });
    ctx.strokeStyle = Math.abs(wind) > 28 ? pal.rose : pal.periwinkle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx - 18, 26);
    ctx.lineTo(wx - 18 + (wind / CFG.WIND_MAX) * 34, 26);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawResetButton(ctx, text, pal) {
    if (state.status !== 'running') return;
    ctx.fillStyle = 'rgba(212,129,143,0.10)';
    ctx.beginPath();
    ctx.roundRect(RESET_BTN.x, RESET_BTN.y, RESET_BTN.w, RESET_BTN.h, 10);
    ctx.fill();
    ctx.strokeStyle = pal.rose;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    text('RESET', RESET_BTN.x + RESET_BTN.w / 2, RESET_BTN.y + 26, {
      size: 13,
      bold: true,
      color: pal.rose,
    });
    text('X · −15000', RESET_BTN.x + RESET_BTN.w / 2, RESET_BTN.y + 44, {
      size: 9,
      color: pal.cream,
    });
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('RAGDOLL RELAY', CFG.W / 2, 82, { size: 34, bold: true, color: pal.amber, glow: 14 });
    text(`NIGHT ${state.seed} · ONE PARCEL, THREE GATES, ONE DEPOT`, CFG.W / 2, 110, {
      size: 12,
      color: pal.periwinkle,
    });

    const lines = [
      ['FLING', 'when the courier settles, drag and release — or aim with arrows, SPACE throws'],
      ['DRIFT', 'in the air, hold left/right (or either half of the screen) to lean'],
      ['THE PARCEL', 'spikes and hard landings crack it — break it and the run is over'],
      ['THE DROP', 'falling off the city costs a reset · six resets is a wrecked courier'],
      ['THE WIND', 'every night has its own gusts — watch the sock, lead your throws'],
    ];
    lines.forEach(([head, body], i) => {
      const y = 168 + i * 44;
      text(head, 84, y, { size: 12, bold: true, color: pal.amber, align: 'left' });
      text(body, 84, y + 17, { size: 10, color: pal.cream, align: 'left' });
    });

    text('FAST, INTACT, AND ON THE FIRST TRY PAYS BEST', CFG.W / 2, 404, {
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
    text(
      won
        ? 'DELIVERED'
        : state.failure === 'shattered'
          ? 'THE PARCEL DIDN\'T MAKE IT'
          : state.failure === 'wrecked'
            ? 'COURIER WRECKED'
            : 'TOO LATE — DEPOT CLOSED',
      CFG.W / 2,
      92,
      { size: won ? 26 : 20, bold: true, color: won ? pal.amber : pal.rose, glow: 12 },
    );
    text(
      won
        ? `${state.t.toFixed(1)}s · PARCEL AT ${state.integrity}% · ${state.resets} RESETS`
        : `MADE IT ${Math.round((courierX(state) / COURSE.finishX) * 100)}% OF THE WAY`,
      CFG.W / 2,
      118,
      { size: 12, color: pal.cream },
    );
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createRagdollRelay;
