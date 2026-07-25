import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  METHODS,
  MOTIVES,
  SUSPECTS,
  applyCommand,
  begin,
  buildCase,
  candidateMethods,
  candidateMotives,
  candidateSuspects,
  compareRuns,
  mulberry32,
  newCase,
  reveal,
  runSummary,
  scoreParts,
  step,
  terminalScore,
} from './logic.js';
import createDefault, { createEvidenceBoard } from './evidence-board.js';
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

const revealAll = (state) => {
  for (const card of state.cards) reveal(state, card.id);
};

function runFor(state, seconds) {
  const events = [];
  const ticks = Math.round(seconds / CFG.TICK);
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) {
    events.push(...step(state, CFG.TICK));
  }
  return events;
}

// --- generation: backward from a proven solution ----------------------------

test('a seed names one exact case, and no case uses ambient randomness', () => {
  assert.deepEqual(buildCase(4242), buildCase(4242));
  assert.notDeepEqual(buildCase(4242), buildCase(4243));
});

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  assert.deepEqual(Array.from({ length: 4 }, mulberry32(8)), Array.from({ length: 4 }, mulberry32(8)));
  assert.ok(Array.from({ length: 500 }, mulberry32(1)).every((v) => v >= 0 && v < 1));
});

test('every case deals exactly 12 cards: 5 alibis, 3+3 eliminations, 1 sighting', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const { solution, cards } = buildCase(seed);
    assert.equal(cards.length, 12);
    const byKind = (kind) => cards.filter((card) => card.kind === kind);
    assert.equal(byKind('alibi').length, SUSPECTS.length - 1);
    assert.equal(byKind('method').length, METHODS.length - 1);
    assert.equal(byKind('motive').length, MOTIVES.length - 1);
    assert.equal(byKind('sighting').length, 1);
    assert.equal(byKind('sighting')[0].subject, solution.suspect);
    // The culprit never has an alibi and the real method/motive are never ruled out.
    assert.ok(byKind('alibi').every((card) => card.subject !== solution.suspect));
    assert.ok(byKind('method').every((card) => card.subject !== solution.method));
    assert.ok(byKind('motive').every((card) => card.subject !== solution.motive));
    // Board ids are the shuffled positions, dense and unique.
    assert.deepEqual([...cards.map((c) => c.id)].sort((a, b) => a - b), cards.map((_, i) => i));
  }
});

test('SOLVABILITY: full evidence always leaves exactly one consistent theory', () => {
  // The headline guarantee of backward generation: over many seeds, revealing
  // everything narrows each axis to precisely the authored solution.
  for (let seed = 1; seed <= 150; seed += 1) {
    const state = startCase(seed);
    revealAll(state);
    assert.deepEqual(candidateSuspects(state), [state.solution.suspect], `seed ${seed} culprit`);
    assert.deepEqual(candidateMethods(state), [state.solution.method], `seed ${seed} method`);
    assert.deepEqual(candidateMotives(state), [state.solution.motive], `seed ${seed} motive`);
  }
});

test('alibis on one board never repeat their story', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const alibis = buildCase(seed).cards.filter((card) => card.kind === 'alibi');
    assert.equal(new Set(alibis.map((card) => card.detail)).size, alibis.length);
  }
});

// --- chasing leads -----------------------------------------------------------

test('revealing a lead costs legwork time and cannot be double-charged', () => {
  const state = startCase(7);
  const before = state.timeLeft;
  assert.equal(reveal(state, 0), true);
  assert.equal(state.timeLeft, before - CFG.REVEAL_COST);
  assert.equal(reveal(state, 0), false, 'a revealed card stays revealed for free');
  assert.equal(state.timeLeft, before - CFG.REVEAL_COST);
  assert.equal(state.reveals, 1);
});

test('a lead you cannot afford is refused, not half-chased', () => {
  const state = startCase(7);
  state.timeLeft = CFG.REVEAL_COST; // exactly at the line — still refused
  assert.equal(reveal(state, 0), false);
  assert.equal(state.cards[0].revealed, false);
  assert.equal(state.timeLeft, CFG.REVEAL_COST);
});

test('the sighting outranks elimination: reveal it and only the culprit remains', () => {
  const state = startCase(11);
  const jackpot = state.cards.find((card) => card.kind === 'sighting');
  reveal(state, jackpot.id);
  assert.deepEqual(candidateSuspects(state), [state.solution.suspect]);
});

