// DS-1b Gate 3 headless proofs: adversarial stress scenes are deterministic
// generators, and remeshing stays CORRECT under scripted edit churn — no
// dropped faces, no double faces, stale results rejected — even when
// worker completions arrive out of order across two transports.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SCENES, checkerboardScene, cavesScene, fortressScene } from './view/stress-scenes.js';
import { churnOp, applyBurst } from './view/churn.js';
import { createMeshPool } from './view/mesh-pool.js';
import { snapshotSection, meshSnapshot } from './view/mesh-snapshot.js';
import { hashInts } from './sim/math/xxhash64.js';

const SECTION = 16;

function realTransport() {
  const posted = [];
  let deliver = null;
  return {
    posted,
    onResult(cb) { deliver = cb; },
    post(snapshot) { posted.push(snapshot); },
    complete(index = 0) { deliver(meshSnapshot(posted.splice(index, 1)[0])); },
    completeAll() { while (posted.length > 0) deliver(meshSnapshot(posted.shift())); },
    terminate() {},
  };
}

test('every stress scene is a deterministic generator', () => {
  for (const [name, make] of Object.entries(SCENES)) {
    const a = make();
    const b = make();
    for (let i = 0; i < 400; i += 1) {
      const h = hashInts(1n, [i]);
      const x = Number(h % 640n);
      const y = Number((h >> 16n) % 96n);
      const z = Number((h >> 32n) % 640n);
      assert.equal(a.readBlock(x, y, z), b.readBlock(x, y, z), `${name} @ ${x},${y},${z}`);
    }
    assert.equal(a.name, name);
    assert.equal(a.snap.region.blocksX, 640);
    assert.equal(a.snap.region.blocksY, 96);
  }
});

test('sectionUniform never lies: a claimed-uniform section reads uniformly', () => {
  for (const [name, make] of Object.entries(SCENES)) {
    const scene = make();
    for (let i = 0; i < 60; i += 1) {
      const h = hashInts(7n, [i]);
      const sx = Number(h % 40n);
      const sy = Number((h >> 16n) % 6n);
      const sz = Number((h >> 32n) % 40n);
      const uniform = scene.sectionUniform(sx, sy, sz);
      if (uniform === null) continue;
      for (let j = 0; j < 48; j += 1) {
        const g = hashInts(h, [j]);
        const x = sx * SECTION + Number(g % 16n);
        const y = sy * SECTION + Number((g >> 8n) % 16n);
        const z = sz * SECTION + Number((g >> 16n) % 16n);
        assert.equal(scene.readBlock(x, y, z), uniform,
          `${name} section ${sx},${sy},${sz} claims ${uniform} but reads otherwise at ${x},${y},${z}`);
      }
    }
  }
});

test('the checkerboard section is the documented worst case: 12288 quads', () => {
  const scene = checkerboardScene();
  // A section fully inside the checker slab (sy=2, y 32..47).
  const mesh = meshSnapshot(snapshotSection(scene.readBlock, 20, 2, 20, 1));
  // 16^3 / 2 = 2048 solid voxels x 6 exposed faces = 12288, minus the 128
  // bottom faces of the lowest layer resting on the solid floor at y=31.
  assert.equal(mesh.quadCount, 12160);
});

test('caves scene: the seed matters and caves carve real voids underground', () => {
  const a = cavesScene('00000000deadbeef');
  const b = cavesScene('00000000cafef00d');
  let differs = 0;
  let voids = 0;
  for (let i = 0; i < 600; i += 1) {
    const h = hashInts(3n, [i]);
    const x = Number(h % 640n);
    const y = 10 + Number((h >> 16n) % 30n); // underground band
    const z = Number((h >> 32n) % 640n);
    if (a.readBlock(x, y, z) !== b.readBlock(x, y, z)) differs += 1;
    if (a.readBlock(x, y, z) === 'air') voids += 1;
  }
  assert.ok(differs > 20, `different seeds must diverge (got ${differs})`);
  assert.ok(voids > 60, `caves must actually carve underground voids (got ${voids})`);
});

test('fortress walls sit on section boundaries and span them', () => {
  const scene = fortressScene();
  // x = 304 is both a wall plane ((304-280)%8 == 0) and a section boundary.
  assert.equal(304 % SECTION, 0);
  assert.equal(scene.readBlock(304, 41, 300), 'wardwall');
  // The wall continues across the z-section boundary at z = 304 too.
  assert.equal(scene.readBlock(304, 41, 303), 'wardwall');
  assert.equal(scene.readBlock(304, 41, 305), 'wardwall');
});

