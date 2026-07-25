import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  TYPES,
  applyCommand,
  begin,
  compareRuns,
  killValue,
  loopScale,
  mulberry32,
  newGame,
  runSummary,
  spawnEnemy,
  spawnEnemyBullet,
  step,
  terminalScore,
} from './logic.js';
import createDefault, { createNeonTide } from './neon-tide.js';
import { manifest } from './manifest.js';
import { palette } from '../../shell/palette.js';
import {
  activateCartridge,
  defineCatalogEntry,
  launchBlockReason,
  validateManifest,
} from '../../shell/cartridge.js';

const diveIn = (seed) => {
  const state = newGame(seed);
  begin(state);
  return state;
};

// The scripted playthrough policy: play the way a person plays it — read the
// screen, sit in the emptiest lane, snap to the boss's lane right after each
// fan (the cadence a player learns), and extract when the water goes slack.
// No adversarial search, no peeking at the rng.
function playTick(state) {
  const midY = (CFG.FIELD.y0 + CFG.FIELD.y1) / 2;
  let pickup = null;
  if (!state.boss.on) {
    for (const p of state.pickups) {
      if (p.on) {
        pickup = p;
        break;
      }
    }
  }
  const alignBurst = state.boss.on && state.boss.cd > 0.4;

  let bestLane = state.py;
  let bestScore = Infinity;
  const y0 = CFG.FIELD.y0 + 30;
  const y1 = CFG.FIELD.y1 - 30;
  for (let lane = y0; lane <= y1; lane += (y1 - y0) / 12) {
    let score = 0;
    for (const e of state.enemies) {
      if (!e.on) continue;
      const ahead = e.x - state.px;
      if (ahead < -30 || ahead > 420) continue;
      const closeness = 1 - ahead / 420;
      const ey = e.type === 0 ? e.baseY : e.y;
      const band = e.type === 0 ? 78 : 46;
      const dy = Math.abs(ey - lane);
      if (dy < band) score += (1 + closeness * 3) * (1 - dy / band);
    }
    for (const b of state.ebullets) {
      if (!b.on || b.vx >= 0) continue;
      const ahead = b.x - state.px;
      if (ahead < -10 || ahead > 380) continue;
      const closeness = 1 - ahead / 380;
      // Where will the round be when it crosses our column?
      const eta = ahead / Math.max(60, -b.vx);
      const by = b.y + b.vy * eta;
      const dy = Math.abs(by - lane);
      if (dy < 44) score += (1 + closeness * 4) * (1 - dy / 44);
    }
    score += Math.abs(lane - state.py) * 0.004; // hysteresis
    if (state.boss.on) {
      score += Math.abs(lane - state.boss.y) * (alignBurst ? 0.12 : 0.001);
    } else if (pickup) {
      score += Math.abs(lane - pickup.y) * 0.01;
    } else {
      score += Math.abs(lane - midY) * 0.002;
    }
    if (score < bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }

  const dy = bestLane - state.py;
  const dx = 80 - state.px;
  applyCommand(state, { k: 'move', x: dx > 8 ? 1 : dx < -8 ? -1 : 0, y: dy > 8 ? 1 : dy < -8 ? -1 : 0 });
  applyCommand(state, { k: 'fire', on: true });
  if (state.phase === 'window' && state.windowT < 7.5) {
    applyCommand(state, { k: 'extract' });
  }
  step(state, CFG.TICK);
}

// --- the seed and the pools ---------------------------------------------------

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  assert.deepEqual(Array.from({ length: 4 }, mulberry32(8)), Array.from({ length: 4 }, mulberry32(8)));
  assert.ok(Array.from({ length: 500 }, mulberry32(1)).every((v) => v >= 0 && v < 1));
});

test('a seed names one exact tide', () => {
  const a = diveIn(66);
  const b = diveIn(66);
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
  assert.equal(state.pickups.length, CFG.PICKUP_POOL);
  assert.ok(CFG.ENEMY_POOL + CFG.EBULLET_POOL >= 500, 'the water is built for a flood');
});

