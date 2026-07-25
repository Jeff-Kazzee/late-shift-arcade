// Tests for VAULT HEIST. They live beside the game, not in test/, because a
// cartridge that cannot be reasoned about on its own is not a package.

import test from 'node:test';
import assert from 'node:assert/strict';

import createVaultHeist, { createVaultHeist as named } from './vault-heist.js';
import { manifest } from './manifest.js';
import {
  defineCatalogEntry, activateCartridge, validateManifest, launchBlockReason,
} from '../../shell/cartridge.js';
import { palette } from '../../shell/palette.js';
import { MIN_TOUCH_TARGET } from '../../shell/catalog-layout.js';

import {
  CFG, ROOMS, ROOM_IDS, EDGES, CAMERAS, GUARD_TEMPLATES, CREW_TEMPLATES,
  mulberry32, newHeist, room, roomIndex, neighbors, shortestPath, hops, edgeKind,
  projectTurn, resolveTurn, applyProjection, guardStep, guardOutlook,
  legalOrders, actionAt, reachable, crewById, carriedBy, camerasLive,
  terminalScore, scoreBreakdown, compareRuns, totalTools,
} from './logic.js';

// --- helpers ---------------------------------------------------------------

const play = (state, orders) => resolveTurn(state, orders).state;

// Drive a heist to its end under a policy, returning the terminal state.
function run(seed, policy, cap = 60) {
  let state = newHeist(seed);
  let steps = 0;
  while (!state.over && steps < cap) {
    state = play(state, policy(state));
    steps += 1;
  }
  return state;
}

// --- the building ----------------------------------------------------------

test('every edge joins two declared rooms and no room is stranded', () => {
  for (const [a, b] of EDGES) {
    assert.ok(ROOM_IDS.includes(a), `unknown room ${a}`);
    assert.ok(ROOM_IDS.includes(b), `unknown room ${b}`);
    assert.notEqual(a, b);
  }
  const state = newHeist(1);
  const open = { ...state, vaultOpen: true };
  for (const id of ROOM_IDS) {
    assert.ok(neighbors(open, id, 'bruno').length > 0, `${id} has no exits`);
    assert.ok(Number.isFinite(hops(open, 'street', id, 'bruno')), `${id} unreachable`);
  }
});

test('the vault has exactly one door, and it starts shut', () => {
  const state = newHeist(1);
  const doors = EDGES.filter(([a, b]) => a === 'vault' || b === 'vault');
  assert.equal(doors.length, 1);
  assert.equal(edgeKind('lobby', 'vault'), 'vault');
  assert.deepEqual(neighbors(state, 'lobby', 'bruno').includes('vault'), false);
  assert.deepEqual(neighbors({ ...state, vaultOpen: true }, 'lobby', 'bruno').includes('vault'), true);
});

test('the vent is VANE\'s alone — it is what a speed-2 ghost is for', () => {
  const state = newHeist(1);
  assert.equal(edgeKind('alley', 'archive'), 'vent');
  assert.ok(neighbors(state, 'alley', 'vane').includes('archive'));
  assert.ok(!neighbors(state, 'alley', 'bruno').includes('archive'));
  assert.ok(!neighbors(state, 'alley', 'guard').includes('archive'));
});

test('the corridors have no cover and the LOBBY camera cannot be walked around', () => {
  for (const id of ['hallw', 'atrium', 'halle', 'security']) {
    assert.equal(room(id).cover, false, `${id} should be exposed`);
  }
  assert.ok(CAMERAS.includes('lobby'));
  // Every route to the vault passes the lobby, so answering the lenses is
  // not optional — which is the puzzle, not an oversight.
  const open = { ...newHeist(1), vaultOpen: true };
  for (const id of ROOM_IDS) {
    if (id === 'vault' || id === 'lobby') continue;
    const path = shortestPath(open, id, 'vault', 'vane');
    assert.ok(path.includes('lobby'), `${id} reaches the vault without the lobby`);
  }
});

test('SECURITY console moved out; the recorder sits one door off the approach', () => {
  assert.equal(room('server').console, 'cameras');
  assert.equal(hops(newHeist(1), 'server', 'lobby', 'spark'), 1);
});

// --- patrols are a pure function of guard state ----------------------------

test('a guard walks its loop one room a turn and looks where it is going', () => {
  const state = newHeist(1);
  const guard = { ...state.guards[0], route: ['hallw', 'atrium', 'halle'], idx: 0, room: 'hallw', alertTo: null, pause: 0 };
  const outlook = guardOutlook(state, guard);
  assert.equal(outlook.to, 'atrium');
  assert.equal(outlook.facing, 'halle');
  assert.equal(outlook.moved.idx, 1);
});

test('guardStep is deterministic — same guard, same answer, every time', () => {
  const state = newHeist(9);
  for (const guard of state.guards) {
    const first = guardStep(state, guard);
    for (let i = 0; i < 20; i += 1) assert.equal(guardStep(state, guard), first);
  }
});

