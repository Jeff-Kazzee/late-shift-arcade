import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CELLS,
  CFG,
  REACTIONS,
  TYPES,
  applyCommand,
  begin,
  buildNight,
  canPlace,
  cellAt,
  compareRuns,
  computePack,
  enrage,
  footprint,
  mulberry32,
  newNight,
  pick,
  place,
  positiveReactions,
  rotate,
  runSummary,
  scoreParts,
  step,
  terminalScore,
  toss,
} from './logic.js';
import createDefault, { createBackpackAlchemist } from './backpack-alchemist.js';
import { manifest } from './manifest.js';
import { palette } from '../../shell/palette.js';
import {
  activateCartridge,
  defineCatalogEntry,
  launchBlockReason,
  validateManifest,
} from '../../shell/cartridge.js';

const typeId = (name) => TYPES.find((t) => t.name === name).id;

// A night with the pre-rolled drafts bypassed, so a test can pack exactly the
// grid it wants to talk about.
function packed(placements, seed = 1) {
  const state = newNight(seed);
  begin(state);
  for (const [name, cell, rot = 0] of placements) {
    state.status = 'place';
    state.holding = typeId(name);
    state.rot = rot;
    state.draftsDone = 0; // keep the phase machinery from starting a fight
    assert.equal(place(state, cell), true, `${name} fits at ${cell}`);
  }
  return state;
}

function runFor(state, seconds) {
  const events = [];
  const ticks = Math.round(seconds / CFG.TICK);
  for (let i = 0; i < ticks; i += 1) {
    events.push(...step(state, CFG.TICK));
  }
  return events;
}

// --- the pre-rolled night ----------------------------------------------------

test('a seed names one exact night, and nothing uses ambient randomness', () => {
  assert.deepEqual(buildNight(4242), buildNight(4242));
  assert.notDeepEqual(buildNight(4242), buildNight(4243));
});

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  assert.deepEqual(Array.from({ length: 4 }, mulberry32(8)), Array.from({ length: 4 }, mulberry32(8)));
  assert.ok(Array.from({ length: 500 }, mulberry32(1)).every((v) => v >= 0 && v < 1));
});

test('every night pre-rolls 12 drafts of three distinct real ingredients', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const { drafts, enemies } = buildNight(seed);
    assert.equal(drafts.length, CFG.ROUNDS * CFG.DRAFTS_PER_ROUND);
    for (const options of drafts) {
      assert.equal(options.length, 3);
      assert.equal(new Set(options).size, 3, 'no duplicate offers in one draft');
      for (const type of options) assert.ok(TYPES[type], 'a real catalog entry');
    }
    assert.ok(
      drafts[0].some((type) => TYPES[type].atk > 0),
      'the opening draft always offers a way to fight',
    );
    assert.equal(enemies.length, CFG.ROUNDS);
    assert.equal(enemies[CFG.ROUNDS - 1].boss, true, 'the Warden closes the night');
    for (let i = 1; i < enemies.length; i += 1) {
      assert.ok(enemies[i].maxHp > enemies[i - 1].maxHp, 'creatures escalate');
    }
  }
});

// --- packing rules -------------------------------------------------------------

test('footprints respect the pack walls and never wrap an edge', () => {
  const kelp = typeId('GLACIER KELP'); // 2x1
  assert.deepEqual(footprint(kelp, cellAt(0, 0), 0), [0, 1]);
  assert.deepEqual(footprint(kelp, cellAt(0, 0), 1), [0, 4]);
  assert.equal(footprint(kelp, cellAt(3, 0), 0), null, 'would wrap the right edge');
  assert.equal(footprint(kelp, cellAt(0, 3), 1), null, 'would poke out the bottom');
  assert.equal(footprint(kelp, -1, 0), null);
  assert.equal(footprint(kelp, CELLS, 0), null);
});