test('commands are refused outside a running case', () => {
  const state = newCase(3);
  assert.equal(reveal(state, 0), false, 'no legwork during the briefing');
  assert.equal(applyCommand(state, { k: 'accuse', suspect: 0, method: 0, motive: 0 }), false);
  assert.equal(applyCommand(state, { k: 'begin' }), true);
  assert.equal(applyCommand(state, { k: 'begin' }), false, 'begin is one-shot');
  assert.equal(applyCommand(state, { k: 'nonsense' }), false);
  assert.equal(applyCommand(state, { k: 'accuse', suspect: 99, method: 0, motive: 0 }), false);
  assert.equal(applyCommand(state, { k: 'accuse', suspect: 0.5, method: 0, motive: 0 }), false);
});

// --- accusation, win, and both loss states -----------------------------------

test('HEADLESS WINNABLE PROOF: chase the evidence, accuse what remains, close the case', () => {
  // Played the way a person plays it — no peeking at state.solution. Reveal
  // the board, read the candidates off the revealed evidence, accuse.
  for (let seed = 1; seed <= 40; seed += 1) {
    const state = startCase(seed);
    runFor(state, 2); // the clock is really running
    revealAll(state);
    const who = candidateSuspects(state);
    const how = candidateMethods(state);
    const why = candidateMotives(state);
    assert.equal(who.length * how.length * why.length, 1, `seed ${seed} narrows to one theory`);
    assert.equal(
      applyCommand(state, { k: 'accuse', suspect: who[0], method: how[0], motive: why[0] }),
      true,
    );
    assert.equal(state.status, 'won', `seed ${seed} closes`);
    assert.ok(terminalScore(state) > 0, `seed ${seed} scores`);
    assert.equal(state.lastVerdict.correct, 3);
  }
});

test('HEADLESS LOSABLE PROOF: three rejected warrants end the case in discredit', () => {
  const state = startCase(5);
  const wrongSuspect = (state.solution.suspect + 1) % SUSPECTS.length;
  for (let i = 0; i < CFG.CREDIBILITY; i += 1) {
    assert.equal(
      applyCommand(state, {
        k: 'accuse',
        suspect: wrongSuspect,
        method: state.solution.method,
        motive: state.solution.motive,
      }),
      true,
    );
  }
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'discredited');
  assert.equal(state.credibility, 0);
  assert.equal(state.wrongAccusations, 3);
  assert.equal(terminalScore(state), 0, 'a blown case scores nothing');
});

test('HEADLESS LOSABLE PROOF: doing nothing lets the trail go cold', () => {
  const state = startCase(6);
  const events = runFor(state, CFG.CASE_SECONDS + 1);
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'cold');
  assert.equal(state.timeLeft, 0);
  assert.ok(events.includes('case-cold'));
  assert.ok(events.includes('case-over'));
  assert.equal(terminalScore(state), 0);
});

test('a wrong warrant reports how much of it held up, but never which parts', () => {
  const state = startCase(9);
  applyCommand(state, {
    k: 'accuse',
    suspect: state.solution.suspect,
    method: state.solution.method,
    motive: (state.solution.motive + 1) % MOTIVES.length,
  });
  assert.equal(state.status, 'running');
  assert.equal(state.lastVerdict.correct, 2);
  assert.equal(state.credibility, CFG.CREDIBILITY - 1);
  assert.ok(!('suspectCorrect' in state.lastVerdict), 'no per-part disclosure');
});

// --- the documented score formula ---------------------------------------------

test('the score formula pays speed and thrift and charges for rejected warrants', () => {
  const state = startCase(13);
  // one wrong warrant, four leads chased, then the correct theory
  applyCommand(state, {
    k: 'accuse',
    suspect: (state.solution.suspect + 1) % SUSPECTS.length,
    method: state.solution.method,
    motive: state.solution.motive,
  });
  for (const card of state.cards.slice(0, 4)) reveal(state, card.id);
  runFor(state, 10);
  applyCommand(state, {
    k: 'accuse',
    suspect: state.solution.suspect,
    method: state.solution.method,
    motive: state.solution.motive,
  });
  assert.equal(state.status, 'won');
  const p = scoreParts(state);
  assert.equal(p.unrevealed, 8);
  assert.equal(p.wrong, 1);
  assert.equal(
    terminalScore(state),
    CFG.SCORE_BASE +
      p.seconds * CFG.SCORE_SECOND +
      8 * CFG.SCORE_UNREVEALED -
      CFG.PENALTY_WRONG,
  );
});

