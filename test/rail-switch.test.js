import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  EDGES,
  NODES,
  PLATFORMS,
  SIGNALS,
  applyCommand,
  begin,
  buildSchedule,
  compareRuns,
  isLocked,
  mulberry32,
  newShift,
  overrideActive,
  projectedPlatform,
  projectedRoute,
  runSummary,
  scoreParts,
  setSignal,
  setSwitch,
  signalPos,
  step,
  terminalScore,
  throwSwitch,
  useOverride,
} from '../games/rail-switch/logic.js';

const onTrack = (train) => train.state === 'run' || train.state === 'stalled';
const trainById = (state, id) => state.trains.find((train) => train.id === id);

// A shift with the seeded schedule cleared out, so a test can place exactly
// the trains it wants to talk about.
function emptyShift(seed = 1) {
  const state = newShift(seed);
  begin(state);
  state.trains = [];
  return state;
}

function place(state, fields) {
  const train = {
    id: state.trains.length + 1,
    side: 'n',
    dest: 'B',
    required: true,
    value: 0,
    releaseAt: 0,
    state: 'run',
    edge: 'trunk',
    dist: 0,
    speed: 0,
    fuel: CFG.FUEL_START,
    held: false,
    delivered: false,
    misrouted: false,
    ...fields,
  };
  state.trains.push(train);
  return train;
}

function runFor(state, seconds) {
  const events = [];
  const ticks = Math.round(seconds / CFG.TICK);
  for (let i = 0; i < ticks && state.status === 'running'; i += 1) {
    events.push(...step(state, CFG.TICK));
  }
  return events;
}

// --- The network ----------------------------------------------------------

test('every edge connects declared nodes and every non-terminal node has an exit', () => {
  for (const [id, edge] of Object.entries(EDGES)) {
    assert.ok(NODES[edge.from], `${id} has a real from-node`);
    assert.ok(NODES[edge.to], `${id} has a real to-node`);
    assert.ok(edge.len > 0, `${id} has length`);
  }
  for (const [id, node] of Object.entries(NODES)) {
    if (node.kind === 'platform' || node.kind === 'yard') continue;
    if (node.kind === 'switch') {
      assert.ok(node.options.length >= 2, `${id} switches between at least two routes`);
      assert.equal(node.options.length, node.optionLabels.length);
      for (const option of node.options) assert.ok(EDGES[option], `${id} option ${option} exists`);
    } else {
      assert.ok(EDGES[node.next], `${id} has a continuation`);
    }
  }
});

test('every platform is reachable from both yards under some switch setting', () => {
  const state = newShift(1);
  for (const [side, entry] of [['n', 'n-approach'], ['s', 's-approach']]) {
    const reached = new Set();
    for (const jn of [0, 1]) {
      for (const te of [0, 1, 2]) {
        state.switches = { jn, js: jn, te };
        const platform = projectedPlatform(state, entry);
        if (platform) reached.add(platform);
      }
    }
    assert.deepEqual([...reached].sort(), [...PLATFORMS], `${side} yard reaches every platform`);
  }
});

test('a bypass reaches exactly one platform, so anything else must fight for the trunk', () => {
  const state = newShift(1);
  state.switches = { jn: 1, js: 1, te: 1 };
  assert.equal(projectedPlatform(state, 'n-approach'), 'A');
  assert.equal(projectedPlatform(state, 's-approach'), 'C');
  assert.ok(projectedRoute(state, 'n-approach').includes('n-bypass-b'));
  assert.ok(!projectedRoute(state, 'n-approach').includes('trunk'));
});

// --- Routing --------------------------------------------------------------

test('a train follows the switch settings in force when it reaches each junction', () => {
  const state = emptyShift();
  state.switches = { jn: 0, js: 0, te: 2 };
  const train = place(state, { edge: 'n-approach', dest: 'C', dist: 0 });
  runFor(state, 12);
  assert.equal(train.state, 'done');
  assert.equal(train.delivered, true, 'arrived at platform C');
});

