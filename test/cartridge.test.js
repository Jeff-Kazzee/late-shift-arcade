import test from 'node:test';
import assert from 'node:assert/strict';
import { activateCartridge, defineCartridge, validateCatalog } from '../shell/cartridge.js';

const DETAILS = {
  genre: 'TEST', controls: ['MOVE'], players: '1', accent: 'amber', tags: [],
};

function makeCartridge(overrides = {}) {
  return {
    id: 'test-cart',
    title: 'Test Cart',
    blurb: 'A cartridge for contract tests.',
    init() {},
    update() {},
    draw() {},
    destroy() {},
    ...overrides,
  };
}

test('defineCartridge publishes immutable metadata and creates fresh valid instances', () => {
  const entry = defineCartridge(
    () => makeCartridge(),
    { genre: 'shooter', controls: ['arrows', 'tap'], players: '1', accent: 'amber', tags: ['arcade'] },
  );

  assert.deepEqual(entry.details, {
    genre: 'shooter',
    controls: ['arrows', 'tap'],
    players: '1',
    accent: 'amber',
    tags: ['arcade'],
  });
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.details));
  assert.ok(Object.isFrozen(entry.details.controls));
  assert.notEqual(entry.create(), entry.create());
  assert.throws(() => {
    entry.details.tags.push('changed');
  }, TypeError);
});

test('defineCartridge rejects an invalid probe or a later invalid instance', () => {
  assert.throws(() => defineCartridge(() => makeCartridge({ title: '' }), DETAILS), /title must be a non-empty string/);
  assert.throws(() => defineCartridge(() => makeCartridge({ draw: null }), DETAILS), /draw must be a function/);

  let calls = 0;
  const entry = defineCartridge(() => {
    calls += 1;
    return calls === 1 ? makeCartridge() : makeCartridge({ destroy: undefined });
  }, DETAILS);
  assert.throws(() => entry.create(), /destroy must be a function/);
});

test('activateCartridge initialises a fresh instance and returns it', () => {
  const context = { highScore: 42 };
  let received = null;
  const entry = defineCartridge(() => makeCartridge({ init: (ctx) => { received = ctx; } }), DETAILS);

  const cartridge = activateCartridge(entry, context);

  assert.equal(received, context);
  assert.equal(cartridge.id, 'test-cart');
});

test('activateCartridge destroys a partially initialised cartridge and rethrows its init error', () => {
  const boom = new Error('init failed');
  let destroyed = 0;
  const entry = defineCartridge(() => makeCartridge({
    init() { throw boom; },
    destroy() { destroyed += 1; throw new Error('cleanup failed'); },
  }), DETAILS);

  assert.throws(() => activateCartridge(entry, {}), (error) => error === boom);
  assert.equal(destroyed, 1);
});

test('validateCatalog accepts unique entries and rejects duplicate IDs', () => {
  const first = defineCartridge(() => makeCartridge(), DETAILS);
  const second = defineCartridge(() => makeCartridge({ id: 'second-cart' }), DETAILS);

  assert.deepEqual(validateCatalog([first, second]), [first, second]);
  assert.throws(() => validateCatalog([first, first]), /Duplicate cartridge id: test-cart/);
});

test('defineCartridge rejects missing or malformed selector metadata', () => {
  assert.throws(() => defineCartridge(() => makeCartridge()), /genre must be a non-empty string/);
  assert.throws(
    () => defineCartridge(() => makeCartridge(), { ...DETAILS, controls: [] }),
    /controls must be a non-empty array/,
  );
  assert.throws(
    () => defineCartridge(() => makeCartridge(), { ...DETAILS, tags: [''] }),
    /tags\[0\] must be a non-empty string/,
  );
});