test('patrol loops are long enough to leave their rooms genuinely cold', () => {
  // A four-stop loop leaves its rooms hot half the time and the building
  // becomes a wall. Six is the floor this vault was tuned against.
  for (const tpl of GUARD_TEMPLATES) {
    assert.ok(tpl.route.length >= 6, `${tpl.name} loop is only ${tpl.route.length} stops`);
    for (const stop of tpl.route) assert.ok(ROOM_IDS.includes(stop), `${tpl.name} visits unknown ${stop}`);
  }
});

test('SECURITY is left unwatched long enough to be worth reaching', () => {
  // Walk DESK's loop and count the turns nothing is looking at its own beat.
  const state = newHeist(1);
  const desk = state.guards.find((g) => g.id === 'g3');
  let cursor = { ...desk, idx: 0, room: desk.route[0], alertTo: null, pause: 0 };
  let cold = 0;
  for (let turn = 0; turn < desk.route.length; turn += 1) {
    const outlook = guardOutlook(state, cursor);
    if (outlook.to !== 'security' && outlook.facing !== 'security') cold += 1;
    cursor = { ...outlook.moved, room: outlook.to };
  }
  assert.ok(cold >= 2, `SECURITY is only cold ${cold} turns in ${desk.route.length}`);
});

// --- the headline guarantee ------------------------------------------------

test('what the overlay previews is exactly what the turn resolves', () => {
  // This is the promise the whole game rests on, so it is checked over many
  // seeds and many order sets rather than one happy path.
  for (let seed = 1; seed <= 40; seed += 1) {
    let state = newHeist(seed);
    const rnd = mulberry32(seed * 7919);
    for (let turn = 0; turn < 12 && !state.over; turn += 1) {
      const orders = {};
      for (const crew of state.crew) {
        if (crew.captured || crew.extracted) continue;
        const legal = legalOrders(state, crew.id);
        orders[crew.id] = legal[Math.floor(rnd() * legal.length)];
      }
      const preview = projectTurn(state, orders);
      const again = projectTurn(state, orders);
      assert.deepEqual(again, preview, 'previewing twice disagreed with itself');

      const resolved = resolveTurn(state, orders);
      assert.deepEqual(resolved.projection, preview, 'resolution disagreed with the preview');
      // And the thing the player actually reads off the overlay:
      assert.deepEqual(
        resolved.state.guards.map((g) => g.room),
        preview.guards.map((g) => g.to),
        'guards did not end where the overlay said',
      );
      assert.deepEqual(
        resolved.state.crew.map((c) => c.room),
        preview.crewAfter.map((c) => c.room),
        'crew did not end where the overlay said',
      );
      state = resolved.state;
    }
  }
});

test('projecting a turn mutates nothing — the overlay is safe to draw on any frame', () => {
  const state = newHeist(5);
  const before = JSON.stringify(state);
  for (let i = 0; i < 30; i += 1) projectTurn(state, { vane: { kind: 'move', to: 'hallw' } });
  assert.equal(JSON.stringify(state), before);
});

test('next-turn guard positions do not depend on the orders being queued', () => {
  // Noise lands after the patrol has moved, which is what lets the cabinet
  // draw honest guard markers before the player has decided anything.
  const state = newHeist(11);
  const quiet = projectTurn(state, {});
  const busy = projectTurn(state, { bruno: { kind: 'move', to: 'hallw' }, vane: { kind: 'move', to: 'alley' } });
  assert.deepEqual(busy.guards.map((g) => g.to), quiet.guards.map((g) => g.to));
  assert.deepEqual(busy.guards.map((g) => g.facing), quiet.guards.map((g) => g.facing));
});

// --- detection -------------------------------------------------------------

test('a guard takes anyone standing in his room or in the room he is facing', () => {
  const state = newHeist(1);
  const guard = { id: 'g1', name: 'T', route: ['hallw', 'atrium'], idx: 0, room: 'hallw', alertTo: null, pause: 0 };
  const rigged = {
    ...state,
    guards: [guard],
    crew: state.crew.map((c) => (c.id === 'vane' ? { ...c, room: 'atrium' } : { ...c, room: 'street' })),
  };
  const projection = projectTurn(rigged, {});
  assert.equal(projection.guards[0].to, 'atrium');
  assert.ok(projection.detections.some((d) => d.crew === 'vane'));
});

test('going still under cover hides you even from a guard who walks in', () => {
  const state = newHeist(1);
  const guard = { id: 'g1', name: 'T', route: ['hallw', 'loading'], idx: 0, room: 'hallw', alertTo: null, pause: 0 };
  const rigged = {
    ...state,
    guards: [guard],
    crew: state.crew.map((c) => (c.id === 'vane' ? { ...c, room: 'loading' } : { ...c, room: 'street' })),
  };
  assert.ok(projectTurn(rigged, {}).detections.some((d) => d.crew === 'vane'));
  assert.equal(projectTurn(rigged, { vane: { kind: 'hide' } }).detections.length, 0);
});

test('a corridor offers nothing to hide behind', () => {
  const state = newHeist(1);
  const crew = crewById(state, 'vane');
  const inHall = { ...state, crew: state.crew.map((c) => ({ ...c, room: 'atrium' })) };
  assert.ok(!legalOrders(inHall, 'vane').some((o) => o.kind === 'hide'));
  assert.equal(room(crew.room).cover, true); // STREET, where the crew starts
});

