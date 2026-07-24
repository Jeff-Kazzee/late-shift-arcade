import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  newGame,
  step,
  launch,
  nudge,
  setFlipper,
  finalScore,
  scoreBreakdown,
  gridMultiplier,
  countDistricts,
} from './logic.js';
import { TABLE, DISTRICTS, DROPS, TOUCH, inZone } from './table.js';

const DT = 1 / 60;
const speed = (ball) => Math.hypot(ball.vx, ball.vy);

const ball = (x, y, vx = 0, vy = 0) => ({ x, y, vx, vy, idle: 0, cradled: false });

// Drop a ball into the playfield with the table already in `play`.
function playing(seed = 1, balls = []) {
  const state = newGame(seed);
  state.phase = 'play';
  state.balls = balls;
  return state;
}

// Rest a ball on a flipper face at distance `r` from the pivot.
function onFlipper(side, r) {
  const spec = TABLE.flippers[side];
  const sign = side === 0 ? 1 : -1;
  return ball(
    spec.px + Math.cos(spec.rest) * r + Math.sin(spec.rest) * sign * (CFG.BALL_R + spec.r + 0.2),
    spec.py + Math.sin(spec.rest) * r - Math.cos(spec.rest) * sign * (CFG.BALL_R + spec.r + 0.2),
  );
}

function run(state, seconds, each = () => {}) {
  const events = [];
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    each(state, i);
    events.push(...step(state, DT));
  }
  return events;
}

// --- physics --------------------------------------------------------------

test('gravity accelerates a free ball and friction bleeds its speed', () => {
  const state = playing(1, [ball(300, 100)]);
  step(state, DT);
  // one frame of gravity, minus one frame of rolling loss
  assert.ok(state.balls[0].vy > 13 && state.balls[0].vy < 14);

  const coasting = playing(1, [ball(300, 100, 400, 0)]);
  coasting.phase = 'play';
  step(coasting, DT);
  assert.ok(coasting.balls[0].vx < 400, 'horizontal speed decays');
});

test('ball speed is capped, and the cap is above any ordinary flipper shot', () => {
  const state = playing(1, [ball(300, 200, 9000, 9000)]);
  step(state, DT);
  assert.ok(speed(state.balls[0]) <= CFG.MAX_SPEED + 1e-6);

  const flipped = playing(2, [onFlipper(0, 55)]);
  setFlipper(flipped, 0, true);
  let peak = 0;
  run(flipped, 0.3, () => {
    if (flipped.balls[0]) peak = Math.max(peak, speed(flipped.balls[0]));
  });
  assert.ok(peak > 800, `a full flipper shot should be strong, got ${peak}`);
  assert.ok(peak < CFG.MAX_SPEED, `the clamp must not be firing on ordinary shots, got ${peak}`);
});

test('flipper power scales with the swing: a full sweep beats a one-frame tap', () => {
  const measure = (holdFrames) => {
    const state = playing(3, [onFlipper(0, 45)]);
    setFlipper(state, 0, true);
    let peak = 0;
    for (let i = 0; i < 20; i += 1) {
      if (i === holdFrames) setFlipper(state, 0, false);
      step(state, DT);
      if (!state.balls[0]) break;
      peak = Math.max(peak, speed(state.balls[0]));
    }
    return peak;
  };
  assert.ok(measure(20) > measure(1) * 1.15, 'a full sweep must be measurably stronger than a tap');
});

test('a flipped ball leaves upward; an unflipped one rolls off the bat and drains', () => {
  const flipped = playing(4, [onFlipper(0, 45)]);
  setFlipper(flipped, 0, true);
  run(flipped, 5 / 60);
  assert.ok(flipped.balls[0].vy < -400, 'the ball is sent up the table');

  const abandoned = playing(4, [onFlipper(0, 45)]);
  const events = run(abandoned, 6);
  assert.ok(events.includes('drain'), 'a ball left on a resting flipper is lost');
});

