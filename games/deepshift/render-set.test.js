// DS-1b Gate 2 headless proofs: RenderSet geometry — deterministic spiral
// load order, bounds clamping, and the radius+2 unload rule (GDD §13.4,
// §13.5 desktop column radius 8). Presentation policy only: nothing here
// touches sim/ and sim/ can never import it (purity.test.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RENDER_RADIUS, UNLOAD_MARGIN, spiralOffsets, columnsAround, shouldUnload, chebyshev2,
} from './view/render-set.js';

test('desktop RenderSet constants match the ratified budgets', () => {
  assert.equal(RENDER_RADIUS, 8); // GDD §13.5 desktop view radius
  assert.equal(UNLOAD_MARGIN, 2); // GDD §13.4 unload beyond radius+2
});

test('spiral offsets cover the full square exactly once, ring by ring outward', () => {
  const offsets = spiralOffsets(8);
  assert.equal(offsets.length, 17 * 17);
  assert.deepEqual(offsets[0], [0, 0], 'the anchor column loads first');
  const seen = new Set();
  let prevRing = 0;
  for (const [dx, dz] of offsets) {
    const ring = Math.max(Math.abs(dx), Math.abs(dz));
    assert.ok(ring >= prevRing, 'rings never regress: near chunks always load first');
    assert.ok(ring <= 8);
    prevRing = ring;
    seen.add(`${dx},${dz}`);
  }
  assert.equal(seen.size, 17 * 17, 'no duplicates');
});

test('spiral order is deterministic and euclidean-near-first inside each ring', () => {
  assert.deepEqual(spiralOffsets(3), spiralOffsets(3));
  const ringOne = spiralOffsets(1).slice(1); // the 8 ring-1 cells
  const d2 = ringOne.map(([dx, dz]) => dx * dx + dz * dz);
  // Edge-adjacent cells (d2 = 1) all come before diagonals (d2 = 2).
  assert.deepEqual(d2, [1, 1, 1, 1, 2, 2, 2, 2]);
});

test('columnsAround clamps to world bounds and keeps spiral order', () => {
  const bounds = { chunksX: 4, chunksZ: 4 };
  const columns = columnsAround(0, 0, 8, bounds);
  assert.equal(columns.length, 16, 'a 4x4 world yields exactly its 16 columns');
  assert.deepEqual(columns[0], [0, 0]);
  for (const [cx, cz] of columns) {
    assert.ok(cx >= 0 && cx < 4 && cz >= 0 && cz < 4);
  }
  // Distance from the anchor never regresses (Chebyshev rings).
  let prev = 0;
  for (const [cx, cz] of columns) {
    const d = chebyshev2(cx, cz, 0, 0);
    assert.ok(d >= prev);
    prev = d;
  }
});

test('an anchor outside the world still streams the nearest in-bounds columns', () => {
  const bounds = { chunksX: 4, chunksZ: 4 };
  const columns = columnsAround(-3, 2, 8, bounds);
  assert.ok(columns.length > 0);
  assert.deepEqual(columns[0], [0, 2], 'nearest in-bounds column first');
});

test('unload triggers strictly beyond radius + 2 — hysteresis against thrash', () => {
  assert.equal(shouldUnload(10, 0, 0, 0), false); // == radius + margin: keep
  assert.equal(shouldUnload(11, 0, 0, 0), true); // one past: unload
  assert.equal(shouldUnload(0, 11, 0, 0), true);
  assert.equal(shouldUnload(7, 7, 0, 0), false); // Chebyshev, not euclidean
  assert.equal(shouldUnload(4, 4, 4, 4), false);
  assert.equal(shouldUnload(4, 4, 4, 4, 0), false, 'same column never unloads');
  assert.equal(shouldUnload(7, 4, 4, 4, 0), true);
});