test('throwing the exit switch mid-run redirects a train still short of the points', () => {
  const state = emptyShift();
  state.switches = { jn: 0, js: 0, te: 0 };
  const train = place(state, { edge: 'trunk', dest: 'B', dist: 0 });
  assert.equal(projectedPlatform(state, 'trunk'), 'A', 'set for the wrong platform');
  assert.equal(setSwitch(state, 'te', 1), true);
  assert.equal(projectedPlatform(state, 'trunk'), 'B');
  runFor(state, 8);
  assert.equal(train.delivered, true);
});

test('a required train delivered to the wrong platform strands the shift', () => {
  const state = emptyShift();
  state.switches = { jn: 0, js: 0, te: 0 };
  const train = place(state, { edge: 'trunk', dest: 'B', dist: EDGES.trunk.len - 1 });
  const events = runFor(state, 6);
  assert.ok(events.includes('misroute'));
  assert.equal(train.misrouted, true);
  assert.equal(train.delivered, false);
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'stranded');
});

test('a misrouted optional train loses its cargo value but not the shift', () => {
  const state = emptyShift();
  state.switches = { jn: 0, js: 0, te: 0 };
  place(state, {
    edge: 'trunk',
    dest: 'B',
    required: false,
    value: 3000,
    dist: EDGES.trunk.len - 1,
  });
  runFor(state, 6);
  assert.equal(state.failure, null);
  assert.equal(state.status, 'won', 'no required train was outstanding');
  assert.equal(scoreParts(state).cargo, 0);
});

// --- Collisions -----------------------------------------------------------

test('two trains closing on one edge collide and the shift scores nothing', () => {
  const state = emptyShift();
  // An optional train runs dry dead on the single line; the next one is
  // already committed to it.
  place(state, { id: 1, edge: 'trunk', dist: 40, required: false, fuel: 0.001 });
  place(state, { id: 2, edge: 'trunk', dist: 6, speed: EDGES.trunk.limit });
  assert.equal(state.status, 'running', 'still clear of each other');
  const events = runFor(state, 1.5);
  assert.ok(events.includes('collision'));
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'collision');
  assert.equal(terminalScore(state), 0);
  assert.ok(state.wreck, 'the wreck is recorded for the renderer');
});

test('trains on different edges never collide, however close the geometry', () => {
  const state = emptyShift();
  place(state, { id: 1, edge: 'n-trunk-in', dist: EDGES['n-trunk-in'].len - 2 });
  place(state, { id: 2, edge: 's-trunk-in', dist: EDGES['s-trunk-in'].len - 2 });
  step(state, CFG.TICK);
  assert.equal(state.status, 'running');
});

test('routing both sides onto the shared trunk together is what actually wrecks them', () => {
  const state = emptyShift();
  state.switches = { jn: 0, js: 0, te: 1 };
  place(state, { id: 1, edge: 'n-trunk-in', dist: EDGES['n-trunk-in'].len - 20, speed: 82 });
  place(state, { id: 2, edge: 's-trunk-in', dist: EDGES['s-trunk-in'].len - 20, speed: 82 });
  const events = runFor(state, 2);
  assert.ok(events.includes('collision'), 'the merge is the conflict point');
});

test('a yard holds its train until the approach block is empty, so arrivals never rear-end', () => {
  const state = emptyShift();
  place(state, { id: 1, edge: 'n-approach', dist: 4, speed: 0 });
  const queued = place(state, { id: 2, side: 'n', state: 'yard', edge: null, releaseAt: 0 });
  runFor(state, 1);
  assert.equal(queued.state, 'yard', 'still in the yard, not on top of train 1');
  assert.equal(state.status, 'running');
  assert.ok(state.delay > 0, 'and it is burning delay while it waits');
});

// --- Signals, delay, and the interlocking ---------------------------------