test('no ball ever leaves the table, however hard the flippers are mashed', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const state = newGame(seed * 22307);
    let frame = 0;
    while (state.phase !== 'lost' && state.phase !== 'won' && frame < 60 * 60) {
      if (state.phase === 'ready') launch(state, (seed % 5) / 4);
      frame += 1;
      setFlipper(state, 0, frame % 37 < 7);
      setFlipper(state, 1, frame % 41 < 7);
      if (frame % 53 === 0) nudge(state, frame % 106 === 0 ? 1 : -1);
      step(state, DT);
      for (const b of state.balls) {
        assert.ok(
          b.x >= 0 && b.x <= TABLE.width && b.y >= 0,
          `ball tunnelled out at (${b.x.toFixed(1)}, ${b.y.toFixed(1)}) on seed ${seed}`,
        );
      }
    }
  }
});

test('no ball gets stuck: every hands-on run reaches a terminal state', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const state = newGame(seed * 7919);
    let frame = 0;
    while (state.phase !== 'lost' && state.phase !== 'won' && frame < 60 * 300) {
      if (state.phase === 'ready') launch(state, (seed % 5) / 4);
      frame += 1;
      setFlipper(state, 0, frame % 37 < 7);
      setFlipper(state, 1, frame % 41 < 7);
      step(state, DT);
    }
    assert.notEqual(state.phase, 'play', `seed ${seed} never finished — a ball is stuck`);
  }
});

test('a minimum-power launch still delivers the ball into the playfield', () => {
  const state = newGame(9);
  assert.equal(launch(state, 0), true);
  let entered = false;
  run(state, 3, () => {
    if (state.balls[0] && state.balls[0].x < 500) entered = true;
  });
  assert.ok(entered, 'the weakest plunge must clear the lane');
  assert.equal(launch(state, 1), false, 'a ball already in play cannot be re-launched');
});

test('the lane gate lets a ball out and refuses to let one back in', () => {
  // heading left out of the lane mouth: passes straight through
  const out = playing(5, [ball(500, 80, -600, 0)]);
  run(out, 3 / 60);
  assert.ok(out.balls[0].vx < 0, 'a ball leaving the lane is not turned around');
  assert.ok(out.balls[0].x < 490, 'and it actually crosses the gate');

  // heading right along the top: blocked, and deflected downward
  const back = playing(5, [ball(470, 78, 600, 0)]);
  run(back, 3 / 60);
  assert.ok(back.balls[0].vx < 0, 'a ball cannot re-enter the plunger lane');
  assert.ok(back.balls[0].vy > 0, 'the gate deflects it down into the playfield');
});

// --- serialisation and determinism ---------------------------------------

test('state survives a JSON round trip and keeps stepping identically', () => {
  const original = newGame(4242);
  launch(original, 0.7);
  run(original, 2);

  const clone = JSON.parse(JSON.stringify(original));
  const a = run(original, 4, (s, i) => setFlipper(s, 0, i % 30 < 8));
  const b = run(clone, 4, (s, i) => setFlipper(s, 0, i % 30 < 8));

  assert.deepEqual(b, a, 'events diverged after a round trip');
  assert.deepEqual(JSON.parse(JSON.stringify(clone)), JSON.parse(JSON.stringify(original)));
});

test('the same seed and the same inputs always produce the same run', () => {
  const play = () => {
    const state = newGame(31337);
    launch(state, 0.42);
    run(state, 20, (s, i) => {
      setFlipper(s, 0, i % 31 < 9);
      setFlipper(s, 1, i % 43 < 9);
      if (s.phase === 'ready') launch(s, 0.42);
    });
    return { points: state.tablePoints, seed: state.seed, phase: state.phase };
  };
  assert.deepEqual(play(), play());
});

// --- districts ------------------------------------------------------------

test('a district arms after exactly its required number of target hits', () => {
  const index = 1; // MARKET, needs 3
  const state = playing(6);
  for (let hit = 1; hit <= DISTRICTS[index].need; hit += 1) {
    state.districtCool[index] = 0;
    state.balls = [ball(DISTRICTS[index].x, DISTRICTS[index].y + 20, 0, -300)];
    const events = run(state, 0.2);
    assert.ok(events.includes('target'), `hit ${hit} did not register`);
    if (hit < DISTRICTS[index].need) {
      assert.equal(state.districts[index].status, 'dark');
      assert.equal(state.districts[index].charge, hit);
    } else {
      assert.equal(state.districts[index].status, 'armed');
      assert.ok(events.includes('arm'));
    }
  }
});