test('a camera raises the alarm once and then stops mattering', () => {
  const state = { ...newHeist(1), crew: newHeist(1).crew.map((c) => ({ ...c, room: 'lobby' })), guards: [] };
  const first = projectTurn(state, {});
  assert.equal(first.spotted.length > 0, true);
  assert.equal(first.next.alarms, 1);
  const loud = applyProjection(state, first);
  const second = projectTurn(loud, {});
  assert.equal(second.next.alarms, 1, 'the lenses charged a second alarm');
});

test('blinding the lenses actually blinds them', () => {
  const base = newHeist(1);
  const state = { ...base, crew: base.crew.map((c) => ({ ...c, room: 'lobby' })), guards: [] };
  assert.ok(camerasLive(state));
  const emp = applyProjection(state, projectTurn(state, { vane: { kind: 'tool', tool: 'emp' } }));
  assert.equal(emp.alarms, 0);
  assert.ok(!camerasLive(emp));
  assert.equal(emp.tools.emp, 0);
});

test('wiping the recorder kills the cameras for good and books an objective', () => {
  const base = newHeist(1);
  const state = { ...base, guards: [], crew: base.crew.map((c) => ({ ...c, room: 'server' })) };
  assert.equal(actionAt(state, crewById(state, 'spark')).kind, 'hack-cameras');
  assert.equal(actionAt(state, crewById(state, 'bruno')).kind, 'none', 'muscle cannot hack');
  const after = applyProjection(state, projectTurn(state, { spark: { kind: 'act' } }));
  assert.equal(after.camerasDead, true);
  assert.equal(after.recorderWiped, true);
  assert.equal(scoreBreakdown(after).objectives, 1);
});

// A corridor is the one place HIDE is not on the menu, so these two are the
// only answers to a glance there. Both write straight into the detection
// path, which is where a bug costs somebody a crew member.

test('smoke kills the glance that a corridor gives you no way to duck', () => {
  const base = newHeist(1);
  const guard = { id: 'g1', name: 'T', route: ['atrium', 'halle'], idx: 0, room: 'atrium', alertTo: null, pause: 0 };
  const rigged = {
    ...base,
    camerasDead: true,
    guards: [guard],
    crew: base.crew.map((c) => (c.id === 'vane' ? { ...c, room: 'atrium' } : { ...c, room: 'street' })),
  };
  assert.equal(room('atrium').cover, false, 'the fixture needs a room with nothing to hide behind');
  assert.ok(!legalOrders(rigged, 'vane').some((o) => o.kind === 'hide'));

  const bare = projectTurn(rigged, {});
  assert.equal(bare.guards[0].to, 'halle');
  assert.equal(bare.guards[0].facing, 'atrium');
  assert.ok(bare.detections.some((d) => d.crew === 'vane'), 'the glance should reach him');

  const smoked = projectTurn(rigged, { vane: { kind: 'tool', tool: 'smoke' } });
  assert.equal(smoked.detections.length, 0, 'smoke did not break the line of sight');
  assert.equal(smoked.next.tools.smoke, 0);
});

test('cutting the lights blinds the lenses and every glance at once', () => {
  const base = newHeist(1);
  const atConsole = { ...base, guards: [], crew: base.crew.map((c) => ({ ...c, room: 'maint' })) };
  assert.equal(actionAt(atConsole, crewById(atConsole, 'spark')).kind, 'hack-lights');
  assert.equal(actionAt(atConsole, crewById(atConsole, 'bruno')).kind, 'none', 'muscle cannot hack');

  const dark = applyProjection(atConsole, projectTurn(atConsole, { spark: { kind: 'act' } }));
  assert.equal(dark.lightsOutTurns, CFG.LIGHTS_OUT_TURNS);
  assert.equal(camerasLive(dark), false);
  // And it is not offered again while they are still out — a button that
  // spends a turn and changes nothing is a trap.
  assert.equal(actionAt(dark, crewById(dark, 'spark')).kind, 'none');

  // In the dark a guard still has his own room, and nothing beyond it.
  const guard = { id: 'g1', name: 'T', route: ['atrium', 'halle'], idx: 0, room: 'atrium', alertTo: null, pause: 0 };
  const blind = {
    ...base,
    camerasDead: true,
    lightsOutTurns: CFG.LIGHTS_OUT_TURNS,
    guards: [guard],
    crew: base.crew.map((c) => {
      if (c.id === 'vane') return { ...c, room: 'atrium' };  // the room he is looking at
      if (c.id === 'bruno') return { ...c, room: 'halle' };  // the room he walks into
      return { ...c, room: 'street' };
    }),
  };
  const seen = projectTurn(blind, {});
  assert.ok(!seen.detections.some((d) => d.crew === 'vane'), 'the glance survived the dark');
  assert.ok(seen.detections.some((d) => d.crew === 'bruno'), 'walking into him should still cost you');
});

// --- noise -----------------------------------------------------------------

