import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  ENTITIES,
  antennas,
  applyCommand,
  begin,
  buildGhost,
  clarity,
  clarityAt,
  compareRuns,
  ghostFreq,
  identify,
  inBand,
  mulberry32,
  newCase,
  runSummary,
  scoreParts,
  setFreq,
  step,
  terminalScore,
} from './logic.js';
import createDefault, { createGhostFrequency } from './ghost-frequency.js';
import { manifest } from './manifest.js';
import { palette } from '../../shell/palette.js';
import {
  activateCartridge,
  defineCatalogEntry,
  launchBlockReason,
  validateManifest,
} from '../../shell/cartridge.js';

const startCase = (seed) => {
  const state = newCase(seed);
  begin(state);
  return state;
};

// Advance a fixed number of ticks with an optional per-tick control policy.
function runTicks(state, ticks, control = null) {
  const events = [];
  for (let i = 0; i < ticks; i += 1) {
    if (state.status === 'won' || state.status === 'lost') break;
    if (control) control(state);
    events.push(...step(state, CFG.TICK));
  }
  return events;
}

const perfectTuner = (state) => setFreq(state, ghostFreq(state));

// --- the pre-rolled ghost ------------------------------------------------------

test('a seed names one exact ghost, and nothing uses ambient randomness', () => {
  assert.deepEqual(buildGhost(4242), buildGhost(4242));
  assert.notDeepEqual(buildGhost(4242), buildGhost(4243));
});

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  assert.deepEqual(Array.from({ length: 4 }, mulberry32(8)), Array.from({ length: 4 }, mulberry32(8)));
  assert.ok(Array.from({ length: 500 }, mulberry32(1)).every((v) => v >= 0 && v < 1));
});

test('every ghost berths clear of the dial stops and jumps stay on the dial', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const { ghost, jumps } = buildGhost(seed);
    assert.ok(ghost.base >= 45 && ghost.base <= 115);
    assert.ok(ghost.entity >= 0 && ghost.entity < ENTITIES.length);
    assert.equal(jumps.length, 3);
    let base = ghost.base;
    for (let i = 0; i < jumps.length; i += 1) {
      if (i > 0) assert.ok(jumps[i].at > jumps[i - 1].at, 'jumps are ordered');
      base += jumps[i].delta;
      assert.ok(base >= 40 && base <= 120, `seed ${seed}: jump ${i} lands on the dial (${base})`);
    }
    // even the worst drift excursion stays inside the tunable band
    const excursion = ghost.a1 + ghost.a2;
    assert.ok(ghost.base + excursion < CFG.DIAL_MAX, `seed ${seed} drifts off the top`);
    assert.ok(ghost.base - excursion > CFG.DIAL_MIN, `seed ${seed} drifts off the bottom`);
  }
});

test('the ghost holds still for the scan and wanders once containment begins', () => {
  const state = startCase(9);
  const before = ghostFreq(state);
  runTicks(state, 120);
  assert.equal(ghostFreq(state), before, 'stationary while scanning');
  state.status = 'contain';
  runTicks(state, 120, perfectTuner);
  assert.notEqual(ghostFreq(state), before, 'moving once cornered');
});

// --- reading the band: every clue is a drawable number --------------------------

test('clarity peaks on the ghost and dies FALLOFF away, on both sides', () => {
  const state = startCase(3);
  const f = ghostFreq(state);
  assert.equal(clarityAt(state, f), 1);
  assert.ok(clarityAt(state, f + 6) < 1 && clarityAt(state, f + 6) > 0);
  assert.equal(clarityAt(state, f + CFG.FALLOFF), 0);
  assert.equal(clarityAt(state, f - CFG.FALLOFF - 5), 0);
  assert.ok(Math.abs(clarityAt(state, f + 3) - clarityAt(state, f - 3)) < 1e-9, 'symmetric');
});

