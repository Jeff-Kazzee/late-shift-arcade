// The F-06 mesh-job snapshot contract (DS-0 D4, DS-1b Gate 1).
//
// A mesh job is an IMMUTABLE snapshot of one 16^3 section plus a one-voxel
// halo, stamped with the section's revision at capture time. Once captured
// it holds no reference to the live world: the world can be edited, the
// section remeshed, or the chunk unloaded, and the snapshot still meshes
// exactly the state it captured. Results carry the revision back so the
// scheduler can reject anything stale.
//
// PURE view-side code: no three, no DOM, no workers — importable headless.
// The worker (mesh-worker.js) and the inline fallback both call
// meshSnapshot(), so worker and non-worker paths are byte-identical by
// construction.

import { meshSection, SECTION_SIZE } from './mesher.js';

// Section + one-voxel halo per axis.
export const SNAPSHOT_SIZE = SECTION_SIZE + 2;

// Capture one section (with halo) as palette + Uint8Array indices.
// readBlock is world-coordinate voxel access; uniformId (when the caller
// knows the 16^3 interior is a single block id) skips the interior reads —
// only the halo shell still comes from readBlock.
export function snapshotSection(readBlock, sx, sy, sz, revision, uniformId = null) {
  const S = SNAPSHOT_SIZE;
  const bx = sx * SECTION_SIZE - 1;
  const by = sy * SECTION_SIZE - 1;
  const bz = sz * SECTION_SIZE - 1;
  const voxels = new Uint8Array(S * S * S);
  const palette = [];
  const paletteIndex = new Map();
  const idOf = (id) => {
    let i = paletteIndex.get(id);
    if (i === undefined) {
      i = palette.length;
      palette.push(id);
      paletteIndex.set(id, i);
    }
    return i;
  };

  if (uniformId !== null) {
    voxels.fill(idOf(uniformId));
    // Halo shell only: any cell with a coordinate on the snapshot boundary.
    for (let y = 0; y < S; y += 1) {
      for (let z = 0; z < S; z += 1) {
        for (let x = 0; x < S; x += 1) {
          if (y !== 0 && y !== S - 1 && z !== 0 && z !== S - 1 && x !== 0 && x !== S - 1) continue;
          voxels[(y * S + z) * S + x] = idOf(readBlock(bx + x, by + y, bz + z));
        }
      }
    }
  } else {
    let i = 0;
    for (let y = 0; y < S; y += 1) {
      for (let z = 0; z < S; z += 1) {
        for (let x = 0; x < S; x += 1) {
          voxels[i] = idOf(readBlock(bx + x, by + y, bz + z));
          i += 1;
        }
      }
    }
  }

  return {
    key: `${sx},${sy},${sz}`,
    sx, sy, sz,
    revision,
    palette,
    voxels,
    bytes: voxels.byteLength,
  };
}

// World-coordinate reader over a captured snapshot. Only coordinates inside
// the section+halo box are defined — exactly the set meshSection reads.
export function snapshotReader(snapshot) {
  const S = SNAPSHOT_SIZE;
  const bx = snapshot.sx * SECTION_SIZE - 1;
  const by = snapshot.sy * SECTION_SIZE - 1;
  const bz = snapshot.sz * SECTION_SIZE - 1;
  const { palette, voxels } = snapshot;
  return (x, y, z) => palette[voxels[((y - by) * S + (z - bz)) * S + (x - bx)]];
}

// Mesh a snapshot. Deterministic: byte-identical to meshing the live world
// the snapshot was captured from (asserted in mesh-jobs.test.js).
export function meshSnapshot(snapshot) {
  const mesh = meshSection(snapshotReader(snapshot), snapshot.sx, snapshot.sy, snapshot.sz);
  return {
    key: snapshot.key,
    sx: snapshot.sx,
    sy: snapshot.sy,
    sz: snapshot.sz,
    revision: snapshot.revision,
    positions: mesh.positions,
    colors: mesh.colors,
    indices: mesh.indices,
    quadCount: mesh.quadCount,
    bytes: mesh.positions.byteLength + mesh.colors.byteLength + mesh.indices.byteLength,
  };
}

// Transfer lists (browser postMessage): moving, not copying, the buffers.
export function snapshotTransferables(snapshot) {
  return [snapshot.voxels.buffer];
}

export function resultTransferables(result) {
  return [result.positions.buffer, result.colors.buffer, result.indices.buffer];
}