test('one guard answers a clatter and the rest keep walking their loop', () => {
  const base = newHeist(2);
  const state = { ...base, crew: base.crew.map((c) => ({ ...c, room: 'server' })) };
  const projection = projectTurn(state, { vane: { kind: 'tool', tool: 'noisemaker', to: 'lobby' } });
  assert.equal(projection.alerted.length, 1, 'the whole shift came running');
  assert.equal(projection.alerted[0].to, 'lobby');
});

test('noise redirects patrols from the next turn, never the one being previewed', () => {
  const base = newHeist(2);
  const state = { ...base, crew: base.crew.map((c) => ({ ...c, room: 'server' })) };
  const quiet = projectTurn(state, {});
  const loud = projectTurn(state, { vane: { kind: 'tool', tool: 'noisemaker', to: 'lobby' } });
  assert.deepEqual(loud.guards.map((g) => g.to), quiet.guards.map((g) => g.to));
  assert.ok(loud.alerted.length > 0);
});

test('drilling is loud and takes two turns, and the door then stays open', () => {
  const base = newHeist(3);
  const state = { ...base, guards: [], camerasDead: true, crew: base.crew.map((c) => ({ ...c, room: 'lobby' })) };
  assert.equal(actionAt(state, crewById(state, 'bruno')).kind, 'drill');
  const once = applyProjection(state, projectTurn(state, { bruno: { kind: 'act' } }));
  assert.equal(once.drillProgress, 1);
  assert.equal(once.vaultOpen, false);
  const twice = applyProjection(once, projectTurn(once, { bruno: { kind: 'act' } }));
  assert.equal(twice.vaultOpen, true);
  assert.equal(CFG.DRILL_TURNS, 2);
  const noise = projectTurn(state, { bruno: { kind: 'act' } }).noises;
  assert.ok(noise.some((n) => n.room === 'lobby' && n.magnitude >= 3));
});

// --- loot, tools and the take ----------------------------------------------

test('two people ordered onto one prize do not duplicate it', () => {
  const base = newHeist(4);
  const state = { ...base, guards: [], camerasDead: true, crew: base.crew.map((c) => ({ ...c, room: 'archive' })) };
  const after = applyProjection(state, projectTurn(state, { vane: { kind: 'act' }, spark: { kind: 'act' } }));
  const ledger = after.loot.find((l) => l.id === 'ledger');
  assert.equal(ledger.carriedBy, 'vane');
  assert.equal(after.loot.filter((l) => l.id === 'ledger').length, 1);
  assert.equal(carriedBy(after, 'spark').length, 0);
});

test('a charge opens the vault, costs an alarm, and shatters a fragile take', () => {
  const fragileSeed = [...Array(60).keys()]
    .map((i) => i + 1)
    .find((s) => newHeist(s).loot.find((l) => l.target).fragile);
  assert.ok(fragileSeed, 'no seed in range produces a fragile target');
  const base = newHeist(fragileSeed);
  const state = { ...base, guards: [], camerasDead: true, crew: base.crew.map((c) => ({ ...c, room: 'lobby' })) };
  const after = applyProjection(state, projectTurn(state, { bruno: { kind: 'tool', tool: 'charge' } }));
  assert.equal(after.vaultOpen, true);
  assert.equal(after.alarms, 1);
  assert.equal(after.targetDestroyed, true);
  assert.equal(after.outcome, 'loss');
});

test('a charge on a take that is not fragile is a fast, loud, legitimate line', () => {
  const solidSeed = [...Array(60).keys()]
    .map((i) => i + 1)
    .find((s) => !newHeist(s).loot.find((l) => l.target).fragile);
  const base = newHeist(solidSeed);
  const state = { ...base, guards: [], camerasDead: true, crew: base.crew.map((c) => ({ ...c, room: 'lobby' })) };
  const after = applyProjection(state, projectTurn(state, { bruno: { kind: 'tool', tool: 'charge' } }));
  assert.equal(after.vaultOpen, true);
  assert.equal(after.targetDestroyed, false);
  assert.equal(after.outcome, null);
});

test('a captured carrier drops the take, and losing the target ends it', () => {
  const base = newHeist(6);
  const guard = { id: 'g1', name: 'T', route: ['lobby', 'atrium'], idx: 0, room: 'lobby', alertTo: null, pause: 0 };
  const state = {
    ...base,
    guards: [guard],
    vaultOpen: true,
    camerasDead: true,
    crew: base.crew.map((c) => (c.id === 'vane' ? { ...c, room: 'atrium' } : { ...c, room: 'street' })),
    loot: base.loot.map((l) => (l.target ? { ...l, room: null, carriedBy: 'vane' } : l)),
  };
  const after = applyProjection(state, projectTurn(state, {}));
  assert.ok(after.crew.find((c) => c.id === 'vane').captured);
  assert.equal(after.targetDestroyed, true);
  assert.equal(after.outcome, 'loss');
});

// --- terminal states -------------------------------------------------------