test('a red signal stops a train exactly at the signal, short of the interlocking', () => {
  const state = emptyShift();
  const train = place(state, { edge: 'n-approach', dist: 0, dest: 'B' });
  setSignal(state, 'n', true);
  runFor(state, 6);
  assert.equal(train.dist, signalPos('n-approach'));
  assert.equal(train.speed, 0);
  assert.equal(train.held, true);
  assert.equal(isLocked(state, 'jn'), false, 'a held train leaves the switch free to throw');
});

test('holding a train is what buys the right to change your mind', () => {
  const state = emptyShift();
  state.switches = { jn: 0, js: 0, te: 0 };
  // Run in past the signal: the points are now under the wheels.
  const train = place(state, {
    edge: 'n-approach',
    dist: EDGES['n-approach'].len - 10,
    dest: 'A',
  });
  assert.ok(train.dist > signalPos('n-approach'));
  assert.equal(isLocked(state, 'jn'), true);
  assert.equal(throwSwitch(state, 'jn'), false, 'refused while locked');

  // Rewind the same train to just short of the signal and hold it there.
  train.dist = 0;
  train.speed = 0;
  setSignal(state, 'n', true);
  runFor(state, 6);
  assert.equal(isLocked(state, 'jn'), false);
  assert.equal(throwSwitch(state, 'jn'), true, 'free once the train is standing at the signal');
});

test('delay accrues one second per second per stopped train and busts the budget', () => {
  const state = emptyShift();
  place(state, { edge: 'n-approach', dist: 0 });
  setSignal(state, 'n', true);
  runFor(state, 4);
  // ~1.6s of that was spent running up to the signal, the rest standing at it.
  const afterOne = state.delay;
  assert.ok(afterOne > 2 && afterOne < 3, `one held train ≈ 2.4 delay-seconds, got ${afterOne}`);

  // A second train queued behind it accrues delay at the same time — that
  // doubling is why the budget is spent so much faster than it looks.
  place(state, { side: 'n', state: 'yard', edge: null, releaseAt: 0 });
  runFor(state, 2);
  assert.ok(state.delay - afterOne > 3.5, 'two waiting trains burn two seconds per second');

  state.delay = CFG.DELAY_BUDGET - 0.05;
  const events = runFor(state, 1);
  assert.ok(events.includes('delay-budget'));
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'delay-budget');
});

test('a red signal shown too late does not stop a committed train', () => {
  const state = emptyShift();
  const train = place(state, { edge: 'n-approach', dist: signalPos('n-approach') + 1, speed: 60 });
  setSignal(state, 'n', true);
  runFor(state, 0.5);
  assert.ok(train.dist > signalPos('n-approach') + 1, 'it kept going');
  assert.ok(train.speed > 0);
});

// --- Overrides ------------------------------------------------------------

test('an override drops every interlock for a moment, then they come back', () => {
  const state = emptyShift();
  place(state, { edge: 'n-approach', dist: EDGES['n-approach'].len - 5 });
  assert.equal(isLocked(state, 'jn'), true);
  assert.equal(throwSwitch(state, 'jn'), false);

  assert.equal(useOverride(state), true);
  assert.equal(overrideActive(state), true);
  assert.equal(isLocked(state, 'jn'), false);
  assert.equal(throwSwitch(state, 'jn'), true, 'thrown under an approaching train');

  state.time = state.overrideUntil;
  assert.equal(overrideActive(state), false);
  assert.equal(isLocked(state, 'jn'), true, 'the interlocking is back');
});

test('overrides are limited and each one costs 2,000 points', () => {
  const state = emptyShift();
  for (let i = 0; i < CFG.OVERRIDES; i += 1) assert.equal(useOverride(state), true);
  assert.equal(useOverride(state), false, 'no third override');
  assert.equal(state.overrides, CFG.OVERRIDES);
  assert.equal(state.overridesLeft, 0);

  const clean = emptyShift();
  place(clean, { edge: 'exit-b', dist: EDGES['exit-b'].len - 1, dest: 'B' });
  runFor(clean, 2);
  const base = terminalScore(clean);

  const costly = emptyShift();
  place(costly, { edge: 'exit-b', dist: EDGES['exit-b'].len - 1, dest: 'B' });
  useOverride(costly);
  runFor(costly, 2);
  assert.equal(base - terminalScore(costly), CFG.PENALTY_OVERRIDE);
});

