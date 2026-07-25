// The player: the CRT cabinet, mounted on a game's detail page.
//
// DOM owns the site; this module owns the only canvas on it. It boots when
// the player presses PLAY — and only then does game code cross the network,
// via entry.load(), which asks launchBlockReason() before fetching a byte.
// Loading this module costs the registry and its manifests, never a game
// module (F-008).
//
// Screens are closures created by factories, exactly as the old cabinet ran
// them: each step, update() returns nothing to stay or the next screen to
// hand over. The single `screen` slot is the only ownership.

import { palette } from './palette.js';
import { createInput } from './input.js';
import { createCrt } from './crt.js';
import { createSfx } from './sfx.js';
import { createTextPainter } from './canvas-text.js';
import { disposeScreen } from './screen.js';
import { advance, STEP_MS } from './loop.js';
import { activateCartridge, launchBlockReason, requiredOrientation } from './cartridge.js';
import {
  loadScores,
  saveScores,
  insertScore,
  qualifies,
  topScore,
  MAX_SCORE,
} from './scores.js';
import { parseDare, formatScore, dareBannerText, shareText } from './share.js';
import { cartridges } from '../games/registry.js';

const W = 640;
const H = 480;

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

function compactLabel(value, max = 64) {
  const label = String(value);
  return label.length <= max ? label : `${label.slice(0, max - 1).trimEnd()}…`;
}

// --- The cabinet ---------------------------------------------------------------
// Builds the overlay, runs the fixed-timestep loop, and tears the whole thing
// down — canvas, input listeners, RAF, audio unlock hooks — when the player
// ejects. Everything it creates, it removes.