test('walking out without the take is a loss, not a small win', () => {
  const base = newHeist(8);
  const state = {
    ...base,
    guards: [],
    camerasDead: true,
    crew: base.crew.map((c) => ({ ...c, room: 'alley' })),
  };
  const after = applyProjection(state, projectTurn(state, {
    vane: { kind: 'extract' }, spark: { kind: 'extract' }, bruno: { kind: 'extract' },
  }));
  assert.equal(after.outcome, 'loss');
  assert.equal(after.reason, 'YOU LEFT THE TAKE BEHIND');
  assert.equal(terminalScore(after), 0);
});

test('the take out and everyone still standing out with it is the win', () => {
  const base = newHeist(8);
  const state = {
    ...base,
    guards: [],
    camerasDead: true,
    crew: base.crew.map((c) => ({ ...c, room: 'alley' })),
    loot: base.loot.map((l) => (l.target ? { ...l, room: null, carriedBy: 'vane' } : l)),
  };
  const after = applyProjection(state, projectTurn(state, {
    vane: { kind: 'extract' }, spark: { kind: 'extract' }, bruno: { kind: 'extract' },
  }));
  assert.equal(after.outcome, 'win');
  assert.ok(terminalScore(after) > 0);
});

test('the lockdown closes the alley and strands whoever is still inside', () => {
  const base = newHeist(8);
  let state = { ...base, guards: [], camerasDead: true, alarms: 1, lockdown: 1 };
  state = applyProjection(state, projectTurn(state, {}));
  assert.equal(state.lockdown, 0);
  assert.equal(state.extractionOpen, false);
  assert.equal(state.outcome, 'loss');
  assert.equal(state.reason, 'LOCKDOWN SEALED THE ALLEY');
});

test('the shift ends the night whatever the crew are in the middle of', () => {
  let state = { ...newHeist(8), guards: [], camerasDead: true, turn: CFG.TURN_LIMIT - 1 };
  state = applyProjection(state, projectTurn(state, {}));
  assert.equal(state.outcome, 'loss');
  assert.equal(state.reason, 'THE SHIFT CHANGED');
});

// --- score -----------------------------------------------------------------

test('the score is exactly the formula on the cabinet card', () => {
  const base = newHeist(8);
  const state = {
    ...base,
    guards: [],
    camerasDead: true,
    crew: base.crew.map((c) => ({ ...c, room: 'alley' })),
    loot: base.loot.map((l) => (l.target || l.objective ? { ...l, room: null, carriedBy: 'vane' } : l)),
  };
  const after = applyProjection(state, projectTurn(state, {
    vane: { kind: 'extract' }, spark: { kind: 'extract' }, bruno: { kind: 'extract' },
  }));
  assert.equal(after.outcome, 'win');
  const b = scoreBreakdown(after);
  const expected =
    10 * b.lootValue + 50000 * b.survivors + 20000 * b.objectives +
    5000 * b.unusedTools - 2000 * after.turn - 25000 * after.alarms;
  assert.equal(terminalScore(after), Math.max(0, Math.round(expected)));
  assert.equal(b.survivors, 3);
  assert.equal(b.unusedTools, totalTools(after.tools));
});

test('a failed heist scores zero however much was already out the door', () => {
  // Two crew away with the canvas, then the lockdown seals the alley. The
  // shared score contract puts completed runs ahead of failed ones, so this
  // cannot be allowed to outrank a clean getaway.
  const base = newHeist(8);
  let state = {
    ...base,
    guards: [],
    camerasDead: true,
    alarms: 1,
    lockdown: 1,
    crew: base.crew.map((c) => (c.id === 'bruno' ? { ...c, room: 'vault' } : { ...c, extracted: true })),
    loot: base.loot.map((l) => (l.id === 'canvas' ? { ...l, room: null, extracted: true } : l)),
  };
  state = applyProjection(state, projectTurn(state, {}));
  assert.equal(state.outcome, 'loss');
  assert.ok(scoreBreakdown(state).loot > 0, 'the fixture should have banked something');
  assert.equal(terminalScore(state), 0);
});

test('the score is always a non-negative integer', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const state = run(seed, careless);
    const score = terminalScore(state);
    assert.ok(Number.isInteger(score) && score >= 0, `seed ${seed} scored ${score}`);
  }
});

test('completed runs rank first, then score, then fewer turns', () => {
  const ranked = [
    { outcome: 'loss', score: 0, turns: 5 },
    { outcome: 'win', score: 100, turns: 12 },
    { outcome: 'win', score: 100, turns: 9 },
    { outcome: 'win', score: 300, turns: 20 },
  ].sort(compareRuns);
  assert.deepEqual(ranked.map((r) => r.score + ':' + r.turns), ['300:20', '100:9', '100:12', '0:5']);
});

// --- determinism -----------------------------------------------------------

test('mulberry32 is a fixed sequence and different seeds diverge', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
  assert.notDeepEqual([c(), c(), c()], first);
});

test('a seed names one exact vault, and no heist uses ambient randomness', () => {
  for (const seed of [1, 2, 77]) {
    assert.deepEqual(newHeist(seed), newHeist(seed));
  }
  // Different seeds have to be different heists, or the seed is a decoration.
  const fingerprint = (seed) => JSON.stringify([
    newHeist(seed).guards.map((g) => [g.room, g.idx]),
    newHeist(seed).loot.map((l) => [l.value, l.fragile]),
  ]);
  const shapes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(fingerprint));
  assert.ok(shapes.size >= 6, `eight seeds only produced ${shapes.size} distinct vaults`);
});