test('the antennas point the way: the tallest bar is the direction to turn', () => {
  const state = startCase(3);
  const f = ghostFreq(state);
  setFreq(state, f - 6); // ghost is above us: the high antenna should lead
  let [low, on, high] = antennas(state);
  assert.ok(high > on && on > low);
  setFreq(state, f + 6); // ghost is below us: the low antenna should lead
  [low, on, high] = antennas(state);
  assert.ok(low > on && on > high);
});

test('setFreq clamps to the dial and refuses non-numbers', () => {
  const state = startCase(4);
  setFreq(state, 5000);
  assert.equal(state.freq, CFG.DIAL_MAX);
  setFreq(state, -40);
  assert.equal(state.freq, CFG.DIAL_MIN);
  assert.equal(setFreq(state, Number.NaN), false);
  assert.equal(setFreq(state, 'boo'), false);
  const idle = newCase(4);
  assert.equal(setFreq(idle, 80), false, 'no tuning during the briefing');
});

// --- lock, identification, containment ------------------------------------------

test('holding the peak fills the lock; wandering off drains it faster than it filled', () => {
  const state = startCase(5);
  perfectTuner(state);
  runTicks(state, Math.round((CFG.LOCK_TIME / 2) / CFG.TICK));
  const half = state.lock;
  assert.ok(half > 0.4 && half < 0.6);
  setFreq(state, ghostFreq(state) + 20); // way off signal
  runTicks(state, Math.round((CFG.LOCK_TIME / 3) / CFG.TICK));
  assert.ok(state.lock < half / 2, 'draining 1.5x as fast');
  const events = runTicks(state, Math.round((CFG.LOCK_TIME + 0.5) / CFG.TICK), perfectTuner);
  assert.ok(events.includes('locked'));
  assert.equal(state.status, 'identify');
});

test('naming the right entity starts containment; wrong names feed the haunt', () => {
  const state = startCase(6);
  state.status = 'identify';
  const truth = state.ghost.entity;
  const wrong = (truth + 1) % ENTITIES.length;
  const before = state.haunt;
  assert.equal(identify(state, wrong), true);
  assert.equal(state.status, 'identify', 'still guessing');
  assert.equal(state.wrongIds, 1);
  assert.ok(state.haunt >= before + CFG.WRONG_ID_HAUNT - 1e-9);
  assert.equal(identify(state, wrong), false, 'a crossed-out card cannot be named again');
  assert.equal(identify(state, truth), true);
  assert.equal(state.status, 'contain');
});

test('identification is only possible once locked', () => {
  const state = startCase(6);
  assert.equal(identify(state, 0), false, 'not during the scan');
  assert.equal(applyCommand(state, { k: 'identify', entity: 9 }), false);
  assert.equal(applyCommand(state, { k: 'nonsense' }), false);
});

test('containment needs held signal: it fills in-band, drains out of band, and the jumps come', () => {
  const state = startCase(7);
  state.status = 'contain';
  const events = runTicks(state, Math.round(2 / CFG.TICK), perfectTuner);
  assert.ok(state.contain > 0.2);
  setFreq(state, CFG.DIAL_MIN); // let go of the signal entirely
  const at = state.contain;
  const hauntAt = state.haunt;
  runTicks(state, Math.round(1 / CFG.TICK));
  assert.ok(state.contain < at, 'containment decays off-signal');
  assert.ok(
    state.haunt > hauntAt + CFG.OFFBAND_HAUNT * 0.9 * 1 - 1e-9,
    'and the room sours faster',
  );
  const more = runTicks(state, Math.round(8 / CFG.TICK), perfectTuner);
  assert.ok([...events, ...more].includes('jump'), 'the ghost jumped somewhere in there');
});

test('a jump moves the base by its rolled delta at its rolled time', () => {
  const state = startCase(8);
  state.status = 'contain';
  const baseBefore = state.ghost.base;
  const firstJump = state.jumps[0];
  runTicks(state, Math.round((firstJump.at + 0.1) / CFG.TICK), perfectTuner);
  assert.equal(state.jumps[0].done, true);
  assert.equal(state.ghost.base, baseBefore + firstJump.delta);
});