test('winning on fewer leads outscores winning on a full sweep', () => {
  const lean = startCase(17);
  const sweep = startCase(17);
  const solveNow = (state) => applyCommand(state, { k: 'accuse', ...state.solution });
  reveal(lean, 0);
  solveNow(lean);
  revealAll(sweep);
  solveNow(sweep);
  assert.equal(lean.status, 'won');
  assert.equal(sweep.status, 'won');
  assert.ok(terminalScore(lean) > terminalScore(sweep));
});

test('closed cases rank ahead of blown ones, then score, then fewer wrong warrants', () => {
  const won = { status: 'won', score: 1000, wrongAccusations: 2 };
  const wonClean = { status: 'won', score: 1000, wrongAccusations: 0 };
  const lost = { status: 'lost', score: 0, wrongAccusations: 0 };
  assert.ok(compareRuns(won, lost) < 0);
  assert.ok(compareRuns(wonClean, won) < 0);
  assert.ok(compareRuns({ ...won, score: 2000 }, wonClean) < 0);
});

// --- determinism and serializability -------------------------------------------

const SCRIPT = [
  { tick: 0, k: 'begin' },
  { tick: 30, k: 'reveal', card: 2 },
  { tick: 90, k: 'reveal', card: 7 },
  { tick: 150, k: 'accuse', suspect: 1, method: 1, motive: 1 },
  { tick: 200, k: 'reveal', card: 0 },
  { tick: 260, k: 'reveal', card: 11 },
];

function replay(seed, script, ticks = 400) {
  const state = newCase(seed);
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const command of script) {
      if (command.tick === tick) applyCommand(state, command);
    }
    step(state, CFG.TICK);
  }
  return state;
}

test('same seed + same command log ⇒ identical final state', () => {
  const a = replay(99, SCRIPT);
  const b = replay(99, SCRIPT);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'and it round-trips through JSON');
  assert.deepEqual(runSummary(a), runSummary(b));
});

test('simulation state stays plain serializable data throughout a case', () => {
  const state = replay(7, SCRIPT);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
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
  const cart = createEvidenceBoard();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(manifest.version, '1.0.0');
  assert.equal(createDefault, createEvidenceBoard, 'the named export must be the default one');
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
  const entry = defineCatalogEntry(manifest, () => import('./evidence-board.js'));
  assert.equal(entry.id, 'evidence-board');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('launch, brief, chase a lead, accuse, and put it away without throwing', () => {
  const cart = createEvidenceBoard();
  cart.init(shellCtx());
  cart.draw(stubCtx());
  // arm past the launch-gesture guard, then open the case with a tap
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true, down: true, justUp: false, moved: true } }));
  cart.draw(stubCtx());
  // tap the first lead card, cycle a selector, press the accuse bar
  cart.update(1 / 60, inputStub({ pointer: { x: 80, y: 90, justDown: true, down: true, justUp: false, moved: true } }));
  cart.update(1 / 60, inputStub({ pointer: { x: 100, y: 299, justDown: true, down: true, justUp: false, moved: true } }));
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 371, justDown: true, down: true, justUp: false, moved: true } }));
  for (let i = 0; i < 10; i += 1) cart.update(1 / 60, inputStub());
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createEvidenceBoard();
  const b = createEvidenceBoard();
  a.init(shellCtx());
  b.init(shellCtx());
  for (let i = 0; i < 30; i += 1) a.update(1 / 60, inputStub());
  a.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.destroy();
});

test('a finished case reports its terminal score to the shell exactly once', () => {
  const scores = [];
  const cart = createEvidenceBoard();
  cart.init(shellCtx((score) => scores.push(score)));
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  // burn the whole case clock: the trail goes cold, endGame(0) follows
  for (let i = 0; i < 60 * (CFG.CASE_SECONDS + 5) && scores.length === 0; i += 1) {
    cart.update(1 / 60, inputStub());
  }
  assert.deepEqual(scores, [0]);
  for (let i = 0; i < 120; i += 1) cart.update(1 / 60, inputStub());
  assert.deepEqual(scores, [0], 'no second report');
  cart.destroy();
});
