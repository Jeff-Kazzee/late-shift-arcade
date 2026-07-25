import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  COURSE,
  applyCommand,
  begin,
  canFling,
  compareRuns,
  courierX,
  fling,
  mulberry32,
  newGame,
  runSummary,
  step,
  terminalScore,
} from './logic.js';
import createDefault, { createRagdollRelay } from './ragdoll-relay.js';
import { manifest } from './manifest.js';
import { palette } from '../../shell/palette.js';
import {
  activateCartridge,
  defineCatalogEntry,
  launchBlockReason,
  validateManifest,
} from '../../shell/cartridge.js';

const clockIn = (seed) => {
  const state = newGame(seed);
  begin(state);
  return state;
};

// Step until the ragdoll settles enough to throw (the wind keeps it swaying,
// so a fixed wait is never honest).
function settle(state, maxTicks = 900) {
  for (let i = 0; i < maxTicks && !canFling(state); i += 1) step(state, CFG.TICK);
  return canFling(state);
}

// The scripted playthrough policy: play it the way a person plays it — wait
// for the courier to settle, throw up-and-right, lean right in the air.
// No adversarial search, no peeking at the rng.
function playTick(state, sinceFling) {
  if (canFling(state) && sinceFling.t > 0.4) {
    applyCommand(state, { k: 'fling', ang: -0.7, pow: 0.8 });
    sinceFling.t = 0;
  }
  sinceFling.t += CFG.TICK;
  applyCommand(state, { k: 'nudge', dir: 1 });
  step(state, CFG.TICK);
}

function deliver(seed) {
  const state = clockIn(seed);
  const sinceFling = { t: 1 };
  const ticks = Math.ceil(CFG.TIME_LIMIT / CFG.TICK) + 10;
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) {
    playTick(state, sinceFling);
  }
  return state;
}

// --- the seed and the wind ---------------------------------------------------

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  assert.deepEqual(Array.from({ length: 4 }, mulberry32(8)), Array.from({ length: 4 }, mulberry32(8)));
  assert.ok(Array.from({ length: 500 }, mulberry32(1)).every((v) => v >= 0 && v < 1));
});

test('a seed names one exact night of wind', () => {
  assert.deepStrictEqual(newGame(77).wind, newGame(77).wind);
  assert.notDeepStrictEqual(newGame(77).wind, newGame(78).wind);
  for (const gust of newGame(5).wind) {
    assert.ok(Math.abs(gust.ax) <= CFG.WIND_MAX);
  }
});

test('the course is honest: gates in order, finish past the last gate, spikes marked', () => {
  let last = 0;
  for (const gate of COURSE.gates) {
    assert.ok(gate.x > last);
    last = gate.x;
  }
  assert.ok(COURSE.finishX > last);
  assert.ok(COURSE.platforms.some((p) => p.spikes), 'the pit exists');
});

// --- the verbs ------------------------------------------------------------------

test('a fling is refused mid-air and honoured from the ground', () => {
  const state = clockIn(3);
  assert.equal(settle(state), true, 'settled and grounded');
  assert.equal(fling(state, -0.7, 0.8), true);
  assert.equal(state.flings, 1);
  for (let i = 0; i < 10; i += 1) step(state, CFG.TICK);
  assert.equal(canFling(state), false, 'airborne now');
  assert.equal(fling(state, -0.7, 0.8), false, 'no double-jumping a ragdoll');
  assert.equal(state.flings, 1);
});

test('commands are validated and refused outside a running run', () => {
  const state = newGame(5);
  assert.equal(applyCommand(state, { k: 'fling', ang: -0.7, pow: 1 }), false, 'not in briefing');
  assert.equal(applyCommand(state, { k: 'begin' }), true);
  assert.equal(applyCommand(state, { k: 'begin' }), false, 'begin is one-shot');
  assert.equal(applyCommand(state, { k: 'nudge', dir: 2 }), false);
  assert.equal(applyCommand(state, { k: 'nonsense' }), false);
  for (let i = 0; i < 30; i += 1) step(state, CFG.TICK);
  assert.equal(applyCommand(state, { k: 'fling', ang: NaN, pow: 1 }), false);
});