function openCabinet(entry, { onClose, onRunEnd }) {
  const manifest = entry.manifest;

  const layer = document.createElement('div');
  layer.className = 'cabinet-layer';
  if (requiredOrientation(manifest) === 'landscape') layer.classList.add('needs-landscape');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', `${manifest.title} — game cabinet`);

  const cabinet = document.createElement('div');
  cabinet.className = 'cabinet';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const exitButton = document.createElement('button');
  exitButton.className = 'cabinet-exit';
  exitButton.setAttribute('aria-label', 'Eject and close the cabinet');
  exitButton.textContent = '✕';
  const rotate = document.createElement('div');
  rotate.className = 'cabinet-rotate';
  rotate.setAttribute('role', 'status');
  rotate.textContent = '↻ ROTATE TO PLAY';

  cabinet.append(canvas, exitButton);
  layer.append(cabinet, rotate);
  document.body.append(layer);
  document.body.style.overflow = 'hidden';

  const ctx2d = canvas.getContext('2d');
  const reducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const input = createInput(canvas);
  const crt = createCrt({ reducedMotion });
  const sfx = createSfx();
  const text = createTextPainter(ctx2d, palette, { size: 16 });

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

  // The overlay is modal: Tab cycles between the eject button and nothing
  // else, because the game reads the keyboard through the shell input.
  const onTrapKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      exitButton.focus();
    }
  };
  layer.addEventListener('keydown', onTrapKey);

  function fitCanvas() {
    // bezel + breathing room, shrinking on small viewports
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

  function clear() {
    ctx2d.fillStyle = palette.ink;
    ctx2d.fillRect(0, 0, W, H);
  }

  let rafId = 0;
  let screen = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(rafId);
    disposeScreen(screen, (error) => console.error('screen cleanup fault:', error));
    input.detach();
    window.removeEventListener('keydown', unlockSfx);
    window.removeEventListener('pointerdown', unlockSfx);
    window.removeEventListener('resize', fitCanvas);
    layer.remove();
    document.body.style.overflow = '';
    onClose();
  };

  // --- Screens (loading → game → initials, with faults) ---------------------

  function loadingScreen() {
    let t = 0;
    let loaded = null;
    let failure = null;
    consumeEject();

    entry.load().then(
      (cartridge) => { loaded = cartridge; },
      (error) => { failure = error; },
    );

    return {
      update(dt) {
        t += dt;
        if (input.pressed('eject') || input.pressed('pause') || consumeEject()) {
          sfx.play('pause');
          return close();
        }
        if (failure) return loadFaultScreen(failure);
        if (loaded) return gameScreen(loaded);
        // Launch input is deliberately not read here: a second tap during the
        // load must not start a second run — and entry.load() is memoised, so
        // it could not start a second fetch even if this screen let it through.
      },
      draw() {
        clear();
        text(manifest.title, W / 2, H / 2 - 40, {
          size: 24, color: palette[manifest.artwork.accent] ?? palette.amber, bold: true, glow: 8,
        });
        text(`LOADING CARTRIDGE${'.'.repeat(Math.floor(t * 3) % 4)}`, W / 2, H / 2 + 6, {
          size: 14, color: palette.cream,
        });
        text('Q TO EJECT', W / 2, H - 40, { size: 11, color: palette.rose });
      },
    };
  }

  function loadFaultScreen(error) {
    const offline = navigator.onLine === false;
    consumeEject();

    return {
      update() {
        if (input.pressed('eject') || input.pressed('pause') || consumeEject()) {
          sfx.play('pause');
          return close();
        }
        if (input.pressed('action') || input.pressed('restart') || input.pointer.justDown) {
          sfx.play('start');
          return loadingScreen();
        }
      },
      draw() {
        clear();
        text('CARTRIDGE JAMMED', W / 2, H / 2 - 62, {
          size: 24, color: palette.rose, bold: true,
        });
        text(manifest.title, W / 2, H / 2 - 26, { size: 16, color: palette.periwinkle });
        text(
          offline
            ? 'no connection — the game could not be downloaded'
            : compactLabel(String(error?.message ?? error)),
          W / 2,
          H / 2 + 8,
          { size: 12, color: palette.cream },
        );
        text('SPACE OR TAP TO RETRY · Q TO EJECT', W / 2, H / 2 + 52, {
          size: 14, color: palette.amber, bold: true,
        });
      },
    };
  }

  function gameScreen(loaded) {
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
      highScore: topScore(loadScores(manifest.slug)),
      shake(power = 5) {
        shakeMag = power;
        shakeT = 0.25;
      },
      endGame(score) {
        const settled = Math.min(MAX_SCORE, Math.max(0, Math.round(score)));
        // Personal best is judged before this run reaches the table — and
        // only against a table that has one, so a first-ever score is a
        // score, not a "best".
        const prevBest = topScore(loadScores(manifest.slug));
        finished = { score: settled };
        sincefinish = 0;
        onRunEnd?.({ score: settled, personalBest: prevBest > 0 && settled > prevBest });
        sfx.play(qualifies(loadScores(manifest.slug), finished.score) ? 'fanfare' : 'lose');
      },
    };

    cart = activateCartridge(loaded, gameCtx);
    consumeEject();

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cart?.destroy();
    };
    const eject = () => {
      dispose();
      sfx.play('pause');
      return close();
    };
    const restart = () => {
      // a cartridge may provide its own restart (e.g. pong rematch keeps mode)
      if (cart.restart) cart.restart();
      else {
        cart.destroy();
        cart = activateCartridge(loaded, gameCtx);
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
          if (qualifies(loadScores(manifest.slug), finished.score)) {
            if (input.pressed('action') || input.pointer.justDown) {
              dispose();
              return initialsScreen(finished.score);
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
          const hint = qualifies(loadScores(manifest.slug), finished.score)
            ? 'NEW HIGH SCORE — tap for initials · R to retry'
            : 'tap or R to restart · Q to eject';
          text(hint, W / 2, H / 2 + 36, { size: 14, color: palette.amber });
        }
      },
      destroy: dispose,
    };
  }

  function initialsScreen(score) {
    const A = 'A'.charCodeAt(0);
    const letters = [0, 0, 0];
    let slot = 0;
    const slotX = (i) => W / 2 + (i - 1) * 70;
    const slotY = H / 2 + 10;

    const commit = () => {
      const initials = letters.map((n) => String.fromCharCode(A + n)).join('');
      saveScores(manifest.slug, insertScore(loadScores(manifest.slug), { initials, score }));
      sfx.play('fanfare');
      return close();
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
        text(`${manifest.title} — ${score}`, W / 2, 150, { color: palette.periwinkle });
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
  // canvas APIs that exist everywhere, and any tap ejects back to the page.
  function faultScreen(err) {
    return {
      update() {
        if (input.pressed('action') || input.pressed('eject') || input.pointer.justDown || consumeEject()) {
          return close();
        }
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
        ctx2d.fillText('tap or SPACE to eject', W / 2, H / 2 + 44);
      },
    };
  }

  // --- Fixed-timestep loop -----------------------------------------------------

  screen = loadingScreen();
  exitButton.focus();
  let last = performance.now();
  let accMs = 0;

  function frame(now) {
    if (closed) return;
    rafId = requestAnimationFrame(frame); // reschedule FIRST: a throw must not kill the loop
    const r = advance(accMs, now - last);
    last = now;
    accMs = r.acc;
    try {
      for (let i = 0; i < r.steps; i += 1) {
        if (input.pressed('m') && !sfx.toggleMute()) sfx.play('click');
        const next = screen.update(STEP_MS / 1000);
        if (closed) return;
        if (next) {
          disposeScreen(screen, (error) => console.error('screen cleanup fault:', error));
          input.rebase?.();
          screen = next;
        }
        // edges are one-step-sized: a keypress must not fall through into the
        // next step's screen
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
  rafId = requestAnimationFrame(frame);
}

// --- Page wiring --------------------------------------------------------------

function renderLocalScores(main, slug) {
  const section = main.querySelector('[data-local-scores]');
  if (!section) return;
  const list = section.querySelector('[data-score-list]');
  const empty = section.querySelector('[data-score-empty]');
  const scores = loadScores(slug);
  list.textContent = '';
  for (const entry of scores) {
    const li = document.createElement('li');
    const initials = document.createElement('span');
    initials.className = 'score-initials';
    initials.textContent = entry.initials;
    const value = document.createElement('span');
    value.className = 'score-value';
    value.textContent = String(entry.score);
    li.append(initials, value);
    list.append(li);
  }
  if (empty) empty.hidden = scores.length !== 0;
  section.hidden = false;
}

// --- The dare banner ----------------------------------------------------------
// A dare arrives as `#dare=<int>` on the fragment. parseDare admits a bounded
// non-negative integer and nothing else; the banner is built from text nodes
// only, so nothing from the URL can ever become markup here.

function renderDareBanner(main, dare, playButton) {
  const banner = document.createElement('p');
  banner.className = 'dare-banner';
  const label = document.createElement('span');
  label.className = 'dare-banner-text';
  label.textContent = dareBannerText(dare);
  banner.append(label);
  if (playButton) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'button button-dare';
    play.textContent = 'Beat it — play now';
    play.addEventListener('click', () => playButton.click());
    banner.append(play);
  }
  main.prepend(banner);
}

// --- The share moment -----------------------------------------------------------
// Appears only when there is a fresh score on the page — after the cabinet
// closes, never during play, never as a nag. navigator.share where the
// platform has it; otherwise the artifact goes to the clipboard with a
// visible confirmation, and if even that is blocked, the text itself is
// rendered for hand copying.

function renderShareRow(main, { title, url, run, dare }) {
  const head = main.querySelector('.detail-head') ?? main;
  let row = head.querySelector('.share-row');
  if (!row) {
    row = document.createElement('div');
    row.className = 'share-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Share your shift');
    head.append(row);
  }
  row.textContent = '';
  head.querySelector('.share-artifact')?.remove();

  const scoreLabel = document.createElement('span');
  scoreLabel.className = 'share-score';
  scoreLabel.textContent = `🌙 ${formatScore(run.score)} on the clock`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-share';
  button.textContent = 'Share your shift';

  const note = document.createElement('span');
  note.className = 'share-note';
  note.setAttribute('role', 'status');

  let noteTimer = 0;
  const setNote = (message) => {
    clearTimeout(noteTimer);
    note.textContent = message;
    noteTimer = setTimeout(() => { note.textContent = ''; }, 6000);
  };

  const text = shareText({
    title,
    score: run.score,
    url,
    personalBest: run.personalBest,
    dare,
  });

  button.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return; // the player changed their mind
        // fall through to the clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote('copied — paste it anywhere');
    } catch {
      const artifact = document.createElement('pre');
      artifact.className = 'share-artifact';
      artifact.textContent = text;
      row.after(artifact);
      setNote('copy is blocked here — select the text below');
    }
  });

  row.append(scoreLabel, button, note);
}

