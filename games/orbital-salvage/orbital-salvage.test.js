import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  applyBurn,
  burnFromDrag,
  carrierPosition,
  carrierVelocity,
  missionScore,
  newGame,
  orbitPosition,
  orbitVelocity,
  previewTrajectory,
  radiusOf,
  step,
  toggleTether,
  totalMass,
  wreckPosition,
} from './logic.js';

// A state with the tug parked on a clean circular orbit far from every
// authored hazard so individual rules can be exercised in isolation.
function isolated(r = 250, angle = 0.3) {
  const state = newGame();
  const p = orbitPosition(r, angle);
  const v = orbitVelocity(r, angle);
  state.tug = { x: p.x, y: p.y, vx: v.vx, vy: v.vy };
  state.debris = [];
  return state;
}

function run(state, seconds, dt = 1 / 60) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    events.push(...step(state, dt));
    if (state.over) break;
  }
  return events;
}

test('a circular orbit stays circular: the physics step is predictable', () => {
  const state = isolated(250);
  run(state, 10);
  assert.equal(state.over, false);
  const r = radiusOf(state.tug);
  assert.ok(Math.abs(r - 250) < 4, `radius drifted from 250 to ${r}`);
  const speed = Math.hypot(state.tug.vx, state.tug.vy);
  assert.ok(Math.abs(speed - Math.sqrt(CFG.MU / 250)) < 2, 'orbital speed held');
});

test('burnFromDrag scales with drag, caps at MAX_DRAG, and charges fuel per impulse', () => {
  const state = isolated();
  const small = burnFromDrag(state, 50, 0);
  const capped = burnFromDrag(state, 500, 0);
  assert.ok(Math.hypot(small.dvx, small.dvy) < Math.hypot(capped.dvx, capped.dvy));
  assert.equal(capped.impulse, CFG.MAX_DRAG * CFG.IMPULSE_PER_PX);
  assert.equal(capped.fuelCost, capped.impulse * CFG.FUEL_PER_IMPULSE);
  assert.equal(burnFromDrag(state, 3, 0), null, 'a tap is not a burn');

  state.fuel = 1;
  const starved = burnFromDrag(state, 500, 0);
  assert.ok(starved.fuelCost <= 1 + 1e-9, 'a burn cannot spend fuel the tank lacks');
});

test('applyBurn changes velocity by the quoted dv and spends the quoted fuel', () => {
  const state = isolated();
  const before = { ...state.tug };
  const fuel = state.fuel;
  const quote = burnFromDrag(state, 80, 0);
  applyBurn(state, 80, 0);
  assert.ok(Math.abs(state.tug.vx - before.vx - quote.dvx) < 1e-9);
  assert.ok(Math.abs(state.fuel - (fuel - quote.fuelCost)) < 1e-9);
});

test('tethered mass makes the same drag buy less route change', () => {
  const bare = isolated();
  const loaded = isolated();
  loaded.cargo = {
    wreckId: 'core', mass: 14,
    x: loaded.tug.x + CFG.TETHER_LEN, y: loaded.tug.y,
    vx: loaded.tug.vx, vy: loaded.tug.vy,
  };
  assert.equal(totalMass(bare), CFG.TUG_MASS);
  assert.equal(totalMass(loaded), CFG.TUG_MASS + 14);

  const bareQuote = burnFromDrag(bare, 0, -120);
  const loadedQuote = burnFromDrag(loaded, 0, -120);
  assert.ok(
    loadedQuote.effectiveDv < bareQuote.effectiveDv * 0.5,
    'a 14t wreck more than halves effective dv',
  );

  // The dynamics agree with the quote: after the same burn plus settling
  // time, the towing tug ends far closer to its original track.
  const bareStart = radiusOf(bare.tug);
  applyBurn(bare, 0, -120);
  applyBurn(loaded, 0, -120);
  run(bare, 4);
  run(loaded, 4);
  const bareShift = Math.abs(radiusOf(bare.tug) - bareStart);
  const loadedShift = Math.abs(radiusOf(loaded.tug) - bareStart);
  assert.ok(
    loadedShift < bareShift * 0.72,
    `towing must blunt the burn (bare ${bareShift.toFixed(1)}, loaded ${loadedShift.toFixed(1)})`,
  );
});

