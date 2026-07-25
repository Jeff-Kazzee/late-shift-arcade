// The DEEPSHIFT cartridge adapter (F-008 / G-007 boundary).
//
// Presents the versioned first-party cartridge instance shape — id/title/
// blurb matching the manifest, init/update/draw/destroy — and owns the
// whole runtime: fixed-step sim driving, input capture (KB/M + touch),
// Three.js renderer (a snapshot subscriber), and a DOM HUD (GDD §13.8).
//
// 3D launch context (interim, until the shell hosts first-party-3d):
//   { container: HTMLElement, seed?: 16-hex string, endGame?: (score) => void }
//
// The renderer holds no sim state and every resource lands in a disposal
// registry; destroy() is idempotent and sweeps everything (GDD §13.6).
// The full canonical command log is recorded; getRunLog() hands it out for
// the headless verifier (tools/verify-run.mjs).

import { manifest } from '../manifest.js';
import { RULESET } from '../sim/constants.js';
import { FP_ONE, fpFloor } from '../sim/math/fixed.js';
import { CMD, BUTTON, quantizeLook } from '../sim/commands.js';
import {
  createSim, tickSim, snapshot, readBlock, drainDirty, PLAYER_ID,
} from '../sim/sim.js';
import { makeRunLog } from '../sim/replay.js';
import { isBreakable, isSolid, PLACEABLE } from '../sim/world/blocks.js';
import { sectionUniformBlock } from '../sim/world/world.js';
import { createWorldRenderer } from '../view/renderer.js';

const TICK_SECONDS = 1 / RULESET.tickHz;
const TURN = 4096;
const LOOK_PER_PX = 3;

function defaultSeed() {
  // Outside the sim, wall-clock entropy is allowed: a fresh unranked run.
  const t = BigInt(Math.floor(performance.now() * 1000) + 1) * 2862933555777941757n;
  return (t & ((1n << 64n) - 1n)).toString(16).padStart(16, '0');
}

const HUD_CSS = `
  .ds-root { position: relative; width: 100%; height: 100%; min-height: 320px;
    background: #06070c; overflow: hidden; font-family: inherit; touch-action: none;
    user-select: none; -webkit-user-select: none; }
  .ds-root canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .ds-hud { position: absolute; inset: 0; pointer-events: none; color: #f2ead9;
    font-size: 14px; line-height: 1.45; }
  .ds-panel { position: absolute; background: rgba(8, 9, 16, 0.72); border: 1px solid #3a3320;
    border-radius: 6px; padding: 6px 10px; }
  .ds-status { top: 10px; left: 10px; }
  .ds-clock { top: 10px; right: 10px; text-align: right; }
  .ds-cross { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 18px; opacity: 0.85; }
  .ds-help { bottom: 10px; left: 10px; font-size: 12px; opacity: 0.75; }
  .ds-touch { position: absolute; right: 10px; bottom: 10px; display: none; gap: 8px;
    pointer-events: none; }
  .ds-touch button { pointer-events: auto; min-width: 64px; min-height: 48px;
    background: rgba(230, 193, 126, 0.18); color: #f2ead9; border: 1px solid #e6c17e;
    border-radius: 8px; font: inherit; font-size: 13px; }
  .ds-end { position: absolute; inset: 0; display: none; align-items: center;
    justify-content: center; background: rgba(6, 7, 12, 0.82); }
  .ds-end .ds-card { background: #10121d; border: 1px solid #e6c17e; border-radius: 10px;
    padding: 20px 28px; text-align: center; max-width: 420px; }
  .ds-end h2 { margin: 0 0 8px; letter-spacing: 0.08em; }
  .ds-end p { margin: 4px 0; }
  .ds-night .ds-clock { border-color: #7280c8; }
`;

