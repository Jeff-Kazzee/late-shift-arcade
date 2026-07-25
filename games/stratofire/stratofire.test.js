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
  spawnEnemyBullet,
  step,
  terminalScore,
} from './logic.js';
import createDefault, { createStratofire } from './stratofire.js';
import { manifest } from './manifest.js';
import { palette } from '../../shell/palette.js';
import {
  activateCartridge,
  defineCatalogEntry,
  launchBlockReason,
  validateManifest,
} from '../../shell/cartridge.js';

const scramble = (seed) => {
  const state = newGame(seed);
  begin(state);
  return state;
};

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// The scripted playthrough policy: fly the way a person flies it — keep
// altitude sacred, point at the nearest bandit when safe, and let go of the
// trigger to mend. No adversarial search, no peeking at the rng.
function playTick(state) {
  let nearest = null;
  let best = Infinity;
  for (const e of state.enemies) {
    if (!e.on) continue;
    // Never chase boats down: only shoot at them from real altitude.
    if (e.type === 2 && state.py > 200) continue;
    let dx = e.x - state.px;
    // The sky wraps: consider the short way round.
    if (dx > CFG.W / 2) dx -= CFG.W;
    if (dx < -CFG.W / 2) dx += CFG.W;
    const dy = e.y - state.py;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      nearest = { dx, dy, dist: 0 };
    }
  }
  if (nearest) nearest.dist = Math.sqrt(best);

  // Altitude is sacred: break off early, long before the water is close.
  const danger =
    state.py > 260 || state.pvy > 140 || (state.py > 180 && state.pvy > 80);
  // Even in pursuit, never point more than a shallow dive below the horizon.
  let chaseA = -Math.PI / 2;
  if (nearest) {
    const maxDown = Math.abs(nearest.dx) * 0.3;
    chaseA = Math.atan2(Math.min(nearest.dy, maxDown), nearest.dx);
  }
  const targetA = danger ? -Math.PI / 2 : chaseA;
  const d = angleDiff(state.pa, targetA);
  applyCommand(state, { k: 'turn', dir: d > 0.06 ? 1 : d < -0.06 ? -1 : 0 });

  // Never sit still: a slow plane is a shot-down plane.
  const speed = Math.hypot(state.pvx, state.pvy);
  const thrust = danger
    ? Math.sin(state.pa) < 0.3 // nose not pointed hard at the sea
    : speed < 130 || (Math.abs(d) < 1.2 && speed < 320 && state.pvy < 120);
  applyCommand(state, { k: 'thrust', on: thrust });

  // Shoot at what is close and ahead; mend early — the regen only works
  // with the trigger up.
  const aligned =
    nearest !== null && nearest.dist < 240 && Math.abs(d) < 0.7 && !danger;
  applyCommand(state, { k: 'fire', on: aligned && state.hull > 40 });
  step(state, CFG.TICK);
}

// --- the seed and the pools ---------------------------------------------------

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  assert.deepEqual(Array.from({ length: 4 }, mulberry32(8)), Array.from({ length: 4 }, mulberry32(8)));
  assert.ok(Array.from({ length: 500 }, mulberry32(1)).every((v) => v >= 0 && v < 1));
});

test('a seed names one exact sortie', () => {
  const a = scramble(55);
  const b = scramble(55);
  applyCommand(a, { k: 'thrust', on: true });
  applyCommand(b, { k: 'thrust', on: true });
  for (let i = 0; i < 600; i += 1) {
    step(a, CFG.TICK);
    step(b, CFG.TICK);
  }
  assert.deepStrictEqual(a, b);
});

test('pools are allocated once at their fixed capacities', () => {
  const state = newGame(1);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
  assert.equal(state.pbullets.length, CFG.PBULLET_POOL);
  assert.equal(state.ebullets.length, CFG.EBULLET_POOL);
  assert.ok(CFG.ENEMY_POOL + CFG.EBULLET_POOL >= 500, 'the sky is built for a flood');
});