test('tether attaches only in range, detaches on toggle, and the rope really pulls', () => {
  const state = isolated();
  assert.deepEqual(toggleTether(state), [], 'nothing in range, nothing happens');

  const wreck = state.wrecks.find((w) => w.id === 'array');
  const p = wreckPosition(wreck);
  const v = orbitVelocity(wreck.r, wreck.angle, wreck.dir);
  state.tug = { x: p.x + CFG.TETHER_RANGE - 6, y: p.y, vx: v.vx, vy: v.vy };
  assert.deepEqual(toggleTether(state), ['tether']);
  assert.equal(wreck.state, 'tethered');
  assert.equal(state.cargo.wreckId, 'array');

  // Burn away from the cargo; the spring must drag the cargo after the tug.
  const cargoV0 = { vx: state.cargo.vx, vy: state.cargo.vy };
  applyBurn(state, -120, 0);
  run(state, 2);
  const dragged = Math.hypot(state.cargo.vx - cargoV0.vx, state.cargo.vy - cargoV0.vy);
  assert.ok(dragged > 3, `tether transmits the burn to the cargo (got ${dragged.toFixed(2)})`);

  assert.deepEqual(toggleTether(state), ['release']);
  assert.equal(state.cargo, null);
  assert.equal(wreck.state, 'field');
});

test('score formula: 10×salvage + 100×fuel + 500×hull% + risk − 1000×collision, floored at 0', () => {
  const state = newGame();
  state.dockedValue = 400;
  state.fuel = 37.2;
  state.hull = 84;
  state.riskBonus = 3000;
  state.collisions = 2;
  assert.equal(missionScore(state), 4000 + 3800 + 42000 + 3000 - 2000);

  state.dockedValue = 0;
  state.fuel = 0;
  state.hull = 0;
  state.riskBonus = 0;
  state.collisions = 5;
  assert.equal(missionScore(state), 0, 'score never goes negative');
});

test('loss: debris collision bleeds hull and a dead hull ends the mission', () => {
  const state = isolated();
  state.debris = [{ r: 250, angle: 0.3, omega: 0, radius: 9 }];
  const events = run(state, 0.1);
  assert.ok(events.includes('collision'));
  assert.equal(state.collisions, 1);
  assert.equal(state.hull, 100 - CFG.HIT_HULL);

  const doomed = isolated();
  doomed.hull = CFG.HIT_HULL;
  doomed.debris = [{ r: 250, angle: 0.3, omega: 0, radius: 9 }];
  const fatal = run(doomed, 0.1);
  assert.ok(fatal.includes('game-over'));
  assert.equal(doomed.outcome, 'hull');
  assert.equal(doomed.win, false);
});

test('loss: dropping into the atmosphere or leaving the leash fails the orbit', () => {
  const low = isolated();
  low.tug = { x: CFG.CX + CFG.ATMO_R - 2, y: CFG.CY, vx: 0, vy: 0 };
  step(low, 1 / 60);
  assert.equal(low.outcome, 'burn-up');

  const far = isolated();
  far.tug = { x: CFG.CX + CFG.ESCAPE_R + 5, y: CFG.CY, vx: 0, vy: 0 };
  step(far, 1 / 60);
  assert.equal(far.outcome, 'adrift');
});

test('loss: debris destroying tethered cargo kills the mission', () => {
  const state = isolated();
  state.cargo = {
    wreckId: 'core', mass: 14,
    x: state.tug.x + CFG.TETHER_LEN, y: state.tug.y,
    vx: state.tug.vx, vy: state.tug.vy,
  };
  state.wrecks.find((w) => w.id === 'core').state = 'tethered';
  state.debris = [{
    r: Math.hypot(state.cargo.x - CFG.CX, state.cargo.y - CFG.CY),
    angle: Math.atan2(state.cargo.y - CFG.CY, state.cargo.x - CFG.CX),
    omega: 0,
    radius: 9,
  }];
  const events = run(state, 0.1);
  assert.ok(events.includes('game-over'));
  assert.equal(state.outcome, 'cargo');
});

test('loss: an empty tank strands the tug after the reserve grace', () => {
  const state = isolated();
  state.fuel = 0;
  run(state, CFG.DRIFT_GRACE - 1);
  assert.equal(state.over, false, 'reserve power keeps the mission alive briefly');
  run(state, 2);
  assert.equal(state.outcome, 'stranded');
});

