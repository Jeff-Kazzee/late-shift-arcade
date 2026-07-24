import test from 'node:test';
import assert from 'node:assert/strict';
import { detailUrlFor, resolveCatalogDetail } from '../shell/catalog.js';
import { cartridges } from '../games/registry.js';

const pongManifest = Object.freeze({ slug: 'pong', version: '1.0.0' });
const pongEntry = Object.freeze({ manifest: pongManifest });
const catalog = Object.freeze([pongEntry]);

test('cabinet and direct detail URL resolve the same manifest object', () => {
  const directUrl = detailUrlFor(
    pongManifest,
    'https://example.com/late-shift-arcade/index.html',
  );
  const detailEntry = resolveCatalogDetail(catalog, directUrl);

  assert.equal(
    directUrl,
    'https://example.com/late-shift-arcade/index.html?game=pong&version=1.0.0',
  );
  assert.equal(detailEntry, pongEntry);
  assert.equal(detailEntry.manifest, pongManifest);
});

test('detail routes fail closed for missing or mismatched versions', () => {
  assert.equal(
    resolveCatalogDetail(catalog, 'https://example.com/index.html?game=pong'),
    null,
  );
  assert.equal(
    resolveCatalogDetail(
      catalog,
      'https://example.com/index.html?game=pong&version=2.0.0',
    ),
    null,
  );
  assert.equal(
    resolveCatalogDetail(
      catalog,
      'https://example.com/index.html?game=missing&version=1.0.0',
    ),
    null,
  );
});

test('all eight Legacy Rack cards and detail routes share complete manifests', () => {
  const requiredFields = [
    'slug',
    'version',
    'creator',
    'runtime',
    'trustLevel',
    'modes',
    'goal',
    'scoreLabel',
    'controls',
    'artwork',
    'releaseStatus',
    'contentNotes',
    'madeWith',
  ];

  // The compendium grows a game at a time; assert the Legacy Rack floor rather
  // than an exact count so a new cartridge is one registry entry, not a
  // shared-test edit that every concurrent game branch has to merge.
  assert.ok(cartridges.length >= 8);
  for (const entry of cartridges) {
    const cardManifest = entry.manifest;
    const directUrl = detailUrlFor(cardManifest, 'https://example.com/index.html');
    const detailEntry = resolveCatalogDetail(cartridges, directUrl);

    assert.equal(detailEntry, entry);
    assert.equal(detailEntry.manifest, cardManifest);
    assert.equal(cardManifest.schemaVersion, 1);
    assert.match(cardManifest.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(
      requiredFields.filter((field) => !Object.hasOwn(cardManifest, field)),
      [],
    );
    assert.doesNotThrow(() => JSON.stringify(cardManifest));
  }
});