test('placement refuses occupied cells and rotation is a real command', () => {
  const state = newNight(2);
  begin(state);
  state.holding = typeId('EMBER MOSS');
  state.status = 'place';
  assert.equal(place(state, 5), true);
  state.holding = typeId('GLACIER KELP');
  state.status = 'place';
  assert.equal(canPlace(state, state.holding, 4, 0), false, '4+5 collides with the moss');
  assert.equal(rotate(state), true);
  assert.equal(state.rot, 1);
  assert.equal(canPlace(state, state.holding, 4, state.rot), true, '4+8 is free standing up');
  assert.equal(place(state, 4), true);
  assert.equal(state.items.length, 2);
});

test('rotating a 1x1 is refused — it is not an action', () => {
  const state = newNight(2);
  begin(state);
  state.holding = typeId('FROST CAP');
  state.status = 'place';
  assert.equal(rotate(state), false);
});

test('tossing brews the ingredient into +2 HP instead of an item', () => {
  const state = newNight(3);
  begin(state);
  state.hp = 20;
  pick(state, 0);
  assert.equal(state.status, 'place');
  assert.equal(toss(state), true);
  assert.equal(state.hp, 22);
  assert.equal(state.items.length, 0);
  assert.equal(state.tosses, 1);
  assert.equal(state.status, 'draft', 'the second draft of the round follows');
});

test('two drafts a round, then the fight starts on its own', () => {
  const state = newNight(4);
  begin(state);
  assert.equal(state.status, 'draft');
  pick(state, 0);
  toss(state);
  assert.equal(state.status, 'draft');
  pick(state, 0);
  toss(state);
  assert.equal(state.status, 'combat');
  assert.equal(state.enemy.name, 'GUTTER WISP');
});

test('commands are refused outside their phase', () => {
  const state = newNight(5);
  assert.equal(pick(state, 0), false, 'no drafting during the briefing');
  begin(state);
  assert.equal(place(state, 0), false, 'nothing in hand yet');
  assert.equal(toss(state), false);
  assert.equal(rotate(state), false);
  assert.equal(pick(state, 7), false, 'only three options exist');
  assert.equal(applyCommand(state, { k: 'nonsense' }), false);
});

// --- the circuit ---------------------------------------------------------------

test('adjacent fire and bolt strike a plasma arc worth +3 attack', () => {
  const apart = packed([['EMBER MOSS', 0], ['STORM SPORE', 10]]);
  const touching = packed([['EMBER MOSS', 0], ['STORM SPORE', 1]]);
  assert.equal(computePack(apart).atk, 4);
  assert.equal(computePack(apart).reactions.length, 0);
  assert.equal(computePack(touching).atk, 7);
  assert.equal(computePack(touching).reactions[0].kind, 'PLASMA ARC');
});

test('a touching item pair reacts once, however many cell edges they share', () => {
  // two 2-long items lying side by side share two edges but one seam
  const state = packed([['CINDER ROOT', 0], ['ARC FERN', 4]]);
  const pack = computePack(state);
  assert.equal(pack.reactions.length, 1);
  assert.equal(pack.atk, 4 + 3 + 3);
});

test('frost walls, tinctures, unstable mixes, and meltdowns all read from the grid', () => {
  const wall = packed([['FROST CAP', 0], ['FROST CAP', 1]]);
  assert.equal(computePack(wall).armor, 2 + 2 + REACTIONS['frost+frost'].armor);

  const tincture = packed([['MOON SAGE', 0], ['FROST CAP', 4]]);
  assert.equal(computePack(tincture).heal, 2 + REACTIONS['frost+herb'].heal);

  const unstable = packed([['EMBER MOSS', 0], ['VITRIOL GLAND', 1]]);
  assert.equal(computePack(unstable).atk, 2 + 6 + REACTIONS['fire+volatile'].atk);
  assert.equal(computePack(unstable).self, 1);

  const meltdown = packed([['VITRIOL GLAND', 0], ['VITRIOL GLAND', 1]]);
  assert.equal(computePack(meltdown).self, REACTIONS['volatile+volatile'].self);
});

test('scorched herbs lose healing but the total never goes negative', () => {
  const scorched = packed([['MOON SAGE', 0], ['EMBER MOSS', 1]]);
  assert.equal(computePack(scorched).heal, 1);
  const doubly = packed([['MOON SAGE', 0], ['EMBER MOSS', 1], ['EMBER MOSS', 4]]);
  assert.equal(computePack(doubly).heal, 0, 'floored at zero');
});