test('gravity is real: an unflung courier stays put, a flung one flies and falls', () => {
  const state = clockIn(7);
  assert.equal(settle(state), true);
  const restX = courierX(state);
  assert.equal(fling(state, -0.7, 0.8), true);
  let peak = 480;
  for (let i = 0; i < 90; i += 1) {
    step(state, CFG.TICK);
    peak = Math.min(peak, state.points[1].y);
  }
  assert.ok(courierX(state) > restX + 60, 'it travelled');
  assert.ok(peak < COURSE.start.spawnY - CFG.SEG - 10, 'it rose above its own head');
  assert.ok(state.grounded === 0 || state.points[1].y > peak, 'and it came back down');
});

test('falling off the city is an automatic reset back to the last gate', () => {
  const state = clockIn(9);
  // Park the whole tangle over the first gap (360..440) and let go — state
  // is plain data, and the gap has no floor before the long dark.
  for (const p of state.points) {
    p.x = 400;
    p.y = 300;
    p.px = p.x;
    p.py = p.y;
  }
  let ticks = 0;
  while (state.resets === 0 && ticks < 600) {
    step(state, CFG.TICK);
    ticks += 1;
  }
  assert.equal(state.resets, 1, 'the drop was counted');
  assert.equal(state.status, 'running');
  assert.ok(courierX(state) < 200, 'back at the start spawn');
});

test('spikes chew the parcel and can end the run', () => {
  const state = clockIn(11);
  // Drop the whole tangle straight into the pit (state is plain data).
  const pit = COURSE.platforms.find((p) => p.spikes);
  const px = (pit.x0 + pit.x1) / 2;
  for (const p of state.points) {
    p.x = px;
    p.y = pit.y - 40;
    p.px = p.x;
    p.py = p.y - 1;
  }
  let ticks = 0;
  while (state.status === 'running' && ticks < 60 * 20) {
    step(state, CFG.TICK);
    ticks += 1;
  }
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'shattered');
  assert.equal(state.integrity, 0);
  assert.equal(terminalScore(state), 0, 'a broken parcel pays nothing');
});

test('the seventh reset wrecks the courier', () => {
  const state = clockIn(13);
  for (let i = 0; i < CFG.MAX_RESETS; i += 1) {
    assert.equal(applyCommand(state, { k: 'reset' }), true);
    assert.equal(state.status, 'running');
  }
  assert.equal(applyCommand(state, { k: 'reset' }), true);
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'wrecked');
});

// --- win, loss, and the documented formula ------------------------------------------

test('HEADLESS WINNABLE PROOF: throw, drift, and the parcel reaches the depot', () => {
  for (const seed of [1, 7, 42]) {
    const state = deliver(seed);
    assert.equal(state.status, 'won', `night ${seed} ends ${state.status} (${state.failure}) at x=${courierX(state).toFixed(0)}`);
    assert.equal(state.gate, COURSE.gates.length, 'every relay gate crossed in order');
    assert.ok(state.integrity > 0);
    assert.ok(terminalScore(state) > 0);
  }
});

test('HEADLESS LOSABLE PROOF: a courier who never throws is simply late', () => {
  const state = clockIn(2);
  const ticks = Math.ceil((CFG.TIME_LIMIT + 1) / CFG.TICK);
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) step(state, CFG.TICK);
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'late');
  assert.equal(terminalScore(state), 0);
});

test('the score pays speed and an intact parcel, and charges for resets', () => {
  const state = deliver(1);
  assert.equal(state.status, 'won');
  const expected = Math.max(
    0,
    Math.max(0, CFG.SCORE_TIME_MAX - Math.round((state.t * 1000) / 10)) +
      state.integrity * CFG.SCORE_INTEGRITY -
      state.resets * CFG.PENALTY_RESET,
  );
  assert.equal(terminalScore(state), Math.round(expected));
  // The same delivery with one more reset would have paid less.
  const cheaper = { ...state, resets: state.resets + 1 };
  assert.ok(terminalScore(cheaper) < terminalScore(state));
});

test('deliveries rank ahead of wipeouts, then score, then fewer resets', () => {
  const won = { status: 'won', score: 100000, resets: 2 };
  const lost = { status: 'lost', score: 0, resets: 0 };
  assert.ok(compareRuns(won, lost) < 0);
  assert.ok(compareRuns({ ...won, score: 100001 }, won) < 0);
  assert.ok(compareRuns({ ...won, resets: 1 }, won) < 0);
});

// --- determinism and serializability ------------------------------------------------

