// The cabinet. Screens are closures created by factories; each frame the
// active screen's update() returns nothing to stay, or the next screen to
// hand the cabinet over. The single `screen` slot is the only ownership —
// a replaced screen is unreferenced, so it cannot keep drawing or ticking.

import { palette } from './palette.js';
import { createInput } from './input.js';
import { createCrt } from './crt.js';
import { createSfx } from './sfx.js';
import { createTextPainter } from './canvas-text.js';
import { disposeScreen } from './screen.js';
import { advance, STEP_MS } from './loop.js';
import { activateCartridge } from './cartridge.js';
import {
  cardsForPage,
  catalogPageControlAt,
  CATALOG_PAGER,
  firstIndexForPage,
  hitTestPage,
  moveCatalogSelection,
  pageCount,
  pageForIndex,
  shiftCatalogPage,
} from './catalog-layout.js';
import {
  loadScores,
  saveScores,
  insertScore,
  qualifies,
  topScore,
} from './scores.js';
import { cartridges } from '../games/registry.js';

// Pre-2022 Safari/Firefox lack roundRect; every cartridge uses it.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(Array.isArray(r) ? r[0] : r ?? 0, w / 2, h / 2));
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}

const canvas = document.getElementById('screen');
const ctx2d = canvas.getContext('2d');
const exitButton = document.getElementById('exit');
const W = canvas.width;
const H = canvas.height;

const reducedMotion =
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const input = createInput(canvas);
const crt = createCrt({ reducedMotion });
const sfx = createSfx();

// Autoplay policy: the AudioContext only exists after a user gesture.
const unlockSfx = () => sfx.unlock();
window.addEventListener('keydown', unlockSfx);
window.addEventListener('pointerdown', unlockSfx);

let ejectClicked = false;
exitButton.addEventListener('click', () => {
  ejectClicked = true;
});
const consumeEject = () => {
  const was = ejectClicked;
  ejectClicked = false;
  return was;
};
const showEject = (on) => {
  exitButton.style.display = on ? 'block' : 'none';
};

function fitCanvas() {
  // bezel + breathing room, shrinking on small (portrait phone) viewports
  const pad = Math.min(72, window.innerWidth * 0.08);
  const scale = Math.max(
    0.25,
    Math.min((window.innerWidth - pad) / W, (window.innerHeight - pad) / H),
  );
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const text = createTextPainter(ctx2d, palette, { size: 16 });

function clear() {
  ctx2d.fillStyle = palette.ink;
  ctx2d.fillRect(0, 0, W, H);
}

function compactLabel(value, max = 36) {
  const label = String(value);
  return label.length <= max ? label : `${label.slice(0, max - 1).trimEnd()}…`;
}

// --- Screens -------------------------------------------------------------

function attractScreen() {
  let t = 0;
  const stars = Array.from({ length: 70 }, () => ({
    x: Math.random() * W,
    y: Math.random() * (H * 0.62),
    r: Math.random() * 1.4 + 0.4,
    phase: Math.random() * Math.PI * 2,
  }));

  return {
    update(dt) {
      t += dt;
      if (input.pressed('action') || input.pointer.justDown) {
        sfx.play('coin');
        return selectScreen();
      }
    },
    draw() {
      // night sky
      const sky = ctx2d.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0b0c14');
      sky.addColorStop(0.62, '#12142a');
      sky.addColorStop(0.63, palette.ink);
      sky.addColorStop(1, palette.ink);
      ctx2d.fillStyle = sky;
      ctx2d.fillRect(0, 0, W, H);

      for (const s of stars) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + s.phase));
        ctx2d.fillStyle = `rgba(243,235,221,${(0.5 * tw).toFixed(3)})`;
        ctx2d.fillRect(s.x, s.y, s.r, s.r);
      }

      // perspective grid floor
      const horizon = H * 0.62;
      ctx2d.strokeStyle = 'rgba(124,136,232,0.28)';
      ctx2d.lineWidth = 1;
      for (let i = -8; i <= 8; i += 1) {
        ctx2d.beginPath();
        ctx2d.moveTo(W / 2 + i * 26, horizon);
        ctx2d.lineTo(W / 2 + i * 120, H);
        ctx2d.stroke();
      }
      const scroll = (t * 40) % 40;
      for (let d = 0; d < 8; d += 1) {
        const frac = (d * 40 + scroll) / 320;
        const y = horizon + frac * frac * (H - horizon);
        ctx2d.strokeStyle = `rgba(124,136,232,${(0.1 + 0.25 * frac).toFixed(3)})`;
        ctx2d.beginPath();
        ctx2d.moveTo(0, y);
        ctx2d.lineTo(W, y);
        ctx2d.stroke();
      }

      const pulse = 14 + 6 * Math.sin(t * 2.2);
      text('LATE SHIFT', W / 2, H / 2 - 88, {
        size: 46,
        color: palette.amber,
        bold: true,
        glow: pulse,
      });
      text('ARCADE', W / 2, H / 2 - 38, {
        size: 46,
        color: palette.periwinkle,
        bold: true,
        glow: pulse,
      });
      text(`${cartridges.length} games · open all night`, W / 2, H / 2 - 4, {
        size: 13,
        color: palette.rose,
      });

      if (Math.floor(t * 1.6) % 2 === 0) {
        text('INSERT COIN — coin not required', W / 2, H / 2 + 52, {
          color: palette.cream,
          glow: 6,
        });
      }
      text('press SPACE or tap · M mutes', W / 2, H - 30, { size: 12, color: palette.rose });
    },
  };
}

