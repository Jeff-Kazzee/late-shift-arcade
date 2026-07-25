// BACKPACK ALCHEMIST cartridge — the pack and the road. Every rule lives in
// ./logic.js; this file turns taps and keys into commands and projects the
// circuit onto the glass.
//
// The board's one readability idea: reactions are drawn as sparks ON THE SEAM
// between the two ingredients that cause them, amber for the ones that fight
// for you and rose for the ones that burn you. The pack is read, not audited.

import {
  CFG,
  TYPES,
  applyCommand,
  canPlace,
  cellAt,
  computePack,
  enrage,
  footprint,
  newNight,
  step,
  terminalScore,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const GRID = { x: 12, y: 76, cell: 62, gap: 2 };
const cellRect = (index) => ({
  x: GRID.x + (index % CFG.COLS) * (GRID.cell + GRID.gap),
  y: GRID.y + Math.floor(index / CFG.COLS) * (GRID.cell + GRID.gap),
  w: GRID.cell,
  h: GRID.cell,
});

const ROTATE_BTN = { x: 12, y: 344, w: 122, h: 56, label: 'ROTATE · F' };
const TOSS_BTN = { x: 142, y: 344, w: 124, h: 56, label: 'TONIC · T' };
const PANEL = { x: 280, y: 70, w: 352 };
const optionRect = (i) => ({ x: PANEL.x, y: 88 + i * 78, w: PANEL.w, h: 70 });
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const pickSeed = () => 1 + (Date.now() % 899999);
const END_HOLD = 1.9;

const EL_GLYPH = { fire: '▲', bolt: '◆', frost: '●', herb: '✚', volatile: '×' };
const LEGEND = [
  ['FIRE + BOLT', 'PLASMA ARC · +3 ATK'],
  ['FROST + FROST', 'ICE WALL · +2 ARMOR'],
  ['HERB + FROST', 'TINCTURE · +2 HEAL'],
  ['FIRE + VITRIOL', 'UNSTABLE · +5 ATK, BURNS YOU'],
  ['VITRIOL + VITRIOL', 'MELTDOWN · BURNS YOU BADLY'],
  ['FIRE + HERB', 'SCORCHED · −1 HEAL'],
];

export function createBackpackAlchemist() {
  let shell = null;
  let state = null;
  let acc = 0;
  let t = 0;
  let reported = false;
  let armed = 0;
  let endHold = 0;
  let flash = null;
  let cursor = 0; // keyboard cell cursor over the pack

  const elColor = (el) => {
    const pal = shell.palette;
    return { fire: pal.rose, bolt: pal.amber, frost: pal.periwinkle, herb: pal.cream, volatile: pal.deep }[el];
  };

  const say = (text, color) => {
    flash = { text, color, life: 1.4 };
  };

  const tryPlace = (cell) => {
    if (applyCommand(state, { k: 'place', cell })) {
      shell.sfx.play('click');
      return;
    }
    say('IT DOES NOT FIT THERE — F ROTATES, T BREWS A TONIC', shell.palette.rose);
    shell.sfx.play('wall');
  };

  const handle = (events) => {
    if (events.includes('enemy-down')) shell.sfx.play('score');
    if (events.includes('player-hit')) shell.sfx.play('hit');
    if (events.includes('volatile')) shell.sfx.play('zap');
    if (events.includes('defeat')) {
      shell.sfx.play('death');
      shell.shake(10);
      endHold = END_HOLD;
    }
    if (events.includes('night-clear')) {
      shell.sfx.play('fanfare');
      endHold = END_HOLD;
    }
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

    const p = { x: input.pointer.x, y: input.pointer.y };

    if (state.status === 'draft') {
      for (let i = 0; i < 3; i += 1) {
        if (input.pressed(String(i + 1)) || (input.pointer.justDown && inside(p, optionRect(i)))) {
          if (applyCommand(state, { k: 'pick', option: i })) shell.sfx.play('coin');
          return;
        }
      }
      return;
    }

    if (state.status === 'place') {
      if (input.pressed('left')) cursor = (cursor % CFG.COLS === 0) ? cursor + CFG.COLS - 1 : cursor - 1;
      if (input.pressed('right')) cursor = (cursor % CFG.COLS === CFG.COLS - 1) ? cursor - CFG.COLS + 1 : cursor + 1;
      if (input.pressed('up')) cursor = (cursor + 12) % 16;
      if (input.pressed('down')) cursor = (cursor + 4) % 16;
      if (input.pressed('f') && applyCommand(state, { k: 'rotate' })) shell.sfx.play('move');
      if (input.pressed('t') && applyCommand(state, { k: 'toss' })) {
        shell.sfx.play('capsule');
        return;
      }
      if (input.pressed('action')) {
        tryPlace(cursor);
        return;
      }
      if (!input.pointer.justDown) return;
      if (inside(p, ROTATE_BTN)) {
        if (applyCommand(state, { k: 'rotate' })) shell.sfx.play('move');
        return;
      }
      if (inside(p, TOSS_BTN)) {
        if (applyCommand(state, { k: 'toss' })) shell.sfx.play('capsule');
        return;
      }
      for (let i = 0; i < 16; i += 1) {
        if (inside(p, cellRect(i))) {
          cursor = i;
          tryPlace(i);
          return;
        }
      }
    }
  };

  return {
    id: 'backpack-alchemist',
    title: 'BACKPACK ALCHEMIST',
    blurb: 'What touches, reacts. Pack accordingly.',

    init(ctx) {
      shell = ctx;
      state = newNight(pickSeed());
      acc = 0;
      t = 0;
      reported = false;
      armed = 0;
      endHold = 0;
      flash = null;
      cursor = 0;
    },

    update(dt, input) {
      t += dt;
      armed += dt;
      if (flash) {
        flash.life -= dt;
        if (flash.life <= 0) flash = null;
      }

      readInput(input);

      acc += dt;
      let guard = 0;
      while (acc >= CFG.TICK && guard < 6) {
        handle(step(state, CFG.TICK));
        acc -= CFG.TICK;
        guard += 1;
      }
      if (guard === 6) acc = 0;

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
      sky.addColorStop(0.5, '#141228');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      drawHud(ctx, text, pal);
      drawPack(ctx, text, pal);
      drawButtons(ctx, text, pal);

      if (state.status === 'draft') drawDraft(ctx, text, pal);
      if (state.status === 'place') drawPlacing(ctx, text, pal);
      if (state.status === 'combat' || state.status === 'won' || state.status === 'lost') {
        drawCombat(ctx, text, pal);
      }
      drawPackStats(ctx, text, pal);

      if (flash) {
        const w = flash.text.length * 6.4 + 22;
        ctx.fillStyle = 'rgba(11,12,20,0.9)';
        ctx.beginPath();
        ctx.roundRect((CFG.W - w) / 2, 406, w, 22, 6);
        ctx.fill();
        text(flash.text, CFG.W / 2, 422, { size: 10, color: flash.color, bold: true, glow: 8 });
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
    const hurt = state.hp <= 10;
    text(`HP ${Math.max(0, state.hp)}/${state.maxHp}`, 14, 24, {
      align: 'left',
      bold: true,
      size: 13,
      color: hurt ? pal.rose : pal.cream,
    });
    ctx.fillStyle = 'rgba(233,236,244,.10)';
    ctx.fillRect(14, 32, 160, 9);
    ctx.fillStyle = hurt ? pal.rose : pal.amber;
    ctx.fillRect(14, 32, Math.max(0, (160 * state.hp) / state.maxHp), 9);
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(14, 32, 160, 9);

    const phase =
      state.status === 'combat'
        ? state.enemy?.boss
          ? 'THE WARDEN'
          : 'FIGHT'
        : state.status === 'draft'
          ? 'DRAFT'
          : state.status === 'place'
            ? 'PACK IT'
            : '';
    text(`ROUND ${Math.min(CFG.ROUNDS, state.round + 1)}/${CFG.ROUNDS} ${phase ? '· ' + phase : ''}`, CFG.W / 2, 28, {
      size: 15,
      bold: true,
      color: state.enemy?.boss ? pal.rose : pal.amber,
    });
    text(`NIGHT ${state.seed}`, CFG.W / 2, 46, { size: 9, color: pal.periwinkle });

    text(`SCORE ${terminalScore(state)}`, 590, 26, { align: 'right', bold: true, size: 13 });

    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(14, 58);
    ctx.lineTo(CFG.W - 14, 58);
    ctx.stroke();
  }

  function drawPack(ctx, text, pal) {
    // empty cells
    for (let i = 0; i < 16; i += 1) {
      const r = cellRect(i);
      ctx.fillStyle = '#10132a';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 5);
      ctx.fill();
      ctx.strokeStyle = '#232948';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // packed ingredients, one rounded slab per item
    for (const item of state.items) {
      const spec = TYPES[item.type];
      const color = elColor(spec.el);
      const xs = item.cells.map((c) => cellRect(c).x);
      const ys = item.cells.map((c) => cellRect(c).y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) + GRID.cell - x;
      const h = Math.max(...ys) + GRID.cell - y;
      ctx.fillStyle = '#1a1f3c';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 7);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = spec.el === 'volatile' ? 2 : 1.5;
      if (spec.el === 'volatile') {
        ctx.shadowColor = pal.rose;
        ctx.shadowBlur = 5 + Math.sin(t * 6) * 3;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      text(EL_GLYPH[spec.el], x + w / 2, y + h / 2 + 1, { size: 17, bold: true, color });
      text(spec.name.split(' ')[0], x + w / 2, y + h / 2 + 16, { size: 7, color: pal.cream });
    }

    // reaction sparks on the seams — the circuit made visible
    const pack = computePack(state);
    const byId = new Map(state.items.map((item) => [item.id, item]));
    for (const reaction of pack.reactions) {
      const bad = reaction.kind === 'MELTDOWN' || reaction.kind === 'SCORCHED' || reaction.kind === 'UNSTABLE MIX';
      const a = byId.get(reaction.a);
      const b = byId.get(reaction.b);
      for (const ca of a.cells) {
        for (const cb of b.cells) {
          const colA = ca % CFG.COLS;
          const rowA = Math.floor(ca / CFG.COLS);
          const colB = cb % CFG.COLS;
          const rowB = Math.floor(cb / CFG.COLS);
          if (Math.abs(colA - colB) + Math.abs(rowA - rowB) !== 1) continue;
          const ra = cellRect(ca);
          const rb = cellRect(cb);
          const mx = (ra.x + rb.x) / 2 + GRID.cell / 2;
          const my = (ra.y + rb.y) / 2 + GRID.cell / 2;
          ctx.fillStyle = bad ? pal.rose : pal.amber;
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(mx, my, 3.5 + Math.sin(t * 5 + mx) * 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    // placement ghost
    if (state.status === 'place' && state.holding !== null) {
      const cells = footprint(state.holding, cursor, state.rot);
      const ok = canPlace(state, state.holding, cursor, state.rot);
      const color = ok ? pal.amber : pal.rose;
      if (cells) {
        for (const c of cells) {
          const r = cellRect(c);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
          ctx.setLineDash([]);
        }
      } else {
        const r = cellRect(cursor);
        ctx.strokeStyle = pal.rose;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      }
    }
  }

  function drawButtons(ctx, text, pal) {
    const active = state.status === 'place';
    for (const b of [ROTATE_BTN, TOSS_BTN]) {
      ctx.fillStyle = active ? 'rgba(233,236,244,.06)' : 'rgba(233,236,244,.02)';
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.strokeStyle = active ? pal.periwinkle : pal.hairline;
      ctx.lineWidth = 1;
      ctx.stroke();
      text(b.label, b.x + b.w / 2, b.y + 28, {
        size: 12,
        bold: active,
        color: active ? pal.cream : '#5b628c',
      });
      text(b === TOSS_BTN ? `+${CFG.TOSS_HEAL} HP, NO ITEM` : 'TURN THE PIECE', b.x + b.w / 2, b.y + 44, {
        size: 8,
        color: active ? pal.periwinkle : '#3b4166',
      });
    }
  }

  function statLine(spec) {
    const bits = [];
    if (spec.atk) bits.push(`ATK ${spec.atk}`);
    if (spec.armor) bits.push(`ARMOR ${spec.armor}`);
    if (spec.heal) bits.push(`HEAL ${spec.heal}`);
    return bits.join(' · ') || '—';
  }

  function drawDraft(ctx, text, pal) {
    text('CHOOSE AN INGREDIENT · 1 / 2 / 3', PANEL.x + PANEL.w / 2, 80, {
      size: 12,
      bold: true,
      color: pal.amber,
    });
    state.draft?.forEach((type, i) => {
      const spec = TYPES[type];
      const r = optionRect(i);
      const color = elColor(spec.el);
      ctx.fillStyle = 'rgba(233,236,244,.04)';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(`${i + 1}`, r.x + 24, r.y + 42, { size: 18, bold: true, color: pal.periwinkle });
      text(`${EL_GLYPH[spec.el]} ${spec.name}`, r.x + 52, r.y + 26, {
        size: 13,
        bold: true,
        color,
        align: 'left',
      });
      text(statLine(spec), r.x + 52, r.y + 44, { size: 10, color: pal.cream, align: 'left' });
      text(
        `${spec.el.toUpperCase()} · TAKES ${spec.w * spec.h} CELL${spec.w * spec.h > 1 ? 'S' : ''}`,
        r.x + 52,
        r.y + 60,
        { size: 8, color: pal.periwinkle, align: 'left' },
      );
    });
    drawLegend(ctx, text, pal, 402);
  }

  function drawPlacing(ctx, text, pal) {
    const spec = TYPES[state.holding];
    const color = elColor(spec.el);
    ctx.fillStyle = 'rgba(233,236,244,.04)';
    ctx.beginPath();
    ctx.roundRect(PANEL.x, 96, PANEL.w, 110, 10);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
    text('IN HAND', PANEL.x + PANEL.w / 2, 116, { size: 9, color: pal.periwinkle });
    text(`${EL_GLYPH[spec.el]} ${spec.name}`, PANEL.x + PANEL.w / 2, 140, {
      size: 15,
      bold: true,
      color,
    });
    text(statLine(spec), PANEL.x + PANEL.w / 2, 160, { size: 11, color: pal.cream });
    text(
      spec.w * spec.h > 1 ? (state.rot === 0 ? 'LYING FLAT ▬▬' : 'STANDING ▮') : 'ONE CELL',
      PANEL.x + PANEL.w / 2,
      180,
      { size: 10, color: pal.periwinkle },
    );
    text('TAP A CELL TO PACK IT', PANEL.x + PANEL.w / 2, 230, {
      size: 12,
      bold: true,
      color: pal.cream,
      glow: 6,
    });
    text('ARROWS + SPACE · F ROTATES · T BREWS A TONIC', PANEL.x + PANEL.w / 2, 250, {
      size: 9,
      color: pal.periwinkle,
    });
    drawLegend(ctx, text, pal, 402);
  }

  function drawLegend(ctx, text, pal, atY) {
    // The whole recipe book, always on screen: no wiki required to finish.
    LEGEND.forEach(([pair, effect], i) => {
      const y = atY - (LEGEND.length - i) * 13;
      text(pair, PANEL.x + 4, y, { size: 8, bold: true, color: pal.amber, align: 'left' });
      text(effect, PANEL.x + 140, y, { size: 8, color: pal.periwinkle, align: 'left' });
    });
  }

  function drawCombat(ctx, text, pal) {
    const enemy = state.enemy;
    const pack = computePack(state);
    if (enemy) {
      const boss = enemy.boss;
      ctx.fillStyle = boss ? 'rgba(212,129,143,0.08)' : 'rgba(233,236,244,.04)';
      ctx.beginPath();
      ctx.roundRect(PANEL.x, 96, PANEL.w, 128, 10);
      ctx.fill();
      ctx.strokeStyle = boss ? pal.rose : pal.periwinkle;
      ctx.lineWidth = boss ? 2 : 1;
      ctx.stroke();
      text(enemy.name, PANEL.x + PANEL.w / 2, 122, {
        size: boss ? 17 : 15,
        bold: true,
        color: boss ? pal.rose : pal.cream,
        glow: boss ? 10 : 0,
      });
      ctx.fillStyle = 'rgba(233,236,244,.10)';
      ctx.fillRect(PANEL.x + 20, 136, PANEL.w - 40, 12);
      ctx.fillStyle = boss ? pal.rose : pal.amber;
      ctx.fillRect(PANEL.x + 20, 136, Math.max(0, ((PANEL.w - 40) * enemy.hp) / enemy.maxHp), 12);
      ctx.strokeStyle = pal.hairline;
      ctx.strokeRect(PANEL.x + 20, 136, PANEL.w - 40, 12);
      text(`${enemy.hp}/${enemy.maxHp}`, PANEL.x + PANEL.w / 2, 146.5, { size: 9, color: pal.ink, bold: true });
      const anger = enrage(state);
      text(
        `STRIKES FOR ${enemy.atk}${anger > 0 ? ` +${anger} ENRAGED` : ''}`,
        PANEL.x + PANEL.w / 2,
        170,
        { size: 11, bold: anger > 0, color: anger > 0 ? pal.rose : pal.periwinkle },
      );
      const countdown = Math.max(0, CFG.PULSE - state.pulseTimer);
      ctx.fillStyle = 'rgba(233,236,244,.10)';
      ctx.fillRect(PANEL.x + 20, 182, PANEL.w - 40, 5);
      ctx.fillStyle = pal.periwinkle;
      ctx.fillRect(
        PANEL.x + 20,
        182,
        (PANEL.w - 40) * Math.min(1, Math.max(0, 1 - countdown / CFG.PULSE)),
        5,
      );
      text('NEXT EXCHANGE', PANEL.x + PANEL.w / 2, 202, { size: 8, color: '#5b628c' });
    }

    if (state.lastPulse) {
      const lp = state.lastPulse;
      text(
        `DEALT ${lp.dealt} · TOOK ${lp.taken}${lp.selfHit ? ` · BURNED ${lp.selfHit}` : ''}${lp.healed ? ` · HEALED ${lp.healed}` : ''}`,
        PANEL.x + PANEL.w / 2,
        238,
        { size: 11, bold: true, color: lp.taken + lp.selfHit > lp.healed ? pal.rose : pal.cream },
      );
    }

    // active reactions, named
    const counts = new Map();
    for (const r of pack.reactions) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    let y = 268;
    text(counts.size > 0 ? 'LIVE REACTIONS' : 'NO REACTIONS — NOTHING TOUCHES', PANEL.x + PANEL.w / 2, y, {
      size: 9,
      bold: true,
      color: counts.size > 0 ? pal.amber : pal.periwinkle,
    });
    y += 18;
    for (const [kind, n] of counts) {
      const bad = kind === 'MELTDOWN' || kind === 'SCORCHED';
      text(`${kind}${n > 1 ? ` ×${n}` : ''}`, PANEL.x + PANEL.w / 2, y, {
        size: 10,
        color: bad ? pal.rose : pal.cream,
      });
      y += 15;
    }
  }

  function drawPackStats(ctx, text, pal) {
    const pack = computePack(state);
    const bits = [
      `ATK ${pack.atk}`,
      `ARMOR ${pack.armor}`,
      `HEAL ${pack.heal}`,
      pack.self > 0 ? `SELF-BURN ${pack.self}` : null,
    ].filter(Boolean);
    text(`PACK · ${bits.join(' · ')}`, CFG.W / 2, 448, {
      size: 12,
      bold: true,
      color: pack.self > 0 ? pal.rose : pal.cream,
    });
    text('EVERY EXCHANGE: YOUR PACK FIRES FIRST, THEN THE CREATURE SWINGS', CFG.W / 2, 466, {
      size: 9,
      color: '#5b628c',
    });
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('BACKPACK ALCHEMIST', CFG.W / 2, 78, { size: 32, bold: true, color: pal.amber, glow: 14 });
    text(`NIGHT ${state.seed} · SIX FIGHTS TO THE WARDEN OF THE STILL`, CFG.W / 2, 106, {
      size: 12,
      color: pal.periwinkle,
    });
    text('WHAT TOUCHES, REACTS. THE PACKING IS THE BUILD.', CFG.W / 2, 130, {
      size: 13,
      bold: true,
      color: pal.cream,
    });

    const lines = [
      ['DRAFT', 'pick one of three ingredients, twice a round'],
      ['PACK', 'place it — neighbours decide what it becomes'],
      ['FIGHT', 'the pack fires on its own; you live with the layout'],
      ['TONIC', 'no room, or too risky? brew it for +2 HP instead'],
    ];
    lines.forEach(([head, body], i) => {
      const y = 172 + i * 36;
      text(head, 120, y, { size: 12, bold: true, color: pal.amber, align: 'left' });
      text(body, 210, y, { size: 11, color: pal.cream, align: 'left' });
    });

    text('THE RECIPE BOOK', CFG.W / 2, 330, { size: 10, bold: true, color: pal.rose });
    LEGEND.forEach(([pair, effect], i) => {
      const y = 350 + i * 15;
      text(pair, 170, y, { size: 9, bold: true, color: pal.amber, align: 'left' });
      text(effect, 330, y, { size: 9, color: pal.periwinkle, align: 'left' });
    });

    text('TAP OR PRESS SPACE TO SHOULDER THE PACK', CFG.W / 2, 462, {
      size: 14,
      bold: true,
      color: pal.cream,
      glow: 8,
    });
  }

  function drawOutcome(ctx, text, pal) {
    const won = state.status === 'won';
    ctx.fillStyle = won ? 'rgba(230,193,126,0.12)' : 'rgba(212,129,143,0.14)';
    ctx.fillRect(0, 62, CFG.W, 64);
    text(won ? 'THE WARDEN FALLS' : 'THE PACK OUTLIVED YOU', CFG.W / 2, 92, {
      size: won ? 24 : 20,
      bold: true,
      color: won ? pal.amber : pal.rose,
      glow: 12,
    });
    text(
      won
        ? `WALKED OUT WITH ${state.hp} HP`
        : `${state.fightsWon} OF ${CFG.ROUNDS} FIGHTS CLEARED`,
      CFG.W / 2,
      114,
      { size: 12, color: pal.cream },
    );
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createBackpackAlchemist;