test('the score counts only the reactions that fight for you', () => {
  const state = packed([
    ['EMBER MOSS', 0],
    ['STORM SPORE', 1], // plasma arc: positive
    ['VITRIOL GLAND', 4], // unstable with the moss: positive (it attacks)
    ['VITRIOL GLAND', 8], // meltdown with the other gland: not an achievement
  ]);
  const kinds = computePack(state).reactions.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['MELTDOWN', 'PLASMA ARC', 'UNSTABLE MIX']);
  assert.equal(positiveReactions(state), 2);
});

// --- the combat pulse ------------------------------------------------------------

function intoCombat(state) {
  // walk the real phase machinery: toss both drafts of the current round
  pick(state, 0);
  toss(state);
  pick(state, 0);
  toss(state);
}

test('the pack fires first: a creature killed on the pulse never swings back', () => {
  const state = packed([['CINDER ROOT', 0], ['ARC FERN', 4], ['VITRIOL GLAND', 12]]);
  state.status = 'draft';
  state.draft = state.drafts[0];
  intoCombat(state);
  state.enemy.hp = 5; // one pulse from death
  const hpBefore = state.hp;
  const events = runFor(state, CFG.GRACE + CFG.PULSE + 0.05);
  assert.ok(events.includes('enemy-down'));
  assert.equal(state.hp, hpBefore, 'no counter-swing from a dead wisp');
  assert.equal(state.status, 'draft');
  assert.equal(state.round, 1);
  assert.equal(state.fightsWon, 1);
});

test('armor blunts the swing but enrage grows until no wall holds', () => {
  const state = packed([['GLACIER KELP', 0], ['GLACIER KELP', 8]]);
  state.status = 'draft';
  state.draft = state.drafts[0];
  intoCombat(state);
  // 6 armor + no attack: the wisp (atk 2) cannot get through until enrage
  assert.ok(computePack(state).armor >= 6);
  assert.equal(computePack(state).atk, 0);
  // armor 6 vs atk 2: nothing lands until enrage has added five — then it does
  runFor(state, CFG.GRACE + CFG.PULSE * (CFG.ENRAGE_EVERY * 6 + 2));
  assert.ok(enrage(state) >= 5, 'the creature is enraged by now');
  assert.ok(state.hp < state.maxHp, 'and the hits are landing');
});

test('volatile chemistry burns the carrier straight through armor', () => {
  const state = packed([
    ['VITRIOL GLAND', 0],
    ['VITRIOL GLAND', 1], // meltdown: 4 self per pulse
    ['GLACIER KELP', 8],
    ['GLACIER KELP', 12],
  ]);
  state.status = 'draft';
  state.draft = state.drafts[0];
  intoCombat(state);
  state.enemy.hp = 500; // pin the creature up so the burn is what we measure
  state.enemy.maxHp = 500;
  const events = runFor(state, CFG.GRACE + CFG.PULSE * 2 + 0.05);
  assert.ok(events.includes('volatile'));
  assert.ok(state.hp <= state.maxHp - 8, 'two pulses of meltdown hurt');
});

test('healing caps at max HP and a dead alchemist is not healed back', () => {
  const healer = packed([['MOON SAGE', 0], ['FROST CAP', 4], ['CINDER ROOT', 10]]);
  healer.status = 'draft';
  healer.draft = healer.drafts[0];
  intoCombat(healer);
  runFor(healer, CFG.GRACE + CFG.PULSE + 0.05);
  assert.ok(healer.hp <= healer.maxHp);

  const doomed = packed([['VITRIOL GLAND', 0], ['VITRIOL GLAND', 1], ['MOON SAGE', 12]]);
  doomed.status = 'draft';
  doomed.draft = doomed.drafts[0];
  intoCombat(doomed);
  doomed.enemy.hp = 500; // the meltdown, not the wisp, is on trial here
  doomed.enemy.maxHp = 500;
  doomed.hp = 3;
  runFor(doomed, CFG.GRACE + CFG.PULSE * 3);
  assert.equal(doomed.status, 'lost');
  assert.equal(doomed.hp, 0);
});

