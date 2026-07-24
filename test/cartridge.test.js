import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateCartridge,
  defineCartridge,
  validateCatalog,
  validateManifest,
} from '../shell/cartridge.js';

// Identity is declared here, not read back from the instance the factory
// returns. The manifest is the claim; the cartridge must match it.
const DETAILS = {
  schemaVersion: 1,
  slug: 'test-cart',
  title: 'Test Cart',
  summary: 'A cartridge for contract tests.',
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
  const second = defineCartridge(() => makeCartridge({ id: 'second-cart' }), {
    ...DETAILS,
    slug: 'second-cart',
  });

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
  // Never executed: a cartridge the gate would refuse must not run its factory
  // just because it was defined. A gate that fires after the code already ran
  // is not a gate.
  assert.equal(suspendedCreates, 0);
  assert.throws(() => activateCartridge(suspended, {}), /launch blocked: suspended/);
  assert.equal(suspendedCreates, 0);

  let isolatedCreates = 0;
  const isolated = defineCartridge(() => {
    isolatedCreates += 1;
    return makeCartridge();
  }, { ...DETAILS, runtime: 'first-party-3d' });
  assert.equal(isolatedCreates, 0);
  assert.throws(() => activateCartridge(isolated, {}), /runtime unavailable: first-party-3d/);
  assert.equal(isolatedCreates, 0);

  // The case that matters once community cartridges exist: untrusted code must
  // not execute on the platform origin at catalog-definition time.
  let communityCreates = 0;
  const community = defineCartridge(() => {
    communityCreates += 1;
    return makeCartridge();
  }, { ...DETAILS, runtime: 'community-iframe', trustLevel: 'untrusted-community' });
  assert.equal(communityCreates, 0);
  assert.throws(() => activateCartridge(community, {}), /runtime unavailable: community-iframe/);
  assert.equal(communityCreates, 0);
});

test('fresh instances must retain the manifest identity established by the probe', () => {
  let calls = 0;
  const entry = defineCartridge(() => {
    calls += 1;
    return calls === 1 ? makeCartridge() : makeCartridge({ id: 'different-cart' });
  }, DETAILS);

  assert.throws(() => activateCartridge(entry, {}), /id must match manifest slug: test-cart/);
});

// Regression tests for the F-002 hardening pass. Each one corresponds to a
// vulnerability demonstrated by an executable probe against the real modules,
// not to a hypothetical.

test('a manifest value that changes between reads cannot be validated as one value and stored as another', () => {
  let reads = 0;
  const shifty = {
    get accent() {
      reads += 1;
      return reads === 1 ? 'amber' : { evil: true };
    },
  };
  assert.throws(
    () => defineCartridge(() => makeCartridge(), { ...DETAILS, artwork: shifty }),
    /artwork/,
  );
});

test('accent must be a real palette key, so a typo cannot ship as a silent fallback', () => {
  assert.throws(
    () => validateManifest({ ...DETAILS, artwork: { accent: 'perwinkle' } }),
    /artwork\.accent is unsupported/,
  );
  // Inherited members are not palette keys: palette[accent] must not resolve
  // 'toString' to a function and hand it to the renderer as a colour.
  assert.throws(
    () => validateManifest({ ...DETAILS, artwork: { accent: 'toString' } }),
    /artwork\.accent is unsupported/,
  );
});

test('versions with leading zeros are rejected so duplicate detection cannot be bypassed', () => {
  assert.throws(
    () => validateManifest({ ...DETAILS, version: '01.0.0' }),
    /MAJOR\.MINOR\.PATCH without leading zeros/,
  );
});

test('an exotic array cannot validate as a list and then be stored as a plain object', () => {
  class Sneaky extends Array {
    static get [Symbol.species]() {
      return Object;
    }
  }
  const tags = Sneaky.from(['a', 'b']);
  const entry = defineCartridge(() => makeCartridge(), { ...DETAILS, tags });
  assert.ok(Array.isArray(entry.manifest.tags), 'tags must remain a real array');
  assert.deepEqual([...entry.manifest.tags], ['a', 'b']);
});

test('validateCatalog returns a frozen snapshot, so no entry can be appended after validation', () => {
  const entry = defineCartridge(() => makeCartridge(), DETAILS);
  const source = [entry];
  const catalog = validateCatalog(source);

  assert.ok(Object.isFrozen(catalog));
  assert.throws(() => catalog.push({ manifest: { title: 'GHOST' } }), TypeError);
  // Mutating the caller's original array must not reach the validated catalog.
  source.push({ manifest: { title: 'GHOST' } });
  assert.equal(catalog.length, 1);
});

test('the declared manifest is authoritative and a mismatched instance is refused', () => {
  assert.throws(
    () => defineCartridge(() => makeCartridge({ id: 'not-the-declared-slug' }), DETAILS),
    /id must match manifest slug: test-cart/,
  );
});