// --- Fuel -----------------------------------------------------------------

test('fuel runs down in service and a dry required train strands the shift', () => {
  const state = emptyShift();
  const train = place(state, { edge: 'n-bypass-b', dist: 0, fuel: 1.5 });
  const events = runFor(state, 3);
  assert.ok(events.includes('stall'));
  assert.equal(train.state, 'stalled');
  assert.equal(train.fuel, 0);
  assert.equal(state.failure, 'stranded');
});

test('the slow bypass costs more fuel than the trunk for the same platform', () => {
  const viaTrunk = emptyShift();
  viaTrunk.switches = { jn: 0, js: 0, te: 0 };
  const fast = place(viaTrunk, { edge: 'n-approach', dest: 'A' });
  runFor(viaTrunk, 25);

  const viaBypass = emptyShift();
  viaBypass.switches = { jn: 1, js: 1, te: 0 };
  const slow = place(viaBypass, { edge: 'n-approach', dest: 'A' });
  runFor(viaBypass, 30);

  assert.equal(fast.delivered, true);
  assert.equal(slow.delivered, true);
  assert.ok(slow.fuel < fast.fuel - 3, `bypass burns more fuel (${slow.fuel} vs ${fast.fuel})`);
});

// --- The shift clock and the planning zoom --------------------------------

test('the planning zoom freezes the trains but never the shift clock', () => {
  const state = emptyShift();
  const train = place(state, { edge: 'trunk', dist: 0, speed: 40 });
  applyCommand(state, { k: 'plan', on: true });
  const before = { dist: train.dist, time: state.time, delay: state.delay };
  const left = state.timeLeft;
  runFor(state, 3);
  assert.equal(train.dist, before.dist, 'trains do not move');
  assert.equal(state.time, before.time, 'train time is frozen');
  assert.equal(state.delay, before.delay, 'no delay accrues');
  assert.ok(left - state.timeLeft > 2.9, 'but the shift clock drained');
});

test('the shift is lost when the clock runs out with trains still on the network', () => {
  const state = emptyShift();
  place(state, { edge: 'trunk', dist: 0 });
  state.timeLeft = 0.5;
  const events = runFor(state, 1);
  assert.ok(events.includes('timeout'));
  assert.equal(state.status, 'lost');
  assert.equal(state.failure, 'timeout');
});

// --- Score ----------------------------------------------------------------

test('the score formula is exactly the one on the cabinet card', () => {
  const state = emptyShift();
  state.timeLeft = 30.9;
  state.delay = 12.7;
  state.overrides = 1;
  place(state, { id: 1, required: true, delivered: true, state: 'done', fuel: 8.4 });
  place(state, { id: 2, required: true, delivered: true, state: 'done', fuel: 6.2 });
  place(state, { id: 3, required: false, value: 3500, delivered: true, state: 'done', fuel: 5.1 });
  place(state, { id: 4, required: false, value: 9999, delivered: false, state: 'done', fuel: 20 });

  const parts = scoreParts(state);
  assert.deepEqual(parts, {
    required: 2,
    cargo: 3500,
    seconds: 30,
    fuel: Math.floor(8.4 + 6.2 + 5.1),
    delaySeconds: 12,
    overrides: 1,
  });
  const expected =
    2 * CFG.SCORE_DELIVERY +
    3500 +
    30 * CFG.SCORE_SECOND +
    19 * CFG.SCORE_FUEL -
    12 * CFG.PENALTY_DELAY -
    1 * CFG.PENALTY_OVERRIDE;
  assert.equal(terminalScore(state), expected);
  assert.equal(expected, 24660, 'and that is 20000 + 3500 + 1500 + 1900 − 240 − 2000');
});