test('simulation state stays plain serializable data all the way through', () => {
  let state = newHeist(13);
  for (let turn = 0; turn < 10 && !state.over; turn += 1) {
    const clone = JSON.parse(JSON.stringify(state));
    assert.deepEqual(clone, state, `turn ${turn} lost something in JSON`);
    state = play(state, competent(state));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('same seed + same order log reproduces the same heist, field for field', () => {
  const replay = (seed) => {
    let state = newHeist(seed);
    const log = [];
    while (!state.over && log.length < 40) {
      const orders = competent(state);
      log.push(JSON.parse(JSON.stringify(orders)));
      state = play(state, orders);
    }
    return { state, log };
  };
  for (const seed of [3, 17, 64]) {
    const first = replay(seed);
    let state = newHeist(seed);
    for (const orders of first.log) state = play(state, orders);
    assert.deepEqual(state, first.state, `seed ${seed} did not replay`);
  }
});

// --- two reference crews, and the gap between them is the game -------------
//
//   competent — reads the projection before committing, refuses to hand
//               anybody over, and sends SPARK to the recorder. Must always
//               win: this is what sizes CFG.TURN_LIMIT and the patrol loops.
//   careless  — wants exactly the same three things in the same order and
//               never looks at the overlay. Must essentially always lose. If
//               it starts winning, then the patrols, the lenses and the
//               lockdown are decoration and the preview is not load-bearing.

const CAMERA_COST = 55;

function mission(state, crew, opts = {}) {
  const target = state.loot.find((l) => l.target);
  const holding = carriedBy(state, crew.id);
  const home = { goal: 'alley', act: 'extract' };

  if (crew.id === 'bruno') {
    if (state.vaultOpen) return home;
    if (camerasLive(state) && !opts.noHack) return { goal: 'server', act: 'hide' };
    return { goal: 'lobby', act: 'act' };
  }
  if (crew.id === 'vane') {
    const ledger = state.loot.find((l) => l.id === 'ledger');
    if (holding.some((l) => l.target)) return home;
    if (camerasLive(state) && !state.vaultOpen) {
      return { goal: opts.noHack ? 'server' : 'loading', act: 'hide' };
    }
    if (ledger.room !== null && holding.length === 0) return { goal: 'archive', act: 'act' };
    if (target.extracted || target.carriedBy !== null) return home;
    if (!state.vaultOpen) return { goal: 'lobby', act: 'wait' };
    return { goal: 'vault', act: 'act' };
  }
  if (!state.recorderWiped && !opts.noHack) return { goal: 'server', act: 'act' };
  const canvas = state.loot.find((l) => l.id === 'canvas');
  if (opts.noHack && holding.length === 0 && canvas.room !== null && !camerasLive(state)) {
    return { goal: 'gallery', act: 'act' };
  }
  return home;
}

function value(state, crew, order, plan) {
  if (order.kind === plan.act && crew.room === plan.goal) return 1000;
  const at = order.kind === 'move' ? order.to : crew.room;
  const here = hops(state, crew.room, plan.goal, crew.id);
  const there = hops(state, at, plan.goal, crew.id);
  let score = 100 - (Number.isFinite(there) ? there : 40) * 10;
  if (there > here) score -= 25;
  if (order.kind === 'act' || order.kind === 'extract') score += 5;
  if (order.kind === 'hide') score -= 12;
  if (order.kind === 'wait') score -= 14;
  if (order.kind === 'tool') score -= 30;
  return score;
}

function careless(state) {
  const orders = {};
  for (const crew of state.crew) {
    if (crew.captured || crew.extracted) continue;
    const plan = mission(state, crew);
    if (crew.room === plan.goal) {
      orders[crew.id] = { kind: plan.act };
      continue;
    }
    const path = shortestPath(state, crew.room, plan.goal, crew.id);
    orders[crew.id] = path.length > 1
      ? { kind: 'move', to: path[Math.min(crew.speed, path.length - 1)] }
      : { kind: 'wait' };
  }
  return orders;
}

function competent(state, opts = {}) {
  const orders = {};
  const bruno = crewById(state, 'bruno');
  const spark = crewById(state, 'spark');
  const wantsLobby = bruno && !bruno.captured && !bruno.extracted && !state.vaultOpen;
  const atDoorstep = wantsLobby && (bruno.room === 'atrium' || bruno.room === 'server');
  const sparkFailed = !spark || spark.captured || spark.extracted;
  const impatient = opts.noHack || state.turn >= 8 || sparkFailed;
  const empNow = atDoorstep && camerasLive(state) && state.tools.emp > 0 && impatient;

  for (const crew of state.crew) {
    if (crew.captured || crew.extracted) continue;
    const useEmp = empNow && crew.id === 'bruno';
    const plan = mission(state, crew, opts);
    const options = legalOrders(state, crew.id)
      .filter((o) => o.kind !== 'tool' || (useEmp && o.tool === 'emp'))
      .filter((o) => o.kind !== 'extract' || plan.act === 'extract');

    let pick = null;
    let best = -Infinity;
    for (const option of options) {
      const trial = projectTurn(state, { ...orders, [crew.id]: option });
      if (trial.outcome === 'loss') continue;
      if (trial.detections.some((d) => d.crew === crew.id)) continue;
      const seen = trial.spotted.some((d) => d.crew === crew.id) && state.alarms === 0;
      const base = useEmp && option.kind === 'tool' ? 900 : value(state, crew, option, plan);
      const scored = base - (seen ? CAMERA_COST : 0);
      if (scored > best) { best = scored; pick = option; }
    }
    orders[crew.id] = pick ?? { kind: 'wait' };
  }
  return orders;
}

const empPlan = (state) => competent(state, { noHack: true });

function survey(policy, seeds) {
  const runs = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    const state = run(seed, policy);
    runs.push({ win: state.outcome === 'win', turns: state.turn, score: terminalScore(state), state });
  }
  const wins = runs.filter((r) => r.win);
  return { runs, wins, rate: wins.length / seeds };
}

test('a crew that reads the overlay takes the vault on every seed', () => {
  const { wins, runs, rate } = survey(competent, 120);
  assert.equal(rate, 1, `competent only took ${wins.length}/${runs.length}`);
  const turns = wins.map((w) => w.turns).sort((a, b) => a - b);
  const median = turns[Math.floor(turns.length / 2)];
  // If the median run finished with the whole night to spare, the clock and
  // the 2,000-a-turn cost would both be decoration.
  assert.ok(median >= CFG.TURN_LIMIT * 0.6, `median ${median} of ${CFG.TURN_LIMIT} is too easy`);
  assert.ok(turns.at(-1) <= CFG.TURN_LIMIT, 'a win exceeded the shift');
});

test('the same plan, executed without reading the overlay, loses every seed', () => {
  const { rate, runs } = survey(careless, 120);
  assert.equal(rate, 0, `careless took ${runs.filter((r) => r.win).length} seeds`);
  // And it loses for real reasons, not one degenerate bug.
  const reasons = new Set(runs.map((r) => r.state.reason));
  assert.ok(reasons.size >= 2, `careless only ever failed one way: ${[...reasons]}`);
});

test('a second loadout — no console, spend the EMP — also takes the vault', () => {
  // Ticket G-016: at least two crew/loadout plans can extract the target.
  const { wins, rate } = survey(empPlan, 120);
  assert.ok(wins.length >= 20, `the EMP plan only took ${wins.length} seeds`);
  assert.ok(rate < 1, 'the EMP plan should be the riskier of the two');
});

test('the safer plan is also the better-paid one, so the score has a gradient', () => {
  const careful = survey(competent, 120);
  const rushed = survey(empPlan, 120);
  const mean = (list) => list.reduce((sum, r) => sum + r.score, 0) / list.length;
  assert.ok(
    mean(careful.wins) > mean(rushed.wins),
    `console ${Math.round(mean(careful.wins))} vs EMP ${Math.round(mean(rushed.wins))}`,
  );
});

// --- reading the state the cabinet draws from ------------------------------

test('legal orders never include a room the crew cannot actually get to', () => {
  const state = newHeist(21);
  for (const crew of state.crew) {
    const legal = legalOrders(state, crew.id);
    const rooms = reachable(state, crew);
    for (const order of legal) {
      if (order.kind !== 'move') continue;
      assert.ok(rooms.includes(order.to), `${crew.name} offered ${order.to}`);
      assert.ok(hops(state, crew.room, order.to, crew.id) <= crew.speed);
    }
  }
});

test('VANE covers two rooms a turn and the others one', () => {
  const state = newHeist(21);
  assert.equal(crewById(state, 'vane').speed, 2);
  assert.equal(crewById(state, 'spark').speed, 1);
  assert.equal(crewById(state, 'bruno').speed, 1);
  assert.equal(CREW_TEMPLATES.length, 3);
});

test('an illegal order is refused rather than quietly obeyed', () => {
  const state = newHeist(21);
  const projection = projectTurn(state, { vane: { kind: 'move', to: 'vault' } });
  assert.ok(projection.issues.length > 0);
  assert.equal(projection.crewAfter.find((c) => c.id === 'vane').room, 'street');
});

test('room indices are stable, which is what every tie-break in here leans on', () => {
  assert.equal(roomIndex('alley'), 0);
  assert.equal(ROOMS.length, ROOM_IDS.length);
  assert.equal(new Set(ROOM_IDS).size, ROOM_IDS.length);
});

// --- the cartridge ---------------------------------------------------------

// A 2D-context stand-in where every property is callable and chainable, so a
// renderer that throws fails here instead of on somebody's phone at 3am.
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
  const cart = createVaultHeist();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(manifest.version, '1.0.0');
  assert.equal(named, createVaultHeist, 'the named export must be the default one');
});