test('saturated pools skip the spawn instead of growing', () => {
  const state = diveIn(3);
  for (let i = 0; i < CFG.ENEMY_POOL; i += 1) spawnEnemy(state, 0, 500, 200);
  assert.equal(spawnEnemy(state, 0, 500, 200), -1);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
  for (let i = 0; i < CFG.EBULLET_POOL; i += 1) spawnEnemyBullet(state, 500, 200, -10, 0);
  assert.equal(spawnEnemyBullet(state, 500, 200, -10, 0), -1);
  assert.equal(state.ebullets.length, CFG.EBULLET_POOL);
});

// --- commands and the weapon ladder -----------------------------------------------

test('commands are validated; extraction is only legal in slack water', () => {
  const state = newGame(5);
  assert.equal(applyCommand(state, { k: 'extract' }), false, 'not while briefing');
  assert.equal(applyCommand(state, { k: 'begin' }), true);
  assert.equal(applyCommand(state, { k: 'begin' }), false, 'begin is one-shot');
  assert.equal(applyCommand(state, { k: 'extract' }), false, 'not mid-wave');
  assert.equal(applyCommand(state, { k: 'move', x: NaN, y: 0 }), false);
  assert.equal(applyCommand(state, { k: 'nonsense' }), false);
  state.phase = 'window';
  state.windowT = 5;
  assert.equal(applyCommand(state, { k: 'extract' }), true);
  assert.equal(state.status, 'won');
});

test('carriers drop cores, cores climb the ladder, and dying costs a tier', () => {
  const state = diveIn(7);
  state.waveT = 999; // hold the tide still
  spawnEnemy(state, 3, state.px + 80, state.py); // a carrier dead ahead
  applyCommand(state, { k: 'fire', on: true });
  for (let i = 0; i < 120 && state.weapon === 0; i += 1) step(state, CFG.TICK);
  assert.equal(state.weapon, 1, 'the dropped core drifted home');
  // Now die: a rusher right on the hull.
  state.invuln = 0;
  applyCommand(state, { k: 'fire', on: false });
  spawnEnemyBullet(state, state.px + 6, state.py, -10, 0);
  for (let i = 0; i < 10 && state.lives === CFG.LIVES; i += 1) step(state, CFG.TICK);
  assert.equal(state.lives, CFG.LIVES - 1);
  assert.equal(state.weapon, 0, 'the tier washed away');
});

test('a death clears every hostile round — respawns are never instant deaths', () => {
  const state = diveIn(9);
  state.waveT = 999;
  for (let i = 0; i < 40; i += 1) spawnEnemyBullet(state, 400 + i * 4, 200, -100, 0);
  state.invuln = 0;
  spawnEnemyBullet(state, state.px + 4, state.py, -10, 0);
  for (let i = 0; i < 10 && state.lives === CFG.LIVES; i += 1) step(state, CFG.TICK);
  assert.equal(state.lives, CFG.LIVES - 1);
  let live = 0;
  for (const b of state.ebullets) if (b.on) live += 1;
  assert.equal(live, 0);
  assert.ok(state.invuln > 0);
});

test('turrets never fire from beyond the right edge', () => {
  const state = diveIn(11);
  state.waveT = 999;
  const offscreen = spawnEnemy(state, 2, CFG.FIELD.x1 + 15, state.py);
  state.enemies[offscreen].cd = 0;
  step(state, CFG.TICK);
  let live = 0;
  for (const b of state.ebullets) if (b.on) live += 1;
  assert.equal(live, 0, 'no undodgeable shots');
});

// --- the timeline: bosses, the window, the loop -------------------------------------

test('the mid-boss takes the channel on schedule and pauses the waves', () => {
  const state = diveIn(13);
  state.t = CFG.BOSS1_T - 0.01;
  step(state, CFG.TICK);
  assert.equal(state.phase, 'boss');
  assert.ok(state.boss.on);
  assert.equal(state.boss.kind, 1);
  assert.equal(state.boss.hpMax, CFG.BOSS1_HP);
});

