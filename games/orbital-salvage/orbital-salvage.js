// ORBITAL SALVAGE cartridge — sling a fragile tug through a rotating junk
// field, tether wreckage, and haul the extra mass home. All rules live in
// logic.js; this module owns projection, input mapping, and juice.

import {
  CFG,
  applyBurn,
  burnFromDrag,
  carrierPosition,
  debrisPosition,
  missionScore,
  nearestTetherable,
  newGame,
  previewTrajectory,
  radiusOf,
  step,
  toggleTether,
  totalMass,
  wreckPosition,
} from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const TETHER_BTN = { x: CFG.W - 148, y: CFG.H - 92, w: 130, h: 74 };

const OUTCOME_TEXT = {
  complete: ['CONTRACT COMPLETE', 'salvage delivered — tug secured'],
  hull: ['HULL LOST', 'the tug broke up in the junk field'],
  'burn-up': ['ORBIT FAILED', 'the tug burned up in the well'],
  adrift: ['ORBIT FAILED', 'the tug drifted beyond recovery'],
  cargo: ['CARGO DESTROYED', 'the contract died with the wreck'],
  stranded: ['TUG STRANDED', 'reserve power exhausted'],
};

export function createOrbitalSalvage() {
  let shell = null;
  let state = null;
  let stars = [];
  let particles = [];
  let t = 0;
  let reported = false;
  let aim = null; // { sx, sy, x, y } while the player drags a burn
  let flashT = 0;

  function inTetherButton(p) {
    return (
      p.x >= TETHER_BTN.x && p.x <= TETHER_BTN.x + TETHER_BTN.w &&
      p.y >= TETHER_BTN.y && p.y <= TETHER_BTN.y + TETHER_BTN.h
    );
  }

  function burnParticles(dvx, dvy) {
    const len = Math.hypot(dvx, dvy) || 1;
    for (let i = 0; i < 14; i += 1) {
      const spread = (Math.random() - 0.5) * 0.7;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const dx = -dvx / len;
      const dy = -dvy / len;
      const speed = 50 + Math.random() * 60;
      particles.push({
        x: state.tug.x,
        y: state.tug.y,
        vx: (dx * cos - dy * sin) * speed,
        vy: (dx * sin + dy * cos) * speed,
        life: 0.3 + Math.random() * 0.2,
      });
    }
  }

  function drawPath(ctx, preview, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < preview.points.length; i += 1) {
      const p = preview.points[i];
      const fade = 1 - i / preview.points.length;
      ctx.globalAlpha = alpha * (0.35 + 0.65 * fade);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawBar(ctx, pal, x, y, w, label, value, color, text) {
    text(label, x, y - 4, { align: 'left', size: 9, color: pal.periwinkle });
    ctx.strokeStyle = pal.hairline;
    ctx.strokeRect(x, y, w, 7);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, Math.max(0, Math.min(1, value)) * (w - 2), 5);
  }

  return {
    id: 'orbital-salvage',
    title: 'ORBITAL SALVAGE',
    blurb: 'Every wreck you tether rewrites the route home.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      t = 0;
      reported = false;
      aim = null;
      flashT = 0;
      particles = [];
      stars = Array.from({ length: 90 }, () => ({
        x: Math.random() * CFG.W,
        y: Math.random() * CFG.H,
        r: Math.random() < 0.12 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
      }));
    },
    update(dt, input) {
      t += dt;
      flashT = Math.max(0, flashT - dt);

      if (state.over) {
        aim = null;
        if (!reported) {
          reported = true;
          shell.endGame(state.score);
        }
        return;
      }

      // Tether: large touch button or T key.
      const tapTether = input.pointer.justDown && inTetherButton(input.pointer);
      if (tapTether || input.pressed('t')) {
        const events = toggleTether(state);
        if (events.includes('tether')) shell.sfx.play('capsule');
        else if (events.includes('release')) shell.sfx.play('click');
      }

      // Aim: press anywhere else, drag a vector, release to burn. The
      // simulation pauses while aiming so planning is a real planning phase.
      if (input.pointer.justDown && !tapTether && !inTetherButton(input.pointer)) {
        aim = { sx: input.pointer.x, sy: input.pointer.y, x: input.pointer.x, y: input.pointer.y };
      }
      if (aim && input.pointer.down) {
        aim.x = input.pointer.x;
        aim.y = input.pointer.y;
      }
      if (aim && input.pointer.justUp) {
        const events = applyBurn(state, aim.x - aim.sx, aim.y - aim.sy);
        if (events.includes('burn')) {
          shell.sfx.play('launch');
          burnParticles(aim.x - aim.sx, aim.y - aim.sy);
        }
        aim = null;
      }

      particles = particles.filter((p) => (p.life -= dt) > 0);
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      if (aim) return; // planning pause: the field holds still while you aim

      const rcs = {
        x: (input.down('left') ? -1 : 0) + (input.down('right') ? 1 : 0),
        y: (input.down('up') ? -1 : 0) + (input.down('down') ? 1 : 0),
      };
      const events = step(state, dt, { rcs });

      if (events.includes('collision')) {
        shell.sfx.play('boom');
        shell.shake(7);
        flashT = 0.4;
      }
      if (events.includes('overheat')) shell.sfx.play('zap');
      if (events.includes('deposit')) shell.sfx.play('score');
      if (events.includes('complete')) shell.sfx.play('fanfare');
      if (events.includes('game-over')) {
        shell.sfx.play(state.outcome === 'stranded' ? 'lose' : 'bigboom');
        shell.shake(state.outcome === 'stranded' ? 2 : 10);
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      const text = createTextPainter(ctx, pal);

      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, '#070913');
      sky.addColorStop(1, '#101226');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      for (const star of stars) {
        const alpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.1 + star.phase));
        ctx.fillStyle = `rgba(243,235,221,${alpha.toFixed(2)})`;
        ctx.fillRect(star.x, star.y, star.r, star.r);
      }

      // Heat zone, atmosphere, planet, escape leash — the whole board is rings.
      const heatGlow = ctx.createRadialGradient(
        CFG.CX, CFG.CY, CFG.ATMO_R, CFG.CX, CFG.CY, CFG.HEAT_R,
      );
      heatGlow.addColorStop(0, 'rgba(230,193,126,0.20)');
      heatGlow.addColorStop(1, 'rgba(230,193,126,0)');
      ctx.fillStyle = heatGlow;
      ctx.beginPath();
      ctx.arc(CFG.CX, CFG.CY, CFG.HEAT_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(212,129,143,0.5)';
      ctx.beginPath();
      ctx.arc(CFG.CX, CFG.CY, CFG.ATMO_R, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#1c2040';
      ctx.beginPath();
      ctx.arc(CFG.CX, CFG.CY, CFG.PLANET_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pal.deep;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(124,136,232,0.35)';
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.arc(CFG.CX, CFG.CY + i * 3, CFG.PLANET_R, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }

      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = 'rgba(212,129,143,0.4)';
      ctx.beginPath();
      ctx.arc(CFG.CX, CFG.CY, CFG.ESCAPE_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Trajectory: the current coast faint, the pending burn bright.
      const coast = previewTrajectory(state, 0, 0);
      drawPath(ctx, coast, pal.periwinkle, 0.4);
      let pendingBurn = null;
      if (aim) {
        pendingBurn = burnFromDrag(state, aim.x - aim.sx, aim.y - aim.sy);
        if (pendingBurn) {
          const planned = previewTrajectory(state, pendingBurn.dvx, pendingBurn.dvy);
          drawPath(ctx, planned, pal.amber, 0.9);
        }
      }

      // Debris clusters: rotating junk, drawn as tumbling plates.
      for (const cluster of state.debris) {
        const p = debrisPosition(cluster);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(cluster.angle * 3);
        ctx.fillStyle = 'rgba(159,168,232,0.28)';
        ctx.fillRect(-cluster.radius, -cluster.radius, cluster.radius * 2, cluster.radius * 2);
        ctx.strokeStyle = pal.periwinkle;
        ctx.strokeRect(-cluster.radius, -cluster.radius, cluster.radius * 2, cluster.radius * 2);
        ctx.restore();
      }

      // Field wrecks pulse when tetherable.
      const tetherable = nearestTetherable(state);
      for (const wreck of state.wrecks) {
        if (wreck.state !== 'field') continue;
        const p = wreckPosition(wreck);
        const hot = tetherable && tetherable.id === wreck.id;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        if (hot) {
          ctx.shadowColor = pal.amber;
          ctx.shadowBlur = 12;
        }
        ctx.fillStyle = hot ? pal.amber : 'rgba(230,193,126,0.55)';
        ctx.fillRect(-7, -7, 14, 14);
        ctx.restore();
        ctx.shadowBlur = 0;
        text(`${wreck.label} · ${wreck.value}`, p.x, p.y - 16, {
          size: 9,
          color: hot ? pal.amber : pal.periwinkle,
        });
      }

      // Carrier: the moving home dock.
      const cp = carrierPosition(state);
      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.rotate(state.carrier.angle + Math.PI / 2);
      ctx.fillStyle = pal.periwinkle;
      ctx.fillRect(-16, -6, 32, 12);
      ctx.fillStyle = pal.cream;
      ctx.fillRect(-4, -10, 8, 20);
      ctx.restore();
      ctx.strokeStyle = 'rgba(159,168,232,0.4)';
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, CFG.DOCK_RANGE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      text('CARRIER', cp.x, cp.y - CFG.DOCK_RANGE - 6, { size: 9, color: pal.periwinkle });

      // Exhaust, then cargo + tether, then the tug on top.
      for (const p of particles) {
        ctx.globalAlpha = Math.min(1, p.life * 3);
        ctx.fillStyle = pal.amber;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      if (state.cargo) {
        ctx.strokeStyle = pal.cream;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(state.tug.x, state.tug.y);
        ctx.lineTo(state.cargo.x, state.cargo.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(state.cargo.x, state.cargo.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = pal.amber;
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 8;
        ctx.fillRect(-CFG.CARGO_R + 1, -CFG.CARGO_R + 1, CFG.CARGO_R * 2 - 2, CFG.CARGO_R * 2 - 2);
        ctx.restore();
        ctx.shadowBlur = 0;
      }

      const heading = Math.atan2(state.tug.vy, state.tug.vx);
      const blink = state.invuln > 0 && Math.floor(t * 12) % 2 === 0;
      ctx.save();
      ctx.translate(state.tug.x, state.tug.y);
      ctx.rotate(heading + Math.PI / 2);
      ctx.fillStyle = blink ? pal.rose : pal.cream;
      ctx.shadowColor = pal.cream;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(-6, 7);
      ctx.lineTo(6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;

      // Aim arrow.
      if (aim && pendingBurn) {
        const len = Math.hypot(aim.x - aim.sx, aim.y - aim.sy) || 1;
        const capped = Math.min(len, CFG.MAX_DRAG);
        const ex = state.tug.x + ((aim.x - aim.sx) / len) * capped;
        const ey = state.tug.y + ((aim.y - aim.sy) / len) * capped;
        ctx.strokeStyle = pal.amber;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(state.tug.x, state.tug.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.lineWidth = 1;
        text(
          `ΔV ${pendingBurn.effectiveDv.toFixed(1)} · FUEL -${pendingBurn.fuelCost.toFixed(0)}`,
          state.tug.x,
          state.tug.y - 18,
          { size: 10, color: pal.amber, bold: true },
        );
      }

      if (flashT > 0) {
        ctx.fillStyle = `rgba(212,129,143,${(flashT * 0.5).toFixed(2)})`;
        ctx.fillRect(0, 0, CFG.W, CFG.H);
      }

      // --- HUD ---
      drawBar(ctx, pal, 14, 22, 110, `FUEL ${Math.ceil(state.fuel)}`, state.fuel / CFG.FUEL,
        state.fuel < 25 ? pal.rose : pal.amber, text);
      drawBar(ctx, pal, 14, 46, 110, `HULL ${Math.round(state.hull)}%`, state.hull / 100,
        state.hull < 35 ? pal.rose : pal.cream, text);
      drawBar(ctx, pal, 14, 70, 110, 'HEAT', state.heat / CFG.HEAT_MAX,
        state.heat > 70 ? pal.rose : pal.deep, text);

      text(`SALVAGE ${state.dockedValue}/${state.contract}`, CFG.W / 2, 24, {
        color: state.dockedValue >= state.contract ? pal.amber : pal.cream,
        bold: true,
        glow: 4,
      });
      text(`PROJ SCORE ${missionScore(state)}`, CFG.W / 2, 44, { size: 11, color: pal.periwinkle });

      // The shell's DOM eject button owns the top-right corner (and grows
      // relative to the canvas on phones), so the mass readout lives in the
      // left HUD column where nothing can cover it.
      const mass = totalMass(state);
      const heavy = state.cargo !== null;
      text(`MASS ${mass}${heavy ? ' · HEAVY' : ''}`, 14, 96, {
        align: 'left',
        color: heavy ? pal.amber : pal.periwinkle,
        bold: heavy,
      });
      const mm = Math.floor(state.t / 60);
      const ss = Math.floor(state.t % 60).toString().padStart(2, '0');
      text(`T+${mm}:${ss}`, 14, 114, { align: 'left', size: 11, color: pal.rose });

      if (state.heat >= CFG.HEAT_MAX * 0.99) {
        text('OVERHEATING — CLIMB', CFG.W / 2, 76, { size: 13, color: pal.rose, bold: true, glow: 8 });
      } else if (radiusOf(state.tug) > CFG.ESCAPE_R - 40 && !state.over) {
        text('LEAVING RECOVERY RANGE', CFG.W / 2, 76, { size: 13, color: pal.rose, bold: true });
      }
      if (state.fuel <= 0 && !state.over) {
        text(`RESERVE POWER ${Math.ceil(CFG.DRIFT_GRACE - state.emptyFor)}s`, CFG.W / 2, 96, {
          size: 13, color: pal.rose, bold: true, glow: 6,
        });
      }

      // Tether button — the one large touch control.
      const carrying = state.cargo !== null;
      const canTether = !carrying && tetherable !== null;
      ctx.fillStyle = canTether || carrying ? 'rgba(230,193,126,0.12)' : 'rgba(233,236,244,0.03)';
      ctx.beginPath();
      ctx.roundRect(TETHER_BTN.x, TETHER_BTN.y, TETHER_BTN.w, TETHER_BTN.h, 10);
      ctx.fill();
      ctx.strokeStyle = canTether ? pal.amber : carrying ? pal.cream : pal.hairline;
      ctx.stroke();
      text(carrying ? 'RELEASE' : 'TETHER', TETHER_BTN.x + TETHER_BTN.w / 2,
        TETHER_BTN.y + 32, {
          size: 16,
          bold: true,
          color: canTether ? pal.amber : carrying ? pal.cream : pal.periwinkle,
          glow: canTether ? 8 : 0,
        });
      text('tap or T', TETHER_BTN.x + TETHER_BTN.w / 2, TETHER_BTN.y + 54, {
        size: 10, color: pal.rose,
      });

      if (aim) {
        text('PLANNING — release to burn', CFG.W / 2, CFG.H - 16, { size: 11, color: pal.amber });
      } else if (!state.over) {
        text('drag to plan a burn · arrows trim · T tether', CFG.W / 2, CFG.H - 16, {
          size: 11, color: pal.rose,
        });
      }

      if (state.over) {
        const [headline, detail] = OUTCOME_TEXT[state.outcome] ?? ['MISSION OVER', ''];
        ctx.fillStyle = 'rgba(11,12,20,0.55)';
        ctx.fillRect(0, 150, CFG.W, 120);
        text(headline, CFG.W / 2, 196, {
          size: 26,
          color: state.win ? pal.amber : pal.rose,
          bold: true,
          glow: 12,
        });
        text(detail, CFG.W / 2, 224, { size: 12, color: pal.cream });
        text(`FINAL SCORE ${state.score} · T+${mm}:${ss}`, CFG.W / 2, 248, {
          size: 12, color: pal.periwinkle,
        });
      }
    },
    destroy() {
      shell = null;
      state = null;
      stars = [];
      particles = [];
      aim = null;
    },
  };
}