function selectScreen() {
  let index = 0;

  return {
    update() {
      const direction = ['up', 'down', 'left', 'right'].find((name) => input.pressed(name));
      if (direction) {
        sfx.play('move');
        index = moveCatalogSelection(index, direction, cartridges.length);
      }
      if (input.pressed('pause')) {
        sfx.play('pause');
        return attractScreen();
      }
      if (input.pressed('action')) {
        sfx.play('start');
        return gameScreen(cartridges[index]);
      }
      if (input.pointer.justDown) {
        const currentPage = pageForIndex(index, cartridges.length);
        const pageControl = catalogPageControlAt(
          cartridges.length,
          input.pointer.x,
          input.pointer.y,
        );
        if (pageControl) {
          const nextPage = shiftCatalogPage(
            currentPage,
            pageControl === 'next' ? 1 : -1,
            cartridges.length,
          );
          index = firstIndexForPage(nextPage, cartridges.length);
          sfx.play('move');
          return;
        }
        const hit = hitTestPage(
          cartridges.length,
          currentPage,
          input.pointer.x,
          input.pointer.y,
        );
        if (hit >= 0) {
          sfx.play('start');
          return gameScreen(cartridges[hit]);
        }
      }
    },
    draw() {
      clear();
      text('SELECT A SHIFT', 44, 42, {
        size: 22, color: palette.amber, bold: true, glow: 10, align: 'left',
      });
      const currentPage = pageForIndex(index, cartridges.length);
      const pages = pageCount(cartridges.length);
      text(pages > 1 ? `${cartridges.length} CARTS · ${currentPage + 1}/${pages}` : `${cartridges.length} CARTRIDGES · PAGE 1/1`, pages > 1 ? 476 : W - 44, 40, {
        size: 11, color: palette.rose, align: 'right',
      });
      if (pages > 1) {
        for (const [name, rect] of Object.entries(CATALOG_PAGER)) {
          ctx2d.strokeStyle = palette.hairline;
          ctx2d.strokeRect(rect.x, rect.y, rect.w, rect.h);
          text(name === 'previous' ? '‹' : '›', rect.x + rect.w / 2, rect.y + 30, {
            size: 22, color: palette.amber,
          });
        }
      }
      ctx2d.strokeStyle = palette.hairline;
      ctx2d.beginPath();
      ctx2d.moveTo(44, 54);
      ctx2d.lineTo(W - 44, 54);
      ctx2d.stroke();

      for (const r of cardsForPage(cartridges.length, currentPage)) {
        const cart = cartridges[r.index];
        const selected = r.index === index;
        const accent = palette[cart.details.accent] ?? palette.amber;
        ctx2d.beginPath();
        ctx2d.roundRect(r.x, r.y, r.w, r.h, 8);
        if (selected) {
          ctx2d.fillStyle = 'rgba(230,193,126,0.08)';
          ctx2d.fill();
          ctx2d.shadowColor = accent;
          ctx2d.shadowBlur = 10;
        }
        ctx2d.strokeStyle = selected ? accent : palette.hairline;
        ctx2d.stroke();
        ctx2d.shadowBlur = 0;

        text(cart.title, r.x + 14, r.y + 22, {
          align: 'left',
          color: selected ? palette.cream : palette.periwinkle,
          size: 16,
          bold: selected,
        });
        text(`HI ${topScore(loadScores(cart.id))}`, r.x + r.w - 14, r.y + 21, {
          align: 'right', size: 11, color: accent,
        });
        text(`${cart.details.genre} · ${cart.details.players}P`, r.x + 14, r.y + 41, {
          align: 'left', size: 10, color: accent, bold: true,
        });
        text(compactLabel(cart.blurb), r.x + 14, r.y + 61, {
          align: 'left',
          size: 10,
          color: palette.rose,
        });
      }
      const selected = cartridges[index];
      text(`${selected.details.controls.join(' + ')} · SPACE / TAP TO LOAD`, W / 2, H - 18, {
        size: 11, color: palette.rose,
      });
    },
  };
}