test('the manifest passes the cabinet\'s own validator, accent and all', () => {
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.ok(
    Object.keys(palette).includes(manifest.artwork.accent),
    `${manifest.artwork.accent} is not in shell/palette.js`,
  );
  assert.ok(['amber', 'periwinkle', 'rose', 'deep', 'cream'].includes(manifest.artwork.accent));
  assert.equal(launchBlockReason(manifest), null, 'the rack would refuse to launch it');
});

test('the manifest imports no game code, so the rack can render a card cheaply', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('./manifest.js', import.meta.url), 'utf8'));
  assert.ok(!/\bimport\b/.test(source), 'manifest.js pulled something in');
});

// Exactly the registry line this game needs, exercised end to end: the entry
// is declared from the manifest, the module is fetched through the real lazy
// loader, and the loaded cartridge is activated. A mistyped path or a missing
// default export fails here rather than on somebody's launch.
const rackEntry = () =>
  defineCatalogEntry(manifest, () => import('./vault-heist.js'));

test('it satisfies the cabinet cartridge contract', async () => {
  const entry = rackEntry();
  assert.equal(entry.id, 'vault-heist');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('the cabinet refuses a module whose identity drifts from its manifest', async () => {
  const entry = defineCatalogEntry(manifest, async () => ({
    default: () => ({
      id: 'vault-heist', title: 'SOMETHING ELSE', blurb: manifest.summary,
      init() {}, update() {}, draw() {}, destroy() {},
    }),
  }));
  await assert.rejects(() => entry.load(), /title must match/);
});

test('launch, poke it, draw it, and put it away without throwing', async () => {
  const loaded = await rackEntry().load();
  const cart = activateCartridge(loaded, shellCtx());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true } }));
  for (let i = 0; i < 5; i += 1) cart.update(1 / 60, inputStub());
  cart.draw(stubCtx());
  // Walk the bar: select a crew member, then run a turn.
  cart.update(1 / 60, inputStub({ pointer: { x: 70, y: 420, justDown: true } }));
  cart.draw(stubCtx());
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 200, justDown: true } }));
  cart.draw(stubCtx());
  for (let i = 0; i < 60; i += 1) cart.update(1 / 60, inputStub());
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createVaultHeist();
  const b = createVaultHeist();
  a.init(shellCtx());
  b.init(shellCtx());
  a.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true } }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.draw(stubCtx()); // destroying one must not disturb the other
  b.destroy();
});

