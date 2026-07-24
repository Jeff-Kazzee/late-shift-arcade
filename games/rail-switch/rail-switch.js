// RAIL SWITCH cartridge — the control desk. Every rule lives in ./logic.js;
// this file turns taps and keys into commands, advances the simulation in
// fixed ticks, and projects the resulting data onto the glass.
//
// The one idea that makes the board readable: each running train's *currently
// set* route is drawn all the way to the platform it will actually reach, and
// turns rose when that platform is not the one on its manifest. A dispatch
// puzzle you have to traverse in your head is not a puzzle, it is homework.

import {
  CFG,
  EDGES,
  NODES,
  SIGNALS,
  SWITCH_NODES,
  applyCommand,
  isLocked,
  overrideActive,
  projectedPlatform,
  projectedRoute,
  newShift,
  shiftProgress,
  signalPos,
  step,
  terminalScore,
  yardQueue,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const FIELD = { x: 6, y: 70, w: 628, h: 326 };
const PLAN_VIEW = { k: 1.35, fx: 300, fy: 236 };
const HIT = 26; // half-size of a junction's tap target
const END_HOLD = 1.7; // seconds the live board stays up before the score card

const BUTTONS = [
  { id: 'hold-n', x: 8, y: 404, w: 150, h: 58, label: 'HOLD N', key: 'Z' },
  { id: 'hold-s', x: 166, y: 404, w: 150, h: 58, label: 'HOLD S', key: 'X' },
  { id: 'override', x: 324, y: 404, w: 150, h: 58, label: 'OVERRIDE', key: 'O' },
  { id: 'plan', x: 482, y: 404, w: 150, h: 58, label: 'PLAN', key: 'P' },
];
const button = (id) => BUTTONS.find((b) => b.id === id);
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Seeds are chosen here, outside the simulation, and shown on the HUD so a
// shift can be named and replayed. logic.js never reaches for a clock.
const pickSeed = () => 1 + (Date.now() % 899999);

const clock = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function pointOn(edgeId, dist) {
  const edge = EDGES[edgeId];
  const a = NODES[edge.from];
  const b = NODES[edge.to];
  const t = edge.len === 0 ? 0 : Math.min(1, Math.max(0, dist / edge.len));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

export function createRailSwitch() {
  let shell = null;
  let state = null;
  let acc = 0;
  let t = 0;
  let reported = false;
  let endHold = 0;
  let flash = null; // { text, life } — refused actions need a reason
  let sparks = [];

  const view = () =>
    state?.planning
      ? { k: PLAN_VIEW.k, fx: PLAN_VIEW.fx, fy: PLAN_VIEW.fy }
      : { k: 1, fx: FIELD.x + FIELD.w / 2, fy: FIELD.y + FIELD.h / 2 };

  const centre = () => ({ x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2 });

  const toWorld = (p) => {
    const v = view();
    const c = centre();
    return { x: (p.x - c.x) / v.k + v.fx, y: (p.y - c.y) / v.k + v.fy };
  };

  const say = (message) => {
    flash = { text: message, life: 1.2 };
  };

  const burst = (x, y) => {
    // Cosmetic only — the wreck plume is drawn, never simulated, so it can
    // use Math.random without touching determinism.
    for (let i = 0; i < 26; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 150;
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.4 + Math.random() * 0.5,
      });
    }
  };

  const command = (cmd) => applyCommand(state, cmd);

  const throwAt = (node) => {
    if (command({ k: 'switch', node })) shell.sfx.play('click');
    else if (isLocked(state, node)) {
      say(`${NODES[node].label} LOCKED — TRAIN ON THE POINTS`);
      shell.sfx.play('wall');
    }
  };

  const tapJunction = (world) => {
    const node = SWITCH_NODES.find(
      (id) =>
        Math.abs(world.x - NODES[id].x) <= HIT && Math.abs(world.y - NODES[id].y) <= HIT,
    );
    if (!node) return false;
    throwAt(node);
    return true;
  };

  const readInput = (input) => {
    const held = input.touches();

    if (state.status === 'briefing') {
      if (input.pressed('action') || input.pointer.justDown) {
        command({ k: 'begin' });
        shell.sfx.play('start');
      }
      return;
    }
    if (state.status !== 'running') return;

    // Signals are a continuous input. Emit a command only when the desired
    // aspect actually changes, so a recorded log replays as the same per-tick
    // boolean sequence rather than one command per frame.
    const wants = {
      n: input.down('z') || held.some((p) => inside(p, button('hold-n'))),
      s: input.down('x') || held.some((p) => inside(p, button('hold-s'))),
    };
    for (const side of ['n', 's']) {
      if (state.signals[side] !== wants[side] && command({ k: 'signal', side, red: wants[side] })) {
        shell.sfx.play(wants[side] ? 'wall' : 'click');
      }
    }

    if (input.pressed('1')) throwAt('jn');
    if (input.pressed('2')) throwAt('js');
    if (input.pressed('3')) throwAt('te');
    if (input.pressed('p')) {
      command({ k: 'plan', on: !state.planning });
      shell.sfx.play('pause');
    }
    if (input.pressed('o')) {
      if (command({ k: 'override' })) {
        shell.sfx.play('zap');
        shell.shake(6);
        say('OVERRIDE — INTERLOCKS DROPPED');
      } else say('NO OVERRIDES LEFT');
    }

    if (!input.pointer.justDown) return;
    const p = { x: input.pointer.x, y: input.pointer.y };
    const hit = BUTTONS.find((b) => inside(p, b));
    if (hit?.id === 'override') {
      if (command({ k: 'override' })) {
        shell.sfx.play('zap');
        shell.shake(6);
        say('OVERRIDE — INTERLOCKS DROPPED');
      } else say('NO OVERRIDES LEFT');
      return;
    }
    if (hit?.id === 'plan') {
      command({ k: 'plan', on: !state.planning });
      shell.sfx.play('pause');
      return;
    }
    if (hit) return; // the hold buttons are read as held state, not taps
    if (p.y < FIELD.y + FIELD.h) tapJunction(toWorld(p));
  };

  const handle = (events) => {
    if (events.length === 0) return;
    if (events.includes('depart')) shell.sfx.play('move');
    if (events.includes('deliver')) shell.sfx.play('score');
    if (events.includes('misroute')) shell.sfx.play('lose');
    if (events.includes('stall')) shell.sfx.play('wall');
    if (events.includes('collision')) {
      shell.sfx.play('bigboom');
      shell.shake(14);
      if (state.wreck) {
        const at = pointOn(state.wreck.edge, state.wreck.dist);
        burst(at.x, at.y);
      }
    }
    if (events.includes('shift-clear')) shell.sfx.play('fanfare');
    if (events.includes('shift-over')) endHold = END_HOLD;
  };

  return {
    id: 'rail-switch',
    title: 'RAIL SWITCH',
    blurb: 'One shared line. Every switch is a promise.',

    init(ctx) {
      shell = ctx;
      state = newShift(pickSeed());
      acc = 0;
      t = 0;
      reported = false;
      endHold = 0;
      flash = null;
      sparks = [];
    },

    update(dt, input) {
      t += dt;
      if (flash) {
        flash.life -= dt;
        if (flash.life <= 0) flash = null;
      }
      for (const spark of sparks) {
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 150 * dt;
        spark.life -= dt;
      }
      sparks = sparks.filter((spark) => spark.life > 0);

      readInput(input);

      // Fixed ticks only. The simulation never sees a wall-clock delta, so a
      // stuttering frame cannot change the outcome of a shift.
      acc += dt;
      let guard = 0;
      while (acc >= CFG.TICK && guard < 6) {
        handle(step(state, CFG.TICK));
        acc -= CFG.TICK;
        guard += 1;
      }
      if (guard === 6) acc = 0;

      if (state.status !== 'running' && state.status !== 'briefing' && !reported) {
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
      const progress = shiftProgress(state);

      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, pal.ink);
      sky.addColorStop(0.55, '#11142b');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      drawHud(ctx, text, pal, progress);

      ctx.save();
      ctx.beginPath();
      ctx.rect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
      ctx.clip();
      const v = view();
      const c = centre();
      ctx.translate(c.x, c.y);
      ctx.scale(v.k, v.k);
      ctx.translate(-v.fx, -v.fy);
      drawNetwork(ctx, text, pal);
      ctx.restore();

      drawButtons(ctx, text, pal);

      if (flash) {
        text(flash.text, CFG.W / 2, FIELD.y + FIELD.h - 8, {
          size: 12,
          color: pal.rose,
          bold: true,
          glow: 8,
        });
      }
      if (state.planning) {
        text('PLANNING ZOOM — TRAINS HELD, SHIFT CLOCK STILL RUNNING', CFG.W / 2, FIELD.y + 16, {
          size: 11,
          color: pal.periwinkle,
          bold: true,
          glow: 7,
        });
        ctx.strokeStyle = pal.periwinkle;
        ctx.lineWidth = 2;
        ctx.strokeRect(FIELD.x + 1, FIELD.y + 1, FIELD.w - 2, FIELD.h - 2);
      }
      if (state.status === 'briefing') drawBriefing(ctx, text, pal);
      if (state.status === 'won' || state.status === 'lost') drawOutcome(ctx, text, pal);
    },

    destroy() {
      state = null;
      shell = null;
      sparks = [];
      flash = null;
    },
  };

  // --- painters -----------------------------------------------------------

  function drawHud(ctx, text, pal, progress) {
    const onTrackForWin = progress.requiredDone === progress.requiredTotal;
    text(`CLEARED ${progress.requiredDone}/${progress.requiredTotal}`, 14, 26, {
      align: 'left',
      bold: true,
      color: onTrackForWin ? pal.amber : pal.cream,
      size: 13,
    });
    if (progress.cargoTotal > 0) {
      text(`CARGO ${progress.cargoDone}/${progress.cargoTotal}`, 14, 44, {
        align: 'left',
        size: 10,
        color: pal.periwinkle,
      });
    }

    const late = state.timeLeft <= 20;
    text(clock(state.timeLeft), CFG.W / 2, 32, {
      size: 26,
      bold: true,
      color: late ? pal.rose : pal.amber,
      glow: late ? 12 : 7,
    });
    text(`SEED ${state.seed}`, CFG.W / 2, 50, { size: 9, color: pal.periwinkle });

    text(`SCORE ${terminalScore(state)}`, CFG.W - 14, 26, {
      align: 'right',
      bold: true,
      size: 13,
    });

    // Delay budget as a bar: the resource the whole game spends.
    const barX = 470;
    const barW = 156;
    const used = Math.min(1, state.delay / CFG.DELAY_BUDGET);
    text('DELAY', barX - 6, 44, { align: 'right', size: 9, color: pal.rose });
    ctx.fillStyle = 'rgba(233,236,244,.10)';
    ctx.fillRect(barX, 36, barW, 9);
    ctx.fillStyle = used > 0.75 ? pal.rose : pal.amber;
    ctx.fillRect(barX, 36, barW * used, 9);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(barX, 36, barW, 9);
    text(`${Math.floor(state.delay)}/${CFG.DELAY_BUDGET}s`, barX + barW, 58, {
      align: 'right',
      size: 9,
      color: pal.rose,
    });

    const dots = '●'.repeat(state.overridesLeft) + '○'.repeat(state.overrides);
    text(`OVERRIDE ${dots || '—'}`, barX - 6, 58, { align: 'right', size: 9, color: pal.periwinkle });

    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(14, 66);
    ctx.lineTo(CFG.W - 14, 66);
    ctx.stroke();
  }

  function trackColor(edgeId, pal) {
    const occupied = state.trains.some(
      (train) => (train.state === 'run' || train.state === 'stalled') && train.edge === edgeId,
    );
    if (EDGES[edgeId].shared) return occupied ? pal.rose : '#3a4270';
    return occupied ? '#4a537f' : '#272d4e';
  }

  function drawEdge(ctx, edgeId, color, width, glow = 0) {
    const edge = EDGES[edgeId];
    const a = NODES[edge.from];
    const b = NODES[edge.to];
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    if (glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawNetwork(ctx, text, pal) {
    // 1. the permanent way
    for (const id of Object.keys(EDGES)) {
      drawEdge(ctx, id, trackColor(id, pal), EDGES[id].shared ? 7 : 5);
      const edge = EDGES[id];
      const a = NODES[edge.from];
      const b = NODES[edge.to];
      ctx.strokeStyle = 'rgba(11,12,20,0.55)';
      ctx.lineWidth = 1;
      const ties = Math.max(2, Math.round(edge.len / 16));
      ctx.beginPath();
      for (let i = 1; i < ties; i += 1) {
        const f = i / ties;
        ctx.moveTo(a.x + (b.x - a.x) * f - 1, a.y + (b.y - a.y) * f - 1);
        ctx.lineTo(a.x + (b.x - a.x) * f + 1, a.y + (b.y - a.y) * f + 1);
      }
      ctx.stroke();
    }

    text('SINGLE LINE', (NODES.tw.x + NODES.te.x) / 2, NODES.tw.y - 14, {
      size: 9,
      color: pal.rose,
      bold: true,
    });
    text('SLOW BYPASS → A', (NODES.bn1.x + NODES.bn2.x) / 2, NODES.bn1.y - 12, {
      size: 9,
      color: pal.periwinkle,
    });
    text('SLOW BYPASS → C', (NODES.bs1.x + NODES.bs2.x) / 2, NODES.bs1.y + 20, {
      size: 9,
      color: pal.periwinkle,
    });

    // 2. every running train's set route, lit to its destination
    for (const train of state.trains) {
      if (train.state !== 'run' || !train.edge) continue;
      const goingTo = projectedPlatform(state, train.edge);
      const right = goingTo === train.dest;
      const color = right ? (train.required ? pal.amber : pal.periwinkle) : pal.rose;
      ctx.globalAlpha = right ? 0.55 : 0.85;
      for (const edgeId of projectedRoute(state, train.edge)) {
        drawEdge(ctx, edgeId, color, 2.5, right ? 4 : 10);
      }
      ctx.globalAlpha = 1;
    }

    // 3. platforms
    for (const id of ['pa', 'pb', 'pc']) {
      const node = NODES[id];
      const wanted = state.trains.filter(
        (train) => train.dest === node.platform && !train.delivered && !train.misrouted,
      ).length;
      ctx.fillStyle = '#1a1f3c';
      ctx.beginPath();
      ctx.roundRect(node.x - 8, node.y - 17, 44, 34, 6);
      ctx.fill();
      ctx.strokeStyle = wanted > 0 ? pal.cream : pal.hairline;
      ctx.stroke();
      text(node.platform, node.x + 6, node.y + 3, { size: 17, bold: true, color: pal.cream });
      text(`${wanted}`, node.x + 26, node.y + 3, { size: 10, color: pal.periwinkle });
    }

    // 4. yards and the queue that is quietly burning delay
    for (const side of ['n', 's']) {
      const node = NODES[side === 'n' ? 'n-yard' : 's-yard'];
      const queue = yardQueue(state, side);
      const overdue = queue.filter((train) => state.time >= train.releaseAt).length;
      ctx.fillStyle = '#151a33';
      ctx.beginPath();
      ctx.roundRect(node.x - 34, node.y - 17, 50, 34, 6);
      ctx.fill();
      ctx.strokeStyle = overdue > 0 ? pal.rose : pal.hairline;
      ctx.stroke();
      text(side === 'n' ? 'N' : 'S', node.x - 22, node.y + 4, {
        size: 15,
        bold: true,
        color: pal.cream,
      });
      text(`${queue.length}`, node.x + 4, node.y + 4, {
        size: 12,
        bold: overdue > 0,
        color: overdue > 0 ? pal.rose : pal.periwinkle,
      });
      const upcoming = queue.slice(0, 3).map((train) => train.dest).join('');
      if (upcoming) {
        text(upcoming, node.x - 9, node.y + 27, { size: 9, color: pal.periwinkle });
      }
    }

    // 5. signals, standing exactly where the interlocking begins
    for (const side of ['n', 's']) {
      const edgeId = SIGNALS[side].edge;
      const at = pointOn(edgeId, signalPos(edgeId));
      const red = state.signals[side];
      ctx.strokeStyle = pal.hairline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
      ctx.lineTo(at.x, at.y - 16);
      ctx.stroke();
      ctx.fillStyle = red ? pal.rose : '#7fd6a0';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(at.x, at.y - 21, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 6. switches — the only things you can touch on the board
    for (const id of SWITCH_NODES) {
      const node = NODES[id];
      const locked = isLocked(state, id);
      const label = node.optionLabels[state.switches[id]];
      ctx.fillStyle = '#141834';
      ctx.beginPath();
      ctx.roundRect(node.x - 25, node.y - 13, 50, 26, 6);
      ctx.fill();
      ctx.strokeStyle = locked ? pal.rose : pal.amber;
      ctx.lineWidth = locked ? 2 : 1.5;
      if (!locked) {
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 6;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      text(label, node.x, node.y + 4, {
        size: label.length > 4 ? 9 : 13,
        bold: true,
        color: locked ? pal.rose : pal.cream,
      });
      text(node.label, node.x, node.y - 17, { size: 8, color: pal.periwinkle });
      if (locked) text('LOCKED', node.x, node.y + 22, { size: 8, color: pal.rose, bold: true });
    }

    if (overrideActive(state)) {
      ctx.strokeStyle = pal.rose;
      ctx.lineWidth = 2;
      for (const id of SWITCH_NODES) {
        ctx.beginPath();
        ctx.arc(NODES[id].x, NODES[id].y, 30 + Math.sin(t * 20) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 7. the trains, each carrying its own verdict
    for (const train of state.trains) {
      if (train.state !== 'run' && train.state !== 'stalled' && train.state !== 'wrecked') continue;
      if (!train.edge) continue;
      const at = pointOn(train.edge, train.dist);
      const goingTo = projectedPlatform(state, train.edge);
      const right = goingTo === train.dest;
      const body =
        train.state === 'wrecked' || !right
          ? pal.rose
          : train.required
            ? pal.amber
            : pal.periwinkle;

      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate(at.angle);
      ctx.fillStyle = body;
      ctx.shadowColor = body;
      ctx.shadowBlur = train.held ? 4 : 11;
      ctx.beginPath();
      ctx.roundRect(-11, -6, 22, 12, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(4, -4, 5, 8);
      ctx.restore();

      text(train.dest, at.x, at.y + 4, { size: 10, bold: true, color: pal.ink });
      const tag = right ? `#${train.id}` : `#${train.id}→${goingTo ?? '?'}!`;
      text(tag, at.x, at.y - 13, {
        size: 9,
        bold: !right,
        color: right ? pal.cream : pal.rose,
        glow: right ? 0 : 7,
      });
      if (train.state === 'stalled') {
        text('DRY', at.x, at.y + 21, { size: 9, color: pal.rose, bold: true });
      } else if (train.held) {
        text('HELD', at.x, at.y + 21, { size: 8, color: pal.rose });
      } else if (train.fuel < 6) {
        text(`⛽${train.fuel.toFixed(0)}`, at.x, at.y + 21, { size: 8, color: pal.amber });
      }
    }

    for (const spark of sparks) {
      ctx.globalAlpha = Math.min(1, spark.life * 2.2);
      ctx.fillStyle = pal.amber;
      ctx.fillRect(spark.x - 2, spark.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawButtons(ctx, text, pal) {
    for (const b of BUTTONS) {
      let active = false;
      let enabled = true;
      let color = pal.periwinkle;
      if (b.id === 'hold-n') {
        active = state.signals.n;
        color = active ? pal.rose : pal.periwinkle;
      } else if (b.id === 'hold-s') {
        active = state.signals.s;
        color = active ? pal.rose : pal.periwinkle;
      } else if (b.id === 'override') {
        enabled = state.overridesLeft > 0;
        active = overrideActive(state);
        color = enabled ? pal.amber : pal.hairline;
      } else {
        active = state.planning;
        color = active ? pal.cream : pal.periwinkle;
      }

      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fillStyle = active ? 'rgba(212,129,143,0.16)' : 'rgba(233,236,244,.04)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      const label =
        b.id === 'override' ? `${b.label} ${state.overridesLeft}` : b.label;
      text(label, b.x + b.w / 2, b.y + 30, {
        size: 15,
        bold: true,
        color: enabled ? (active ? pal.cream : color) : pal.hairline,
      });
      const sub =
        b.id === 'hold-n'
          ? 'HOLD · Z'
          : b.id === 'hold-s'
            ? 'HOLD · X'
            : b.id === 'override'
              ? '−2000 · O'
              : 'PAUSE TRAINS · P';
      text(sub, b.x + b.w / 2, b.y + 47, { size: 9, color: pal.periwinkle });
    }
    text('TAP A JUNCTION TO THROW IT · KEYS 1 JN · 2 JS · 3 EXIT', CFG.W / 2, 474, {
      size: 10,
      color: pal.rose,
    });
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.86)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('RAIL SWITCH', CFG.W / 2, 76, { size: 34, bold: true, color: pal.amber, glow: 14 });
    text(
      `SEED ${state.seed} · ${state.trains.length} TRAINS · ${CFG.REQUIRED_COUNT} REQUIRED`,
      CFG.W / 2,
      102,
      { size: 12, color: pal.periwinkle },
    );
    text('DELIVER EVERY REQUIRED TRAIN BEFORE THE SHIFT ENDS', CFG.W / 2, 126, {
      size: 12,
      color: pal.cream,
      bold: true,
    });
    text(
      `ONE SHARED LINE · ${CFG.DELAY_BUDGET}s DELAY BUDGET · ${CFG.OVERRIDES} OVERRIDES`,
      CFG.W / 2,
      146,
      { size: 11, color: pal.rose },
    );

    text('TONIGHT’S BOARD', CFG.W / 2, 180, { size: 11, bold: true, color: pal.amber });
    state.trains.forEach((train, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 120 + col * 240;
      const y = 202 + row * 19;
      const color = train.required ? pal.amber : pal.periwinkle;
      text(
        `#${String(train.id).padStart(2, ' ')}  ${train.side.toUpperCase()}→${train.dest}  ${clock(train.releaseAt)}  ${
          train.required ? 'REQUIRED' : `$${train.value}`
        }`,
        x,
        y,
        { size: 11, color, align: 'left' },
      );
    });

    text('TAP OR PRESS SPACE TO TAKE THE DESK', CFG.W / 2, 432, {
      size: 14,
      bold: true,
      color: pal.cream,
      glow: 8,
    });
    text('HOLD A SIGNAL TO FREE THE SWITCH BEYOND IT — DELAY IS THE PRICE', CFG.W / 2, 456, {
      size: 10,
      color: pal.rose,
    });
  }

  function drawOutcome(ctx, text, pal) {
    const won = state.status === 'won';
    const reason = {
      collision: 'COLLISION — THE SHIFT SCORES NOTHING',
      stranded: 'CRITICAL CARGO STRANDED',
      'delay-budget': 'DELAY BUDGET BLOWN',
      timeout: 'SHIFT ENDED WITH TRAINS STILL OUT',
    }[state.failure] ?? 'SHIFT LOST';

    ctx.fillStyle = won ? 'rgba(230,193,126,0.10)' : 'rgba(212,129,143,0.12)';
    ctx.fillRect(0, FIELD.y, CFG.W, 56);
    text(won ? 'SHIFT CLEAR' : reason, CFG.W / 2, FIELD.y + 30, {
      size: won ? 26 : 16,
      bold: true,
      color: won ? pal.amber : pal.rose,
      glow: 12,
    });
    if (won) {
      text(`EVERY REQUIRED TRAIN DELIVERED · ${state.overrides} OVERRIDES USED`, CFG.W / 2, FIELD.y + 50, {
        size: 11,
        color: pal.cream,
      });
    }
  }
}