test('a lit district keeps paying, at double, and cannot be charged again', () => {
  const state = playing(7);
  state.districts[0] = { status: 'lit', charge: DISTRICTS[0].need };
  const before = state.tablePoints;
  state.balls = [ball(DISTRICTS[0].x + 20, DISTRICTS[0].y, -300, 0)];
  run(state, 0.2);
  assert.equal(state.districts[0].status, 'lit');
  assert.equal(state.tablePoints - before, CFG.P_TARGET * 2 * gridMultiplier(state));
});

test('the grid multiplier pays armed districts double what banked ones pay', () => {
  const state = playing(8);
  assert.equal(gridMultiplier(state), 1);
  state.districts[0].status = 'lit';
  assert.equal(gridMultiplier(state), 2);
  state.districts[1].status = 'armed';
  assert.equal(gridMultiplier(state), 4);
  for (const d of state.districts) d.status = 'armed';
  assert.equal(gridMultiplier(state), Math.min(CFG.MAX_GRID, 9));
  for (const d of state.districts) d.status = 'lit';
  assert.equal(gridMultiplier(state), 5, 'a fully banked city is worth less than a fully armed one');
});

test('completing the drop bank charges every dark district and the bank resets', () => {
  const state = playing(9);
  state.districts[3] = { status: 'lit', charge: DISTRICTS[3].need };
  let events = [];
  for (let i = 0; i < DROPS.length; i += 1) {
    state.dropCool[i] = 0;
    state.balls = [ball(DROPS[i].x + 20, DROPS[i].y, -300, 0)];
    events = run(state, 0.2);
  }
  assert.ok(state.drops.every(Boolean));
  assert.ok(events.includes('drop-bank'));
  assert.equal(state.districts[0].charge, 1);
  assert.equal(state.districts[1].charge, 1);
  assert.equal(state.districts[2].charge, 1);
  assert.equal(state.districts[3].charge, DISTRICTS[3].need, 'a lit district is not re-charged');

  state.balls = [];
  state.phase = 'play';
  run(state, CFG.DROP_RESET + 0.1);
  assert.ok(state.drops.every((down) => down === false), 'the bank pops back up');
});

// --- banking, blackout, and the win --------------------------------------

test('the substation banks every armed district, paid at the risked multiplier', () => {
  const state = playing(10);
  state.districts[0].status = 'armed';
  state.districts[1].status = 'armed';
  const risked = gridMultiplier(state); // 1 + 0 lit + 2*2 armed = 5
  assert.equal(risked, 5);

  state.balls = [ball(TABLE.saucer.x, TABLE.saucer.y + 10)];
  const events = run(state, 0.05);
  assert.ok(events.includes('bank'));
  assert.equal(countDistricts(state).lit, 2);
  assert.equal(state.tablePoints, CFG.P_BANK * 2 * risked);
  assert.equal(gridMultiplier(state), 3, 'banking trades the risked multiplier for a permanent one');
});

test('an unarmed substation hit is a plain award, not a bank', () => {
  const state = playing(11, [ball(TABLE.saucer.x, TABLE.saucer.y + 10)]);
  const events = run(state, 0.05);
  assert.ok(events.includes('saucer'));
  assert.ok(!events.includes('bank'));
  assert.equal(state.tablePoints, CFG.P_SAUCER);
});

test('a fully lit city starts the Blackout multiball with three balls', () => {
  const state = playing(12);
  for (const d of state.districts) d.status = 'lit';
  state.balls = [ball(TABLE.saucer.x, TABLE.saucer.y + 10)];
  const events = run(state, CFG.SAUCER_HOLD + 0.1);
  assert.ok(events.includes('blackout-start'));
  assert.equal(state.mode, 'blackout');
  assert.equal(state.balls.length, 3, 'the held ball is kicked back out alongside two more');
});

test('three jackpots win the game; the win keeps the unused balls', () => {
  const state = playing(13);
  for (const d of state.districts) d.status = 'lit';
  state.mode = 'blackout';
  const ballsBefore = state.ballsLeft;
  for (let i = 1; i <= CFG.JACKPOTS_TO_WIN; i += 1) {
    state.saucer = { held: false, timer: 0 };
    state.balls = [ball(TABLE.saucer.x, TABLE.saucer.y + 10)];
    const events = run(state, 0.05);
    assert.ok(events.includes('jackpot'));
    if (i === CFG.JACKPOTS_TO_WIN) assert.ok(events.includes('win'));
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.ballsLeft, ballsBefore);
  assert.deepEqual(step(state, DT), [], 'a won table stops simulating');
});

