import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  TYPES,
  applyCommand,
  begin,
  compareRuns,
  mulberry32,
  multiplier,
  newGame,
  runSummary,
  spawnEnemy,
  step,
  terminalScore,
} from './logic.js';
import createDefault, { createGraveyardShift } from './graveyard-shift.js';
import { manifest } from './manifest.js';
import { palette } from '../../shell/palette.js';
import {
  activateCartridge,
  defineCatalogEntry,
  launchBlockReason,
  validateManifest,
} from '../../shell/cartridge.js';

const startNight = (seed) => {
  const state = newGame(seed);
  begin(state);
  return state;
};

// The scripted playthrough policy: play the way a person plays it — read the
// screen (live enemies), kite away from the nearest, aim at it, hold fire.
// No adversarial search, no peeking at the rng.
function playTick(state) {
  let nearest = null;
  let best = Infinity;
  for (const e of state.enemies) {
    if (!e.on) continue;
    const d = (e.x - state.px) ** 2 + (e.y - state.py) ** 2;
    if (d < best) {
      best = d;
      nearest = e;
    }
  }
  const cx = (CFG.ARENA.x0 + CFG.ARENA.x1) / 2;
  const cy = (CFG.ARENA.y0 + CFG.ARENA.y1) / 2;
  if (nearest) {
    const ax = nearest.x - state.px;
    const ay = nearest.y - state.py;
    const d = Math.hypot(ax, ay) || 1;
    // Run from it, leaning back toward the middle of the lot.
    const mx = -ax / d + (cx - state.px) / 300;
    const my = -ay / d + (cy - state.py) / 300;
    applyCommand(state, { k: 'move', x: mx, y: my });
    applyCommand(state, { k: 'aim', x: ax, y: ay });
    applyCommand(state, { k: 'fire', on: true });
  } else {
    applyCommand(state, { k: 'move', x: (cx - state.px) / 100, y: (cy - state.py) / 100 });
    applyCommand(state, { k: 'fire', on: false });
  }
  step(state, CFG.TICK);
}

// --- the seed and the pools ---------------------------------------------------

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  assert.deepEqual(Array.from({ length: 4 }, mulberry32(8)), Array.from({ length: 4 }, mulberry32(8)));
  assert.ok(Array.from({ length: 500 }, mulberry32(1)).every((v) => v >= 0 && v < 1));
});

test('a seed names one exact night', () => {
  const a = startNight(77);
  const b = startNight(77);
  for (let i = 0; i < 600; i += 1) {
    step(a, CFG.TICK);
    step(b, CFG.TICK);
  }
  assert.deepStrictEqual(a, b);
});

test('pools are allocated once at their fixed capacities', () => {
  const state = newGame(1);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
  assert.equal(state.bullets.length, CFG.BULLET_POOL);
  assert.equal(state.fx.length, CFG.FX_RING);
  assert.ok(CFG.ENEMY_POOL + CFG.BULLET_POOL >= 500, 'the arena is built for a flood');
});

test('a saturated enemy pool skips the spawn instead of growing', () => {
  const state = startNight(3);
  for (let i = 0; i < CFG.ENEMY_POOL; i += 1) spawnEnemy(state, 0, 100, 100);
  assert.equal(state.liveEnemies, CFG.ENEMY_POOL);
  assert.equal(spawnEnemy(state, 0, 100, 100), -1);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
});

// --- commands -------------------------------------------------------------------

test('commands are validated and refused outside a running shift', () => {
  const state = newGame(5);
  assert.equal(applyCommand(state, { k: 'begin' }), true);
  assert.equal(applyCommand(state, { k: 'begin' }), false, 'begin is one-shot');
  assert.equal(applyCommand(state, { k: 'move', x: NaN, y: 0 }), false);
  assert.equal(applyCommand(state, { k: 'aim', x: 0, y: 0 }), false, 'zero aim is refused');
  assert.equal(applyCommand(state, { k: 'nonsense' }), false);
  assert.equal(applyCommand(state, { k: 'move', x: 5, y: -5 }), true);
  assert.equal(state.input.mx, 1, 'move is clamped');
  assert.equal(state.input.my, -1);
  assert.equal(applyCommand(state, { k: 'aim', x: 3, y: 4 }), true);
  assert.ok(Math.abs(Math.hypot(state.input.ax, state.input.ay) - 1) < 1e-9, 'aim is normalised');
});

// --- the chain ---------------------------------------------------------------------

test('the multiplier steps ×1→×8 with the chain and the chain dies of old age', () => {
  const state = startNight(9);
  assert.equal(multiplier(state), 1);
  state.chain = 5;
  assert.equal(multiplier(state), 2);
  state.chain = 34;
  assert.equal(multiplier(state), 7);
  state.chain = 99;
  assert.equal(multiplier(state), CFG.COMBO_CAP);
  state.chainT = 0.01;
  step(state, CFG.TICK);
  assert.equal(state.chain, 0, 'the window closed');
});