test('dropping the end-boss opens the window; letting it close rides the next loop', () => {
  const state = diveIn(17);
  state.bossesDown = 1; // mid already down
  state.t = CFG.BOSS2_T;
  step(state, CFG.TICK);
  assert.equal(state.boss.kind, 2);
  state.boss.hp = 1;
  // Park a round inside the boss.
  state.pbullets[0].on = true;
  state.pbullets[0].x = state.boss.x;
  state.pbullets[0].y = state.boss.y;
  state.pbullets[0].vx = 0;
  state.pbullets[0].vy = 0;
  step(state, CFG.TICK);
  assert.equal(state.boss.on, false);
  assert.equal(state.phase, 'window');
  const scoreAfterBoss = state.score;
  assert.ok(scoreAfterBoss >= CFG.BOSS2_VALUE);
  // Let the window close: the tide comes back harder.
  for (let i = 0; i < Math.ceil((CFG.EXTRACT_WINDOW + 0.5) / CFG.TICK); i += 1) step(state, CFG.TICK);
  assert.equal(state.loop, 1);
  assert.equal(state.phase, 'wave');
  assert.equal(loopScale(state), 1.5);
  // Loop-2 spawns really are tougher and worth more.
  const slot = spawnEnemy(state, 2, 500, 200);
  assert.equal(state.enemies[slot].hp, Math.ceil(TYPES[2].hp * 1.5));
  assert.equal(killValue(state, TYPES[0].value), TYPES[0].value * 2);
});

// --- win, loss, and the documented formula ------------------------------------------

test('HEADLESS WINNABLE PROOF: a lane-reading gunner drops both bosses and extracts', () => {
  const state = diveIn(1);
  const ticks = Math.ceil(300 / CFG.TICK);
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) playTick(state);
  assert.equal(
    state.status,
    'won',
    `tide ends ${state.status} after ${state.kills} kills, ${state.bossesDown} bosses, t=${state.t.toFixed(1)}`,
  );
  assert.equal(state.bossesDown, 2);
  assert.ok(terminalScore(state) > CFG.EXTRACT_BASE);
});

test('HEADLESS LOSABLE PROOF: an idle ship is lost to the tide with nothing banked', () => {
  const state = diveIn(2);
  for (let i = 0; i < 60 * 120 && state.status === 'running'; i += 1) step(state, CFG.TICK);
  assert.equal(state.status, 'lost');
  assert.equal(state.lives, 0);
  assert.equal(terminalScore(state), 0, 'no kills, no extraction, no score');
});

test('the extraction bonus pays loops and ships, and only on a win', () => {
  const won = diveIn(4);
  won.status = 'won';
  won.score = 3000;
  won.loop = 1;
  won.lives = 2;
  assert.equal(
    terminalScore(won),
    3000 + CFG.EXTRACT_BASE + CFG.EXTRACT_PER_LOOP + 2 * CFG.EXTRACT_PER_LIFE,
  );
  const lost = diveIn(4);
  lost.status = 'lost';
  lost.score = 3000;
  assert.equal(terminalScore(lost), 3000, 'you keep what the tide paid');
});

test('extracted runs rank ahead of drowned ones, then score, loops, kills', () => {
  const won = { status: 'won', score: 1000, loops: 0, kills: 30 };
  const lost = { status: 'lost', score: 90000, loops: 2, kills: 200 };
  assert.ok(compareRuns(won, lost) < 0);
  assert.ok(compareRuns({ ...lost, score: 90001 }, lost) < 0);
  assert.ok(compareRuns({ ...lost, loops: 3 }, lost) < 0);
  assert.ok(compareRuns({ ...lost, kills: 201 }, lost) < 0);
});

// --- determinism and serializability ------------------------------------------------

test('same seed + same command log ⇒ identical final state', () => {
  const script = (state) => {
    for (let i = 0; i < 900; i += 1) {
      if (i === 5) applyCommand(state, { k: 'fire', on: true });
      if (i === 60) applyCommand(state, { k: 'move', x: 0, y: 1 });
      if (i === 300) applyCommand(state, { k: 'move', x: 1, y: -1 });
      if (i === 600) applyCommand(state, { k: 'move', x: 0, y: 0 });
      step(state, CFG.TICK);
    }
  };
  const a = newGame(456);
  const b = newGame(456);
  begin(a);
  begin(b);
  script(a);
  script(b);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(runSummary(a), runSummary(b));
});