test('falling back to one ball ends Blackout and resets the jackpot count', () => {
  const state = playing(14);
  for (const d of state.districts) d.status = 'lit';
  state.mode = 'blackout';
  state.jackpots = 2;
  state.balls = [ball(300, 200), ball(320, 200)];

  // drop one ball: multiball continues, no ball is charged
  const ballsBefore = state.ballsLeft;
  state.balls[0].y = TABLE.drainY + 5;
  let events = step(state, DT);
  assert.ok(events.includes('drain'));
  assert.equal(state.ballsLeft, ballsBefore, 'a multiball drain costs nothing');
  assert.equal(state.mode, 'blackout');

  // drop the last one: blackout ends and the ball is finally charged
  state.balls[0].y = TABLE.drainY + 5;
  events = step(state, DT);
  assert.ok(events.includes('blackout-end'));
  assert.equal(state.mode, 'normal');
  assert.equal(state.jackpots, 0);
  assert.equal(state.ballsLeft, ballsBefore - 1);
});

// --- draining, ball save, and losing --------------------------------------

test('a drain loses armed districts but never banked ones', () => {
  const state = playing(15);
  state.districts[0].status = 'lit';
  state.districts[1].status = 'armed';
  state.districts[2].charge = 1;
  state.saveUsed = true;
  state.balls = [ball(300, TABLE.drainY + 5)];
  const events = step(state, DT);
  assert.ok(events.includes('grid-lost'));
  assert.equal(state.districts[0].status, 'lit');
  assert.equal(state.districts[1].status, 'dark');
  assert.equal(state.districts[1].charge, 0);
  assert.equal(state.districts[2].charge, 1, 'partial charge on a dark district survives');
});

test('the ball save is once per ball and does not spend one', () => {
  const state = newGame(16);
  launch(state, 1);
  const before = state.ballsLeft;
  state.balls = [ball(300, TABLE.drainY + 5)];
  let events = step(state, DT);
  assert.ok(events.includes('ball-save'));
  assert.equal(state.ballsLeft, before);
  assert.equal(state.phase, 'ready');

  // the same ball drains again: this time it costs one
  launch(state, 1);
  assert.equal(state.saveTimer, 0, 're-plunging must not re-arm the save');
  state.balls = [ball(300, TABLE.drainY + 5)];
  events = step(state, DT);
  assert.ok(!events.includes('ball-save'));
  assert.equal(state.ballsLeft, before - 1);
});

test('three drained balls end the run', () => {
  const state = newGame(17);
  assert.equal(state.ballsLeft, CFG.BALLS - 1, 'the first ball is already in the shooter lane');
  for (let i = 0; i < CFG.BALLS; i += 1) {
    launch(state, 1);
    state.saveUsed = true;
    state.saveTimer = 0;
    state.balls = [ball(300, TABLE.drainY + 5)];
    step(state, DT);
  }
  assert.equal(state.phase, 'lost');
  assert.equal(state.ballsLeft, 0);
  assert.deepEqual(step(state, DT), [], 'a lost table stops simulating');
});

// --- nudge and tilt -------------------------------------------------------

test('a nudge pushes every ball sideways and up', () => {
  const state = playing(18, [ball(300, 200), ball(320, 220)]);
  assert.equal(nudge(state, 1), 'nudge');
  for (const b of state.balls) {
    assert.equal(b.vx, CFG.NUDGE_VX);
    assert.equal(b.vy, -CFG.NUDGE_VY);
  }
  assert.equal(nudge(state, 1), null, 'nudges are rate limited');
});

test('panic nudging warns; spacing nudges out never does', () => {
  const panic = playing(19, [ball(300, 200)]);
  const results = [];
  for (let i = 0; i < 3; i += 1) {
    results.push(nudge(panic, 1));
    run(panic, CFG.NUDGE_COOLDOWN + 0.01);
  }
  assert.deepEqual(results, ['nudge', 'nudge', 'tiltwarn']);
  assert.equal(panic.tiltWarnings, 1);

  const patient = playing(20, [ball(300, 200)]);
  for (let i = 0; i < 8; i += 1) {
    nudge(patient, -1);
    run(patient, 1.2);
  }
  assert.equal(patient.tiltWarnings, 0, 'a nudge every 1.2s is inside the meter\'s decay');
});