test('kills pay value × multiplier at the moment of the kill', () => {
  const state = startNight(11);
  state.spawnT = 999; // hold the ambient spawner still
  state.waveT = 999;
  state.chain = 10; // ×3 going in once this kill lands
  state.chainT = CFG.COMBO_WINDOW; // window held open for the bullet's flight
  spawnEnemy(state, 0, state.px + 40, state.py);
  applyCommand(state, { k: 'aim', x: 1, y: 0 });
  applyCommand(state, { k: 'fire', on: true });
  const before = state.score;
  for (let i = 0; i < 30 && state.kills === 0; i += 1) step(state, CFG.TICK);
  assert.equal(state.kills, 1);
  assert.equal(state.score - before, TYPES[0].value * 3);
});

test('a scratch costs a life, breaks the chain, and the lantern flare pays nothing', () => {
  const state = startNight(13);
  state.spawnT = 999;
  state.waveT = 999;
  state.chain = 12;
  spawnEnemy(state, 0, state.px + 12, state.py); // touching distance
  spawnEnemy(state, 0, state.px + 60, state.py); // inside the mercy radius
  const before = state.score;
  step(state, CFG.TICK);
  assert.equal(state.lives, CFG.LIVES - 1);
  assert.equal(state.chain, 0);
  assert.equal(state.score, before, 'mercy kills score nothing');
  assert.equal(state.liveEnemies, 0, 'the flare cleared the yard');
  assert.ok(state.invuln > 0);
});

// --- win, loss, and the documented formula --------------------------------------

test('HEADLESS WINNABLE PROOF: a kiting watchman survives to dawn', () => {
  const state = startNight(1);
  const ticks = Math.ceil((CFG.SHIFT_SECONDS + 1) / CFG.TICK);
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) playTick(state);
  assert.equal(state.status, 'won', 'dawn is reachable');
  assert.ok(state.kills > 20, 'the shift was worked, not waited out');
  assert.ok(terminalScore(state) > CFG.WIN_BASE, 'a won shift outscores its own bonus');
});

test('HEADLESS LOSABLE PROOF: standing still feeds the lot all three lives', () => {
  const state = startNight(2);
  const ticks = Math.ceil(CFG.SHIFT_SECONDS / CFG.TICK);
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) step(state, CFG.TICK);
  assert.equal(state.status, 'lost');
  assert.equal(state.lives, 0);
  assert.ok(state.t < CFG.SHIFT_SECONDS, 'the night did not run out first');
});

test('the terminal score adds the dawn bonus only to a survived shift', () => {
  const won = startNight(4);
  won.score = 5000;
  won.lives = 2;
  won.status = 'won';
  assert.equal(terminalScore(won), 5000 + CFG.WIN_BASE + 2 * CFG.WIN_PER_LIFE);
  const lost = startNight(4);
  lost.score = 5000;
  lost.status = 'lost';
  assert.equal(terminalScore(lost), 5000, 'you keep what you killed');
});

test('finished shifts rank ahead of ended ones, then score, then survival', () => {
  const won = { status: 'won', score: 1000, survived: 90 };
  const lost = { status: 'lost', score: 9000, survived: 80 };
  assert.ok(compareRuns(won, lost) < 0);
  assert.ok(compareRuns({ ...lost, score: 9001 }, lost) < 0);
  assert.ok(compareRuns({ ...lost, survived: 85 }, lost) < 0);
});

// --- determinism and serializability ------------------------------------------------

test('same seed + same command log ⇒ identical final state', () => {
  const script = (state) => {
    for (let i = 0; i < 900; i += 1) {
      if (i === 10) applyCommand(state, { k: 'move', x: 1, y: 0.5 });
      if (i === 200) applyCommand(state, { k: 'aim', x: -1, y: 0.2 });
      if (i === 210) applyCommand(state, { k: 'fire', on: true });
      if (i === 600) applyCommand(state, { k: 'move', x: -1, y: -1 });
      step(state, CFG.TICK);
    }
  };
  const a = newGame(123);
  const b = newGame(123);
  begin(a);
  begin(b);
  script(a);
  script(b);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(runSummary(a), runSummary(b));
});

