// VAULT HEIST — the cartridge. Reads the simulation, draws it, and turns taps
// into orders. It owns no rules: every question about what a turn will do is
// answered by `projectTurn`, the same call the resolver makes.

import {
  CFG, ROOMS, EDGES, CAMERAS, newHeist, room, neighbors, projectTurn,
  resolveTurn, legalOrders, actionAt, reachable, crewById, carriedBy,
  lootInRoom, camerasLive, terminalScore, scoreBreakdown, totalTools,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const W = 640;
const H = 480;

// The rack of rooms. 84 x 80 canvas units is the smallest a room may be and
// still clear 44 CSS px once the cabinet scales its glass down to 0.56 on a
// portrait handset — the number every tap target in here is sized against.
const MAP = { x: 20, y: 84, cellW: 100, cellH: 104, w: 84, h: 80 };
const MAP_VIEW = { x: 6, y: 80, w: 628, h: 298 };
const BAR = { y: 384, h: 84 };
const MIN_TAP = 78;

const roomRect = (id) => {
  const spot = room(id);
  return {
    x: MAP.x + spot.col * MAP.cellW,
    y: MAP.y + spot.row * MAP.cellH,
    w: MAP.w,
    h: MAP.h,
  };
};
const roomCentre = (id) => {
  const r = roomRect(id);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Palette-only colour with an alpha. The cabinet's five inks and nothing else.
function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const CREW_INK = { vane: 'periwinkle', spark: 'amber', bruno: 'rose' };

const ACT_LABEL = {
  grab: 'TAKE', drill: 'DRILL', 'hack-cameras': 'WIPE', 'hack-lights': 'LIGHTS', none: '—',
};

const TOOL_LABEL = { emp: 'EMP', smoke: 'SMOKE', noisemaker: 'CLATTER', charge: 'CHARGE' };

export function createVaultHeist() {
  let shell = null;
  let state = null;
  let orders = {};
  let preview = null;
  let phase = 'brief'; // brief | plan | resolve | over
  let mode = 'crew'; // crew | orders | tools | aim
  let selected = null;
  let reported = false;
  let clock = 0;
  let resolveT = 0;
  let resolved = null; // the projection being animated
  let zoom = false;
  let flash = '';
  let flashT = 0;

  // Everything the overlay needs, recomputed whenever the queue changes. It is
  // the same call the resolver will make, so the drawing cannot drift from the
  // outcome — that equality is the entire promise of the game.
  const refresh = () => {
    preview = state && !state.over ? projectTurn(state, orders) : null;
  };

  const say = (text) => {
    flash = text;
    flashT = 1.8;
  };

  const startHeist = (seed) => {
    state = newHeist(seed);
    orders = {};
    selected = null;
    mode = 'crew';
    resolved = null;
    refresh();
  };

  // --- reading the plan ----------------------------------------------------

  const liveCrew = () => (state ? state.crew.filter((c) => !c.captured && !c.extracted) : []);

  const orderLabel = (crew) => {
    const order = orders[crew.id];
    if (!order) return 'HOLD';
    if (order.kind === 'move') return `→ ${room(order.to).name}`;
    if (order.kind === 'act') return ACT_LABEL[actionAt(state, crew).kind] ?? 'ACT';
    if (order.kind === 'tool') {
      return order.to ? `${TOOL_LABEL[order.tool]} → ${room(order.to).name}` : TOOL_LABEL[order.tool];
    }
    return order.kind.toUpperCase();
  };

  const setOrder = (crew, order) => {
    orders[crew.id] = order;
    refresh();
    shell.sfx.play('click');
  };

  // Rooms the selected crew member may end this turn in.
  const highlighted = () => {
    if (!selected || phase !== 'plan') return [];
    const crew = crewById(state, selected);
    if (!crew) return [];
    if (mode === 'aim') return neighbors(state, crew.room, crew.id);
    if (mode === 'orders') return reachable(state, crew).filter((id) => id !== crew.room);
    return [];
  };

  // --- the button bar ------------------------------------------------------
  //
  // Modal on purpose: a phone thumb gets a handful of wide targets instead of
  // a dense toolbar. Tap a crew member, tap where they go, confirm the turn.
  const buttons = () => {
    if (phase === 'over') return [{ id: 'again', label: 'AGAIN', tone: 'amber' }];
    if (phase !== 'plan') return [];
    if (mode === 'crew') {
      const chips = liveCrew().map((c) => ({
        id: `crew:${c.id}`, label: c.name, tone: CREW_INK[c.id], sub: orderLabel(c),
      }));
      return [
        ...chips,
        { id: 'zoom', label: zoom ? 'WIDE' : 'ZOOM', tone: 'deep' },
        { id: 'go', label: 'RUN TURN', tone: preview && !preview.safe ? 'rose' : 'cream' },
      ];
    }
    const crew = crewById(state, selected);
    if (!crew) return [];
    const legal = legalOrders(state, selected);
    const has = (kind, tool) => legal.some((o) => o.kind === kind && (!tool || o.tool === tool));
    if (mode === 'tools') {
      const tools = ['emp', 'smoke', 'noisemaker', 'charge']
        .filter((t) => legal.some((o) => o.kind === 'tool' && o.tool === t))
        .map((t) => ({ id: `tool:${t}`, label: TOOL_LABEL[t], tone: 'deep', sub: `x${state.tools[t]}` }));
      return [{ id: 'back', label: 'BACK', tone: 'cream' }, ...tools];
    }
    const list = [{ id: 'back', label: 'BACK', tone: 'cream' }];
    list.push({ id: 'wait', label: 'HOLD', tone: 'cream' });
    if (has('hide')) list.push({ id: 'hide', label: 'HIDE', tone: 'periwinkle' });
    if (has('act')) list.push({ id: 'act', label: ACT_LABEL[actionAt(state, crew).kind], tone: 'amber' });
    if (has('extract')) list.push({ id: 'extract', label: 'OUT', tone: 'amber' });
    if (legal.some((o) => o.kind === 'tool')) list.push({ id: 'tools', label: 'KIT', tone: 'deep' });
    return list;
  };

  const buttonRects = () => {
    const list = buttons();
    if (list.length === 0) return [];
    const gap = 6;
    const width = Math.max(MIN_TAP, (W - 12 - gap * (list.length - 1)) / list.length);
    return list.map((b, i) => ({ ...b, x: 6 + i * (width + gap), y: BAR.y, w: width, h: BAR.h }));
  };

  const commitTurn = () => {
    const outcome = resolveTurn(state, orders);
    resolved = outcome.projection;
    state = outcome.state;
    orders = {};
    selected = null;
    mode = 'crew';
    phase = 'resolve';
    resolveT = 0;
    if (resolved.detections.length > 0) shell.sfx.play('zap');
    else if (resolved.spotted.length > 0) shell.sfx.play('wall');
    if (resolved.noises.some((n) => n.magnitude >= 3)) shell.sfx.play('boom');
    if (resolved.events.some((e) => e.includes('vault door'))) shell.sfx.play('capsule');
  };

  const tapButton = (id) => {
    if (id === 'again') {
      startHeist((state.seed + 1) >>> 0);
      phase = 'plan';
      reported = false;
      shell.sfx.play('start');
      return;
    }
    if (id.startsWith('crew:')) {
      selected = id.slice(5);
      mode = 'orders';
      shell.sfx.play('move');
      return;
    }
    if (id === 'zoom') {
      zoom = !zoom;
      shell.sfx.play('click');
      return;
    }
    if (id === 'go') {
      commitTurn();
      return;
    }
    if (id === 'back') {
      if (mode === 'tools' || mode === 'aim') mode = 'orders';
      else { mode = 'crew'; selected = null; }
      shell.sfx.play('click');
      return;
    }
    const crew = crewById(state, selected);
    if (!crew) return;
    if (id === 'tools') { mode = 'tools'; shell.sfx.play('click'); return; }
    if (id.startsWith('tool:')) {
      const tool = id.slice(5);
      if (tool === 'noisemaker') { mode = 'aim'; shell.sfx.play('click'); return; }
      setOrder(crew, { kind: 'tool', tool });
      mode = 'crew';
      selected = null;
      return;
    }
    setOrder(crew, { kind: id });
    mode = 'crew';
    selected = null;
  };

  // Map taps: a destination for the selected crew member, or a room to lob a
  // noisemaker into.
  const tapMap = (point) => {
    const crew = selected ? crewById(state, selected) : null;
    if (!crew) return;
    const target = ROOMS.find((r) => inRect(point, roomRect(r.id)));
    if (!target) return;
    if (mode === 'aim') {
      if (!neighbors(state, crew.room, crew.id).includes(target.id)) {
        say('TOO FAR TO THROW');
        return;
      }
      setOrder(crew, { kind: 'tool', tool: 'noisemaker', to: target.id });
      mode = 'crew';
      selected = null;
      return;
    }
    if (mode !== 'orders') return;
    if (target.id === crew.room) return;
    if (!reachable(state, crew).includes(target.id)) {
      say(`${crew.name} CANNOT REACH ${target.name}`);
      return;
    }
    setOrder(crew, { kind: 'move', to: target.id });
    mode = 'crew';
    selected = null;
  };

  // --- zoom ----------------------------------------------------------------
  //
  // The overlay has to be readable without hover, and on a small screen that
  // means being able to magnify it. Focus follows the selection.
  const viewTransform = () => {
    if (!zoom) return { scale: 1, dx: 0, dy: 0 };
    const scale = 1.7;
    const focusRoom = selected ? crewById(state, selected)?.room : liveCrew()[0]?.room;
    const focus = roomCentre(focusRoom ?? 'street');
    let dx = MAP_VIEW.x + MAP_VIEW.w / 2 - focus.x * scale;
    let dy = MAP_VIEW.y + MAP_VIEW.h / 2 - focus.y * scale;
    // Keep the building covering the window rather than drifting off it.
    const left = MAP.x - 10;
    const top = MAP.y - 10;
    const right = MAP.x + 5 * MAP.cellW + MAP.w + 10;
    const bottom = MAP.y + 2 * MAP.cellH + MAP.h + 10;
    dx = Math.min(MAP_VIEW.x - left * scale, Math.max(MAP_VIEW.x + MAP_VIEW.w - right * scale, dx));
    dy = Math.min(MAP_VIEW.y - top * scale, Math.max(MAP_VIEW.y + MAP_VIEW.h - bottom * scale, dy));
    return { scale, dx, dy };
  };

  const toMapSpace = (p) => {
    const v = viewTransform();
    return { x: (p.x - v.dx) / v.scale, y: (p.y - v.dy) / v.scale };
  };

  return {
    id: 'vault-heist',
    title: 'VAULT HEIST',
    blurb: 'Plan the whole crew. Nothing the guards do is a surprise.',

    init(ctx) {
      shell = ctx;
      clock = 0;
      reported = false;
      phase = 'brief';
      zoom = false;
      flash = '';
      flashT = 0;
      // A seed the player can read off the brief card and play again.
      startHeist(((Date.now() / 1000) | 0) % 9973 || 1);
    },

    update(dt, input) {
      clock += dt;
      if (flashT > 0) flashT -= dt;

      if (phase === 'brief') {
        if (input.pressed('action') || input.pointer.justDown) {
          phase = 'plan';
          shell.sfx.play('start');
        }
        return;
      }

      if (phase === 'resolve') {
        resolveT += dt;
        if (resolveT >= 0.5) {
          phase = state.over ? 'over' : 'plan';
          resolved = null;
          refresh();
          if (state.over && !reported) {
            reported = true;
            shell.sfx.play(state.outcome === 'win' ? 'fanfare' : 'death');
            if (state.outcome !== 'win') shell.shake(9);
            shell.endGame(terminalScore(state));
          }
        }
        return;
      }

      // Keyboard is a courtesy path; the game is designed thumb-first.
      if (phase === 'plan') {
        const crew = liveCrew();
        for (let i = 0; i < crew.length; i += 1) {
          if (input.pressed(String(i + 1))) {
            selected = crew[i].id;
            mode = 'orders';
            shell.sfx.play('move');
          }
        }
        if (input.pressed('action')) {
          if (mode === 'crew') commitTurn();
          else { mode = 'crew'; selected = null; }
          return;
        }
      }
      if (input.pressed('z')) zoom = !zoom;

      if (input.pointer.justDown) {
        const p = { x: input.pointer.x, y: input.pointer.y };
        const hit = buttonRects().find((b) => inRect(p, b));
        if (hit) {
          tapButton(hit.id);
          return;
        }
        if (phase === 'plan' && p.y < BAR.y) tapMap(toMapSpace(p));
      }
    },

    draw(ctx) {
      const pal = shell.palette;
      const text = createTextPainter(ctx, pal);

      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, W, H);

      if (phase === 'brief') {
        drawBrief(ctx, text, pal);
        return;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(MAP_VIEW.x, MAP_VIEW.y, MAP_VIEW.w, MAP_VIEW.h);
      ctx.clip();
      const view = viewTransform();
      ctx.translate(view.dx, view.dy);
      ctx.scale(view.scale, view.scale);
      drawMap(ctx, text, pal);
      ctx.restore();

      drawHud(ctx, text, pal);
      drawBar(ctx, text, pal);
      if (phase === 'over') drawResult(ctx, text, pal);
    },

    destroy() {
      shell = null;
      state = null;
      orders = {};
      preview = null;
      resolved = null;
      selected = null;
    },
  };

  // --- painting ------------------------------------------------------------

  function drawBrief(ctx, text, pal) {
    const target = state.loot.find((l) => l.target);
    text('VAULT HEIST', W / 2, 128, { size: 34, color: pal.amber, bold: true, glow: 14 });
    text('EVERY GUARD MOVE IS ON THE TABLE BEFORE YOU COMMIT', W / 2, 162, { size: 12, color: pal.cream });
    const lines = [
      `TONIGHT'S TAKE   ${target.name}${target.fragile ? '  (FRAGILE — A CHARGE WILL SHATTER IT)' : ''}`,
      'TAP A NAME, TAP A ROOM, THEN RUN THE TURN',
      'RED MARKS WHERE A GUARD WILL BE AND WHAT HE WILL SEE',
      'COVER LETS YOU HIDE. CORRIDORS DO NOT.',
      `${CFG.TURN_LIMIT} TURNS. EVERY TURN COSTS 2,000.`,
    ];
    lines.forEach((line, i) => {
      text(line, W / 2, 214 + i * 26, { size: 13, color: i === 0 ? pal.amber : pal.cream });
    });
    text(`VAULT ${state.seed}`, W / 2, 372, { size: 12, color: pal.periwinkle });
    if (Math.floor(clock * 2) % 2 === 0) {
      text('TAP TO CASE THE BUILDING', W / 2, 416, { size: 15, color: pal.cream, bold: true, glow: 8 });
    }
  }

  function drawMap(ctx, text, pal) {
    const watched = new Set();
    if (preview) for (const guard of preview.guards) for (const id of guard.watches) watched.add(id);
    const spots = highlighted();
    const camerasOn = camerasLive(state);

    // Doorways first, so rooms sit on top of them. Drawn straight off the
    // simulation's edge table, so a doorway can never appear on screen that
    // the rules do not honour.
    for (const [a, b, kind] of EDGES) {
      const from = roomCentre(a);
      const to = roomCentre(b);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      if (kind === 'vent') {
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = tint(pal.periwinkle, 0.5);
        ctx.lineWidth = 2;
      } else if (kind === 'vault') {
        ctx.setLineDash([]);
        ctx.strokeStyle = state.vaultOpen ? tint(pal.amber, 0.85) : tint(pal.rose, 0.8);
        ctx.lineWidth = 6;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = tint(pal.cream, 0.16);
        ctx.lineWidth = 3;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const spot of ROOMS) {
      const r = roomRect(spot.id);
      const hot = watched.has(spot.id);
      const pick = spots.includes(spot.id);

      ctx.fillStyle = hot ? tint(pal.rose, 0.2) : tint(pal.cream, 0.05);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.lineWidth = pick ? 3 : 1;
      ctx.strokeStyle = pick ? pal.amber : (hot ? tint(pal.rose, 0.75) : pal.hairline);
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      if (pick) {
        ctx.fillStyle = tint(pal.amber, 0.12 + 0.06 * Math.sin(clock * 6));
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }

      text(spot.name, r.x + r.w / 2, r.y + 16, { size: 10, color: hot ? pal.rose : pal.cream, bold: true });

      // Cover is the difference between a place to wait and a corridor.
      if (spot.cover) {
        ctx.fillStyle = tint(pal.periwinkle, 0.5);
        ctx.fillRect(r.x + 5, r.y + 5, 7, 3);
      }
      if (spot.extraction) {
        ctx.fillStyle = state.extractionOpen ? tint(pal.amber, 0.9) : tint(pal.rose, 0.9);
        ctx.fillRect(r.x + r.w - 13, r.y + 4, 8, 8);
      }
      if (spot.console) {
        ctx.strokeStyle = state.camerasDead && spot.console === 'cameras' ? tint(pal.cream, 0.3) : pal.deep;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 6, r.y + r.h - 15, 11, 9);
      }
      if (CAMERAS.includes(spot.id)) {
        ctx.fillStyle = camerasOn ? pal.deep : tint(pal.cream, 0.22);
        ctx.beginPath();
        ctx.arc(r.x + r.w - 12, r.y + r.h - 11, 5, 0, Math.PI * 2);
        ctx.fill();
        if (camerasOn) {
          ctx.strokeStyle = tint(pal.deep, 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(r.x + r.w - 12, r.y + r.h - 11, 8 + Math.sin(clock * 3) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Loot still sitting in the room.
      const spoils = lootInRoom(state, spot.id);
      if (spoils.length > 0) {
        spoils.forEach((prize, i) => {
          ctx.fillStyle = prize.target ? pal.amber : tint(pal.amber, 0.55);
          ctx.fillRect(r.x + r.w / 2 - 4 + i * 10, r.y + r.h - 16, 8, 8);
        });
      }
    }

    // Guards: where they are, where they step, and what they will be looking
    // at when they get there. This is the readable core of the whole game.
    if (preview) {
      for (const guard of preview.guards) {
        const from = roomCentre(guard.from);
        const to = roomCentre(guard.to);
        if (guard.from !== guard.to) {
          ctx.strokeStyle = tint(pal.rose, 0.75);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          ctx.fillStyle = pal.rose;
          ctx.beginPath();
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(to.x - Math.cos(angle - 0.45) * 12, to.y - Math.sin(angle - 0.45) * 12);
          ctx.lineTo(to.x - Math.cos(angle + 0.45) * 12, to.y - Math.sin(angle + 0.45) * 12);
          ctx.closePath();
          ctx.fill();
        }
        // Solid pip = now. Hollow pip = next turn.
        ctx.fillStyle = tint(pal.rose, 0.9);
        ctx.beginPath();
        ctx.arc(from.x, from.y + 6, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pal.rose;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(to.x, to.y + 6, 10, 0, Math.PI * 2);
        ctx.stroke();
        text(guard.name[0], from.x, from.y + 10, { size: 10, color: pal.ink, bold: true });
        // Letter the destination too. With three patrols converging on one
        // clatter, an unlabelled ring is unreadable — and the whole point is
        // knowing which of them is about to be standing on you.
        if (guard.to !== guard.from) {
          text(guard.name[0], to.x, to.y + 10, { size: 10, color: pal.rose, bold: true });
        }

        // The eye: the one extra room he can see from where he lands.
        if (guard.watches.includes(guard.facing) && guard.facing !== guard.to) {
          const eye = roomCentre(guard.facing);
          ctx.strokeStyle = tint(pal.rose, 0.6);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(to.x, to.y + 6);
          ctx.lineTo(eye.x, eye.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.ellipse(eye.x, eye.y - 20, 9, 5, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = pal.rose;
          ctx.beginPath();
          ctx.arc(eye.x, eye.y - 20, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Crew, and where their queued order puts them. Three people share the
    // STREET on turn one and often share a room after that, so each gets a
    // slot within the room rather than being drawn on top of the last.
    const lerp = phase === 'resolve' ? Math.min(1, resolveT / 0.4) : 0;
    const slotIn = (id, at) => {
      const here = state.crew.filter((c) => !c.captured && !c.extracted && c.room === id);
      const seat = here.findIndex((c) => c.id === at);
      if (seat < 0 || here.length < 2) return 0;
      return (seat - (here.length - 1) / 2) * 22;
    };
    for (const crew of state.crew) {
      if (crew.captured || crew.extracted) continue;
      const ink = pal[CREW_INK[crew.id]];
      const centre = roomCentre(crew.room);
      let at = { x: centre.x + slotIn(crew.room, crew.id), y: centre.y };
      if (phase === 'resolve' && resolved) {
        const move = resolved.moves.find((m) => m.id === crew.id);
        if (move && move.from !== move.to) {
          const a = roomCentre(move.from);
          const b = roomCentre(move.to);
          at = { x: a.x + (b.x - a.x) * lerp, y: a.y + (b.y - a.y) * lerp };
        }
      }
      // Guards sit low in the room; crew sit high. Two populations, two rows,
      // so a pip is never ambiguous about which side it is on.
      at = { x: at.x, y: at.y - 4 };
      const order = orders[crew.id];
      if (phase === 'plan' && order && order.kind === 'move') {
        const dest = roomCentre(order.to);
        ctx.strokeStyle = tint(ink, 0.8);
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(at.x, at.y);
        ctx.lineTo(dest.x, dest.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dest.x, dest.y - 8, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      const caught = preview && preview.detections.some((d) => d.crew === crew.id);
      const seen = preview && preview.spotted.some((d) => d.crew === crew.id);
      ctx.fillStyle = ink;
      if (caught && Math.floor(clock * 8) % 2 === 0) ctx.fillStyle = pal.rose;
      ctx.beginPath();
      ctx.arc(at.x, at.y - 8, 10, 0, Math.PI * 2);
      ctx.fill();
      text(crew.name[0], at.x, at.y - 4, { size: 11, color: pal.ink, bold: true });
      if (crew.hiding) {
        ctx.strokeStyle = tint(pal.cream, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(at.x, at.y - 8, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (carriedBy(state, crew.id).length > 0) {
        ctx.fillStyle = pal.amber;
        ctx.fillRect(at.x + 8, at.y - 18, 7, 7);
      }
      if (caught || seen) {
        // Stagger the warning by seat, or two people in one room print their
        // labels on top of each other and neither is legible.
        const seat = state.crew.filter((c) => !c.captured && !c.extracted && c.room === crew.room)
          .findIndex((c) => c.id === crew.id);
        text(caught ? 'SEEN' : 'LENS', at.x, at.y + 16 + Math.max(0, seat) * 10, {
          size: 9, color: pal.rose, bold: true,
        });
      }
    }
  }

  function drawHud(ctx, text, pal) {
    ctx.fillStyle = tint(pal.cream, 0.04);
    ctx.fillRect(0, 0, W, 76);
    const b = scoreBreakdown(state);
    const target = state.loot.find((l) => l.target);

    text(`TURN ${state.turn}/${CFG.TURN_LIMIT}`, 14, 24, { align: 'left', size: 13, color: pal.cream, bold: true });
    // Gate on `over`, not on truthiness: a failed heist scores zero, and
    // falling back to the running total there would print a healthy TAKE
    // behind a SCORE 0 card.
    text(`TAKE ${state.over ? terminalScore(state) : projectedScore()}`, 14, 44, {
      align: 'left', size: 13, color: pal.amber, bold: true,
    });
    text(`KIT ${totalTools(state.tools)}/${totalTools(state.toolsStart)}`, 14, 62, {
      align: 'left', size: 11, color: pal.periwinkle,
    });

    const status = state.vaultOpen
      ? (target.extracted ? 'TAKE IS OUT' : (target.carriedBy ? 'TAKE IN HAND' : 'VAULT OPEN'))
      : `VAULT DOOR ${state.drillProgress}/${CFG.DRILL_TURNS}`;
    text(status, W / 2, 24, { size: 13, color: pal.cream, bold: true });
    text(camerasLive(state) ? 'LENSES LIVE' : 'LENSES BLIND', W / 2, 44, {
      size: 12, color: camerasLive(state) ? pal.deep : tint(pal.cream, 0.55), bold: true,
    });

    // The cabinet's eject button floats over the top-right of the glass, and
    // it is not a fixed size: about 32 canvas units square on a desktop but 66
    // on a landscape handset, where it swallowed this whole column. Both rows
    // stop well clear of the widest case rather than of the one being looked at.
    const RIGHT = W - 92;
    if (state.alarms > 0) {
      const urgent = state.lockdown >= 0 && state.lockdown <= 3;
      text(`ALARM x${state.alarms}`, RIGHT, 24, {
        align: 'right', size: 13, color: pal.rose, bold: true, glow: urgent ? 9 : 0,
      });
      if (state.lockdown >= 0) {
        text(`LOCKDOWN ${state.lockdown}`, RIGHT, 44, {
          align: 'right', size: 13, color: urgent ? pal.rose : pal.amber, bold: true,
        });
      }
    } else {
      text('QUIET', RIGHT, 24, { align: 'right', size: 13, color: pal.periwinkle, bold: true });
      text(`OBJ ${b.objectives}/2`, RIGHT, 44, { align: 'right', size: 12, color: pal.amber });
    }

    // The one line that says whether the turn you have queued is survivable.
    if (phase === 'plan' && preview) {
      const bad = preview.detections.length > 0;
      const lens = preview.spotted.length > 0;
      const note = bad
        ? `${preview.detections.map((d) => d.name).join(', ')} WILL BE TAKEN`
        : (lens ? 'A LENS WILL CATCH YOU — ONE ALARM' : 'THIS TURN IS CLEAN');
      text(note, W / 2, 66, {
        size: 12, color: bad ? pal.rose : (lens ? pal.amber : pal.periwinkle), bold: true,
        glow: bad ? 8 : 0,
      });
    }
    if (flashT > 0) {
      text(flash, W / 2, H - 96, { size: 12, color: pal.amber, bold: true });
    }
  }

  function projectedScore() {
    const b = scoreBreakdown(state);
    return Math.max(
      0,
      b.loot + b.crew + b.objectiveBonus + b.toolBonus + b.turnCost + b.alarmCost,
    );
  }

  function drawBar(ctx, text, pal) {
    const rects = buttonRects();
    if (rects.length === 0) return;
    ctx.fillStyle = tint(pal.cream, 0.05);
    ctx.fillRect(0, BAR.y - 6, W, BAR.h + 12);
    for (const b of rects) {
      const ink = pal[b.tone] ?? pal.cream;
      const chosen = b.id.startsWith('crew:') && orders[b.id.slice(5)];
      ctx.fillStyle = tint(ink, chosen ? 0.24 : 0.12);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = ink;
      ctx.lineWidth = b.id === 'go' ? 2.5 : 1.5;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      text(b.label, b.x + b.w / 2, b.y + (b.sub ? 34 : 48), {
        size: b.label.length > 7 ? 13 : 15, color: ink, bold: true,
      });
      if (b.sub) {
        text(b.sub, b.x + b.w / 2, b.y + 58, { size: 10, color: tint(pal.cream, 0.7) });
      }
    }
    if (mode === 'aim') {
      text('TAP A ROOM NEXT DOOR TO THROW INTO', W / 2, BAR.y - 12, { size: 11, color: pal.amber, bold: true });
    } else if (mode === 'orders' && selected) {
      const crew = crewById(state, selected);
      text(`${crew.name} — TAP A ROOM TO MOVE, OR PICK AN ACTION`, W / 2, BAR.y - 12, {
        size: 11, color: pal[CREW_INK[crew.id]], bold: true,
      });
    }
  }

  function drawResult(ctx, text, pal) {
    ctx.fillStyle = tint(pal.ink, 0.95);
    ctx.fillRect(0, 0, W, H);
    const won = state.outcome === 'win';
    const b = scoreBreakdown(state);
    text(won ? 'CLEAN AWAY' : 'THE JOB IS BLOWN', W / 2, 132, {
      size: 30, color: won ? pal.amber : pal.rose, bold: true, glow: 12,
    });
    // On a win the reason IS the headline, so show the seed instead — it is
    // the thing worth carrying away and running again.
    text(won ? `VAULT ${state.seed} IN ${state.turn} TURNS` : state.reason, W / 2, 164, {
      size: 13, color: pal.cream,
    });
    const rows = [
      [`TAKE ${b.lootValue.toLocaleString()}`, `${b.loot.toLocaleString()}`],
      [`CREW OUT ${b.survivors}`, `${b.crew.toLocaleString()}`],
      [`OBJECTIVES ${b.objectives}`, `${b.objectiveBonus.toLocaleString()}`],
      [`KIT UNSPENT ${b.unusedTools}`, `${b.toolBonus.toLocaleString()}`],
      [`TURNS ${b.turns}`, `${b.turnCost.toLocaleString()}`],
      [`ALARMS ${b.alarms}`, `${b.alarmCost.toLocaleString()}`],
    ];
    rows.forEach(([label, amount], i) => {
      const y = 208 + i * 22;
      text(label, 176, y, { align: 'left', size: 12, color: tint(pal.cream, 0.8) });
      text(amount, 464, y, { align: 'right', size: 12, color: pal.cream });
    });
    text(`SCORE ${terminalScore(state)}`, W / 2, 356, {
      size: 20, color: won ? pal.amber : tint(pal.cream, 0.6), bold: true, glow: won ? 10 : 0,
    });
    if (!won) text('A FAILED HEIST SCORES NOTHING', W / 2, 376, { size: 11, color: pal.rose });
  }
}

export default createVaultHeist;