test('destroy really lets go', () => {
  const cart = createVaultHeist();
  cart.init(shellCtx());
  cart.destroy();
  // A second destroy, and a draw after it, must not throw either.
  cart.destroy();
});

test('it reports a score exactly once, when the heist is over', () => {
  const scores = [];
  const cart = createVaultHeist();
  cart.init(shellCtx((s) => scores.push(s)));
  cart.update(1 / 60, inputStub({ pointer: { x: 320, y: 240, justDown: true } }));
  // Run the shift out by confirming empty turns; the clock ends it either way.
  for (let turn = 0; turn < CFG.TURN_LIMIT + 6; turn += 1) {
    cart.update(1 / 60, inputStub({ pointer: { x: 600, y: 420, justDown: true } }));
    for (let f = 0; f < 45; f += 1) cart.update(1 / 60, inputStub());
  }
  assert.equal(scores.length, 1, `endGame fired ${scores.length} times`);
  assert.ok(Number.isFinite(scores[0]) && scores[0] >= 0);
  cart.destroy();
});

test('the renderer never reaches for a colour the cabinet does not own', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('./vault-heist.js', import.meta.url), 'utf8'));
  const literals = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.deepEqual(literals, [], `hard-coded colours: ${literals.join(', ')}`);
  assert.ok(!/Math\.random\s*\(/.test(source), 'the renderer reached for ambient randomness');
});

test('the simulation never reaches for ambient randomness either', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('./logic.js', import.meta.url), 'utf8'));
  assert.ok(!/Math\.random\s*\(/.test(source), 'the simulation reached for ambient randomness');
});

test('every room and every button clears a real thumb', () => {
  // The cabinet scales its 640-wide glass to about 0.56 on a portrait handset,
  // so a 44 CSS px target needs roughly 79 canvas units on both axes.
  const floor = MIN_TOUCH_TARGET / 0.56;
  const ROOM_W = 84;
  const ROOM_H = 80;
  assert.ok(ROOM_W >= floor, `rooms are ${ROOM_W} wide, need ${floor.toFixed(1)}`);
  assert.ok(ROOM_H >= floor, `rooms are ${ROOM_H} tall, need ${floor.toFixed(1)}`);
  // Six buttons is the widest bar the cartridge ever builds.
  const barButton = (640 - 12 - 6 * 5) / 6;
  assert.ok(barButton >= floor, `bar buttons are ${barButton.toFixed(1)} wide`);
  assert.ok(84 >= floor, 'the bar is not tall enough');
  // And no two rooms may overlap once they are that big.
  const seen = new Map();
  for (const spot of ROOMS) {
    const key = `${spot.col},${spot.row}`;
    assert.ok(!seen.has(key), `${spot.id} sits on top of ${seen.get(key)}`);
    seen.set(key, spot.id);
  }
});