test('simulation state stays plain serializable data mid-firefight', () => {
  const state = startNight(31);
  applyCommand(state, { k: 'fire', on: true });
  for (let i = 0; i < 1200; i += 1) step(state, CFG.TICK);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

// --- THE STRESS PROOF: 500+ live entities, 60 simulated seconds ---------------------

test('STRESS: 500+ pooled entities step 60 sim-seconds with bounded time and zero growth', () => {
  const state = startNight(42);
  state.lives = 1e9; // pin the run open: this measures the hot loop, not the game
  applyCommand(state, { k: 'aim', x: 1, y: 0.3 });
  applyCommand(state, { k: 'fire', on: true }); // hold the trigger from mid-arena

  const flood = () => {
    let type = 0;
    while (state.liveEnemies < 500) {
      if (spawnEnemy(state, type % 3, 20 + ((type * 37) % 600), 70 + ((type * 61) % 390)) === -1) break;
      type += 1;
    }
  };
  flood();
  assert.ok(state.liveEnemies >= 500, 'the arena starts flooded');

  const enemiesRef = state.enemies;
  const bulletsRef = state.bullets;
  const ticks = Math.round(60 / CFG.TICK); // 3600 fixed steps
  let minLive = Infinity;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ticks; i += 1) {
    step(state, CFG.TICK);
    if (state.liveEnemies < 500) flood(); // keep the pressure at 500+
    if (state.liveEnemies < minLive) minLive = state.liveEnemies;
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

  // Bounded step time: 3600 steps of a 500+ entity arena in well under real
  // time. 4ms/step average would still be 60fps-safe; demand far better.
  assert.ok(elapsedMs < 4000, `3600 steps took ${elapsedMs.toFixed(1)}ms`);

  // Zero growth: the pools are the same arrays at the same sizes, and the
  // event/fx buffers never stretched.
  assert.equal(state.enemies, enemiesRef);
  assert.equal(state.bullets, bulletsRef);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
  assert.equal(state.bullets.length, CFG.BULLET_POOL);
  assert.equal(state.fx.length, CFG.FX_RING);
  assert.ok(state.events.length <= 16, 'the event buffer is reused, not accumulated');
  assert.ok(minLive >= 400, `pressure held (${minLive} live at the lowest ebb)`);
  assert.ok(state.kills > 100, 'the firefight was real');
});

// --- the cartridge --------------------------------------------------------------

function stubCtx() {
  const handler = {
    get(t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf' || prop === 'toString') return () => 0;
      return stubCtx();
    },
    set: () => true,
    apply: () => stubCtx(),
  };
  return new Proxy(function stub() {}, handler);
}

const inputStub = (over = {}) => ({
  down: () => false,
  pressed: () => false,
  touches: () => [],
  pointer: { x: 0, y: 0, down: false, justDown: false, justUp: false, moved: false },
  ...over,
});

function shellCtx(onEnd = () => {}) {
  return {
    width: 640, height: 480, palette, highScore: 0,
    endGame: onEnd, shake() {}, sfx: { play() {} },
  };
}

test('the cartridge names itself exactly as the manifest advertises it', () => {
  const cart = createGraveyardShift();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(createDefault, createGraveyardShift, 'the named export must be the default one');
});

test('the manifest passes the cabinet\'s own validator, accent and all', () => {
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.ok(Object.keys(palette).includes(manifest.artwork.accent));
  assert.equal(launchBlockReason(manifest), null);
});

test('the manifest imports no game code, so the rack can render a card cheaply', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('./manifest.js', import.meta.url), 'utf8'));
  assert.ok(!/\bimport\b/.test(source), 'manifest.js pulled something in');
});

test('it satisfies the cabinet cartridge contract', async () => {
  const entry = defineCatalogEntry(manifest, () => import('./graveyard-shift.js'));
  assert.equal(entry.id, 'graveyard-shift');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('launch, clock in, fight with mouse and sticks, and put it away without throwing', () => {
  const cart = createGraveyardShift();
  cart.init(shellCtx());
  cart.draw(stubCtx());
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true, down: true, justUp: false, moved: true } }));
  // Desktop: WASD held, mouse aiming, trigger down.
  for (let i = 0; i < 90; i += 1) {
    cart.update(1 / 60, inputStub({
      down: (...n) => n.includes('w') || n.includes('space'),
      pointer: { x: 500, y: 100, down: true, justDown: false, justUp: false, moved: true },
    }));
  }
  cart.draw(stubCtx());
  // Touch: both virtual sticks live at once.
  for (let i = 0; i < 90; i += 1) {
    cart.update(1 / 60, inputStub({ touches: () => [{ x: 80, y: 360 }, { x: 560, y: 350 }] }));
  }
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createGraveyardShift();
  const b = createGraveyardShift();
  a.init(shellCtx());
  b.init(shellCtx());
  for (let i = 0; i < 30; i += 1) a.update(1 / 60, inputStub());
  a.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.destroy();
});

test('a finished shift reports its terminal score to the shell exactly once', () => {
  const scores = [];
  const cart = createGraveyardShift();
  cart.init(shellCtx((score) => scores.push(score)));
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  // Stand there all night: the lot collects three lives, endGame follows.
  for (let i = 0; i < 60 * (CFG.SHIFT_SECONDS + 5) && scores.length === 0; i += 1) {
    cart.update(1 / 60, inputStub());
  }
  assert.equal(scores.length, 1);
  for (let i = 0; i < 120; i += 1) cart.update(1 / 60, inputStub());
  assert.equal(scores.length, 1, 'no second report');
  cart.destroy();
});
