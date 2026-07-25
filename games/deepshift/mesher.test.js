// Gate 3 headless geometry proofs: greedy meshing per 16^3 section (opaque
// bucket), and the WorldView seam — meshes rebuilt from a replayed state
// are byte-identical to meshes from the live state (GDD §17 DS-0).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { meshSection, SECTION_SIZE, isOpaque } from './view/mesher.js';
import { runReplay } from './sim/replay.js';
import { runWinPolicy } from './tools/policies.mjs';
import { readBlock } from './sim/sim.js';
import { floorDiv } from './sim/math/fixed.js';

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/golden-run.json', import.meta.url), 'utf8'),
);

function worldOf(cells) {
  return (x, y, z) => cells[`${x},${y},${z}`] ?? 'air';
}

test('a lone block meshes to exactly six quads with face shading', () => {
  const read = worldOf({ '5,5,5': 'fieldstone' });
  const mesh = meshSection(read, 0, 0, 0);
  assert.equal(mesh.quadCount, 6);
  assert.equal(mesh.positions.length, 6 * 4 * 3);
  assert.equal(mesh.colors.length, 6 * 4 * 3);
  assert.equal(mesh.indices.length, 6 * 6);
  // Top faces are brighter than bottom faces (baked directional shade).
  const brightness = [];
  for (let i = 0; i < mesh.colors.length; i += 3) brightness.push(mesh.colors[i]);
  assert.ok(Math.max(...brightness) > Math.min(...brightness));
});

test('greedy merging: a 2-block domino is six quads, not ten faces', () => {
  const read = worldOf({ '5,5,5': 'fieldstone', '6,5,5': 'fieldstone' });
  const mesh = meshSection(read, 0, 0, 0);
  assert.equal(mesh.quadCount, 6); // 2 caps + 4 merged long sides
});

test('a full solid section against air is one quad per face', () => {
  const read = (x, y, z) => (
    x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16 ? 'fieldstone' : 'air'
  );
  const mesh = meshSection(read, 0, 0, 0);
  assert.equal(mesh.quadCount, 6);
});

test('faces against a solid neighbor section are culled via the halo', () => {
  // Solid 16^3 in section (0,0,0) and one abutting block just across the +x
  // boundary: that shared face must vanish from the +x sheet.
  const read = (x, y, z) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16) return 'fieldstone';
    if (x === 16 && y === 3 && z === 3) return 'fieldstone';
    return 'air';
  };
  const mesh = meshSection(read, 0, 0, 0);
  // The +x sheet can no longer be one 16x16 quad; it splits around the hole.
  assert.ok(mesh.quadCount > 6, `expected the +x sheet to split, got ${mesh.quadCount} quads`);
});

test('mixed materials never merge into one quad', () => {
  const read = worldOf({ '5,5,5': 'fieldstone', '6,5,5': 'coal' });
  const mesh = meshSection(read, 0, 0, 0);
  assert.equal(mesh.quadCount, 10); // 2x5 faces, sides cannot merge across ids
});

test('air and non-opaque ids stay out of the opaque bucket', () => {
  assert.ok(!isOpaque('air'));
  assert.ok(isOpaque('fieldstone'));
  assert.ok(isOpaque('cache'));
});

test('WorldView seam: meshes rebuilt from a replayed state are byte-identical', () => {
  const live = runWinPolicy(golden.runLog.seed);
  const replayed = runReplay(golden.runLog.seed, golden.runLog.commands);
  assert.equal(live.state.hash, replayed.hash);

  // Mesh the 3x2x3 sections around the (edited) spawn shaft in both states.
  const px = floorDiv(floorDiv(replayed.player.x, 65536), SECTION_SIZE);
  const py = floorDiv(floorDiv(replayed.player.y, 65536), SECTION_SIZE);
  const pz = floorDiv(floorDiv(replayed.player.z, 65536), SECTION_SIZE);
  for (let sx = px - 1; sx <= px + 1; sx += 1) {
    for (let sy = py - 1; sy <= py; sy += 1) {
      for (let sz = pz - 1; sz <= pz + 1; sz += 1) {
        const a = meshSection((x, y, z) => readBlock(live.state, x, y, z), sx, sy, sz);
        const b = meshSection((x, y, z) => readBlock(replayed, x, y, z), sx, sy, sz);
        assert.deepEqual(Array.from(a.positions), Array.from(b.positions));
        assert.deepEqual(Array.from(a.colors), Array.from(b.colors));
        assert.deepEqual(Array.from(a.indices), Array.from(b.indices));
      }
    }
  }

  // And meshing is pure: the same state meshes identically twice.
  const once = meshSection((x, y, z) => readBlock(replayed, x, y, z), px, py, pz);
  const twice = meshSection((x, y, z) => readBlock(replayed, x, y, z), px, py, pz);
  assert.deepEqual(Array.from(once.positions), Array.from(twice.positions));
});