test('same seed + same command log ⇒ identical final state', () => {
  const script = (state) => {
    for (let i = 0; i < 1200; i += 1) {
      if (i === 60) applyCommand(state, { k: 'fling', ang: -0.7, pow: 0.8 });
      if (i === 70) applyCommand(state, { k: 'nudge', dir: 1 });
      if (i === 300) applyCommand(state, { k: 'fling', ang: -0.6, pow: 0.9 });
      if (i === 600) applyCommand(state, { k: 'reset' });
      if (i === 700) applyCommand(state, { k: 'fling', ang: -0.8, pow: 0.7 });
      step(state, CFG.TICK);
    }
  };
  const a = newGame(987);
  const b = newGame(987);
  begin(a);
  begin(b);
  script(a);
  script(b);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(runSummary(a), runSummary(b));
});

test('simulation state stays plain serializable data mid-tumble', () => {
  const state = clockIn(31);
  for (let i = 0; i < 60; i += 1) step(state, CFG.TICK);
  applyCommand(state, { k: 'fling', ang: -0.7, pow: 1 });
  for (let i = 0; i < 300; i += 1) step(state, CFG.TICK);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

// --- the performance floor ----------------------------------------------------------
// A ragdoll is four points, not five hundred — but the hot loop still owes
// the same discipline: fixed structures, no allocation, bounded step time.

test('PERF: a full two-minute night steps in a fraction of real time with zero growth', () => {
  const state = clockIn(42);
  const pointsRef = state.points;
  const windRef = state.wind;
  const sinceFling = { t: 1 };
  const ticks = Math.ceil(CFG.TIME_LIMIT / CFG.TICK); // 7200 fixed steps
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) {
    playTick(state, sinceFling); // full physics + commands, like a real run
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(elapsedMs < 2000, `the night took ${elapsedMs.toFixed(1)}ms to simulate`);
  assert.equal(state.points, pointsRef);
  assert.equal(state.points.length, 4);
  assert.equal(state.wind, windRef);
  assert.ok(state.events.length <= 8, 'the event buffer is reused, not accumulated');
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
  const cart = createRagdollRelay();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(createDefault, createRagdollRelay, 'the named export must be the default one');
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
  const entry = defineCatalogEntry(manifest, () => import('./ragdoll-relay.js'));
  assert.equal(entry.id, 'ragdoll-relay');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('launch, clock in, drag-fling, drift, reset, and put it away without throwing', () => {
  const cart = createRagdollRelay();
  cart.init(shellCtx());
  cart.draw(stubCtx());
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true, down: true, justUp: false, moved: true } }));
  // Let the courier settle, then drag and release a fling.
  for (let i = 0; i < 60; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pointer: { x: 200, y: 300, justDown: true, down: true, justUp: false, moved: true } }));
  for (let i = 0; i < 5; i += 1) {
    cart.update(1 / 60, inputStub({ pointer: { x: 300, y: 220, justDown: false, down: true, justUp: false, moved: true } }));
  }
  cart.draw(stubCtx());
  cart.update(1 / 60, inputStub({ pointer: { x: 300, y: 220, justDown: false, down: false, justUp: true, moved: true } }));
  // Drift right in the air, then keyboard-aim and throw again after landing.
  for (let i = 0; i < 120; i += 1) {
    cart.update(1 / 60, inputStub({ down: (...n) => n.includes('right') || n.includes('arrowright') }));
  }
  cart.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  cart.draw(stubCtx());
  // Reset from the button.
  cart.update(1 / 60, inputStub({ pointer: { x: 85, y: 430, justDown: true, down: true, justUp: false, moved: true } }));
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createRagdollRelay();
  const b = createRagdollRelay();
  a.init(shellCtx());
  b.init(shellCtx());
  for (let i = 0; i < 30; i += 1) a.update(1 / 60, inputStub());
  a.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.destroy();
});

test('a finished run reports its terminal score to the shell exactly once', () => {
  const scores = [];
  const cart = createRagdollRelay();
  cart.init(shellCtx((score) => scores.push(score)));
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  // Never throw: the depot closes at the time limit, endGame(0) follows.
  for (let i = 0; i < 60 * (CFG.TIME_LIMIT + 5) && scores.length === 0; i += 1) {
    cart.update(1 / 60, inputStub());
  }
  assert.deepEqual(scores, [0]);
  for (let i = 0; i < 120; i += 1) cart.update(1 / 60, inputStub());
  assert.deepEqual(scores, [0], 'no second report');
  cart.destroy();
});
