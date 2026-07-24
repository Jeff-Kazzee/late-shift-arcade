import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateCartridge,
  defineCatalogEntry,
  lazyModule,
  validateCatalog,
  validateManifest,
} from '../shell/cartridge.js';

// Identity is declared here, not read back from the instance the module
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

// Stands in for `() => import('./pong/pong.js')`: a function resolving to a
// module whose default export is the cartridge factory.
function moduleLoader(factory) {
  return async () => ({ default: factory });
}

function defineTestEntry(factory = () => makeCartridge(), metadata = DETAILS) {
  return defineCatalogEntry(metadata, moduleLoader(factory));
}

test('defineCatalogEntry publishes an immutable versioned manifest without loading the game', async () => {
  let loads = 0;
  const entry = defineCatalogEntry(DETAILS, async () => {
    loads += 1;
    return { default: () => makeCartridge() };
  });

  // The point of the whole boundary: a rack of thirty entries costs thirty
  // manifests and zero game modules.
  assert.equal(loads, 0);
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
  assert.throws(() => {
    entry.manifest.modes.push('changed');
  }, TypeError);

  const loaded = await entry.load();
  assert.equal(loads, 1);
  assert.equal(loaded.manifest, entry.manifest);
  assert.notEqual(loaded.create(), loaded.create());
});

test('defineCatalogEntry rejects a loader that is not a function', () => {
  assert.throws(() => defineCatalogEntry(DETAILS, null), /Cartridge loader must be a function/);
});

test('a module is validated on load and on every later instance', async () => {
  await assert.rejects(
    defineTestEntry(() => makeCartridge({ title: '' })).load(),
    /title must be a non-empty string/,
  );
  await assert.rejects(
    defineTestEntry(() => makeCartridge({ draw: null })).load(),
    /draw must be a function/,
  );
  await assert.rejects(
    defineCatalogEntry(DETAILS, async () => ({ createTestCart: () => makeCartridge() })).load(),
    /module must default-export a cartridge factory/,
  );

  let calls = 0;
  const loaded = await defineTestEntry(() => {
    calls += 1;
    return calls === 1 ? makeCartridge() : makeCartridge({ destroy: undefined });
  }).load();
  assert.throws(() => loaded.create(), /destroy must be a function/);
});

test('activateCartridge initialises a fresh instance and returns it', async () => {
  const context = { highScore: 42 };
  let received = null;
  const loaded = await defineTestEntry(
    () => makeCartridge({ init: (ctx) => { received = ctx; } }),
  ).load();

  const cartridge = activateCartridge(loaded, context);

  assert.equal(received, context);
  assert.equal(cartridge.id, 'test-cart');
});

test('activateCartridge destroys a partially initialised cartridge and rethrows its init error', async () => {
  const boom = new Error('init failed');
  let destroyed = 0;
  const loaded = await defineTestEntry(() => makeCartridge({
    init() { throw boom; },
    destroy() { destroyed += 1; throw new Error('cleanup failed'); },
  })).load();

  assert.throws(() => activateCartridge(loaded, {}), (error) => error === boom);
  assert.equal(destroyed, 1);
});

test('activateCartridge refuses a catalog entry that has not been loaded', () => {
  // The two halves of the contract are not interchangeable: an entry is a
  // declaration, and only a loaded cartridge can be run.
  assert.throws(() => activateCartridge(defineTestEntry(), {}), /entry was not validated/);
});

test('validateCatalog accepts unique entries and rejects malformed or duplicate versions', async () => {
  const first = defineTestEntry();
  const second = defineCatalogEntry(
    { ...DETAILS, slug: 'second-cart' },
    moduleLoader(() => makeCartridge({ id: 'second-cart' })),
  );

  assert.deepEqual(validateCatalog([first, second]), [first, second]);
  assert.throws(() => validateCatalog([first, first]), /Duplicate cartridge version: test-cart@1\.0\.0/);
  assert.throws(
    () => validateCatalog([{ id: 'fake', manifest: first.manifest, load() {} }]),
    /entry was not validated/,
  );
  // A loaded cartridge is not a catalog entry either.
  const loaded = await first.load();
  assert.throws(() => validateCatalog([loaded]), /entry was not validated/);
});