test('simulation state stays plain serializable data mid-tide', () => {
  const state = diveIn(31);
  applyCommand(state, { k: 'fire', on: true });
  for (let i = 0; i < 1500 && state.status === 'running'; i += 1) step(state, CFG.TICK);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

// --- THE STRESS PROOF: 500+ live entities, 60 simulated seconds ---------------------

test('STRESS: 500+ pooled entities step 60 sim-seconds with bounded time and zero growth', () => {
  const state = diveIn(42);
  state.invuln = 1e9; // pin the ship open: this measures the hot loop, not the game
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
      if (spawnEnemy(state, k % 4, 340 + ((k * 53) % 280), 90 + ((k * 37) % 340)) === -1) break;
      k += 1;
    }
    for (let i = 0; i < CFG.EBULLET_POOL; i += 1) {
      const b = state.ebullets[i];
      // Slow drifters live for the whole window without leaving the field.
      if (!b.on) spawnEnemyBullet(state, 340 + ((i * 91) % 280), 90 + ((i * 47) % 340), -4, 0);
    }
  };
  flood();
  assert.ok(liveCount() >= 500, `the water starts flooded (${liveCount()})`);

  const enemiesRef = state.enemies;
  const ticks = Math.round(60 / CFG.TICK); // 3600 fixed steps
  let minLive = Infinity;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ticks; i += 1) {
    step(state, CFG.TICK);
    if ((i & 15) === 0) {
      const live = liveCount();
      if (live < minLive) minLive = live;
      if (live < 520) flood();
    }
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

  assert.ok(elapsedMs < 4000, `3600 steps took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(state.enemies, enemiesRef);
  assert.equal(state.enemies.length, CFG.ENEMY_POOL);
  assert.equal(state.pbullets.length, CFG.PBULLET_POOL);
  assert.equal(state.ebullets.length, CFG.EBULLET_POOL);
  assert.equal(state.pickups.length, CFG.PICKUP_POOL);
  assert.equal(state.fx.length, CFG.FX_RING);
  assert.ok(state.events.length <= 16, 'the event buffer is reused, not accumulated');
  assert.ok(minLive >= 450, `pressure held (${minLive} live at the lowest ebb)`);
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
  const cart = createNeonTide();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(createDefault, createNeonTide, 'the named export must be the default one');
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
  const entry = defineCatalogEntry(manifest, () => import('./neon-tide.js'));
  assert.equal(entry.id, 'neon-tide');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('launch, dive in, fly with keys and with the stick, and put it away without throwing', () => {
  const cart = createNeonTide();
  cart.init(shellCtx());
  cart.draw(stubCtx());
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true, down: true, justUp: false, moved: true } }));
  // Desktop: arrows move, space fires.
  for (let i = 0; i < 90; i += 1) {
    cart.update(1 / 60, inputStub({ down: (...n) => n.includes('up') || n.includes('space') }));
  }
  cart.draw(stubCtx());
  // Touch: stick on the left, trigger finger on the right.
  for (let i = 0; i < 90; i += 1) {
    cart.update(1 / 60, inputStub({ touches: () => [{ x: 90, y: 360 }, { x: 520, y: 240 }] }));
  }
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createNeonTide();
  const b = createNeonTide();
  a.init(shellCtx());
  b.init(shellCtx());
  for (let i = 0; i < 30; i += 1) a.update(1 / 60, inputStub());
  a.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.destroy();
});

test('a finished tide reports its terminal score to the shell exactly once', () => {
  const scores = [];
  const cart = createNeonTide();
  cart.init(shellCtx((score) => scores.push(score)));
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  // Hands off the stick: the tide takes all three ships, endGame(0) follows.
  for (let i = 0; i < 60 * 150 && scores.length === 0; i += 1) {
    cart.update(1 / 60, inputStub());
  }
  assert.deepEqual(scores, [0]);
  for (let i = 0; i < 120; i += 1) cart.update(1 / 60, inputStub());
  assert.deepEqual(scores, [0], 'no second report');
  cart.destroy();
});
