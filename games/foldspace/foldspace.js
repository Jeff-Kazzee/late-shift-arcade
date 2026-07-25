// FOLDSPACE cartridge — the light table and the crease handles. Every rule
// lives in ./logic.js; this file turns taps and keys into commands and
// projects the paper world onto the glass.
//
// The one readability idea: a crease is a physical handle you can see and
// press. Selecting it previews exactly which half of the world will fold and
// where it lands, so a fold is never a surprise — it is a promise kept.

import {
  CFG,
  PUZZLES,
  applyCommand,
  checkFold,
  foldSide,
  terminalScore,
  newRun,
  step,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const END_HOLD = 1.9; // seconds the outcome banner stays before the score card
const RESET_BTN = { x: 20, y: 402, w: 150, h: 56 };

export function createFoldspace() {
  let shell = null;
  let state = null;
  let acc = 0;
  let reported = false;
  let armed = 0; // the tap that loaded the cartridge must not start the run
  let endHold = 0;
  let flash = null; // { text, color, life } — refusals need a reason
  let sel = { axis: 'v', crease: 1 }; // keyboard cursor over the creases

  const say = (text, color) => {
    flash = { text, color, life: 1.6 };
  };

  // --- geometry: where the paper sits on the glass --------------------------

  const metrics = () => {
    const { w, h } = state.grid;
    const cell = Math.min(64, Math.floor(440 / w), Math.floor(280 / h));
    const bx = Math.round((CFG.W - w * cell) / 2) + 24; // nudge right of h-handles
    const by = 118 + Math.round((280 - h * cell) / 2);
    return { cell, bx, by, w, h };
  };

  const vHandle = (m, crease) => ({
    x: m.bx + crease * m.cell - 22,
    y: m.by - 50,
    w: 44,
    h: 44,
  });
  const hHandle = (m, crease) => ({
    x: m.bx - 50,
    y: m.by + crease * m.cell - 22,
    w: 44,
    h: 44,
  });

  const clampSel = () => {
    const { w, h } = state.grid;
    if (sel.axis === 'v') sel.crease = Math.min(Math.max(1, sel.crease), Math.max(1, w - 1));
    else sel.crease = Math.min(Math.max(1, sel.crease), Math.max(1, h - 1));
  };

  const tryFold = (axis, crease) => {
    const verdict = checkFold(state.grid, axis, crease);
    if (!verdict.ok) {
      say(
        verdict.reason === 'blocked'
          ? "THE PAPER WON'T CLOSE OVER TWO ANVILS"
          : 'NO CREASE THERE',
        shell.palette.rose,
      );
      shell.sfx.play('wall');
      return;
    }
    const before = state.cleared;
    const sparks = state.sparks;
    applyCommand(state, { k: 'fold', axis, crease });
    clampSel();
    if (state.sparks > sparks) say('SPARK FOLDED IN +5000', shell.palette.amber);
    if (state.status === 'cleared') {
      shell.sfx.play('score');
      return;
    }
    if (state.status === 'lost') {
      shell.sfx.play('lose');
      shell.shake(7);
      endHold = END_HOLD;
      return;
    }
    if (state.cleared === before) shell.sfx.play('click');
  };

  const tryReset = () => {
    if (!applyCommand(state, { k: 'reset' })) {
      say('NOTHING TO RE-CREASE', shell.palette.periwinkle);
      return;
    }
    if (state.status === 'lost') {
      shell.sfx.play('lose');
      endHold = END_HOLD;
      return;
    }
    say('RE-CREASED −1000', shell.palette.rose);
    shell.sfx.play('zap');
    clampSel();
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
    if (state.status === 'cleared') {
      if (input.pressed('action') || input.pointer.justDown) {
        applyCommand(state, { k: 'advance' });
        if (state.status === 'won') {
          shell.sfx.play('score');
          endHold = END_HOLD;
        } else {
          shell.sfx.play('start');
          sel = { axis: 'v', crease: 1 };
        }
      }
      return;
    }
    if (state.status !== 'running') return;

    if (input.pressed('left')) {
      sel = { axis: 'v', crease: sel.axis === 'v' ? sel.crease - 1 : 1 };
      clampSel();
      shell.sfx.play('move');
    }
    if (input.pressed('right')) {
      sel = { axis: 'v', crease: sel.axis === 'v' ? sel.crease + 1 : 1 };
      clampSel();
      shell.sfx.play('move');
    }
    if (input.pressed('up')) {
      sel = { axis: 'h', crease: sel.axis === 'h' ? sel.crease - 1 : 1 };
      clampSel();
      shell.sfx.play('move');
    }
    if (input.pressed('down')) {
      sel = { axis: 'h', crease: sel.axis === 'h' ? sel.crease + 1 : 1 };
      clampSel();
      shell.sfx.play('move');
    }
    if (input.pressed('action')) tryFold(sel.axis, sel.crease);
    if (input.pressed('x')) tryReset();

    if (!input.pointer.justDown) return;
    const p = { x: input.pointer.x, y: input.pointer.y };
    if (inside(p, RESET_BTN)) {
      tryReset();
      return;
    }
    const m = metrics();
    for (let crease = 1; crease < m.w; crease += 1) {
      if (inside(p, vHandle(m, crease))) {
        sel = { axis: 'v', crease };
        tryFold('v', crease);
        return;
      }
    }
    for (let crease = 1; crease < m.h; crease += 1) {
      if (inside(p, hHandle(m, crease))) {
        sel = { axis: 'h', crease };
        tryFold('h', crease);
        return;
      }
    }
  };

  return {
    id: 'foldspace',
    title: 'FOLDSPACE',
    blurb: 'Fold the level until the shard meets the gate.',

    init(ctx) {
      shell = ctx;
      state = newRun();
      acc = 0;
      reported = false;
      armed = 0;
      endHold = 0;
      flash = null;
      sel = { axis: 'v', crease: 1 };
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
        step(state);
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
      sky.addColorStop(0.55, '#101331');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      drawHud(ctx, text, pal);
      if (state.status !== 'briefing') {
        drawBoard(ctx, text, pal);
        drawResetButton(ctx, text, pal);
      }

      if (flash) {
        const w = flash.text.length * 7.4 + 22;
        ctx.fillStyle = 'rgba(11,12,20,0.9)';
        ctx.beginPath();
        ctx.roundRect((CFG.W - w) / 2, 386, w, 22, 6);
        ctx.fill();
        text(flash.text, CFG.W / 2, 402, { size: 12, color: flash.color, bold: true, glow: 8 });
      }

      text('TAP A HANDLE TO FOLD · ARROWS PICK A CREASE · SPACE FOLDS · X RE-CREASES', CFG.W / 2, 444, {
        size: 10,
        color: pal.periwinkle,
      });

      if (state.status === 'briefing') drawBriefing(ctx, text, pal);
      if (state.status === 'cleared') drawCleared(ctx, text, pal);
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
    const puzzle = PUZZLES[state.puzzle];
    text(`WORLD ${state.puzzle + 1}/${PUZZLES.length} · ${puzzle.name}`, 14, 26, {
      align: 'left',
      bold: true,
      size: 13,
      color: pal.cream,
    });
    const foldsLeft = Math.max(0, state.budget - state.foldsUsed);
    const pips = '●'.repeat(foldsLeft) + '○'.repeat(state.budget - foldsLeft);
    text(`FOLDS ${pips}`, 14, 44, {
      align: 'left',
      size: 11,
      color: foldsLeft <= 1 ? pal.rose : pal.periwinkle,
    });

    // The shell parks its eject button over canvas x 602–634, y 6–38, so the
    // top-right HUD stops short of it rather than hiding under it.
    text(`SCORE ${terminalScore(state)}`, 590, 26, { align: 'right', bold: true, size: 13 });
    text(`RE-CREASES LEFT ${Math.max(0, CFG.MAX_RESETS - state.resets)}`, 590, 44, {
      align: 'right',
      size: 10,
      color: pal.periwinkle,
    });

    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(14, 56);
    ctx.lineTo(CFG.W - 14, 56);
    ctx.stroke();
  }

  function drawBoard(ctx, text, pal) {
    const m = metrics();
    const running = state.status === 'running';
    const side = running ? foldSide(state.grid, sel.axis, sel.crease) : null;

    // The paper.
    ctx.fillStyle = 'rgba(233,236,244,0.05)';
    ctx.beginPath();
    ctx.roundRect(m.bx - 4, m.by - 4, m.w * m.cell + 8, m.h * m.cell + 8, 8);
    ctx.fill();

    for (let r = 0; r < m.h; r += 1) {
      for (let c = 0; c < m.w; c += 1) {
        const x = m.bx + c * m.cell;
        const y = m.by + r * m.cell;
        // Preview tint: the side about to fold glows faintly.
        let folding = false;
        if (side) {
          const i = sel.axis === 'v' ? c : r;
          folding = side === 'near' ? i < sel.crease : i >= sel.crease;
        }
        ctx.fillStyle = folding ? 'rgba(124,136,232,0.16)' : '#12152e';
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, m.cell - 4, m.cell - 4, 5);
        ctx.fill();
        ctx.strokeStyle = pal.hairline;
        ctx.lineWidth = 1;
        ctx.stroke();
        drawStack(ctx, text, pal, state.grid.cells[r][c], x, y, m.cell);
      }
    }

    if (running) {
      // Crease handles. Tapping one folds there; the selected one glows.
      for (let crease = 1; crease < m.w; crease += 1) {
        drawHandle(ctx, pal, vHandle(m, crease), 'v', crease);
      }
      for (let crease = 1; crease < m.h; crease += 1) {
        drawHandle(ctx, pal, hHandle(m, crease), 'h', crease);
      }
      // The selected crease line itself.
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      if (sel.axis === 'v') {
        const x = m.bx + sel.crease * m.cell;
        ctx.moveTo(x, m.by - 6);
        ctx.lineTo(x, m.by + m.h * m.cell + 6);
      } else {
        const y = m.by + sel.crease * m.cell;
        ctx.moveTo(m.bx - 6, y);
        ctx.lineTo(m.bx + m.w * m.cell + 6, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawHandle(ctx, pal, r, axis, crease) {
    const selected = state.status === 'running' && sel.axis === axis && sel.crease === crease;
    const verdict = checkFold(state.grid, axis, crease);
    ctx.fillStyle = selected ? 'rgba(230,193,126,0.18)' : 'rgba(159,168,232,0.10)';
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = !verdict.ok ? pal.rose : selected ? pal.amber : pal.periwinkle;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    // Arrow shows which side folds over.
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const side = foldSide(state.grid, axis, crease);
    const flip = side === 'far' ? -1 : 1;
    ctx.fillStyle = !verdict.ok ? pal.rose : selected ? pal.amber : pal.periwinkle;
    ctx.beginPath();
    if (axis === 'v') {
      ctx.moveTo(cx - 8 * flip, cy - 7);
      ctx.lineTo(cx - 8 * flip, cy + 7);
      ctx.lineTo(cx + 8 * flip, cy);
    } else {
      ctx.moveTo(cx - 7, cy - 8 * flip);
      ctx.lineTo(cx + 7, cy - 8 * flip);
      ctx.lineTo(cx, cy + 8 * flip);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawStack(ctx, text, pal, stack, x, y, cell) {
    const cx = x + cell / 2;
    const cy = y + cell / 2;
    const q = cell / 2 - 7;
    for (const item of stack) {
      if (item === '#') {
        ctx.fillStyle = '#2a2f52';
        ctx.beginPath();
        ctx.roundRect(cx - q, cy - q, q * 2, q * 2, 4);
        ctx.fill();
        ctx.strokeStyle = '#454c7e';
        ctx.stroke();
      } else if (item === 'G') {
        ctx.strokeStyle = pal.periwinkle;
        ctx.lineWidth = 3;
        ctx.shadowColor = pal.periwinkle;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, q - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
      } else if (item === '*') {
        ctx.fillStyle = pal.rose;
        ctx.shadowColor = pal.rose;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let i = 0; i < 4; i += 1) {
          const a = (i * Math.PI) / 2;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a + 0.5) * 4, cy + Math.sin(a + 0.5) * 4);
          ctx.lineTo(cx + Math.cos(a) * (q - 3), cy + Math.sin(a) * (q - 3));
          ctx.lineTo(cx + Math.cos(a - 0.5) * 4, cy + Math.sin(a - 0.5) * 4);
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (item === 'S') {
        ctx.fillStyle = pal.amber;
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(cx, cy - q + 1);
        ctx.lineTo(cx + q - 1, cy);
        ctx.lineTo(cx, cy + q - 1);
        ctx.lineTo(cx - q + 1, cy);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    if (stack.length > 1) {
      text(`×${stack.length}`, x + cell - 4, y + 12, { size: 8, align: 'right', color: pal.cream });
    }
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
    text('RE-CREASE', RESET_BTN.x + RESET_BTN.w / 2, RESET_BTN.y + 26, {
      size: 13,
      bold: true,
      color: pal.rose,
    });
    text('X · −1000', RESET_BTN.x + RESET_BTN.w / 2, RESET_BTN.y + 44, {
      size: 9,
      color: pal.cream,
    });
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('FOLDSPACE', CFG.W / 2, 82, { size: 34, bold: true, color: pal.deep, glow: 14 });
    text('NINE PAPER WORLDS · EVERY SHARD IS STRANDED', CFG.W / 2, 110, {
      size: 12,
      color: pal.amber,
    });

    const lines = [
      ['FOLD', 'press a crease handle — half the world flips onto the other half'],
      ['JOIN', 'land the amber shard on the ringed gate to clear a world'],
      ['ANVILS', 'a fold that would crush anvil onto anvil refuses to close'],
      ['THE BUDGET', 'run out of folds and the world collapses — the run ends there'],
      ['SPARKS', 'fold a spark into the shard for +5000 · re-creasing costs 1000'],
    ];
    lines.forEach(([head, body], i) => {
      const y = 168 + i * 44;
      text(head, 96, y, { size: 12, bold: true, color: pal.amber, align: 'left' });
      text(body, 96, y + 17, { size: 10, color: pal.cream, align: 'left' });
    });

    text('EVERY WORLD IS PROVEN SOLVABLE INSIDE ITS BUDGET', CFG.W / 2, 404, {
      size: 10,
      color: pal.rose,
    });
    text('TAP OR PRESS SPACE TO START FOLDING', CFG.W / 2, 440, {
      size: 14,
      bold: true,
      color: pal.cream,
      glow: 8,
    });
  }

  function drawCleared(ctx, text, pal) {
    ctx.fillStyle = 'rgba(230,193,126,0.12)';
    ctx.fillRect(0, 62, CFG.W, 56);
    const spare = state.budget - state.foldsUsed;
    text(`WORLD FOLDED FLAT — +${CFG.SCORE_CLEAR + spare * CFG.SCORE_FOLD_LEFT}`, CFG.W / 2, 88, {
      size: 20,
      bold: true,
      color: pal.amber,
      glow: 10,
    });
    text('TAP OR PRESS SPACE FOR THE NEXT WORLD', CFG.W / 2, 108, { size: 11, color: pal.cream });
  }

  function drawOutcome(ctx, text, pal) {
    const won = state.status === 'won';
    ctx.fillStyle = won ? 'rgba(230,193,126,0.12)' : 'rgba(212,129,143,0.14)';
    ctx.fillRect(0, 62, CFG.W, 70);
    text(
      won
        ? 'EVERY WORLD FOLDED FLAT'
        : state.failure === 'torn'
          ? 'THE PAPER TORE'
          : 'THE SPACE COLLAPSED',
      CFG.W / 2,
      92,
      { size: won ? 26 : 20, bold: true, color: won ? pal.amber : pal.rose, glow: 12 },
    );
    text(
      won
        ? `${state.sparks} SPARKS · ${state.totalFolds} FOLDS · ${state.resets} RE-CREASES`
        : `${state.cleared} OF ${PUZZLES.length} WORLDS CLEARED`,
      CFG.W / 2,
      118,
      { size: 12, color: pal.cream },
    );
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createFoldspace;
