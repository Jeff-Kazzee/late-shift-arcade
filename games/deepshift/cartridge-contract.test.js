// Gate 3 contract proofs, headless: the manifest satisfies the shell's
// versioned schema, the shell's launch gate honestly reports why it will
// not host first-party-3d yet, the cartridge presents its declared
// identity, and the disposal registry's 10-cycle bookkeeping is leak-free.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { manifest } from './manifest.js';
import {
  validateManifest, launchBlockReason, defineCatalogEntry, requiredOrientation,
} from '../../shell/cartridge.js';
import { createRegistry } from './view/registry.js';
import createDeepshiftCartridge from './cart/cartridge.js';

test('the manifest validates against the shell schema v1', () => {
  assert.equal(validateManifest(manifest), manifest);
  assert.equal(manifest.runtime, 'first-party-3d');
  assert.equal(manifest.trustLevel, 'trusted-first-party');
  assert.equal(requiredOrientation(manifest), 'landscape');
});

test('the shell gate blocks first-party-3d today, before any code is fetched', async () => {
  assert.equal(launchBlockReason(manifest), 'runtime unavailable: first-party-3d');
  let loaderCalled = false;
  const entry = defineCatalogEntry(manifest, async () => {
    loaderCalled = true;
    return {};
  });
  await assert.rejects(entry.load(), /runtime unavailable: first-party-3d/);
  assert.equal(loaderCalled, false, 'the gate must refuse BEFORE the loader runs');
});

test('the cartridge presents its declared identity and lifecycle shape', () => {
  const instance = createDeepshiftCartridge();
  assert.equal(instance.id, manifest.slug);
  assert.equal(instance.title, manifest.title);
  assert.equal(instance.blurb, manifest.summary);
  for (const method of ['init', 'update', 'draw', 'destroy', 'getRunLog']) {
    assert.equal(typeof instance[method], 'function', method);
  }
  // Headless: no DOM context -> init must refuse loudly, not half-start.
  assert.throws(() => instance.init({}), /container/);
});

test('disposal registry: ten launch/eject cycles leak nothing', () => {
  for (let cycle = 0; cycle < 10; cycle += 1) {
    const registry = createRegistry();
    const disposed = [];
    const tokens = [];
    for (let i = 0; i < 50; i += 1) {
      tokens.push(registry.track({ i }, (r) => disposed.push(r.i)));
    }
    // Some resources are replaced mid-run (section remesh path).
    assert.ok(registry.release(tokens[7]));
    assert.ok(!registry.release(tokens[7]), 'double release is a no-op');
    assert.equal(registry.size(), 49);
    assert.equal(registry.sweep(), 49);
    assert.equal(registry.size(), 0);
    assert.equal(registry.sweep(), 0, 'sweep is idempotent');
    assert.equal(disposed.length, 50);
    assert.equal(new Set(disposed).size, 50, 'every disposer ran exactly once');
  }
});

test('zero console noise from the cartridge, view, and sim', () => {
  const roots = ['sim', 'view', 'cart', 'tools'].map((d) =>
    fileURLToPath(new URL(`./${d}`, import.meta.url)));
  const offenders = [];
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (/\.(js|mjs)$/.test(entry.name)) {
        const source = readFileSync(full, 'utf8');
        if (/\bconsole\./.test(source)) offenders.push(full);
      }
    }
  };
  for (const root of roots) scan(root);
  assert.deepEqual(offenders, []);
});

test('the vendored three module carries its license and stays inside the game', () => {
  const vendor = fileURLToPath(new URL('./vendor', import.meta.url));
  const files = readdirSync(vendor);
  assert.ok(files.includes('three.module.min.js'));
  assert.ok(files.includes('three.core.min.js'));
  assert.ok(files.includes('THREE-LICENSE'));
  const license = readFileSync(join(vendor, 'THREE-LICENSE'), 'utf8');
  assert.match(license, /MIT/);
});