test('the third warning on a ball tilts the table: no flippers, no points', () => {
  const state = playing(21, [ball(300, 200)]);
  const results = [];
  for (let i = 0; i < 9; i += 1) {
    const r = nudge(state, 1);
    if (r) results.push(r);
    run(state, CFG.NUDGE_COOLDOWN + 0.01);
  }
  assert.equal(results.filter((r) => r === 'tiltwarn').length, CFG.TILT_LIMIT - 1);
  assert.ok(results.includes('tilt'));
  assert.equal(state.tiltLocked, true);
  assert.equal(state.tiltWarnings, CFG.TILT_LIMIT);
  assert.equal(nudge(state, 1), null, 'a tilted table ignores further nudges');

  // flippers are dead
  setFlipper(state, 0, true);
  run(state, 0.3);
  assert.ok(Math.abs(state.flippers[0].angle - TABLE.flippers[0].rest) < 1e-9);

  // and the table stops paying
  const before = state.tablePoints;
  state.balls = [ball(DISTRICTS[0].x + 20, DISTRICTS[0].y, -300, 0)];
  run(state, 0.2);
  assert.equal(state.tablePoints, before);

  // a fresh ball clears the lock but keeps the scored warnings
  state.saveUsed = true;
  state.balls = [ball(300, TABLE.drainY + 5)];
  step(state, DT);
  assert.equal(state.tiltLocked, false);
  assert.equal(state.tiltThisBall, 0);
  assert.equal(state.tiltWarnings, CFG.TILT_LIMIT, 'warnings are scored for the whole run');
});

// --- score ----------------------------------------------------------------

test('the score is table points plus districts, win, balls, minus tilts', () => {
  const state = newGame(22);
  state.tablePoints = 123456;
  state.districts[0].status = 'lit';
  state.districts[1].status = 'lit';
  state.districts[2].status = 'armed';
  state.ballsLeft = 1;
  state.tiltWarnings = 2;

  const expected = 123456 + 2 * CFG.B_DISTRICT + 1 * CFG.B_BALL - 2 * CFG.B_TILT;
  assert.equal(finalScore(state), expected);

  state.phase = 'won';
  assert.equal(finalScore(state), expected + CFG.B_WIN);

  const parts = scoreBreakdown(state);
  assert.equal(parts.table + parts.districts + parts.win + parts.balls + parts.tilt, parts.total);
  assert.equal(parts.tilt, -2 * CFG.B_TILT);
});

test('an armed district is worth nothing at the buzzer; only banked ones count', () => {
  const armed = newGame(23);
  armed.districts.forEach((d) => { d.status = 'armed'; });
  armed.ballsLeft = 0;
  assert.equal(finalScore(armed), 0);

  const banked = newGame(23);
  banked.districts.forEach((d) => { d.status = 'lit'; });
  banked.ballsLeft = 0;
  assert.equal(finalScore(banked), 4 * CFG.B_DISTRICT);
});

test('the score never goes negative, however many tilts are taken', () => {
  const state = newGame(24);
  state.tablePoints = 1000;
  state.ballsLeft = 0;
  state.tiltWarnings = 99;
  assert.equal(finalScore(state), 0);
});

// --- touch contract -------------------------------------------------------

test('both flipper zones are at least 96px on their short side and do not overlap', () => {
  for (const zone of Object.values(TOUCH)) {
    assert.ok(Math.min(zone.w, zone.h) >= 96, 'a thumb zone is under 96px');
  }
  assert.ok(!inZone(TOUCH.flipRight, TOUCH.flipLeft.x + TOUCH.flipLeft.w - 1, 400));
  assert.ok(inZone(TOUCH.flipLeft, 10, 400));
  assert.ok(inZone(TOUCH.flipRight, 630, 400));
  // a nudge strip is reachable without leaving a flipper held
  assert.ok(inZone(TOUCH.nudgeLeft, 20, 200) && !inZone(TOUCH.flipLeft, 20, 200));
  assert.ok(inZone(TOUCH.nudgeRight, 620, 200) && !inZone(TOUCH.flipRight, 620, 200));
});