test('win: docking cargo that meets the contract completes the mission', () => {
  const state = isolated();
  const cp = carrierPosition(state);
  const cv = carrierVelocity(state);
  state.tug = { x: cp.x + 6, y: cp.y, vx: cv.vx, vy: cv.vy };
  state.cargo = {
    wreckId: 'core', mass: 14,
    x: cp.x + 6 + CFG.TETHER_LEN, y: cp.y,
    vx: cv.vx, vy: cv.vy,
  };
  state.wrecks.find((w) => w.id === 'core').state = 'tethered';
  const events = step(state, 1 / 60);
  assert.ok(events.includes('deposit'));
  assert.ok(events.includes('complete'));
  assert.equal(state.win, true);
  assert.equal(state.dockedValue, 400);
  assert.equal(state.riskBonus, 3000);
  assert.ok(state.score > 0);
});

test('partial deposits accumulate without ending the mission', () => {
  const state = isolated();
  const cp = carrierPosition(state);
  const cv = carrierVelocity(state);
  state.tug = { x: cp.x + 6, y: cp.y, vx: cv.vx, vy: cv.vy };
  state.cargo = {
    wreckId: 'pod', mass: 5,
    x: cp.x + 6 + CFG.TETHER_LEN, y: cp.y,
    vx: cv.vx, vy: cv.vy,
  };
  state.wrecks.find((w) => w.id === 'pod').state = 'tethered';
  const events = step(state, 1 / 60);
  assert.ok(events.includes('deposit'));
  assert.equal(state.over, false, '150 of 400 is not a completed contract');
  assert.equal(state.dockedValue, 150);
});

test('heat builds inside the well, cools outside, and overheating burns hull', () => {
  const state = isolated();
  state.tug = { x: CFG.CX + 80, y: CFG.CY, vx: 0, vy: -Math.sqrt(CFG.MU / 80) };
  run(state, 2);
  assert.ok(state.heat > 0, 'skimming the well heats the tug');

  const cooked = isolated();
  cooked.heat = CFG.HEAT_MAX;
  cooked.tug = { x: CFG.CX + 80, y: CFG.CY, vx: 0, vy: -Math.sqrt(CFG.MU / 80) };
  const hull = cooked.hull;
  run(cooked, 1);
  assert.ok(cooked.hull < hull, 'an overheated hull takes damage');

  const cooling = isolated(280);
  cooling.heat = 50;
  run(cooling, 2);
  assert.ok(cooling.heat < 50, 'altitude cools the hull');
});

test('the simulation is seeded, deterministic, and JSON-serializable', () => {
  const a = newGame(77);
  const b = newGame(77);
  assert.deepEqual(a, b);
  assert.notDeepEqual(newGame(77).debris, newGame(78).debris);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'state survives a JSON round trip');

  applyBurn(a, 60, -40);
  applyBurn(b, 60, -40);
  run(a, 3);
  run(b, 3);
  assert.deepEqual(a, b, 'identical inputs replay identically');
});

test('previewTrajectory starts at the tug and a burn visibly rewrites it', () => {
  const state = isolated(200);
  const coast = previewTrajectory(state, 0, 0, 10);
  assert.ok(coast.points.length > 50);
  const first = coast.points[0];
  assert.ok(Math.hypot(first.x - state.tug.x, first.y - state.tug.y) < 8);
  const coastEnd = coast.points[coast.points.length - 1];
  const coastEndR = Math.hypot(coastEnd.x - CFG.CX, coastEnd.y - CFG.CY);
  assert.ok(Math.abs(coastEndR - 200) < 6, 'coasting preview stays on the orbit');

  const quote = burnFromDrag(state, 0, 120);
  const burned = previewTrajectory(state, quote.dvx, quote.dvy, 10);
  const burnedEnd = burned.points[burned.points.length - 1];
  const burnedEndR = Math.hypot(burnedEnd.x - CFG.CX, burnedEnd.y - CFG.CY);
  assert.ok(Math.abs(burnedEndR - coastEndR) > 20, 'a real burn changes the route');

  // Preview and simulation are the same physics: previewing must not mutate.
  const snapshot = JSON.parse(JSON.stringify(state));
  previewTrajectory(state, 5, 5, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), snapshot);
});