const main = document.querySelector('main[data-slug]');
if (main) {
  const slug = main.dataset.slug;
  renderLocalScores(main, slug);

  const playButton = main.querySelector('[data-play]');
  const entry = cartridges.find((e) => e.manifest.slug === slug) ?? null;

  // The generator only emits a play button when the launch gate clears the
  // manifest, and entry.load() asks the gate again at launch. This check is
  // belt on top of braces: a page/registry mismatch degrades to a plain page.
  const playable = Boolean(playButton && entry && launchBlockReason(entry.manifest) === null);

  // Session-local dare state: parsed once from the fragment, never persisted.
  const dare = parseDare(window.location.hash);
  if (dare !== null) renderDareBanner(main, dare, playable ? playButton : null);

  if (playable) {
    const canonical = document.querySelector('link[rel="canonical"]');
    const shareUrl = canonical?.href ?? window.location.origin + window.location.pathname;
    let lastRun = null; // survives cabinet close, dies with the page

    playButton.hidden = false;
    playButton.addEventListener('click', () => {
      playButton.disabled = true;
      openCabinet(entry, {
        onRunEnd(run) {
          lastRun = run;
        },
        onClose() {
          playButton.disabled = false;
          playButton.focus();
          renderLocalScores(main, slug);
          if (lastRun && lastRun.score > 0) {
            renderShareRow(main, {
              title: entry.manifest.title,
              url: shareUrl,
              run: lastRun,
              dare,
            });
          }
        },
      });
    });
  }
}
