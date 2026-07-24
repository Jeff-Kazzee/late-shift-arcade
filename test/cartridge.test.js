import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateCartridge,
  defineCartridge,
  validateCatalog,
  validateManifest,
} from '../shell/cartridge.js';

const DETAILS = {
  schemaVersion: 1,
  version: '1.0.0',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Complete the cartridge contract.',
  scoreLabel: 'POINTS',
  controls: ['MOVE'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://example.com/test-cart',
  genre: 'TEST',
  players: '1',
  tags: [],
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

test('defineCartridge publishes an immutable versioned manifest and creates fresh instances', () => {
  const entry = defineCartridge(() => makeCartridge(), DETAILS);

  assert.deepEqual(entry.manifest, {
    ...DETAILS,
    slug: 'test-cart',
    title: 'Test Cart',
    summary: 'A cartridge for contract tests.',
  });
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.manifest));
  assert.ok(Object.isFrozen(entry.manifest.controls));
  assert.ok(Object.isFrozen(entry.manifest.artwork));
  assert.notEqual(entry.create(), entry.create());
  assert.throws(() => {
    entry.manifest.modes.push('changed');
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

test('validateCatalog accepts unique entries and rejects malformed or duplicate versions', () => {
  const first = defineCartridge(() => makeCartridge(), DETAILS);
  const second = defineCartridge(() => makeCartridge({ id: 'second-cart' }), DETAILS);

  assert.deepEqual(validateCatalog([first, second]), [first, second]);
  assert.throws(() => validateCatalog([first, first]), /Duplicate cartridge version: test-cart@1\.0\.0/);
  assert.throws(
    () => validateCatalog([{ id: 'fake', manifest: first.manifest, create() {} }]),
    /entry was not validated/,
  );
});

test('manifest validation rejects missing or malformed required metadata', () => {
  const valid = defineCartridge(() => makeCartridge(), DETAILS).manifest;

  assert.throws(
    () => defineCartridge(() => makeCartridge()),
    /manifest\.schemaVersion must be a data property/,
  );
  assert.throws(() => validateManifest({ ...valid, goal: '' }), /goal must be a non-empty string/);
  assert.throws(
    () => validateManifest({ ...valid, controls: [] }),
    /controls must be a non-empty array/,
  );
  assert.throws(
    () => validateManifest({ ...valid, source: 'javascript:alert(1)' }),
    /source must be an absolute HTTP\(S\) URL/,
  );
  assert.throws(
    () => validateManifest({ ...valid, runtime: 'community-iframe' }),
    /runtime and trustLevel are incompatible/,
  );
  assert.throws(
    () => validateManifest({ ...valid, debug: () => {} }),
    /manifest has unsupported field: debug/,
  );
  assert.throws(
    () => validateManifest({ ...valid, artwork: { accent: 'amber', image: () => {} } }),
    /artwork has unsupported field: image/,
  );

  const accessorArtwork = {};
  Object.defineProperty(accessorArtwork, 'accent', { enumerable: true, get: () => 'amber' });
  assert.throws(
    () => validateManifest({ ...valid, artwork: accessorArtwork }),
    /artwork\.accent must be a data property/,
  );

  const accessorControls = [];
  Object.defineProperty(accessorControls, 0, { enumerable: true, get: () => 'MOVE' });
  accessorControls.length = 1;
  assert.throws(
    () => validateManifest({ ...valid, controls: accessorControls }),
    /controls\[0\] must be a data property/,
  );

  Object.defineProperty(Object.prototype, 'madeWith', {
    configurable: true,
    value: valid.madeWith,
  });
  try {
    const inheritedMadeWith = { ...valid };
    delete inheritedMadeWith.madeWith;
    assert.throws(
      () => validateManifest(inheritedMadeWith),
      /manifest\.madeWith must be a data property/,
    );
  } finally {
    delete Object.prototype.madeWith;
  }
});

test('activateCartridge rejects invalid, suspended, and unsupported runtime entries before creation', () => {
  let invalidCreates = 0;
  const invalid = {
    manifest: { releaseStatus: 'published' },
    create() {
      invalidCreates += 1;
      return makeCartridge();
    },
  };
  assert.throws(() => activateCartridge(invalid, {}), /entry was not validated/);
  assert.equal(invalidCreates, 0);

  let suspendedCreates = 0;
  const suspended = defineCartridge(() => {
    suspendedCreates += 1;
    return makeCartridge();
  }, { ...DETAILS, releaseStatus: 'suspended' });
  assert.equal(suspendedCreates, 1);
  assert.throws(() => activateCartridge(suspended, {}), /launch blocked: suspended/);
  assert.equal(suspendedCreates, 1);

  let isolatedCreates = 0;
  const isolated = defineCartridge(() => {
    isolatedCreates += 1;
    return makeCartridge();
  }, { ...DETAILS, runtime: 'first-party-3d' });
  assert.equal(isolatedCreates, 1);
  assert.throws(() => activateCartridge(isolated, {}), /runtime unavailable: first-party-3d/);
  assert.equal(isolatedCreates, 1);
});

test('fresh instances must retain the manifest identity established by the probe', () => {
  let calls = 0;
  const entry = defineCartridge(() => {
    calls += 1;
    return calls === 1 ? makeCartridge() : makeCartridge({ id: 'different-cart' });
  }, DETAILS);

  assert.throws(() => activateCartridge(entry, {}), /id must match manifest slug: test-cart/);
});