test('saturated pools skip the spawn instead of growing', () => {
  const state = scramble(3);
  for (let i = 0; i < CFG.ENEMY_POOL; i += 1) spawnEnemy(state, 0, 100, 100);
  assert.equal(spawnEnemy(state, 0, 100, 100), -1);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
  for (let i = 0; i < CFG.EBULLET_POOL; i += 1) spawnEnemyBullet(state, 0, 0, 1, 1);
  assert.equal(spawnEnemyBullet(state, 0, 0, 1, 1), -1);
  assert.equal(state.ebullets.length, CFG.EBULLET_POOL);
});

// --- flight model ----------------------------------------------------------------

test('commands are validated; turn is a tri-state', () => {
  const state = scramble(5);
  assert.equal(applyCommand(state, { k: 'turn', dir: 2 }), false);
  assert.equal(applyCommand(state, { k: 'turn', dir: -1 }), true);
  assert.equal(applyCommand(state, { k: 'nonsense' }), false);
  const fresh = newGame(5);
  assert.equal(applyCommand(fresh, { k: 'begin' }), true);
  assert.equal(applyCommand(fresh, { k: 'begin' }), false, 'begin is one-shot');
});

test('gravity always pulls and thrust is a vector along the nose', () => {
  const state = scramble(7);
  const y0 = state.py;
  for (let i = 0; i < 30; i += 1) step(state, CFG.TICK); // no thrust: fall
  assert.ok(state.py > y0, 'the plane drops without thrust');
  const falling = state.pvy;
  applyCommand(state, { k: 'thrust', on: true }); // nose starts up
  for (let i = 0; i < 30; i += 1) step(state, CFG.TICK);
  assert.ok(state.pvy < falling, 'thrust along an up-pointed nose fights the fall');
});

test('the sea ends the run in one touch', () => {
  const state = scramble(2);
  let ticks = 0;
  while (state.status === 'running' && ticks < 600) {
    step(state, CFG.TICK);
    ticks += 1;
  }
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'splashed');
  assert.ok(ticks < 300, 'an unflown plane finds the water fast');
});

test('the hull mends only while the trigger is released', () => {
  const state = scramble(9);
  state.hull = 50;
  applyCommand(state, { k: 'thrust', on: true });
  applyCommand(state, { k: 'fire', on: true });
  step(state, CFG.TICK);
  assert.equal(state.hull, 50, 'guns hot: no healing');
  applyCommand(state, { k: 'fire', on: false });
  for (let i = 0; i < 60; i += 1) step(state, CFG.TICK);
  assert.ok(state.hull > 60, 'guns quiet: the crew works');
});

test('ramming downs the bandit but pays hull, not points', () => {
  const state = scramble(11);
  state.fighterT = 999;
  state.boatT = 999;
  applyCommand(state, { k: 'thrust', on: true });
  spawnEnemy(state, 0, state.px + 4, state.py, Math.PI);
  const score = state.score;
  step(state, CFG.TICK);
  assert.equal(state.liveEnemies, 0, 'the exchange is always lost by them');
  assert.equal(state.score, score, 'no points for a collision');
  assert.equal(state.kills, 0);
  assert.ok(state.hull <= CFG.HULL - CFG.RAM_DMG + 1);
});

// --- the chain and the documented formula ---------------------------------------

test('kills pay value × chain multiplier, and the chain dies of silence', () => {
  const state = scramble(13);
  state.fighterT = 999;
  state.boatT = 999;
  state.chain = 4;
  state.chainT = CFG.CHAIN_WINDOW;
  // A fighter parked dead ahead, two rounds needed.
  spawnEnemy(state, 0, state.px + 60, state.py, Math.PI);
  const e = state.enemies[0];
  e.cd = 999; // it never gets a shot off
  applyCommand(state, { k: 'aim' }); // no such command — refused, aim is the nose
  state.pa = 0; // point straight at it
  applyCommand(state, { k: 'fire', on: true });
  const before = state.score;
  for (let i = 0; i < 40 && state.kills === 0; i += 1) step(state, CFG.TICK);
  assert.equal(state.kills, 1);
  assert.equal(state.score - before, TYPES[0].value * Math.min(CFG.CHAIN_CAP, 1 + 5));
  state.chainT = 0.01;
  applyCommand(state, { k: 'fire', on: false });
  step(state, CFG.TICK);
  assert.equal(state.chain, 0);
  assert.equal(multiplier(state), 1);
});

