// PINBALL AFTER DARK cartridge. Every rule lives in ./logic.js and every
// dimension in ./table.js; this file is input mapping, neon, and the HUD.
//
// The renderer draws from the same geometry the simulation collides against,
// so a wall the player can see is a wall the ball can hit. Sparks and the
// skyline use Math.random freely — they are decoration, never simulation.

import {
  CFG,
  newGame,
  step,
  launch,
  nudge,
  setFlipper,
  finalScore,
  scoreBreakdown,
  gridMultiplier,
  countDistricts,
} from './logic.js';
import { TABLE, DISTRICTS, DROPS, BUMPERS, POSTS, WALLS, TOUCH, inZone } from './table.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const W = TABLE.width;
const H = TABLE.height;
// One fixed seed: the table is a deterministic machine, so a run is decided by
// the player's hands rather than by which second they pressed start.
const SEED = 20260724;
const CHARGE_TIME = 0.7;
const SWIPE_MIN = 25;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const STATUS_COLOR = { dark: 'hairline', charging: 'rose', armed: 'amber', lit: 'cream' };
const displayStatus = (district) =>
  (district.status === 'dark' && district.charge > 0 ? 'charging' : district.status);

export function createPinballAfterDark() {
  let shell = null;
  let state = null;
  let reported = false;
  let t = 0;
  let charge = 0;
  let keyHeld = false;
  let gestureFrom = null;
  let gestureAt = null;
  let nudgeHeld = [false, false];
  let sparks = [];
  let trails = [];
  let skyline = [];

  const burst = (x, y, color, n, power = 150) => {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.3 + Math.random());
      sparks.push({
        x, y, color, life: 0.3 + Math.random() * 0.3,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      });
    }
  };

  function readFlippers(input) {
    const touches = input.touches();
    const left = input.down('left')
      || touches.some((p) => inZone(TOUCH.flipLeft, p.x, p.y));
    const right = input.down('right')
      || touches.some((p) => inZone(TOUCH.flipRight, p.x, p.y));
    setFlipper(state, 0, left);
    setFlipper(state, 1, right);
  }

  // Nudge is read per-ZONE from the full touch list rather than from the single
  // shared pointer, so edge-swiping while a flipper is held works. The shell's
  // pointer has no ids; a second finger would corrupt a gesture tracked that way.
  function readNudge(input) {
    const touches = input.touches();
    const zones = [TOUCH.nudgeLeft, TOUCH.nudgeRight];
    for (let i = 0; i < 2; i += 1) {
      const held = touches.some((p) => inZone(zones[i], p.x, p.y));
      if (held && !nudgeHeld[i]) fireNudge(i === 0 ? -1 : 1);
      nudgeHeld[i] = held;
    }
    if (input.pressed('z')) fireNudge(-1);
    if (input.pressed('x')) fireNudge(1);
    if (input.pressed('up')) fireNudge(0);
  }

  function fireNudge(dir) {
    const result = nudge(state, dir);
    if (!result) return;
    if (result === 'nudge') shell.sfx.play('wall');
    if (result === 'tiltwarn') {
      shell.sfx.play('zap');
      shell.shake(6);
    }
    if (result === 'tilt') {
      shell.sfx.play('lose');
      shell.shake(12);
    }
  }

  // Plunger: hold and release, or swipe up. Both map onto one power value so
  // touch and keyboard produce exactly the same shots.
  function readPlunger(dt, input) {
    const touches = input.touches();
    const keyDown = input.down('down', 's', 'action');

    if (touches.length > 0) {
      if (!gestureFrom) gestureFrom = { x: touches[0].x, y: touches[0].y };
      gestureAt = { x: touches[0].x, y: touches[0].y };
    }
    const holding = touches.length > 0 || keyDown;
    if (holding) {
      charge = Math.min(1, charge + dt / CHARGE_TIME);
      keyHeld = keyDown;
      return;
    }

    const released = gestureFrom || keyHeld;
    if (!released) return;
    const swipe = gestureFrom && gestureAt ? gestureFrom.y - gestureAt.y : 0;
    const power = swipe > SWIPE_MIN ? clamp(swipe / 150, 0.25, 1) : charge;
    if (launch(state, power)) {
      shell.sfx.play('launch');
      burst(TABLE.lane.restX, TABLE.lane.restY, shell.palette.amber, 8, 120);
    }
    gestureFrom = null;
    gestureAt = null;
    keyHeld = false;
    charge = 0;
  }

  function playEvents(events) {
    const sfx = shell.sfx;
    for (const ball of state.balls) {
      if (events.includes('bumper')) burst(ball.x, ball.y, shell.palette.periwinkle, 4, 120);
    }
    if (events.includes('bumper')) sfx.play('brick');
    if (events.includes('sling')) sfx.play('wall');
    if (events.includes('target')) sfx.play('click');
    if (events.includes('drop')) sfx.play('capsule');
    if (events.includes('drop-bank')) sfx.play('coin');
    if (events.includes('arm')) {
      sfx.play('coin');
      shell.shake(3);
    }
    if (events.includes('saucer')) sfx.play('capsule');
    if (events.includes('saucer-kick')) sfx.play('pew');
    if (events.includes('bank')) {
      sfx.play('fanfare');
      shell.shake(5);
      burst(TABLE.saucer.x, TABLE.saucer.y, shell.palette.cream, 24, 260);
    }
    if (events.includes('blackout-start')) {
      sfx.play('bigboom');
      shell.shake(12);
      burst(TABLE.saucer.x, TABLE.saucer.y, shell.palette.amber, 34, 340);
    }
    if (events.includes('jackpot')) {
      sfx.play('score');
      shell.shake(6);
      burst(TABLE.saucer.x, TABLE.saucer.y, shell.palette.amber, 20, 280);
    }
    if (events.includes('blackout-end')) sfx.play('death');
    if (events.includes('ball-save')) sfx.play('coin');
    if (events.includes('grid-lost')) sfx.play('lose');
    if (events.includes('drain')) sfx.play('zap');
    if (events.includes('search')) sfx.play('move');
    if (events.includes('win')) sfx.play('fanfare');
    if (events.includes('lose')) sfx.play('death');
  }

  function reset() {
    state = newGame(SEED);
    reported = false;
    charge = 0;
    keyHeld = false;
    gestureFrom = null;
    gestureAt = null;
    nudgeHeld = [false, false];
    sparks = [];
    trails = [];
  }

  // --- drawing ------------------------------------------------------------

  function drawTable(ctx, pal) {
    // district territory glow, so the table reads as four parts of a city
    for (let i = 0; i < DISTRICTS.length; i += 1) {
      const status = displayStatus(state.districts[i]);
      if (status === 'dark') continue;
      const spot = DISTRICTS[i];
      const alpha = status === 'lit' ? 0.14 : status === 'armed' ? 0.11 : 0.05;
      const glow = ctx.createRadialGradient(spot.x, spot.y, 4, spot.x, spot.y, 96);
      glow.addColorStop(0, pal[STATUS_COLOR[status]]);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = glow;
      ctx.fillRect(spot.x - 96, spot.y - 96, 192, 192);
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const seg of WALLS) {
      if (seg.kind === 'gate') {
        ctx.strokeStyle = 'rgba(159,168,232,0.4)';
        ctx.setLineDash([4, 4]);
      } else if (seg.kind === 'sling') {
        ctx.strokeStyle = pal.rose;
      } else {
        ctx.strokeStyle = 'rgba(159,168,232,0.5)';
      }
      ctx.beginPath();
      ctx.moveTo(seg.ax, seg.ay);
      ctx.lineTo(seg.bx, seg.by);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 1;

    // drop targets: the feeder bank
    for (let i = 0; i < DROPS.length; i += 1) {
      const target = DROPS[i];
      if (state.drops[i]) {
        ctx.strokeStyle = pal.hairline;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = pal.deep;
      ctx.shadowColor = pal.deep;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(target.x - target.r, target.y - target.r + 2, target.r * 2, target.r * 2 - 4, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // bumpers
    for (const bumper of BUMPERS) {
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 2.4 + bumper.x));
      ctx.strokeStyle = pal.periwinkle;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.18 * pulse;
      ctx.fillStyle = pal.periwinkle;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, bumper.r * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = pal.cream;
      ctx.stroke();
    }

    for (const post of POSTS) {
      ctx.fillStyle = pal.rose;
      ctx.beginPath();
      ctx.arc(post.x, post.y, post.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // district standups
    for (let i = 0; i < DISTRICTS.length; i += 1) {
      const spot = DISTRICTS[i];
      const status = displayStatus(state.districts[i]);
      const color = pal[STATUS_COLOR[status]];
      const beat = status === 'armed' ? 6 + 6 * Math.sin(t * 7) : status === 'lit' ? 12 : 0;
      ctx.shadowColor = color;
      ctx.shadowBlur = beat;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(spot.x - spot.r, spot.y - spot.r, spot.r * 2, spot.r * 2, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // substation
    const { lit, armed } = countDistricts(state);
    const ready = state.mode === 'blackout' || armed > 0 || lit === DISTRICTS.length;
    const mouth = ready ? pal.amber : 'rgba(159,168,232,0.45)';
    ctx.strokeStyle = mouth;
    ctx.lineWidth = 2;
    ctx.shadowColor = mouth;
    ctx.shadowBlur = ready ? 10 + 6 * Math.sin(t * 6) : 0;
    ctx.beginPath();
    ctx.arc(TABLE.saucer.x, TABLE.saucer.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    if (state.saucer.held) {
      ctx.fillStyle = pal.cream;
      ctx.beginPath();
      ctx.arc(TABLE.saucer.x, TABLE.saucer.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFlippers(ctx, pal) {
    for (let i = 0; i < TABLE.flippers.length; i += 1) {
      const spec = TABLE.flippers[i];
      const angle = state.flippers[i].angle;
      const tipX = spec.px + Math.cos(angle) * spec.len;
      const tipY = spec.py + Math.sin(angle) * spec.len;
      ctx.strokeStyle = state.tiltLocked ? pal.hairline : pal.amber;
      ctx.lineWidth = spec.r * 2;
      ctx.lineCap = 'round';
      ctx.shadowColor = pal.amber;
      ctx.shadowBlur = state.flippers[i].want && !state.tiltLocked ? 14 : 0;
      ctx.beginPath();
      ctx.moveTo(spec.px, spec.py);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
    }
  }

  function drawBalls(ctx, pal) {
    for (const trail of trails) {
      ctx.fillStyle = `rgba(243,235,221,${(0.22 * trail.life).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, CFG.BALL_R * (0.3 + 0.6 * trail.life), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const ball of state.balls) {
      ctx.shadowColor = pal.cream;
      ctx.shadowBlur = 14;
      ctx.fillStyle = pal.cream;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, CFG.BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(11,12,20,0.35)';
      ctx.beginPath();
      ctx.arc(ball.x + 2, ball.y + 2, CFG.BALL_R * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHud(ctx, pal, text) {
    // top strip: the whole band above y=60 sits outside the playfield walls
    ctx.fillStyle = 'rgba(11,12,20,0.9)';
    ctx.fillRect(0, 0, W, 58);
    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(0, 58);
    ctx.lineTo(W, 58);
    ctx.stroke();

    text(finalScore(state).toLocaleString('en-US'), 16, 34, {
      size: 24, bold: true, color: pal.cream, align: 'left',
    });
    const grid = gridMultiplier(state);
    text(`GRID ×${grid}`, 16, 51, {
      size: 12, color: grid > 1 ? pal.amber : pal.rose, align: 'left', bold: grid > 2,
    });

    for (let i = 0; i < DISTRICTS.length; i += 1) {
      const district = state.districts[i];
      const status = displayStatus(district);
      const color = pal[STATUS_COLOR[status]];
      const x = 236 + i * 80;
      ctx.strokeStyle = status === 'dark' ? pal.hairline : color;
      ctx.beginPath();
      ctx.roundRect(x, 10, 74, 38, 5);
      ctx.stroke();
      if (status === 'armed') {
        ctx.globalAlpha = 0.1 + 0.08 * Math.sin(t * 7);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      text(DISTRICTS[i].name, x + 37, 26, {
        size: 10, color: status === 'dark' ? pal.rose : color, bold: status !== 'dark',
      });
      for (let pip = 0; pip < DISTRICTS[i].need; pip += 1) {
        const filled = status === 'lit' || status === 'armed' || pip < district.charge;
        ctx.fillStyle = filled ? color : pal.hairline;
        ctx.fillRect(x + 37 - (DISTRICTS[i].need * 9) / 2 + pip * 9, 34, 6, 6);
      }
      text(status === 'lit' ? 'LIT' : status === 'armed' ? 'ARMED' : '', x + 37, 46, {
        size: 8, color,
      });
    }

    text(`BALL ${CFG.BALLS - state.ballsLeft}/${CFG.BALLS}`, W - 16, 26, {
      size: 12, color: pal.periwinkle, align: 'right',
    });
    if (state.mode === 'blackout') {
      text(`JACKPOT ${state.jackpots}/${CFG.JACKPOTS_TO_WIN}`, W - 16, 46, {
        size: 11, color: pal.amber, align: 'right', bold: true,
      });
    } else if (state.saveTimer > 0) {
      text('BALL SAVE', W - 16, 46, { size: 11, color: pal.cream, align: 'right' });
    }

    // left apron: the tilt meter, so the cost of nudging is always visible
    text('TILT', 24, 424, { size: 10, color: pal.rose, align: 'left' });
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(24, 430, 150, 8);
    ctx.fillStyle = state.tiltLocked ? pal.rose : state.tiltMeter > 0.66 ? pal.amber : pal.deep;
    ctx.fillRect(25, 431, 148 * Math.min(1, state.tiltMeter), 6);
    if (state.tiltWarnings > 0) {
      text(`WARNINGS ${state.tiltWarnings}  −${(state.tiltWarnings * CFG.B_TILT).toLocaleString('en-US')}`, 24, 454, {
        size: 10, color: pal.rose, align: 'left',
      });
    }
    if (state.tiltLocked) {
      text('TILT — FLIPPERS DEAD', 24, 468, { size: 11, color: pal.rose, align: 'left', bold: true });
    }

    // right apron: what the table wants next
    const { lit, armed } = countDistricts(state);
    const hint = state.mode === 'blackout'
      ? 'SHOOT THE SUBSTATION FOR JACKPOTS'
      : armed > 0
        ? `BANK ${armed} ARMED · OR RISK ${gridMultiplier(state)}×`
        : lit === DISTRICTS.length
          ? 'SUBSTATION STARTS THE BLACKOUT'
          : 'CHARGE A DISTRICT TARGET';
    text(hint, W - 24, 424, { size: 10, color: pal.amber, align: 'right' });
    text('FLIP ←/→ or thumbs · NUDGE Z/X or edges', W - 24, 446, {
      size: 10, color: pal.rose, align: 'right',
    });
    text(`${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`, W - 24, 466, {
      size: 10, color: pal.periwinkle, align: 'right',
    });
  }

  function drawOverlays(ctx, pal, text) {
    if (state.lastAwardT > 0 && state.lastAward) {
      ctx.globalAlpha = Math.min(1, state.lastAwardT);
      text(state.lastAward, 300, 366, { size: 17, color: pal.amber, bold: true, glow: 10 });
      ctx.globalAlpha = 1;
    }

    if (state.phase === 'ready') {
      const barX = TABLE.lane.restX - 7;
      ctx.fillStyle = pal.amber;
      ctx.fillRect(barX, 468 - 84 * charge, 14, 4 + 84 * charge);
      text('SWIPE UP', 300, 300, { size: 20, color: pal.cream, bold: true, glow: 8 });
      text('or hold SPACE and let go to plunge', 300, 324, { size: 12, color: pal.rose });
      text('relight HARBOR · MARKET · TOWER · YARDS, then clear the BLACKOUT', 300, 348, {
        size: 11, color: pal.periwinkle,
      });
    }

    if (state.phase !== 'won' && state.phase !== 'lost') return;

    ctx.fillStyle = 'rgba(11,12,20,0.82)';
    ctx.fillRect(0, 0, W, H);
    const parts = scoreBreakdown(state);
    const won = state.phase === 'won';
    text(won ? 'CITY RESTORED' : 'THE CITY STAYS DARK', 300, 96, {
      size: 26, color: won ? pal.amber : pal.rose, bold: true, glow: 14,
    });
    const rows = [
      ['TABLE', parts.table],
      ['DISTRICTS RELIT', parts.districts],
      ['BLACKOUT CLEARED', parts.win],
      ['BALLS IN RESERVE', parts.balls],
      ['TILT WARNINGS', parts.tilt],
    ];
    rows.forEach(([label, value], i) => {
      const y = 140 + i * 24;
      text(label, 190, y, { size: 13, color: pal.periwinkle, align: 'left' });
      text(value.toLocaleString('en-US'), 450, y, {
        size: 13, color: value < 0 ? pal.rose : pal.cream, align: 'right',
      });
    });
    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(190, 272);
    ctx.lineTo(450, 272);
    ctx.stroke();
    text('TOTAL', 190, 292, { size: 15, color: pal.amber, align: 'left', bold: true });
    text(parts.total.toLocaleString('en-US'), 450, 292, {
      size: 15, color: pal.amber, align: 'right', bold: true,
    });
    if (won) {
      text(`CLEARED IN ${state.elapsed.toFixed(1)}s`, 300, 322, { size: 12, color: pal.cream });
    }
  }

  return {
    id: 'pinball-after-dark',
    title: 'PINBALL AFTER DARK',
    blurb: 'Relight four districts. Clear the Blackout.',

    init(ctx) {
      shell = ctx;
      t = 0;
      skyline = Array.from({ length: 26 }, (_, i) => ({
        x: i * 25,
        w: 16 + Math.random() * 9,
        h: 12 + Math.random() * 44,
      }));
      reset();
    },

    // Shell R: a rematch is a fresh table on the same deterministic seed.
    restart() {
      t = 0;
      reset();
    },

    update(dt, input) {
      t += dt;

      if (state.phase === 'ready') {
        setFlipper(state, 0, false);
        setFlipper(state, 1, false);
        readPlunger(dt, input);
      } else if (state.phase === 'play') {
        readFlippers(input);
        readNudge(input);
      }

      const before = state.balls.length;
      const events = step(state, dt);
      if (events.length > 0) playEvents(events);
      if (state.balls.length < before && events.includes('drain')) {
        burst(300, TABLE.drainY, shell.palette.rose, 12, 200);
      }

      for (const ball of state.balls) {
        trails.push({ x: ball.x, y: ball.y, life: 1 });
      }
      trails = trails.filter((p) => (p.life -= dt * 4.5) > 0);
      sparks = sparks.filter((p) => (p.life -= dt) > 0);
      for (const p of sparks) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
      }

      if ((state.phase === 'won' || state.phase === 'lost') && !reported) {
        reported = true;
        shell.endGame(finalScore(state));
      }
    },

    draw(ctx) {
      const pal = shell.palette;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, W, H);
      const text = createTextPainter(ctx, pal, { size: 12 });

      // skyline behind the table: the city this run is trying to relight
      const { lit } = countDistricts(state);
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < skyline.length; i += 1) {
        const block = skyline[i];
        ctx.fillStyle = i * 4 < lit * skyline.length ? 'rgba(230,193,126,0.28)' : 'rgba(124,136,232,0.13)';
        ctx.fillRect(block.x, H - block.h, block.w, block.h);
      }
      ctx.globalAlpha = 1;

      // nudge shove, applied only to the picture
      ctx.save();
      if (state.nudgeFx > 0) {
        ctx.translate(state.nudgeDir * state.nudgeFx * 24, state.nudgeFx * -8);
      }
      drawTable(ctx, pal);
      drawFlippers(ctx, pal);
      drawBalls(ctx, pal);
      for (const p of sparks) {
        ctx.globalAlpha = clamp(p.life * 2.6, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // touch zones, faint, so a first-time phone player can see where to press
      ctx.strokeStyle = pal.hairline;
      for (const zone of [TOUCH.flipLeft, TOUCH.flipRight]) {
        ctx.strokeRect(zone.x + 1, zone.y, zone.w - 2, zone.h - 1);
      }

      drawHud(ctx, pal, text);
      drawOverlays(ctx, pal, text);
    },

    destroy() {
      state = null;
      shell = null;
      sparks = [];
      trails = [];
      skyline = [];
      gestureFrom = null;
      gestureAt = null;
      nudgeHeld = [false, false];
    },
  };
}

// The default export is the cartridge factory: how the rack loads a game.
export default createPinballAfterDark;