test('a collision scores zero however good the rest of the shift was', () => {
  const state = emptyShift();
  state.timeLeft = 60;
  for (let i = 0; i < 6; i += 1) {
    place(state, { id: i + 1, required: true, delivered: true, state: 'done', fuel: 15 });
  }
  assert.ok(terminalScore(state) > 60000);
  state.failure = 'collision';
  state.status = 'lost';
  assert.equal(terminalScore(state), 0);
});

test('the score is a non-negative integer even for a disastrous shift', () => {
  const state = emptyShift();
  state.timeLeft = 0;
  state.delay = 500;
  state.overrides = 2;
  const score = terminalScore(state);
  assert.equal(score, 0);
  assert.ok(Number.isInteger(score));
});

test('completed runs rank first, then score, then fewer overrides', () => {
  const won = { status: 'won', score: 50000, overrides: 2 };
  const lostHigher = { status: 'lost', score: 90000, overrides: 0 };
  assert.ok(compareRuns(won, lostHigher) < 0, 'a finished shift outranks a bigger failed one');

  const tidy = { status: 'won', score: 50000, overrides: 0 };
  assert.ok(compareRuns(tidy, won) < 0, 'same score, fewer overrides wins');
  assert.equal(compareRuns(tidy, { ...tidy }), 0);
});

// --- Determinism ----------------------------------------------------------

test('mulberry32 is a fixed sequence, and different seeds diverge', () => {
  assert.deepEqual(
    Array.from({ length: 4 }, mulberry32(7)),
    Array.from({ length: 4 }, mulberry32(7)),
  );
  assert.notDeepEqual(
    Array.from({ length: 4 }, mulberry32(7)),
    Array.from({ length: 4 }, mulberry32(8)),
  );
  const values = Array.from({ length: 500 }, mulberry32(1));
  assert.ok(values.every((v) => v >= 0 && v < 1));
});

test('a seed names one exact shift, and no schedule uses ambient randomness', () => {
  assert.deepEqual(buildSchedule(4242), buildSchedule(4242));
  assert.notDeepEqual(buildSchedule(4242), buildSchedule(4243));
  const schedule = buildSchedule(4242);
  assert.equal(schedule.length, CFG.TRAIN_COUNT);
  assert.equal(schedule.filter((train) => train.required).length, CFG.REQUIRED_COUNT);
  for (const train of schedule) {
    assert.ok(PLATFORMS.includes(train.dest));
    assert.ok(train.releaseAt > 0);
    assert.equal(train.required ? train.value : 0, 0);
  }
  for (let i = 1; i < schedule.length; i += 1) {
    assert.ok(schedule[i].releaseAt > schedule[i - 1].releaseAt, 'arrivals are ordered');
  }
});

// The headline guarantee: the same seed replayed against the same command log
// reproduces the same final state, bit for bit. This is what makes a replay
// or a daily board verifiable rather than merely plausible.
const SCRIPT = [
  { tick: 0, k: 'begin' },
  { tick: 40, k: 'switch', node: 'te' },
  { tick: 120, k: 'signal', side: 'n', red: true },
  { tick: 300, k: 'switch', node: 'jn' },
  { tick: 460, k: 'signal', side: 'n', red: false },
  { tick: 620, k: 'plan', on: true },
  { tick: 900, k: 'plan', on: false },
  { tick: 1100, k: 'override' },
  { tick: 1130, k: 'switch', node: 'js' },
  { tick: 1500, k: 'signal', side: 's', red: true },
  { tick: 2100, k: 'signal', side: 's', red: false },
  { tick: 2400, k: 'switch', node: 'te' },
];

function replay(seed, script, ticks = 60 * 130) {
  const state = newShift(seed);
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
  assert.equal(terminalScore(a), terminalScore(b));
  assert.deepEqual(runSummary(a), runSummary(b));
});