test('manifest validation rejects missing or malformed required metadata', () => {
  const valid = defineTestEntry().manifest;

  assert.throws(
    () => defineTestEntry(() => makeCartridge(), {}),
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

test('the launch gate refuses blocked entries before their module is ever fetched', async () => {
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

  // Fetching a module means evaluating it, so for a lazily loaded cartridge
  // the import IS the launch. The counter is on the LOADER, not the factory:
  // with lazy loading a factory that never ran proves nothing, but a module
  // that was never even requested proves the gate fired first.
  const countedEntry = (metadata) => {
    const counter = { loads: 0 };
    counter.entry = defineCatalogEntry(metadata, async () => {
      counter.loads += 1;
      return { default: () => makeCartridge() };
    });
    return counter;
  };

  const suspended = countedEntry({ ...DETAILS, releaseStatus: 'suspended' });
  assert.equal(suspended.loads, 0);
  await assert.rejects(suspended.entry.load(), /launch blocked: suspended/);
  assert.equal(suspended.loads, 0);

  const isolated = countedEntry({ ...DETAILS, runtime: 'first-party-3d' });
  assert.equal(isolated.loads, 0);
  await assert.rejects(isolated.entry.load(), /runtime unavailable: first-party-3d/);
  assert.equal(isolated.loads, 0);

  // The case that matters once community cartridges exist: untrusted code must
  // never be fetched onto — let alone evaluated on — the platform origin.
  const community = countedEntry({
    ...DETAILS,
    runtime: 'community-iframe',
    trustLevel: 'untrusted-community',
  });
  assert.equal(community.loads, 0);
  await assert.rejects(community.entry.load(), /runtime unavailable: community-iframe/);
  assert.equal(community.loads, 0);
});

test('fresh instances must retain the manifest identity established at load', async () => {
  let calls = 0;
  const loaded = await defineTestEntry(() => {
    calls += 1;
    return calls === 1 ? makeCartridge() : makeCartridge({ id: 'different-cart' });
  }).load();

  assert.throws(() => activateCartridge(loaded, {}), /id must match manifest slug: test-cart/);
});

// --- The loading boundary --------------------------------------------------

test('two launches during a load share one fetch, and a loaded game is not refetched', async () => {
  let loads = 0;
  let release;
  const entry = defineCatalogEntry(DETAILS, () => {
    loads += 1;
    return new Promise((resolve) => {
      release = () => resolve({ default: () => makeCartridge() });
    });
  });

  // The double-launch guard: a player tapping twice on the loading screen must
  // not start a second download, let alone a second run.
  const first = entry.load();
  const second = entry.load();
  assert.equal(loads, 1);
  release();
  assert.equal(await first, await second);

  await entry.load();
  assert.equal(loads, 1);
});

test('a failed load is retryable, and the retry is a real second attempt', async () => {
  const attempts = [];
  const entry = defineCatalogEntry(DETAILS, async (attempt) => {
    attempts.push(attempt);
    if (attempt === 0) throw new Error('Failed to fetch dynamically imported module');
    return { default: () => makeCartridge() };
  });

  await assert.rejects(entry.load(), /Failed to fetch dynamically imported module/);
  // A rejected load must not be memoised, or the retry button would replay the
  // failure forever without touching the network.
  const loaded = await entry.load();
  assert.deepEqual(attempts, [0, 1]);
  assert.equal(activateCartridge(loaded, {}).id, 'test-cart');
});

test('lazyModule resolves relative to the declaring module and reports a missing one', async () => {
  const entry = defineCatalogEntry(
    { ...DETAILS, slug: 'pong', title: 'PONG', summary: 'First to 7. Ball speeds up every rally.' },
    lazyModule('../games/pong/pong.js', import.meta.url),
  );
  const loaded = await entry.load();
  assert.equal(loaded.create().id, 'pong');

  const missing = defineCatalogEntry(
    DETAILS,
    lazyModule('../games/no-such-game/no-such-game.js', import.meta.url),
  );
  await assert.rejects(missing.load());
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
    () => defineTestEntry(() => makeCartridge(), { ...DETAILS, artwork: shifty }),
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
  const entry = defineTestEntry(() => makeCartridge(), { ...DETAILS, tags });
  assert.ok(Array.isArray(entry.manifest.tags), 'tags must remain a real array');
  assert.deepEqual([...entry.manifest.tags], ['a', 'b']);
});

test('validateCatalog returns a frozen snapshot, so no entry can be appended after validation', () => {
  const entry = defineTestEntry();
  const source = [entry];
  const catalog = validateCatalog(source);

  assert.ok(Object.isFrozen(catalog));
  assert.throws(() => catalog.push({ manifest: { title: 'GHOST' } }), TypeError);
  // Mutating the caller's original array must not reach the validated catalog.
  source.push({ manifest: { title: 'GHOST' } });
  assert.equal(catalog.length, 1);
});

test('the declared manifest is authoritative and a mismatched module is refused', async () => {
  await assert.rejects(
    defineTestEntry(() => makeCartridge({ id: 'not-the-declared-slug' })).load(),
    /id must match manifest slug: test-cart/,
  );
});