// --- headless winnable and losable proofs ----------------------------------------

test('HEADLESS WINNABLE PROOF: a steady hand contains every seeded case', () => {
  // The control proof: track the signal exactly, name the entity off the
  // state, and the case closes with room to spare — on every seed tried.
  for (let seed = 1; seed <= 30; seed += 1) {
    const state = startCase(seed);
    let guard = 0;
    while (state.status !== 'won' && state.status !== 'lost' && guard < 60 * 60) {
      guard += 1;
      perfectTuner(state);
      if (state.status === 'identify') identify(state, state.ghost.entity);
      step(state, CFG.TICK);
    }
    assert.equal(state.status, 'won', `seed ${seed} ended ${state.status}`);
    assert.ok(state.haunt < 0.25, `seed ${seed} finished calm (haunt ${state.haunt.toFixed(2)})`);
    assert.ok(terminalScore(state) > CFG.SCORE_BASE, `seed ${seed} scores`);
  }
});

test('HEADLESS LOSABLE PROOF: an untouched radio always ends in manifestation', () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const state = startCase(seed);
    const events = runTicks(state, Math.round(160 / CFG.TICK));
    assert.equal(state.status, 'lost', `seed ${seed} should manifest`);
    assert.equal(state.failure, 'manifested');
    assert.equal(state.haunt, 1);
    assert.ok(events.includes('manifested'));
    assert.ok(events.includes('case-over'));
    assert.equal(terminalScore(state), 0, 'a manifested ghost scores nothing');
  }
});

test('wrong identifications make the win poorer but not impossible', () => {
  const clean = startCase(11);
  const sloppy = startCase(11);
  for (const state of [clean, sloppy]) {
    let guard = 0;
    while (state.status !== 'won' && state.status !== 'lost' && guard < 60 * 60) {
      guard += 1;
      perfectTuner(state);
      if (state.status === 'identify') {
        if (state === sloppy && state.wrongIds === 0) {
          identify(state, (state.ghost.entity + 1) % ENTITIES.length);
        } else {
          identify(state, state.ghost.entity);
        }
      }
      step(state, CFG.TICK);
    }
  }
  assert.equal(clean.status, 'won');
  assert.equal(sloppy.status, 'won');
  assert.ok(terminalScore(clean) > terminalScore(sloppy));
  assert.equal(scoreParts(clean).cleanSweep, 1);
  assert.equal(scoreParts(sloppy).cleanSweep, 0);
});

// --- the documented score formula -------------------------------------------------

test('the score formula pays calm and the clean sweep, and pays nothing for a loss', () => {
  const state = startCase(13);
  state.status = 'won';
  state.haunt = 0.3;
  state.wrongIds = 0;
  assert.equal(
    terminalScore(state),
    CFG.SCORE_BASE + Math.round(0.7 * CFG.SCORE_CALM) + CFG.SCORE_CLEAN_ID,
  );
  state.wrongIds = 2;
  assert.equal(terminalScore(state), CFG.SCORE_BASE + Math.round(0.7 * CFG.SCORE_CALM));
  state.status = 'lost';
  assert.equal(terminalScore(state), 0);
});

test('contained cases rank ahead of manifested ones, then score, then fewer wrong names', () => {
  const won = { status: 'won', score: 6000, wrongIds: 1 };
  const lost = { status: 'lost', score: 0, wrongIds: 0 };
  assert.ok(compareRuns(won, lost) < 0);
  assert.ok(compareRuns({ ...won, score: 7000 }, won) < 0);
  assert.ok(compareRuns({ ...won, wrongIds: 0 }, won) < 0);
});

// --- determinism, serializability, and the sound-off contract ----------------------