test('the fortieth kill completes the sortie and banks the hull bonus', () => {
  const state = scramble(17);
  state.fighterT = 999;
  state.boatT = 999;
  state.kills = CFG.SORTIE_KILLS - 1;
  state.score = 1000;
  state.hull = 80;
  state.pa = 0;
  spawnEnemy(state, 0, state.px + 60, state.py, Math.PI);
  state.enemies[0].cd = 999;
  state.enemies[0].hp = 1;
  applyCommand(state, { k: 'fire', on: true });
  for (let i = 0; i < 40 && state.status === 'running'; i += 1) step(state, CFG.TICK);
  assert.equal(state.status, 'won');
  assert.equal(
    terminalScore(state),
    state.score + CFG.WIN_BASE + CFG.WIN_PER_HULL * Math.round(state.hull),
  );
});

test('HEADLESS WINNABLE PROOF: a careful pilot completes the sortie', () => {
  const state = scramble(1);
  const ticks = Math.ceil(240 / CFG.TICK);
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) playTick(state);
  assert.equal(state.status, 'won', `sortie ends ${state.status} (${state.failure}) after ${state.kills} kills at t=${state.t.toFixed(1)}`);
  assert.ok(terminalScore(state) > CFG.WIN_BASE);
});

test('HEADLESS LOSABLE PROOF: an idle plane splashes; a straight-line pilot is shot down or splashes', () => {
  const idle = scramble(4);
  for (let i = 0; i < 600 && idle.status === 'running'; i += 1) step(idle, CFG.TICK);
  assert.equal(idle.status, 'lost');
  assert.equal(idle.failure, 'splashed');
  assert.equal(terminalScore(idle), 0, 'nothing shot down, nothing kept');
});

test('completed sorties rank ahead of ended ones, then score, then kills', () => {
  const won = { status: 'won', score: 1000, kills: 40 };
  const lost = { status: 'lost', score: 90000, kills: 39 };
  assert.ok(compareRuns(won, lost) < 0);
  assert.ok(compareRuns({ ...lost, score: 90001 }, lost) < 0);
  assert.ok(compareRuns({ ...lost, kills: 40 }, lost) < 0);
});

// --- determinism and serializability ------------------------------------------------

test('same seed + same command log ⇒ identical final state', () => {
  const script = (state) => {
    for (let i = 0; i < 900; i += 1) {
      if (i === 5) applyCommand(state, { k: 'thrust', on: true });
      if (i === 60) applyCommand(state, { k: 'turn', dir: 1 });
      if (i === 130) applyCommand(state, { k: 'turn', dir: 0 });
      if (i === 140) applyCommand(state, { k: 'fire', on: true });
      if (i === 400) applyCommand(state, { k: 'fire', on: false });
      step(state, CFG.TICK);
    }
  };
  const a = newGame(321);
  const b = newGame(321);
  begin(a);
  begin(b);
  script(a);
  script(b);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(runSummary(a), runSummary(b));
});