// --- headless winnable and losable proofs -----------------------------------

// The scripted brewer the proof plays with: pick the option whose best legal
// placement adds the most power, then place it there. Power weighs attack
// double and self-burn triple — a cautious packer, not an adversarial bot.
function bestPlacement(state, type) {
  let best = null;
  const before = computePack(state);
  for (let cell = 0; cell < CELLS; cell += 1) {
    for (const rot of [0, 1]) {
      if (!canPlace(state, type, cell, rot)) continue;
      const ghost = {
        ...state,
        items: [...state.items, { id: 9999, type, cells: footprint(type, cell, rot) }],
      };
      const after = computePack(ghost);
      const gain =
        (after.atk - before.atk) * 2 +
        (after.armor - before.armor) +
        (after.heal - before.heal) -
        (after.self - before.self) * 3;
      if (!best || gain > best.gain) best = { cell, rot, gain };
    }
  }
  return best;
}

function brewerNight(seed) {
  const state = newNight(seed);
  begin(state);
  let guard = 0;
  while (state.status !== 'won' && state.status !== 'lost' && guard < 4000) {
    guard += 1;
    if (state.status === 'draft') {
      let choice = { option: 0, gain: -Infinity };
      state.draft.forEach((type, option) => {
        const placement = bestPlacement(state, type);
        if (placement && placement.gain > choice.gain) choice = { option, gain: placement.gain };
      });
      pick(state, choice.option);
    } else if (state.status === 'place') {
      const placement = bestPlacement(state, state.holding);
      if (!placement || placement.gain <= -3) toss(state);
      else {
        state.rot = placement.rot;
        place(state, placement.cell);
      }
    } else {
      step(state, CFG.TICK * 10);
    }
  }
  return state;
}

test('HEADLESS WINNABLE PROOF: a cautious packer beats the Warden on most nights', () => {
  let wins = 0;
  const seeds = 30;
  for (let seed = 1; seed <= seeds; seed += 1) {
    if (brewerNight(seed).status === 'won') wins += 1;
  }
  assert.ok(wins >= Math.ceil(seeds * 0.6), `the brewer won only ${wins}/${seeds} nights`);
});

test('HEADLESS WINNABLE PROOF: night 7 in particular is a recorded, replayable win', () => {
  const state = brewerNight(7);
  assert.equal(state.status, 'won', `night 7 ended ${state.status} (${state.failure})`);
  assert.equal(state.fightsWon, CFG.ROUNDS);
  assert.ok(terminalScore(state) >= CFG.ROUNDS * CFG.SCORE_FIGHT + CFG.SCORE_BOSS);
  assert.deepStrictEqual(brewerNight(7), state, 'and it replays identically');
});

test('HEADLESS LOSABLE PROOF: brewing every draft into tonics is a short night', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const state = newNight(seed);
    begin(state);
    let guard = 0;
    while (state.status !== 'lost' && guard < 4000) {
      guard += 1;
      if (state.status === 'draft') pick(state, 0);
      else if (state.status === 'place') toss(state);
      else step(state, CFG.TICK * 10);
    }
    assert.equal(state.status, 'lost', `seed ${seed}: an empty pack cannot win`);
    assert.equal(state.failure, 'slain');
    assert.equal(state.fightsWon, 0, 'the first wisp is already unbeatable barehanded');
  }
});

// --- the documented score formula -------------------------------------------

test('the score formula pays fights, live circuitry, and surviving HP', () => {
  const state = packed([['EMBER MOSS', 0], ['STORM SPORE', 1]]);
  state.fightsWon = 3;
  state.hp = 17;
  const p = scoreParts(state);
  assert.deepEqual(p, { fights: 3, reactions: 1, hp: 17, boss: 0 });
  assert.equal(
    terminalScore(state),
    3 * CFG.SCORE_FIGHT + 1 * CFG.SCORE_REACTION + 17 * CFG.SCORE_HP,
  );
  state.status = 'won';
  assert.equal(terminalScore(state) - CFG.SCORE_BOSS,
    3 * CFG.SCORE_FIGHT + 1 * CFG.SCORE_REACTION + 17 * CFG.SCORE_HP);
});

