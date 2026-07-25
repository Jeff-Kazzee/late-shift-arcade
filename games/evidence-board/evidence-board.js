// EVIDENCE BOARD cartridge — the corkboard and the warrant desk. Every rule
// lives in ./logic.js; this file turns taps and keys into commands and
// projects the case onto the glass.
//
// The board's one readability idea: the three theory selectors only ever cycle
// through candidates the revealed evidence still allows. Chasing a lead is not
// bookkeeping — it visibly shrinks the space you have to accuse into.

import {
  CFG,
  METHODS,
  MOTIVES,
  SUSPECTS,
  applyCommand,
  candidateMethods,
  candidateMotives,
  candidateSuspects,
  newCase,
  step,
  terminalScore,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const GRID = { cols: 4, rows: 3, x: 8, y: 62, w: 150, h: 58, gapX: 8, gapY: 6 };
const cardRect = (id) => ({
  x: GRID.x + (id % GRID.cols) * (GRID.w + GRID.gapX),
  y: GRID.y + Math.floor(id / GRID.cols) * (GRID.h + GRID.gapY),
  w: GRID.w,
  h: GRID.h,
});

// Selectors and the accuse bar are sized for thumbs: 62-tall tap targets,
// nothing interactive under 44 canvas units.
const SELECTORS = [
  { id: 'who', x: 8, y: 268, w: 198, h: 62, label: 'WHO · 1', key: '1' },
  { id: 'how', x: 214, y: 268, w: 198, h: 62, label: 'HOW · 2', key: '2' },
  { id: 'why', x: 420, y: 268, w: 212, h: 62, label: 'WHY · 3', key: '3' },
];
const ACCUSE = { x: 170, y: 340, w: 300, h: 62 };
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Seeds are chosen here, outside the simulation, and shown on the HUD so a
// case can be named and replayed. logic.js never reaches for a clock.
const pickSeed = () => 1 + (Date.now() % 899999);
const END_HOLD = 1.9; // seconds the outcome banner stays before the score card

const clock = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export function createEvidenceBoard() {
  let shell = null;
  let state = null;
  let acc = 0;
  let reported = false;
  let armed = 0; // the tap that loaded the cartridge must not open the case
  let endHold = 0;
  let flash = null; // { text, color, life } — refusals and verdicts need a reason
  let cursor = 0; // keyboard cursor over the card grid
  let picks = { who: 0, how: 0, why: 0 }; // theory under construction

  const say = (text, color) => {
    flash = { text, color, life: 1.6 };
  };

  const candidates = () => ({
    who: candidateSuspects(state),
    how: candidateMethods(state),
    why: candidateMotives(state),
  });

  // Selections always sit on a live candidate: revealing an alibi that clears
  // the currently selected suspect snaps the selector to the next one still
  // in play, so the player can never accuse somebody the board has cleared.
  const snapPicks = () => {
    const c = candidates();
    for (const key of ['who', 'how', 'why']) {
      if (!c[key].includes(picks[key])) picks[key] = c[key][0] ?? 0;
    }
  };

  const cycle = (key) => {
    const list = candidates()[key];
    if (list.length === 0) return;
    const at = list.indexOf(picks[key]);
    picks[key] = list[(at + 1) % list.length];
    shell.sfx.play('move');
  };

  const chase = (id) => {
    if (applyCommand(state, { k: 'reveal', card: id })) {
      shell.sfx.play('click');
      snapPicks();
      return;
    }
    const card = state.cards.find((c) => c.id === id);
    if (card && !card.revealed) {
      say('NO TIME LEFT FOR LEGWORK — ACCUSE', shell.palette.rose);
      shell.sfx.play('wall');
    }
  };

  const fileAccusation = () => {
    const before = state.credibility;
    if (
      !applyCommand(state, {
        k: 'accuse',
        suspect: picks.who,
        method: picks.how,
        motive: picks.why,
      })
    ) {
      return;
    }
    if (state.status === 'won') {
      shell.sfx.play('score');
      endHold = END_HOLD;
      return;
    }
    shell.sfx.play('zap');
    shell.shake(7);
    if (state.status === 'lost') {
      endHold = END_HOLD;
      return;
    }
    const held = state.lastVerdict.correct;
    say(
      `WARRANT REJECTED — ${held} OF 3 HELD UP · ${before - 1} LEFT`,
      shell.palette.rose,
    );
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

    if (input.pressed('left')) cursor = (cursor + 11) % 12;
    if (input.pressed('right')) cursor = (cursor + 1) % 12;
    if (input.pressed('up')) cursor = (cursor + 8) % 12;
    if (input.pressed('down')) cursor = (cursor + 4) % 12;
    if (input.pressed('action')) chase(cursor);
    if (input.pressed('1')) cycle('who');
    if (input.pressed('2')) cycle('how');
    if (input.pressed('3')) cycle('why');
    if (input.pressed('x')) fileAccusation();

    if (!input.pointer.justDown) return;
    const p = { x: input.pointer.x, y: input.pointer.y };
    if (inside(p, ACCUSE)) {
      fileAccusation();
      return;
    }
    for (const sel of SELECTORS) {
      if (inside(p, sel)) {
        cycle(sel.id);
        return;
      }
    }
    for (const card of state.cards) {
      if (inside(p, cardRect(card.id))) {
        cursor = card.id;
        chase(card.id);
        return;
      }
    }
  };

  return {
    id: 'evidence-board',
    title: 'EVIDENCE BOARD',
    blurb: 'Twelve leads. One theory holds.',

    init(ctx) {
      shell = ctx;
      state = newCase(pickSeed());
      acc = 0;
      reported = false;
      armed = 0;
      endHold = 0;
      flash = null;
      cursor = 0;
      picks = { who: 0, how: 0, why: 0 };
    },

    update(dt, input) {
      armed += dt;
      if (flash) {
        flash.life -= dt;
        if (flash.life <= 0) flash = null;
      }

      readInput(input);

      // Fixed ticks only: the case clock never sees a wall-clock delta.
      acc += dt;
      let guard = 0;
      while (acc >= CFG.TICK && guard < 6) {
        const events = step(state, CFG.TICK);
        if (events.includes('case-cold')) {
          shell.sfx.play('lose');
          endHold = END_HOLD;
        }
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
      sky.addColorStop(0.5, '#12142a');
      sky.addColorStop(1, '#0a0b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      drawHud(ctx, text, pal);
      drawCards(ctx, text, pal);
      drawSelectors(ctx, text, pal);
      drawAccuse(ctx, text, pal);

      if (flash) {
        const w = flash.text.length * 7.4 + 22;
        ctx.fillStyle = 'rgba(11,12,20,0.9)';
        ctx.beginPath();
        ctx.roundRect((CFG.W - w) / 2, 240, w, 22, 6);
        ctx.fill();
        text(flash.text, CFG.W / 2, 256, { size: 12, color: flash.color, bold: true, glow: 8 });
      }

      text('TAP A LEAD TO CHASE IT (−8s) · ARROWS + SPACE', CFG.W / 2, 428, {
        size: 10,
        color: pal.periwinkle,
      });
      text('EVERY WRONG WARRANT COSTS CREDIBILITY', CFG.W / 2, 444, {
        size: 10,
        color: pal.rose,
      });

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
    const pips =
      '●'.repeat(Math.max(0, state.credibility)) +
      '○'.repeat(CFG.CREDIBILITY - Math.max(0, state.credibility));
    text(`CREDIBILITY ${pips}`, 14, 26, {
      align: 'left',
      bold: true,
      size: 13,
      color: state.credibility <= 1 ? pal.rose : pal.cream,
    });
    text(`LEADS ${state.cards.filter((c) => c.revealed).length}/12`, 14, 44, {
      align: 'left',
      size: 10,
      color: pal.periwinkle,
    });

    const late = state.timeLeft <= 30;
    text(clock(state.timeLeft), CFG.W / 2, 32, {
      size: 26,
      bold: true,
      color: late ? pal.rose : pal.amber,
      glow: late ? 12 : 7,
    });
    text(`CASE ${state.seed}`, CFG.W / 2, 50, { size: 9, color: pal.periwinkle });

    // The shell parks its eject button over canvas x 602–634, y 6–38, so the
    // top-right HUD stops short of it rather than hiding under it.
    text(`SCORE ${terminalScore(state)}`, 590, 26, { align: 'right', bold: true, size: 13 });

    ctx.strokeStyle = pal.hairline;
    ctx.beginPath();
    ctx.moveTo(14, 56);
    ctx.lineTo(CFG.W - 14, 56);
    ctx.stroke();
  }

  function kindColor(kind, pal) {
    return { alibi: pal.periwinkle, method: pal.amber, motive: pal.cream, sighting: pal.rose }[
      kind
    ];
  }

  function kindTag(kind) {
    return { alibi: 'ALIBI', method: 'FORENSICS', motive: 'BACKGROUND', sighting: 'WITNESS' }[
      kind
    ];
  }

  function drawCards(ctx, text, pal) {
    for (const card of state.cards) {
      const r = cardRect(card.id);
      const focused = card.id === cursor && state.status === 'running';
      ctx.fillStyle = card.revealed ? '#171b36' : '#10132a';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 6);
      ctx.fill();
      ctx.strokeStyle = focused ? pal.amber : card.revealed ? pal.hairline : '#2a3054';
      ctx.lineWidth = focused ? 2 : 1;
      if (focused) {
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 6;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      const cx = r.x + r.w / 2;
      if (!card.revealed) {
        text(`LEAD #${card.id + 1}`, cx, r.y + 26, { size: 12, bold: true, color: pal.periwinkle });
        text('−8s TO CHASE', cx, r.y + 44, { size: 8, color: '#5b628c' });
        continue;
      }
      const color = kindColor(card.kind, pal);
      text(kindTag(card.kind), cx, r.y + 14, { size: 8, bold: true, color });
      text(card.detail, cx, r.y + 30, { size: 9, color: pal.cream });
      text(card.note, cx, r.y + 48, { size: 9, bold: true, color });
    }
  }

  function drawSelectors(ctx, text, pal) {
    const c = candidates();
    const values = {
      who: SUSPECTS[picks.who],
      how: METHODS[picks.how],
      why: MOTIVES[picks.why],
    };
    const left = { who: c.who.length, how: c.how.length, why: c.why.length };
    for (const sel of SELECTORS) {
      const pinned = left[sel.id] === 1;
      ctx.fillStyle = pinned ? 'rgba(230,193,126,0.10)' : 'rgba(233,236,244,.04)';
      ctx.beginPath();
      ctx.roundRect(sel.x, sel.y, sel.w, sel.h, 10);
      ctx.fill();
      ctx.strokeStyle = pinned ? pal.amber : pal.periwinkle;
      ctx.lineWidth = pinned ? 2 : 1;
      ctx.stroke();
      text(sel.label, sel.x + sel.w / 2, sel.y + 15, { size: 9, color: pal.periwinkle });
      text(values[sel.id] ?? '—', sel.x + sel.w / 2, sel.y + 38, {
        size: 15,
        bold: true,
        color: pinned ? pal.amber : pal.cream,
      });
      text(pinned ? 'PINNED' : `${left[sel.id]} IN PLAY`, sel.x + sel.w / 2, sel.y + 54, {
        size: 8,
        color: pinned ? pal.amber : '#5b628c',
      });
    }
  }

  function drawAccuse(ctx, text, pal) {
    ctx.fillStyle = 'rgba(212,129,143,0.10)';
    ctx.beginPath();
    ctx.roundRect(ACCUSE.x, ACCUSE.y, ACCUSE.w, ACCUSE.h, 10);
    ctx.fill();
    ctx.strokeStyle = pal.rose;
    ctx.lineWidth = 2;
    ctx.stroke();
    text('ACCUSE', ACCUSE.x + ACCUSE.w / 2, ACCUSE.y + 32, {
      size: 18,
      bold: true,
      color: pal.rose,
      glow: 8,
    });
    text(`X · ${SUSPECTS[picks.who]} / ${METHODS[picks.how]} / ${MOTIVES[picks.why]}`,
      ACCUSE.x + ACCUSE.w / 2, ACCUSE.y + 52, { size: 9, color: pal.cream });
  }

  function drawBriefing(ctx, text, pal) {
    ctx.fillStyle = 'rgba(11,12,20,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    text('EVIDENCE BOARD', CFG.W / 2, 78, { size: 34, bold: true, color: pal.periwinkle, glow: 14 });
    text(`CASE ${state.seed} · THE TAKE FROM CABINET NINE IS GONE`, CFG.W / 2, 106, {
      size: 12,
      color: pal.amber,
    });
    text('SIX NAMES. FOUR WAYS IN. FOUR REASONS WHY.', CFG.W / 2, 130, {
      size: 12,
      bold: true,
      color: pal.cream,
    });
    text(SUSPECTS.join(' · '), CFG.W / 2, 154, { size: 11, color: pal.periwinkle });

    const lines = [
      ['CHASE A LEAD', 'tap a face-down card — it costs 8 seconds of the case clock'],
      ['READ THE BOARD', 'alibis clear names · forensics kill methods · background kills motives'],
      ['BUILD THE THEORY', 'the WHO / HOW / WHY selectors only offer what the evidence allows'],
      ['ACCUSE', 'wrong warrants burn credibility — three rejections end the case'],
    ];
    lines.forEach(([head, body], i) => {
      const y = 200 + i * 44;
      text(head, 96, y, { size: 12, bold: true, color: pal.amber, align: 'left' });
      text(body, 96, y + 17, { size: 10, color: pal.cream, align: 'left' });
    });

    text('EVERY CASE HAS EXACTLY ONE THEORY THAT FITS ALL THE EVIDENCE', CFG.W / 2, 404, {
      size: 10,
      color: pal.rose,
    });
    text('TAP OR PRESS SPACE TO OPEN THE CASE', CFG.W / 2, 440, {
      size: 14,
      bold: true,
      color: pal.cream,
      glow: 8,
    });
  }

  function drawOutcome(ctx, text, pal) {
    const won = state.status === 'won';
    const truth = `${SUSPECTS[state.solution.suspect]} · ${METHODS[state.solution.method]} · ${
      MOTIVES[state.solution.motive]
    }`;
    ctx.fillStyle = won ? 'rgba(230,193,126,0.12)' : 'rgba(212,129,143,0.14)';
    ctx.fillRect(0, 62, CFG.W, 70);
    text(
      won
        ? 'CASE CLOSED'
        : state.failure === 'cold'
          ? 'THE TRAIL WENT COLD'
          : 'LAUGHED OUT OF THE PRECINCT',
      CFG.W / 2,
      92,
      { size: won ? 26 : 20, bold: true, color: won ? pal.amber : pal.rose, glow: 12 },
    );
    text(won ? `IT WAS ${truth}` : `THE TRUTH: ${truth}`, CFG.W / 2, 118, {
      size: 12,
      bold: !won,
      color: pal.cream,
    });
  }
}

// The default export is the cartridge factory: how the rack loads a game.
export default createEvidenceBoard;
