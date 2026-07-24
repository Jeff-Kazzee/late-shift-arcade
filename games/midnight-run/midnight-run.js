import { CFG, newGame, start, step, movePlayer, movePlayerTo, terminalScore } from './logic.js';
import { createTextPainter } from '../../shell/canvas-text.js';

const CAR_COLORS = ['#d4818f', '#9fa8e8', '#e6c17e'];

export function createMidnightRun() {
  let shell = null;
  let state = null;
  let t = 0;
  let reported = false;
  let sparks = [];

  const burst = (x, y) => {
    for (let i = 0; i < 22; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 190;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.35 + Math.random() * 0.35 });
    }
  };

  return {
    id: 'midnight-run',
    title: 'MIDNIGHT RUN',
    blurb: 'Thread the traffic. Chase the neon.',
    init(ctx) {
      shell = ctx;
      state = newGame();
      t = 0;
      reported = false;
      sparks = [];
    },
    update(dt, input) {
      t += dt;
      let steer = 0;
      if (input.down('left')) steer -= 1;
      if (input.down('right')) steer += 1;
      if (steer !== 0) {
        start(state);
        movePlayer(state, steer, dt);
      }
      if (input.pointer.down) {
        start(state);
        movePlayerTo(state, input.pointer.x);
      }

      const events = step(state, dt);
      if (events.includes('spawn')) shell.sfx.play('move');
      if (events.includes('pass')) shell.sfx.play('hit');
      if (events.includes('near-miss')) shell.sfx.play('score');
      if (events.includes('pickup')) shell.sfx.play('capsule');
      if (events.includes('crash')) {
        shell.sfx.play('bigboom');
        shell.shake(11);
        burst(state.player.x, CFG.PLAYER_Y);
      }
      if (events.includes('game-over')) shell.sfx.play('death');

      sparks = sparks.filter((spark) => (spark.life -= dt) > 0);
      for (const spark of sparks) {
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 180 * dt;
      }
      if (state.over && !reported) {
        reported = true;
        shell.endGame(terminalScore(state));
      }
    },
    draw(ctx) {
      const pal = shell.palette;
      const text = createTextPainter(ctx, pal);
      const horizon = 94;
      const roadBottom = CFG.H + 20;
      const roadLeft = 14;
      const roadRight = CFG.W - 14;
      const roadAt = (y) => {
        const p = Math.max(0, Math.min(1, (y - horizon) / (roadBottom - horizon)));
        return { left: 202 + (roadLeft - 202) * p, right: 438 + (roadRight - 438) * p };
      };
      const projectToRoad = (x, y) => {
        const road = roadAt(y);
        const lane = (x - CFG.ROAD_LEFT) / (CFG.ROAD_RIGHT - CFG.ROAD_LEFT);
        const depth = Math.max(0, Math.min(1, (y - horizon) / (CFG.PLAYER_Y - horizon)));
        return {
          x: road.left + (road.right - road.left) * lane,
          scale: 0.32 + depth * 0.68,
        };
      };

      const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, '#0b0c14');
      sky.addColorStop(0.46, '#221437');
      sky.addColorStop(0.58, '#5a254d');
      sky.addColorStop(0.59, '#111426');
      sky.addColorStop(1, '#070814');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      // distant skyline and streaming stars
      ctx.fillStyle = '#151831';
      for (let x = 0; x < CFG.W; x += 24) {
        const h = 14 + ((x * 17) % 44);
        ctx.fillRect(x, horizon - h, 18, h);
      }
      ctx.fillStyle = 'rgba(159,168,232,0.48)';
      for (let i = 0; i < 44; i += 1) {
        const x = (i * 89) % CFG.W;
        const y = ((i * 53 + t * (20 + (i % 5) * 14)) % (horizon - 10)) + 6;
        ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
      }

      ctx.fillStyle = '#17192c';
      ctx.beginPath();
      ctx.moveTo(202, horizon);
      ctx.lineTo(438, horizon);
      ctx.lineTo(roadRight, roadBottom);
      ctx.lineTo(roadLeft, roadBottom);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.rose;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(202, horizon);
      ctx.lineTo(roadLeft, roadBottom);
      ctx.moveTo(438, horizon);
      ctx.lineTo(roadRight, roadBottom);
      ctx.stroke();

      // perspective lane marks race toward the player.
      const scroll = (state.distance * 0.008) % 1;
      for (let lane = 1; lane < CFG.LANES; lane += 1) {
        for (let segment = 0; segment < 8; segment += 1) {
          const a = (segment / 8 + scroll) % 1;
          const b = Math.min(1, a + 0.07 + a * 0.05);
          const ya = horizon + a * a * (roadBottom - horizon);
          const yb = horizon + b * b * (roadBottom - horizon);
          const ra = roadAt(ya);
          const rb = roadAt(yb);
          const xa = ra.left + (ra.right - ra.left) * (lane / CFG.LANES);
          const xb = rb.left + (rb.right - rb.left) * (lane / CFG.LANES);
          ctx.strokeStyle = 'rgba(243,235,221,0.42)';
          ctx.lineWidth = 2 + a * 3;
          ctx.beginPath();
          ctx.moveTo(xa, ya);
          ctx.lineTo(xb, yb);
          ctx.stroke();
        }
      }

      const drawCar = (x, y, color, player = false, scale = 1) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.shadowColor = color;
        ctx.shadowBlur = player ? 15 : 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.lineTo(-20, -13);
        ctx.lineTo(-17, 28);
        ctx.lineTo(17, 28);
        ctx.lineTo(20, -13);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#111426';
        ctx.fillRect(-11, -10, 22, 18);
        ctx.fillStyle = player ? pal.cream : '#ff5b72';
        ctx.fillRect(-13, 19, 7, 4);
        ctx.fillRect(6, 19, 7, 4);
        if (player) {
          ctx.fillStyle = pal.amber;
          ctx.fillRect(-2, 28, 4, 8 + (Math.floor(t * 24) % 2) * 5);
        }
        ctx.restore();
      };

      for (const pickup of state.pickups) {
        const projected = projectToRoad(pickup.x, pickup.y);
        ctx.save();
        ctx.translate(projected.x, pickup.y);
        ctx.scale(projected.scale, projected.scale);
        ctx.rotate(t * 5);
        ctx.shadowColor = pal.amber;
        ctx.shadowBlur = 12;
        ctx.fillStyle = pal.amber;
        ctx.fillRect(-8, -8, 16, 16);
        ctx.fillStyle = pal.ink;
        ctx.fillRect(-2, -5, 4, 10);
        ctx.restore();
      }
      for (const car of state.traffic) {
        const projected = projectToRoad(car.x, car.y);
        drawCar(projected.x, car.y, CAR_COLORS[car.hue], false, projected.scale);
      }
      if (!state.over && (state.player.inv <= 0 || Math.floor(t * 10) % 2 === 0)) {
        const player = projectToRoad(state.player.x, CFG.PLAYER_Y);
        drawCar(player.x, CFG.PLAYER_Y, pal.periwinkle, true);
      }
      for (const spark of sparks) {
        ctx.globalAlpha = Math.min(1, spark.life * 3);
        ctx.fillStyle = pal.amber;
        ctx.fillRect(spark.x - 2, spark.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      text(`SCORE ${terminalScore(state)}`, 22, 34, { align: 'left', bold: true });
      text(`${Math.round(state.speed)} KM/H`, CFG.W / 2, 34, { color: pal.amber, bold: true, glow: 7 });
      text(`LIVES ${'◆'.repeat(Math.max(0, state.player.lives))}`, CFG.W - 22, 34, { align: 'right', color: pal.rose, bold: true });
      if (state.combo > 0) text(`NEAR MISS x${state.combo}`, CFG.W / 2, 66, { color: pal.cream, bold: true, glow: 9 });
      text(`${Math.floor(state.distance)}m`, CFG.W - 22, 55, { align: 'right', color: pal.periwinkle, size: 12 });

      if (state.ready) {
        ctx.fillStyle = 'rgba(11,12,20,0.45)';
        ctx.fillRect(0, 0, CFG.W, CFG.H);
        text('MIDNIGHT RUN', CFG.W / 2, 186, { size: 32, color: pal.amber, bold: true, glow: 14 });
        text('DRAG TO STEER · ARROWS TO DRIVE', CFG.W / 2, 224, { color: pal.cream, bold: true });
        text('THREAD THE TRAFFIC. BUILD THE COMBO.', CFG.W / 2, 250, { size: 12, color: pal.rose });
      }
    },
    destroy() {
      state = null;
      sparks = [];
    },
  };
}