export default function createDeepshiftCartridge() {
  let ctx = null;
  let root = null;
  let canvas = null;
  let renderer = null;
  let sim = null;
  let abort = null;
  let hud = null;
  let destroyed = false;
  let ended = false;
  let accumulator = 0;
  let seq = 0;
  let commandLog = [];
  let queuedActions = [];
  let lastMove = null;
  let prevPlayer = null;
  let currSnap = null;
  let target = null; // [x,y,z] of the aimed block, view-side only
  let placeTarget = null;
  let selected = 0; // index into PLACEABLE
  const look = { yaw: 0, pitch: 0 }; // float accumulators, quantized per tick
  const held = { forward: false, back: false, left: false, right: false, jump: false };
  const touchState = { movePointer: null, lookPointer: null, moveOrigin: null, lookMoved: 0, lookStart: 0 };

  const view = {
    snap: null,
    readBlock: (x, y, z) => readBlock(sim, x, y, z),
    sectionUniform: (sx, sy, sz) => sectionUniformBlock(sim.world, sx, sy, sz),
  };

  function buttonsNow() {
    let buttons = 0;
    if (held.forward) buttons |= BUTTON.FORWARD;
    if (held.back) buttons |= BUTTON.BACK;
    if (held.left) buttons |= BUTTON.LEFT;
    if (held.right) buttons |= BUTTON.RIGHT;
    if (held.jump) buttons |= BUTTON.JUMP;
    return buttons;
  }

  function queue(action) {
    if (!ended) queuedActions.push(action);
  }

  // Amanatides & Woo voxel raycast from the eye along the look direction.
  // View-side floats are fine here: the sim revalidates reach in integers.
  function raycast() {
    if (sim === null) return;
    const p = sim.player;
    const yawRad = (look.yaw * Math.PI * 2) / TURN;
    const pitchRad = (look.pitch * Math.PI * 2) / TURN;
    const cp = Math.cos(pitchRad);
    const dir = [Math.sin(yawRad) * cp, Math.sin(pitchRad), -Math.cos(yawRad) * cp];
    const eye = [p.x / FP_ONE, (p.y + RULESET.playerEyeHeight) / FP_ONE, p.z / FP_ONE];
    let [cx, cy, cz] = eye.map(Math.floor);
    const step = dir.map((d) => (d > 0 ? 1 : d < 0 ? -1 : 0));
    const tDelta = dir.map((d) => (d === 0 ? Infinity : Math.abs(1 / d)));
    const tMax = [0, 1, 2].map((i) => {
      if (dir[i] === 0) return Infinity;
      const cell = [cx, cy, cz][i];
      const next = dir[i] > 0 ? cell + 1 : cell;
      return Math.abs((next - eye[i]) / dir[i]);
    });
    let prev = null;
    let travelled = 0;
    for (let it = 0; it < 64 && travelled <= RULESET.reach + 0.5; it += 1) {
      const id = view.readBlock(cx, cy, cz);
      if (isSolid(id)) {
        target = isBreakable(id) ? [cx, cy, cz] : null;
        placeTarget = prev;
        return;
      }
      prev = [cx, cy, cz];
      const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      travelled = tMax[axis];
      tMax[axis] += tDelta[axis];
      if (axis === 0) cx += step[0];
      else if (axis === 1) cy += step[1];
      else cz += step[2];
    }
    target = null;
    placeTarget = null;
  }

  function mineAction() {
    raycast();
    if (target !== null) {
      queue({ type: CMD.MINE, x: target[0], y: target[1], z: target[2] });
    }
  }

  function placeAction() {
    raycast();
    if (placeTarget !== null && currSnap !== null) {
      const block = PLACEABLE[selected];
      if (currSnap.player.inventory[block] > 0) {
        queue({ type: CMD.PLACE, x: placeTarget[0], y: placeTarget[1], z: placeTarget[2], block });
      }
    }
  }

  function attackAction() {
    if (currSnap === null) return;
    const p = currSnap.player;
    let best = null;
    let bestD = Infinity;
    for (const e of currSnap.entities) {
      const dx = (e.x - p.x) / FP_ONE;
      const dy = (e.y - p.y) / FP_ONE;
      const dz = (e.z - p.z) / FP_ONE;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best !== null && bestD <= RULESET.attackRange * RULESET.attackRange) {
      queue({ type: CMD.ATTACK, entityId: best.id });
    }
  }

  function bankAction() {
    queue({ type: CMD.BANK });
  }

  function stepSim() {
    const t = sim.tick;
    const q = quantizeLook(Math.round(look.yaw), Math.round(look.pitch));
    const commands = [];
    let s = 0;
    const moveNow = { buttons: buttonsNow(), yaw: q.yaw, pitch: q.pitch };
    if (lastMove === null || lastMove.buttons !== moveNow.buttons ||
        lastMove.yaw !== moveNow.yaw || lastMove.pitch !== moveNow.pitch) {
      commands.push({ t, p: PLAYER_ID, s, type: CMD.MOVE, ...moveNow });
      s += 1;
      lastMove = moveNow;
    }
    for (const action of queuedActions.splice(0, 4)) {
      commands.push({ t, p: PLAYER_ID, s, ...action });
      s += 1;
    }
    prevPlayer = currSnap === null ? null : currSnap.player;
    tickSim(sim, commands);
    for (const cmd of commands) commandLog.push(cmd);
    currSnap = snapshot(sim);
    view.snap = currSnap;
    const dirty = drainDirty(sim);
    if (dirty.length > 0) renderer.applyDirty(view, dirty);
    if (currSnap.status !== 'running' && !ended) finish();
  }

  function finish() {
    ended = true;
    queuedActions = [];
    const snap = currSnap;
    hud.endTitle.textContent = snap.status === 'won' ? 'SHIFT COMPLETE' : 'SHIFT LOST';
    const reason = { 'quota-banked': 'Quota banked before dawn.', death: 'The Hollowed got you.', 'dawn-timeout': 'Dawn came. The quota did not.' }[snap.endReason] ?? '';
    hud.endReason.textContent = reason;
    hud.endScore.textContent = `SHIFT REPORT: ${snap.score}`;
    hud.endDetail.textContent =
      `banked ${snap.banked.day} by day + ${snap.banked.night} by night · seed ${sim.seedHex}`;
    hud.end.style.display = 'flex';
    if (typeof ctx.endGame === 'function') ctx.endGame(snap.score);
  }

  function buildDom(container) {
    root = document.createElement('div');
    root.className = 'ds-root';
    const style = document.createElement('style');
    style.textContent = HUD_CSS;
    root.append(style);
    canvas = document.createElement('canvas');
    root.append(canvas);

    const hudRoot = document.createElement('div');
    hudRoot.className = 'ds-hud';
    hudRoot.innerHTML = `
      <div class="ds-panel ds-status"><span data-hp></span><br><span data-inv></span><br><span data-sel></span></div>
      <div class="ds-panel ds-clock"><span data-phase></span><br><span data-quota></span></div>
      <div class="ds-cross">+</div>
      <div class="ds-panel ds-help">WASD move · mouse look · click mine · right-click place · 1-3 block · E bank · F attack · space jump</div>
      <div class="ds-touch">
        <button data-btn="jump">JUMP</button><button data-btn="mine">MINE</button>
        <button data-btn="place">PLACE</button><button data-btn="attack">FIGHT</button>
        <button data-btn="bank">BANK</button>
      </div>
      <div class="ds-end"><div class="ds-card">
        <h2 data-end-title></h2><p data-end-reason></p><p data-end-score></p><p data-end-detail></p>
      </div></div>`;
    root.append(hudRoot);
    container.append(root);
    hud = {
      root: hudRoot,
      hp: hudRoot.querySelector('[data-hp]'),
      inv: hudRoot.querySelector('[data-inv]'),
      sel: hudRoot.querySelector('[data-sel]'),
      phase: hudRoot.querySelector('[data-phase]'),
      quota: hudRoot.querySelector('[data-quota]'),
      touch: hudRoot.querySelector('.ds-touch'),
      end: hudRoot.querySelector('.ds-end'),
      endTitle: hudRoot.querySelector('[data-end-title]'),
      endReason: hudRoot.querySelector('[data-end-reason]'),
      endScore: hudRoot.querySelector('[data-end-score]'),
      endDetail: hudRoot.querySelector('[data-end-detail]'),
    };
  }

  function updateHud() {
    const snap = currSnap;
    if (snap === null) return;
    hud.hp.textContent = `HP ${snap.player.hp}/${snap.player.maxHp}`;
    const inv = snap.player.inventory;
    hud.inv.textContent = `dirt ${inv.dirt} · stone ${inv.fieldstone} · coal ${inv.coal}`;
    hud.sel.textContent = `placing: ${PLACEABLE[selected]}`;
    const night = snap.night;
    const secondsLeft = Math.ceil(snap.ticksLeft / RULESET.tickHz);
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const ss = String(secondsLeft % 60).padStart(2, '0');
    hud.phase.textContent = `${night ? 'NIGHT' : 'DAY'} · ${mm}:${ss} to dawn`;
    hud.quota.textContent = `quota ${snap.banked.day + snap.banked.night}/${snap.quota}`;
    root.classList.toggle('ds-night', night);
  }

  function bindKeyboard(signal) {
    const keyMap = {
      KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump',
    };
    document.addEventListener('keydown', (e) => {
      const dir = keyMap[e.code];
      if (dir !== undefined) { held[dir] = true; e.preventDefault(); return; }
      if (e.code === 'KeyE') bankAction();
      else if (e.code === 'KeyF') attackAction();
      else if (e.code === 'Digit1') selected = 0;
      else if (e.code === 'Digit2') selected = 1;
      else if (e.code === 'Digit3') selected = 2;
    }, { signal });
    document.addEventListener('keyup', (e) => {
      const dir = keyMap[e.code];
      if (dir !== undefined) held[dir] = false;
    }, { signal });

    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas && typeof canvas.requestPointerLock === 'function') {
        // Some browsers return a promise that rejects on denial; a denied
        // lock is a fine state (touch/laptop users), never console noise.
        const locked = canvas.requestPointerLock();
        if (locked && typeof locked.catch === 'function') locked.catch(() => {});
      }
      if (e.button === 0) mineAction();
      else if (e.button === 2) placeAction();
      e.preventDefault();
    }, { signal });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      look.yaw = (look.yaw + e.movementX * LOOK_PER_PX * 0.35 + TURN) % TURN;
      look.pitch = Math.max(-1000, Math.min(1000, look.pitch - e.movementY * LOOK_PER_PX * 0.35));
    }, { signal });
  }

  function bindTouch(signal) {
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      hud.touch.style.display = 'flex';
      const rect = root.getBoundingClientRect();
      if (e.target.closest('.ds-touch')) return;
      if (e.clientX - rect.left < rect.width * 0.4 && touchState.movePointer === null) {
        touchState.movePointer = e.pointerId;
        touchState.moveOrigin = [e.clientX, e.clientY];
      } else if (touchState.lookPointer === null) {
        touchState.lookPointer = e.pointerId;
        touchState.lookMoved = 0;
        touchState.lookStart = e.timeStamp;
      }
    }, { signal });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId === touchState.movePointer) {
        const dx = e.clientX - touchState.moveOrigin[0];
        const dy = e.clientY - touchState.moveOrigin[1];
        held.forward = dy < -14;
        held.back = dy > 14;
        held.left = dx < -14;
        held.right = dx > 14;
      } else if (e.pointerId === touchState.lookPointer) {
        look.yaw = (look.yaw + e.movementX * LOOK_PER_PX + TURN) % TURN;
        look.pitch = Math.max(-1000, Math.min(1000, look.pitch - e.movementY * LOOK_PER_PX));
        touchState.lookMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    }, { signal });
    const endTouch = (e) => {
      if (e.pointerId === touchState.movePointer) {
        touchState.movePointer = null;
        held.forward = held.back = held.left = held.right = false;
      } else if (e.pointerId === touchState.lookPointer) {
        // A short, still tap on the look zone mines at the crosshair.
        if (touchState.lookMoved < 12 && e.timeStamp - touchState.lookStart < 350) mineAction();
        touchState.lookPointer = null;
      }
    };
    root.addEventListener('pointerup', endTouch, { signal });
    root.addEventListener('pointercancel', endTouch, { signal });

    for (const button of hud.touch.querySelectorAll('button')) {
      const kind = button.dataset.btn;
      if (kind === 'jump') {
        button.addEventListener('pointerdown', () => { held.jump = true; }, { signal });
        button.addEventListener('pointerup', () => { held.jump = false; }, { signal });
        button.addEventListener('pointercancel', () => { held.jump = false; }, { signal });
      } else {
        const act = { mine: mineAction, place: placeAction, attack: attackAction, bank: bankAction }[kind];
        button.addEventListener('pointerdown', (e) => { act(); e.preventDefault(); }, { signal });
      }
    }
  }

  return {
    id: manifest.slug,
    title: manifest.title,
    blurb: manifest.summary,

    init(context) {
      // Duck-typed so the refusal is the same clear error in any runtime
      // (HTMLElement does not exist headless).
      if (context === null || typeof context !== 'object' ||
          context.container === null || typeof context.container !== 'object' ||
          typeof context.container.append !== 'function') {
        throw new TypeError('deepshift needs a 3D context with a container element');
      }
      ctx = context;
      destroyed = false;
      const seed = typeof ctx.seed === 'string' && /^[0-9a-fA-F]{1,16}$/.test(ctx.seed)
        ? ctx.seed.toLowerCase().padStart(16, '0')
        : defaultSeed();
      buildDom(ctx.container);
      renderer = createWorldRenderer({ canvas });
      sim = createSim(seed);
      commandLog = [];
      queuedActions = [];
      lastMove = null;
      ended = false;
      accumulator = 0;
      currSnap = snapshot(sim);
      view.snap = currSnap;
      drainDirty(sim);
      renderer.rebuildAll(view);
      abort = new AbortController();
      bindKeyboard(abort.signal);
      bindTouch(abort.signal);
      updateHud();
    },

    update(dt) {
      if (destroyed || sim === null || ended) return;
      accumulator += Math.min(dt, 0.25);
      while (accumulator >= TICK_SECONDS && !ended) {
        accumulator -= TICK_SECONDS;
        stepSim();
      }
    },

    draw() {
      if (destroyed || renderer === null || currSnap === null) return;
      const alpha = ended ? 1 : Math.min(1, accumulator / TICK_SECONDS);
      const curr = currSnap.player;
      const prev = prevPlayer ?? curr;
      const lerp = (a, b) => a + (b - a) * alpha;
      raycast();
      renderer.render(view, {
        x: lerp(prev.x, curr.x) / FP_ONE,
        y: (lerp(prev.y, curr.y) + RULESET.playerEyeHeight) / FP_ONE,
        z: lerp(prev.z, curr.z) / FP_ONE,
        yaw: look.yaw,
        pitch: look.pitch,
      }, target);
      updateHud();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort?.abort();
      if (document.pointerLockElement === canvas && typeof document.exitPointerLock === 'function') {
        document.exitPointerLock();
      }
      renderer?.dispose();
      root?.remove();
      renderer = null;
      sim = null;
      root = null;
      canvas = null;
      hud = null;
      currSnap = null;
      view.snap = null;
    },

    // The deterministic-run seam: the exact canonical log this run played,
    // ready for tools/verify-run.mjs.
    getRunLog() {
      return sim === null ? null : makeRunLog(sim.seedHex, commandLog);
    },
  };
}