test('a section-face edit dirties the owning section AND the face neighbor', () => {
  const scene = fortressScene();
  scene.setBlock(304, 50, 300, 'air'); // x%16 == 0: the -x neighbor sees this plane
  const dirty = scene.drainDirty();
  assert.ok(dirty.includes('19,3,18'), `dirty misses the edited section: ${dirty}`);
  assert.ok(dirty.includes('18,3,18'), `dirty misses the -x face neighbor: ${dirty}`);
  assert.equal(scene.drainDirty().length, 0, 'drain empties the set');
});

test('churn ops are deterministic and boundary-biased', () => {
  const center = { x: 320, y: 56, z: 320 };
  let boundary = 0;
  for (let i = 0; i < 200; i += 1) {
    const op = churnOp(42n, i, center, 40);
    assert.deepEqual(op, churnOp(42n, i, center, 40), 'same seed+index, same op');
    const bx = ((op.x % SECTION) + SECTION) % SECTION;
    const bz = ((op.z % SECTION) + SECTION) % SECTION;
    if (bx === 0 || bx === SECTION - 1 || bz === 0) boundary += 1;
  }
  assert.ok(boundary >= 100, `at least half the ops must hit section faces (got ${boundary})`);
});

test('remesh under churn: applied meshes byte-equal a fresh remesh of the final world, stale results rejected', () => {
  const scene = fortressScene();
  const tA = realTransport();
  const tB = realTransport();
  const pool = createMeshPool({ transports: [tA, tB], maxInFlight: 4 });
  const revisions = new Map();
  const applied = new Map();
  const apply = (result) => applied.set(result.key, result);
  const center = { x: 320, y: 56, z: 320 };
  const region = scene.snap.region;

  const submitKey = (key) => {
    const [sx, sy, sz] = key.split(',').map(Number);
    if (sx < 0 || sy < 0 || sz < 0) return;
    if (sx * SECTION >= region.blocksX || sy * SECTION >= region.blocksY || sz * SECTION >= region.blocksZ) return;
    const revision = (revisions.get(key) ?? 0) + 1;
    revisions.set(key, revision);
    pool.submit(snapshotSection(scene.readBlock, sx, sy, sz, revision));
  };

  for (let burst = 0; burst < 12; burst += 1) {
    const dirty = applyBurst(scene, 42n, burst, 24, center, 40);
    assert.ok(dirty.length > 0);
    for (const key of dirty) submitKey(key);
    // Adversarial completion: some bursts complete NOTHING (jobs go stale
    // in flight), others complete out of order across the two transports.
    if (burst % 3 === 0) continue;
    if (tB.posted.length > 1) tB.complete(tB.posted.length - 1); // newest first: out of order
    if (tA.posted.length > 0) tA.complete(0);
    pool.drain(apply, { maxResults: 8 });
  }

  // Settle: complete everything, drain everything.
  while (!pool.idle()) {
    tA.completeAll();
    tB.completeAll();
    pool.drain(apply);
  }

  const stats = pool.stats();
  assert.ok(stats.rejectedStale > 0, 'the harness must have raced stale results');
  assert.ok(stats.coalesced > 0, 'the harness must have coalesced superseded jobs');
  assert.ok(scene.editCount() > 200, 'churn actually edited the world');

  // Correctness: every section ever dirtied now byte-equals a fresh remesh
  // of the FINAL world — no dropped faces, no double faces, no stale
  // geometry left applied.
  assert.ok(revisions.size >= 20, `churn should have touched many sections (got ${revisions.size})`);
  for (const key of revisions.keys()) {
    const [sx, sy, sz] = key.split(',').map(Number);
    const fresh = meshSnapshot(snapshotSection(scene.readBlock, sx, sy, sz, 0));
    const got = applied.get(key);
    assert.ok(got !== undefined, `section ${key} was dirtied but never applied`);
    assert.equal(got.revision, revisions.get(key), `section ${key} applied a non-final revision`);
    assert.deepEqual(Array.from(got.positions), Array.from(fresh.positions), `positions differ at ${key}`);
    assert.deepEqual(Array.from(got.colors), Array.from(fresh.colors), `colors differ at ${key}`);
    assert.deepEqual(Array.from(got.indices), Array.from(fresh.indices), `indices differ at ${key}`);
  }
});