function replay(seed, ticks = 60 * 30) {
  const state = newCase(seed);
  begin(state);
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick === 30) applyCommand(state, { k: 'set-freq', freq: 72.5 });
    if (tick === 300) applyCommand(state, { k: 'set-freq', freq: ghostFreq(state) });
    if (tick % 60 === 0 && state.status === 'contain') {
      applyCommand(state, { k: 'set-freq', freq: ghostFreq(state) });
    }
    if (state.status === 'identify') applyCommand(state, { k: 'identify', entity: state.ghost.entity });
    step(state, CFG.TICK);
  }
  return state;
}

test('same seed + same command log ⇒ identical final state', () => {
  const a = replay(99);
  const b = replay(99);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'and it round-trips through JSON');
  assert.deepEqual(runSummary(a), runSummary(b));
  assert.notDeepStrictEqual(a, replay(100), 'a different seed is a different case');
});

test('simulation state stays plain serializable data throughout a case', () => {
  const state = replay(7);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('SOUND-OFF CONTRACT: the simulation knows nothing about audio, and no code asks for a microphone', async () => {
  const fs = await import('node:fs/promises');
  const logic = await fs.readFile(new URL('./logic.js', import.meta.url), 'utf8');
  const cart = await fs.readFile(new URL('./ghost-frequency.js', import.meta.url), 'utf8');
  // Every clue must exist as drawable state — the sim may not touch sound APIs.
  assert.ok(!/sfx|AudioContext|webkitAudio|createOscillator/.test(logic), 'logic.js is silent by construction');
  for (const source of [logic, cart]) {
    assert.ok(!/getUserMedia|mediaDevices/.test(source), 'no microphone, ever');
  }
});

// --- the cartridge ---------------------------------------------------------

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
  const cart = createGhostFrequency();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(manifest.version, '1.0.0');
  assert.equal(createDefault, createGhostFrequency, 'the named export must be the default one');
});

test('the manifest passes the cabinet\'s own validator, accent and all', () => {
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.ok(Object.keys(palette).includes(manifest.artwork.accent));
  assert.equal(launchBlockReason(manifest), null, 'the rack would refuse to launch it');
});

test('the manifest imports no game code, so the rack can render a card cheaply', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('./manifest.js', import.meta.url), 'utf8'));
  assert.ok(!/\bimport\b/.test(source), 'manifest.js pulled something in');
});

test('it satisfies the cabinet cartridge contract', async () => {
  const entry = defineCatalogEntry(manifest, () => import('./ghost-frequency.js'));
  assert.equal(entry.id, 'ghost-frequency');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('launch, brief, drag the dial, and put it away without throwing', () => {
  const cart = createGhostFrequency();
  cart.init(shellCtx());
  cart.draw(stubCtx());
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true, down: true, justUp: false, moved: true } }));
  cart.draw(stubCtx());
  // drag on the dial strip, then hold a fine button for a few frames
  cart.update(1 / 60, inputStub({ touches: () => [{ x: 400, y: 290 }] }));
  cart.draw(stubCtx());
  for (let i = 0; i < 20; i += 1) {
    cart.update(1 / 60, inputStub({ touches: () => [{ x: 80, y: 440 }] }));
  }
  cart.draw(stubCtx());
  // sweep with the keyboard too
  for (let i = 0; i < 20; i += 1) {
    cart.update(1 / 60, inputStub({ down: (...n) => n.includes('right') }));
  }
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createGhostFrequency();
  const b = createGhostFrequency();
  a.init(shellCtx());
  b.init(shellCtx());
  for (let i = 0; i < 30; i += 1) a.update(1 / 60, inputStub());
  a.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.destroy();
});

test('a manifested case reports a zero score to the shell exactly once', () => {
  const scores = [];
  const cart = createGhostFrequency();
  cart.init(shellCtx((score) => scores.push(score)));
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  for (let i = 0; i < 60 * 170 && scores.length === 0; i += 1) {
    cart.update(1 / 60, inputStub());
  }
  assert.deepEqual(scores, [0]);
  for (let i = 0; i < 120; i += 1) cart.update(1 / 60, inputStub());
  assert.deepEqual(scores, [0], 'no second report');
  cart.destroy();
});