test('simulation state stays plain serializable data mid-dogfight', () => {
  const state = scramble(31);
  applyCommand(state, { k: 'thrust', on: true });
  applyCommand(state, { k: 'fire', on: true });
  for (let i = 0; i < 1200 && state.status === 'running'; i += 1) step(state, CFG.TICK);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

// --- THE STRESS PROOF: 500+ live entities, 60 simulated seconds ---------------------

test('STRESS: 500+ pooled entities step 60 sim-seconds with bounded time and zero growth', () => {
  const state = scramble(42);
  state.hull = 1e12; // pin the run open: this measures the hot loop, not the game
  state.kills = -1e9; // the sortie can never complete inside the window
  state.pa = -Math.PI / 2;
  applyCommand(state, { k: 'thrust', on: true }); // hold the ceiling, clear of the sea
  applyCommand(state, { k: 'fire', on: true });

  const liveCount = () => {
    let n = state.liveEnemies;
    for (let i = 0; i < state.pbullets.length; i += 1) if (state.pbullets[i].on) n += 1;
    for (let i = 0; i < state.ebullets.length; i += 1) if (state.ebullets[i].on) n += 1;
    return n;
  };
  const flood = () => {
    let k = 0;
    while (state.liveEnemies < CFG.ENEMY_POOL) {
      if (spawnEnemy(state, k % 2 === 0 ? 0 : 1, (k * 53) % CFG.W, 30 + ((k * 37) % 300)) === -1) break;
      k += 1;
    }
    for (let i = 0; i < CFG.EBULLET_POOL; i += 1) {
      const b = state.ebullets[i];
      if (!b.on) spawnEnemyBullet(state, (i * 91) % CFG.W, 30 + ((i * 47) % 300), 20, -4, 60);
    }
  };
  flood();
  assert.ok(liveCount() >= 500, `the sky starts flooded (${liveCount()})`);

  const enemiesRef = state.enemies;
  const ticks = Math.round(60 / CFG.TICK); // 3600 fixed steps
  let minLive = Infinity;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ticks; i += 1) {
    step(state, CFG.TICK);
    if ((i & 31) === 0) {
      const live = liveCount();
      if (live < minLive) minLive = live;
      if (live < 500) flood();
    }
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

  assert.ok(elapsedMs < 4000, `3600 steps took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(state.enemies, enemiesRef);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
  assert.equal(state.pbullets.length, CFG.PBULLET_POOL);
  assert.equal(state.ebullets.length, CFG.EBULLET_POOL);
  assert.equal(state.fx.length, CFG.FX_RING);
  assert.ok(state.events.length <= 16, 'the event buffer is reused, not accumulated');
  assert.ok(minLive >= 400, `pressure held (${minLive} live at the lowest ebb)`);
  assert.equal(state.status, 'running', 'the measurement ran the full window');
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
  const cart = createStratofire();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(createDefault, createStratofire, 'the named export must be the default one');
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
  const entry = defineCatalogEntry(manifest, () => import('./stratofire.js'));
  assert.equal(entry.id, 'stratofire');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('launch, scramble, fly with keys and with buttons, and put it away without throwing', () => {
  const cart = createStratofire();
  cart.init(shellCtx());
  cart.draw(stubCtx());
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true, down: true, justUp: false, moved: true } }));
  // Desktop: thrust and turn on keys, space firing.
  for (let i = 0; i < 90; i += 1) {
    cart.update(1 / 60, inputStub({ down: (...n) => n.includes('w') || n.includes('arrowleft') || n.includes('space') }));
  }
  cart.draw(stubCtx());
  // Touch: thrust and fire buttons held.
  for (let i = 0; i < 90; i += 1) {
    cart.update(1 / 60, inputStub({ touches: () => [{ x: 578, y: 430 }, { x: 476, y: 430 }] }));
  }
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createStratofire();
  const b = createStratofire();
  a.init(shellCtx());
  b.init(shellCtx());
  for (let i = 0; i < 30; i += 1) a.update(1 / 60, inputStub());
  a.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.destroy();
});

test('a finished sortie reports its terminal score to the shell exactly once', () => {
  const scores = [];
  const cart = createStratofire();
  cart.init(shellCtx((score) => scores.push(score)));
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  // Hands off the stick: the plane splashes, endGame(0) follows.
  for (let i = 0; i < 60 * 20 && scores.length === 0; i += 1) {
    cart.update(1 / 60, inputStub());
  }
  assert.deepEqual(scores, [0]);
  for (let i = 0; i < 120; i += 1) cart.update(1 / 60, inputStub());
  assert.deepEqual(scores, [0], 'no second report');
  cart.destroy();
});