test('changing only the seed, or only one command tick, changes the outcome', () => {
  const base = replay(99, SCRIPT);
  assert.notDeepStrictEqual(base, replay(100, SCRIPT), 'a different seed is a different shift');

  // Clear the north signal a hundred ticks later: same commands, same order,
  // one different tick, and the shift diverges.
  const late = SCRIPT.map((command) =>
    command.k === 'signal' && command.side === 'n' && command.red === false
      ? { ...command, tick: command.tick + 100 }
      : command,
  );
  const nudged = replay(99, late);
  assert.notDeepStrictEqual(base, nudged);
  assert.ok(nudged.delay > base.delay, 'and the extra hold shows up as delay');
});

test('simulation state stays plain serializable data throughout a shift', () => {
  const state = replay(7, SCRIPT, 60 * 40);
  const clone = JSON.parse(JSON.stringify(state));
  assert.deepEqual(clone, state, 'nothing but JSON values ever enters the state');
  for (const train of state.trains) {
    for (const value of Object.values(train)) {
      assert.ok(
        value === null || ['number', 'string', 'boolean'].includes(typeof value),
        'train fields are primitives',
      );
      if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
  }
});

// --- Solvability ----------------------------------------------------------
//
// A deliberately dim reference dispatcher: it serialises the whole network,
// never uses a bypass, and never overrides. If this policy clears a seed, the
// seed is solvable — and the delay it spends is what CFG.DELAY_BUDGET and
// CFG.SHIFT_SECONDS are sized against.

const SHARED = new Set(['n-trunk-in', 's-trunk-in', 'trunk']);

function committed(state, side) {
  const edge = SIGNALS[side].edge;
  return state.trains.find(
    (train) => onTrack(train) && train.edge === edge && train.dist > signalPos(edge),
  );
}

function referenceDispatch(state) {
  setSwitch(state, 'jn', 0);
  setSwitch(state, 'js', 0);
  const occupant =
    state.trains.find((train) => onTrack(train) && SHARED.has(train.edge)) ??
    committed(state, 'n') ??
    committed(state, 's');

  const lead = {};
  for (const side of ['n', 's']) {
    const edge = SIGNALS[side].edge;
    lead[side] = state.trains.find(
      (train) => onTrack(train) && train.edge === edge && train.dist <= signalPos(edge),
    );
  }
  const claim = occupant ? null : lead.n ? 'n' : lead.s ? 's' : null;
  for (const side of ['n', 's']) setSignal(state, side, Boolean(lead[side]) && claim !== side);

  const target = occupant ?? (claim ? lead[claim] : null);
  if (target) setSwitch(state, 'te', PLATFORMS.indexOf(target.dest));
}

function autoRun(seed) {
  const state = newShift(seed);
  begin(state);
  for (let i = 0; i < 60 * 200 && state.status === 'running'; i += 1) {
    referenceDispatch(state);
    step(state, CFG.TICK);
  }
  return state;
}

test('a plodding reference dispatcher clears every seed it is given', () => {
  let worstDelay = 0;
  let leastSlack = Infinity;
  for (let seed = 1; seed <= 60; seed += 1) {
    const state = autoRun(seed);
    assert.equal(state.status, 'won', `seed ${seed} is solvable (${state.failure})`);
    assert.equal(state.overrides, 0, 'without spending an override');
    worstDelay = Math.max(worstDelay, state.delay);
    leastSlack = Math.min(leastSlack, state.timeLeft);
  }
  assert.ok(worstDelay < CFG.DELAY_BUDGET, `worst delay ${worstDelay} fits the budget`);
  assert.ok(leastSlack > 0, `worst slack ${leastSlack} fits the clock`);
  // Headroom, not comfort: if this ever grows past the budget the schedule has
  // drifted and the numbers in CFG need re-measuring, not nudging.
  assert.ok(worstDelay > CFG.DELAY_BUDGET * 0.5, 'the budget still bites a lazy policy');
});

test('the reference dispatcher is itself deterministic', () => {
  assert.deepStrictEqual(autoRun(11), autoRun(11));
});
