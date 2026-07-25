// DS-1b Gate 1 headless proofs: the F-06 mesh-job snapshot contract.
// A snapshot is an immutable capture of section + one-voxel halo; meshing a
// snapshot is byte-identical to meshing the live world it was captured
// from; edits after capture cannot leak into a captured job.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { meshSection, SECTION_SIZE } from './view/mesher.js';
import {
  snapshotSection, snapshotReader, meshSnapshot, snapshotTransferables, resultTransferables,
} from './view/mesh-snapshot.js';
import { runReplay } from './sim/replay.js';
import { readBlock } from './sim/sim.js';
import { floorDiv } from './sim/math/fixed.js';

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/golden-run.json', import.meta.url), 'utf8'),
);

function mapWorld(cells = {}) {
  const map = new Map(Object.entries(cells));
  return {
    read: (x, y, z) => map.get(`${x},${y},${z}`) ?? 'air',
    set: (x, y, z, id) => map.set(`${x},${y},${z}`, id),
  };
}

function assertSameMesh(a, b) {
  assert.deepEqual(Array.from(a.positions), Array.from(b.positions));
  assert.deepEqual(Array.from(a.colors), Array.from(b.colors));
  assert.deepEqual(Array.from(a.indices), Array.from(b.indices));
  assert.equal(a.quadCount, b.quadCount);
}

test('meshing a snapshot is byte-identical to meshing the live world (golden run)', () => {
  const state = runReplay(golden.runLog.seed, golden.runLog.commands);
  const read = (x, y, z) => readBlock(state, x, y, z);
  const px = floorDiv(floorDiv(state.player.x, 65536), SECTION_SIZE);
  const py = floorDiv(floorDiv(state.player.y, 65536), SECTION_SIZE);
  const pz = floorDiv(floorDiv(state.player.z, 65536), SECTION_SIZE);
  for (let sx = px - 1; sx <= px + 1; sx += 1) {
    for (let sy = py - 1; sy <= py; sy += 1) {
      for (let sz = pz - 1; sz <= pz + 1; sz += 1) {
        const direct = meshSection(read, sx, sy, sz);
        const viaSnapshot = meshSnapshot(snapshotSection(read, sx, sy, sz, 7));
        assertSameMesh(direct, viaSnapshot);
        assert.equal(viaSnapshot.revision, 7, 'the revision stamp survives meshing');
      }
    }
  }
});

test('a captured snapshot is immune to later world edits', () => {
  const world = mapWorld({ '5,5,5': 'fieldstone', '8,8,8': 'coal' });
  const snapshot = snapshotSection(world.read, 0, 0, 0, 1);
  const before = meshSnapshot(snapshot);

  world.set(5, 5, 5, 'air'); // mine the block AFTER capture
  world.set(2, 2, 2, 'dirt'); // and place another

  const after = meshSnapshot(snapshot);
  assertSameMesh(before, after); // the job meshes what it captured, period

  // A FRESH snapshot of the edited world sees the edit.
  const fresh = meshSnapshot(snapshotSection(world.read, 0, 0, 0, 2));
  assert.notDeepEqual(Array.from(fresh.positions), Array.from(before.positions));
});

test('the snapshot covers exactly section + one-voxel halo', () => {
  // Solid 16^3 section with one abutting halo block just across +x: the
  // shared face must split, proving halo cells are captured...
  const solid = (x, y, z) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16) return 'fieldstone';
    if (x === 16 && y === 3 && z === 3) return 'fieldstone';
    return 'air';
  };
  const withHalo = meshSnapshot(snapshotSection(solid, 0, 0, 0, 1));
  assert.ok(withHalo.quadCount > 6, 'halo neighbor must split the +x sheet');

  // ...and a block TWO cells out (outside the halo) changes nothing.
  const beyond = (x, y, z) => (x === 17 && y === 3 && z === 3 ? 'fieldstone' : solid(x, y, z));
  const outside = meshSnapshot(snapshotSection(beyond, 0, 0, 0, 1));
  assert.equal(outside.quadCount, withHalo.quadCount);
});

test('the uniform-interior fast path meshes identically to a full capture', () => {
  // Uniform fieldstone section under a varied halo (air above, mixed sides).
  const read = (x, y, z) => {
    if (y >= 0 && y < 16 && x >= 0 && x < 16 && z >= 0 && z < 16) return 'fieldstone';
    if (y === 16) return (x + z) % 3 === 0 ? 'dirt' : 'air';
    if (y < 0) return 'worldbone';
    return 'air';
  };
  const full = meshSnapshot(snapshotSection(read, 0, 0, 0, 1));
  const fast = meshSnapshot(snapshotSection(read, 0, 0, 0, 1, 'fieldstone'));
  assertSameMesh(full, fast);
});

test('snapshot reads through the reader match the source world everywhere in range', () => {
  const world = mapWorld({ '0,0,0': 'dirt', '15,15,15': 'coal', '-1,7,7': 'fieldstone', '16,8,8': 'wardwall' });
  const snapshot = snapshotSection(world.read, 0, 0, 0, 3);
  const reader = snapshotReader(snapshot);
  for (let y = -1; y <= 16; y += 1) {
    for (let z = -1; z <= 16; z += 1) {
      for (let x = -1; x <= 16; x += 1) {
        assert.equal(reader(x, y, z), world.read(x, y, z), `${x},${y},${z}`);
      }
    }
  }
});

test('transfer lists cover every owned buffer, nothing else', () => {
  const world = mapWorld({ '1,1,1': 'fieldstone' });
  const snapshot = snapshotSection(world.read, 0, 0, 0, 1);
  assert.deepEqual(snapshotTransferables(snapshot), [snapshot.voxels.buffer]);
  const result = meshSnapshot(snapshot);
  assert.deepEqual(
    resultTransferables(result),
    [result.positions.buffer, result.colors.buffer, result.indices.buffer],
  );
  assert.equal(result.bytes,
    result.positions.byteLength + result.colors.byteLength + result.indices.byteLength);
});