function gameScreen(entry) {
  let cart = null;
  let disposed = false;
  let paused = false;
  let finished = null; // { score } once the cartridge calls endGame
  let sincefinish = 0;
  let shakeT = 0;
  let shakeMag = 0;

  const gameCtx = {
    width: W,
    height: H,
    palette,
    sfx,
    highScore: topScore(loadScores(entry.id)),
    shake(power = 5) {
      shakeMag = power;
      shakeT = 0.25;
    },
    endGame(score) {
      finished = { score: Math.max(0, Math.round(score)) };
      sincefinish = 0;
      sfx.play(qualifies(loadScores(entry.id), finished.score) ? 'fanfare' : 'lose');
    },
  };

  cart = activateCartridge(entry, gameCtx);
  showEject(true);
  consumeEject();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cart?.destroy();
    showEject(false);
  };
  const eject = () => {
    dispose();
    sfx.play('pause');
    return selectScreen();
  };
  const restart = () => {
    // a cartridge may provide its own restart (e.g. pong rematch keeps mode)
    if (cart.restart) cart.restart();
    else {
      cart.destroy();
      cart = activateCartridge(entry, gameCtx);
    }
    paused = false;
    finished = null;
    sfx.play('click');
  };

  return {
    update(dt) {
      if (shakeT > 0) shakeT -= dt;
      if (input.pressed('eject') || consumeEject()) return eject();

      if (finished) {
        sincefinish += dt;
        if (sincefinish < 0.5) return; // debounce the killing blow's input
        if (input.pressed('restart')) return restart();
        if (qualifies(loadScores(entry.id), finished.score)) {
          if (input.pressed('action') || input.pointer.justDown) {
            dispose();
            return initialsScreen(entry, finished.score);
          }
        } else if (input.pressed('action') || input.pointer.justDown) {
          restart();
        }
        return;
      }

      if (input.pressed('pause')) {
        paused = !paused;
        sfx.play('pause');
      }
      if (input.pressed('restart')) restart();
      if (!paused) cart.update(dt, input); // pause = the clock stops
    },
    draw() {
      clear();
      if (shakeT > 0) {
        const k = shakeMag * (shakeT / 0.25);
        ctx2d.save();
        ctx2d.translate((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k);
        cart.draw(ctx2d);
        ctx2d.restore();
      } else {
        cart.draw(ctx2d);
      }
      if (paused && !finished) {
        ctx2d.fillStyle = 'rgba(11,12,20,0.75)';
        ctx2d.fillRect(0, 0, W, H);
        text('PAUSED', W / 2, H / 2 - 10, { size: 28, color: palette.amber });
        text('ESC resume · R restart · Q eject', W / 2, H / 2 + 24, {
          size: 14,
          color: palette.periwinkle,
        });
      }
      if (finished) {
        ctx2d.fillStyle = 'rgba(11,12,20,0.75)';
        ctx2d.fillRect(0, 0, W, H);
        text('GAME OVER', W / 2, H / 2 - 30, { size: 28, color: palette.rose });
        text(`SCORE ${finished.score}`, W / 2, H / 2 + 4, { color: palette.cream });
        const hint = qualifies(loadScores(entry.id), finished.score)
          ? 'NEW HIGH SCORE — tap for initials · R to retry'
          : 'tap or R to restart · Q to eject';
        text(hint, W / 2, H / 2 + 36, { size: 14, color: palette.amber });
      }
    },
    destroy: dispose,
  };
}

