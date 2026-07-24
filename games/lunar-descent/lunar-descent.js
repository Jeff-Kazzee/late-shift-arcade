// LUNAR DESCENT cartridge — a precision landing run over a shifting moon.

import { CFG, landingAssessment, newGame, step, terrainHeight } from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

export function createLunarDescent() {
  let shell = null;
  let state = null;
  let stars = [];
  let particles = [];
  let t = 0;
  let reported = false;
  let thrusting = false;
  let activeControls = { left: false, right: false, thrust: false };

  function controlsFrom(input) {
    let left = input.down('left');
    let right = input.down('right');
    let thrust = input.down('up', 'space');
    for (const touch of input.touches()) {
      if (touch.y < CFG.H - 105) continue;
      if (touch.x < CFG.W / 3) left = true;
      else if (touch.x > (CFG.W * 2) / 3) right = true;
      else thrust = true;
    }
    return { left, right, thrust };
  }

  function makeParticles() {
    const { lander } = state;
    const rearX = lander.x - Math.sin(lander.angle) * 14;
    const rearY = lander.y + Math.cos(lander.angle) * 14;
    for (let i = 0; i < 2; i += 1) {
      const spread = (Math.random() - 0.5) * 0.4;
      const speed = 70 + Math.random() * 50;
      particles.push({
        x: rearX,
        y: rearY,
        vx: -Math.sin(lander.angle + spread) * speed,
        vy: Math.cos(lander.angle + spread) * speed,
        life: 0.24 + Math.random() * 0.12,
      });
    }
  }

  return {
    id: 'lunar-descent',
    title: 'LUNAR DESCENT',
    blurb: 'Spend fuel. Trust your instruments. Touch down softly.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      t = 0;
      reported = false;
      thrusting = false;
      activeControls = { left: false, right: false, thrust: false };
      particles = [];
      stars = Array.from({ length: 82 }, () => ({
        x: Math.random() * CFG.W,
        y: Math.random() * (CFG.H - 110),
        r: Math.random() < 0.14 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
      }));
    },
    update(dt, input) {
      t += dt;
      const controls = controlsFrom(input);
      activeControls = controls;
      const events = step(state, dt, controls);
      if (controls.thrust && state.phase === 'flying') makeParticles();
      if (controls.thrust && !thrusting && state.phase === 'flying') shell.sfx.play('launch');
      thrusting = controls.thrust;

      if (events.includes('landed')) {
        shell.sfx.play('fanfare');
        shell.shake(3);
      }
      if (events.includes('level-up')) shell.sfx.play('start');
      if (events.includes('crash')) {
        shell.sfx.play('bigboom');
        shell.shake(10);
      }

      particles = particles.filter((p) => (p.life -= dt) > 0);
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      if (state.over && !reported) {
        reported = true;
        shell.endGame(state.score);
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      const text = createTextPainter(ctx, pal);

      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, '#070913');
      sky.addColorStop(0.76, '#151a36');
      sky.addColorStop(1, '#242642');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      for (const star of stars) {
        const alpha = 0.3 + 0.55 * Math.abs(Math.sin(t * 1.3 + star.phase));
        ctx.fillStyle = `rgba(243,235,221,${alpha.toFixed(2)})`;
        ctx.fillRect(star.x, star.y, star.r, star.r);
      }

      // The rendered profile includes the pad, so the collision surface and
      // the moon silhouette are the same shape.
      const pad = state.terrain.pad;
      const terrainLine = [
        ...state.terrain.points.filter((point) => point.x < pad.x),
        { x: pad.x, y: pad.y },
        { x: pad.x + pad.width, y: pad.y },
        ...state.terrain.points.filter((point) => point.x > pad.x + pad.width),
      ];
      ctx.beginPath();
      ctx.moveTo(0, CFG.H);
      for (const point of terrainLine) ctx.lineTo(point.x, point.y);
      ctx.lineTo(CFG.W, CFG.H);
      ctx.closePath();
      ctx.fillStyle = '#25294a';
      ctx.fill();
      ctx.strokeStyle = pal.hairline;
      ctx.beginPath();
      terrainLine.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.shadowColor = pal.amber;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pad.x, pad.y);
      ctx.lineTo(pad.x + pad.width, pad.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;

      // exhaust trails are intentionally behind the lander body.
      for (const p of particles) {
        ctx.globalAlpha = Math.min(1, p.life * 4);
        ctx.fillStyle = pal.amber;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 5);
      }
      ctx.globalAlpha = 1;

      const { lander } = state;
      ctx.save();
      ctx.translate(lander.x, lander.y);
      ctx.rotate(lander.angle);
      ctx.shadowColor = pal.cream;
      ctx.shadowBlur = 10;
      ctx.fillStyle = pal.cream;
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(-11, 9);
      ctx.lineTo(11, 9);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = pal.periwinkle;
      ctx.beginPath();
      ctx.moveTo(-9, 8);
      ctx.lineTo(-15, 16);
      ctx.moveTo(9, 8);
      ctx.lineTo(15, 16);
      ctx.stroke();
      if (thrusting && state.phase === 'flying') {
        ctx.fillStyle = pal.amber;
        ctx.beginPath();
        ctx.moveTo(-5, 10);
        ctx.lineTo(0, 23 + (Math.floor(t * 25) % 2) * 5);
        ctx.lineTo(5, 10);
        ctx.fill();
      }
      ctx.restore();

      const assessment = landingAssessment(state);
      const cue = assessment.safe ? 'GREEN: SAFE ENVELOPE' : 'AMBER: ADJUST APPROACH';
      const cueColor = assessment.safe ? pal.cream : pal.amber;
      text(`SCORE ${state.score}`, 18, 28, { align: 'left', bold: true });
      text(`LEVEL ${state.level}`, CFG.W / 2, 28, { color: pal.periwinkle, bold: true, glow: 5 });
      text(`FUEL ${Math.ceil(state.fuel).toString().padStart(3, '0')}`, CFG.W - 18, 28, {
        align: 'right',
        color: state.fuel < 25 ? pal.rose : pal.cream,
        bold: true,
      });
      text(`VX ${lander.vx.toFixed(0).padStart(4, ' ')}  VY ${lander.vy.toFixed(0).padStart(4, ' ')}  TILT ${(lander.angle * 180 / Math.PI).toFixed(0)}°`, CFG.W / 2, 54, {
        size: 12,
        color: pal.cream,
      });
      text(cue, CFG.W / 2, 77, { size: 12, color: cueColor, glow: assessment.safe ? 5 : 0 });

      // Touch zones are drawn as held controls, leaving the playfield clear.
      const zoneY = CFG.H - 94;
      const zoneH = 76;
      const labels = ['◀ ROTATE', '▲ THRUST', 'ROTATE ▶'];
      for (let i = 0; i < 3; i += 1) {
        const x = i * (CFG.W / 3) + 8;
        const w = CFG.W / 3 - 16;
        const active = i === 0 ? activeControls.left : i === 1 ? activeControls.thrust : activeControls.right;
        if (active) {
          ctx.fillStyle = 'rgba(230,193,126,0.08)';
          ctx.fillRect(x, zoneY, w, zoneH);
        }
        ctx.strokeStyle = pal.hairline;
        ctx.strokeRect(x, zoneY, w, zoneH);
        text(labels[i], x + w / 2, zoneY + 45, { size: 12, color: active ? pal.amber : pal.periwinkle });
      }

      if (state.phase === 'settling') {
        text('TOUCHDOWN CONFIRMED', CFG.W / 2, 180, { size: 24, color: pal.amber, bold: true, glow: 12 });
        text('next descent preparing...', CFG.W / 2, 206, { size: 13, color: pal.cream });
      }
      if (state.phase === 'crashed') {
        text('HULL LOST', CFG.W / 2, 190, { size: 28, color: pal.rose, bold: true, glow: 12 });
      }
    },
    destroy() {
      state = null;
      particles = [];
    },
  };
}