test('finished nights rank ahead of fatal ones, then score, then HP', () => {
  const won = { status: 'won', score: 5000, hp: 4 };
  const lost = { status: 'lost', score: 6000, hp: 0 };
  assert.ok(compareRuns(won, lost) < 0, 'a win outranks a higher-scoring death');
  assert.ok(compareRuns({ ...won, score: 5200 }, won) < 0);
  assert.ok(compareRuns({ ...won, hp: 9 }, won) < 0);
});

// --- determinism and serializability ------------------------------------------

function scriptedNight(seed) {
  const state = newNight(seed);
  begin(state);
  const script = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]; // draft picks in order
  let at = 0;
  let cell = 0;
  let guard = 0;
  while (state.status !== 'won' && state.status !== 'lost' && guard < 40000) {
    guard += 1;
    if (state.status === 'draft') pick(state, script[at++ % script.length]);
    else if (state.status === 'place') {
      while (cell < CELLS && !canPlace(state, state.holding, cell, 0)) cell += 1;
      if (cell < CELLS) place(state, cell);
      else toss(state);
    } else step(state, CFG.TICK);
  }
  return state;
}

test('same seed + same command script ⇒ identical final state', () => {
  const a = scriptedNight(99);
  const b = scriptedNight(99);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'and it round-trips through JSON');
  assert.deepEqual(runSummary(a), runSummary(b));
  assert.notDeepStrictEqual(a, scriptedNight(100), 'a different seed is a different night');
});

test('simulation state stays plain serializable data throughout a night', () => {
  const state = scriptedNight(7);
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

const tap = (x, y) => inputStub({ pointer: { x, y, down: true, justDown: true, justUp: false, moved: true } });

test('the cartridge names itself exactly as the manifest advertises it', () => {
  const cart = createBackpackAlchemist();
  assert.equal(cart.id, manifest.slug);
  assert.equal(cart.title, manifest.title);
  assert.equal(cart.blurb, manifest.summary);
  assert.equal(manifest.version, '1.0.0');
  assert.equal(createDefault, createBackpackAlchemist, 'the named export must be the default one');
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
  const entry = defineCatalogEntry(manifest, () => import('./backpack-alchemist.js'));
  assert.equal(entry.id, 'backpack-alchemist');
  const loaded = await entry.load();
  const cart = activateCartridge(loaded, shellCtx());
  for (const method of ['init', 'update', 'draw', 'destroy']) {
    assert.equal(typeof cart[method], 'function');
  }
  cart.destroy();
});

test('launch, brief, draft, pack, watch a fight, and put it away without throwing', () => {
  const cart = createBackpackAlchemist();
  cart.init(shellCtx());
  cart.draw(stubCtx());
  for (let i = 0; i < 30; i += 1) cart.update(1 / 60, inputStub());
  cart.update(1 / 60, tap(320, 240)); // open the pack
  cart.draw(stubCtx());
  cart.update(1 / 60, tap(456, 120)); // take the first draft option
  cart.draw(stubCtx());
  cart.update(1 / 60, tap(45, 108)); // pack it top-left
  cart.update(1 / 60, tap(456, 120)); // second draft
  cart.update(1 / 60, tap(203, 355)); // brew this one into a tonic
  cart.draw(stubCtx());
  for (let i = 0; i < 240; i += 1) cart.update(1 / 60, inputStub()); // the wisp arrives
  cart.draw(stubCtx());
  cart.destroy();
});

test('two launches never share state', () => {
  const a = createBackpackAlchemist();
  const b = createBackpackAlchemist();
  a.init(shellCtx());
  b.init(shellCtx());
  for (let i = 0; i < 30; i += 1) a.update(1 / 60, inputStub());
  a.update(1 / 60, inputStub({ pressed: (...n) => n.includes('action') }));
  a.draw(stubCtx());
  b.draw(stubCtx());
  a.destroy();
  b.destroy();
});