function initialsScreen(cart, score) {
  const A = 'A'.charCodeAt(0);
  const letters = [0, 0, 0];
  let slot = 0;
  const slotX = (i) => W / 2 + (i - 1) * 70;
  const slotY = H / 2 + 10;

  const commit = () => {
    const initials = letters.map((n) => String.fromCharCode(A + n)).join('');
    saveScores(cart.id, insertScore(loadScores(cart.id), { initials, score }));
    sfx.play('fanfare');
    return selectScreen();
  };
  const cycle = (i, delta) => {
    letters[i] = (letters[i] + 26 + delta) % 26;
  };

  return {
    update() {
      if (input.pressed('left', 'right', 'up', 'down')) sfx.play('move');
      if (input.pressed('left')) slot = (slot + 2) % 3;
      if (input.pressed('right')) slot = (slot + 1) % 3;
      if (input.pressed('up')) cycle(slot, 1);
      if (input.pressed('down')) cycle(slot, -1);
      if (input.pressed('action')) return commit();
      if (input.pointer.justDown) {
        const p = input.pointer;
        for (let i = 0; i < 3; i += 1) {
          if (Math.abs(p.x - slotX(i)) <= 30) {
            slot = i;
            if (p.y < slotY - 10) cycle(i, 1);
            else if (p.y > slotY + 10) cycle(i, -1);
          }
        }
        if (p.y > H - 90 && Math.abs(p.x - W / 2) < 60) return commit();
      }
    },
    draw() {
      clear();
      text('NEW HIGH SCORE', W / 2, 110, { size: 26, color: palette.amber });
      text(`${cart.title} — ${score}`, W / 2, 150, { color: palette.periwinkle });
      for (let i = 0; i < 3; i += 1) {
        const ch = String.fromCharCode(A + letters[i]);
        text('▲', slotX(i), slotY - 50, { size: 14, color: palette.deep });
        text(ch, slotX(i), slotY + 12, {
          size: 44,
          color: i === slot ? palette.cream : palette.periwinkle,
        });
        text('▼', slotX(i), slotY + 60, { size: 14, color: palette.deep });
        if (i === slot) {
          ctx2d.strokeStyle = palette.amber;
          ctx2d.strokeRect(slotX(i) - 30, slotY - 30, 60, 54);
        }
      }
      text('[ OK ]', W / 2, H - 60, { size: 20, color: palette.amber });
      text('arrows to spell · SPACE or tap OK', W / 2, H - 28, {
        size: 12,
        color: palette.rose,
      });
    },
  };
}

// A thrown frame costs one frame, never the session: this screen uses only
// canvas APIs that exist everywhere, and any tap returns to the cabinet.
function faultScreen(err) {
  showEject(false);
  return {
    update() {
      if (input.pressed('action') || input.pointer.justDown) return attractScreen();
    },
    draw() {
      ctx2d.fillStyle = palette.ink;
      ctx2d.fillRect(0, 0, W, H);
      ctx2d.textAlign = 'center';
      ctx2d.fillStyle = palette.rose;
      ctx2d.font = 'bold 24px "Courier New", monospace';
      ctx2d.fillText('CABINET FAULT', W / 2, H / 2 - 20);
      ctx2d.fillStyle = palette.periwinkle;
      ctx2d.font = '13px "Courier New", monospace';
      ctx2d.fillText(String(err?.message ?? err).slice(0, 70), W / 2, H / 2 + 12);
      ctx2d.fillStyle = palette.amber;
      ctx2d.fillText('tap or SPACE to reboot the cabinet', W / 2, H / 2 + 44);
    },
  };
}

// --- Fixed-timestep loop ---------------------------------------------------

let screen = attractScreen();
showEject(false);
let last = performance.now();
let accMs = 0;

function frame(now) {
  requestAnimationFrame(frame); // reschedule FIRST: a throw must not kill the loop
  const r = advance(accMs, now - last);
  last = now;
  accMs = r.acc;
  try {
    for (let i = 0; i < r.steps; i += 1) {
      if (input.pressed('m') && !sfx.toggleMute()) sfx.play('click');
      const next = screen.update(STEP_MS / 1000);
      if (next) {
        disposeScreen(screen, (error) => console.error('screen cleanup fault:', error));
        input.rebase?.();
        screen = next;
      }
      // edges are one-step-sized: a keypress must not fall through into the
      // next step's screen (attract → select → game on one SPACE)
      input.endFrame();
    }
    screen.draw();
    crt.draw(ctx2d, W, H, now);
  } catch (err) {
    disposeScreen(screen, (error) => console.error('screen cleanup fault:', error));
    console.error('cabinet fault:', err);
    screen = faultScreen(err);
  }
}
requestAnimationFrame(frame);
