// Seeded per-chunk Dusklands worldgen (GDD §5, DS-1c slice). Every block is
// a pure function of (seed, coordinates, stageId) via xxhash64 — no shared
// sequential RNG, so any chunk generates identically in isolation and in
// any order (§5.2, mandatory for workers).
//
// The Dusklands (§5.4 baseline): rolling nightgrass plains over dirt over
// fieldstone, scattered gnarlpine, sand/gravel patches, coal and copper
// veins, and SURFACE ORE OUTCROPS — the DS-1c form of §5.2's solvability
// guarantee ("quota ore within reach"): a 1-in-2 chance per 16x16 lattice
// cell of a visible 2x2x2 vein breaking the turf. A wardwall ring stands on
// the region border columns; worldbone floors everything.

import { RULESET } from '../constants.js';
import { hashInts } from '../math/xxhash64.js';
import { floorDiv } from '../math/fixed.js';
import { createChunk, chunkSet, chunkGet, CHUNK_SIZE } from './chunk.js';

const STAGE_HEIGHT = 1;
const STAGE_COAL = 2;
const STAGE_COPPER = 3;
const STAGE_OUTCROP = 4;
const STAGE_TREE = 5;
const STAGE_PATCH = 6;
const STAGE_HEIGHT2 = 7;

export const REGION = Object.freeze({
  chunksX: RULESET.regionChunksX,
  chunksY: RULESET.regionChunksY,
  chunksZ: RULESET.regionChunksZ,
  blocksX: RULESET.regionChunksX * CHUNK_SIZE,
  blocksY: RULESET.regionChunksY * CHUNK_SIZE,
  blocksZ: RULESET.regionChunksZ * CHUNK_SIZE,
});

const WALL_TOP = 96; // wardwall ring height; also the all-air ceiling
const TREE_MARGIN = 2; // canopy radius: roots this far outside still reach in

// The player spawn column and the clan cache column are fixed
// region-relative constants; their heights come from the same pure function
// as everything else, so every chunk that needs them can compute them alone.
export const SPAWN_COLUMN = Object.freeze({ x: REGION.blocksX / 2, z: REGION.blocksZ / 2 });
export const CACHE_COLUMN = Object.freeze({ x: REGION.blocksX / 2 + 2, z: REGION.blocksZ / 2 });

// Pure-function memo (worldgen is hot: streaming meshes the whole region).
// Memoizing a pure function is observationally invisible; the cap only
// bounds memory across many-seed test runs.
const memo = new Map();
function memoized(key, compute) {
  let v = memo.get(key);
  if (v === undefined) {
    v = compute();
    if (memo.size > 200000) memo.clear();
    memo.set(key, v);
  }
  return v;
}

function latticeHeight(seed, stage, lx, lz, range) {
  return memoized(`h:${seed}:${stage}:${lx},${lz}`, () => {
    const h = hashInts(hashInts(seed, [stage]), [lx, lz]);
    return Number(h % BigInt(range));
  });
}

function bilinear(seed, stage, x, z, step, range) {
  const lx = floorDiv(x, step);
  const lz = floorDiv(z, step);
  const fx = x - lx * step;
  const fz = z - lz * step;
  const h00 = latticeHeight(seed, stage, lx, lz, range);
  const h10 = latticeHeight(seed, stage, lx + 1, lz, range);
  const h01 = latticeHeight(seed, stage, lx, lz + 1, range);
  const h11 = latticeHeight(seed, stage, lx + 1, lz + 1, range);
  const top = (step - fx) * ((step - fz) * h00 + fz * h01) + fx * ((step - fz) * h10 + fz * h11);
  return floorDiv(top, step * step);
}

// Two-octave integer value noise: the surface height of a column (the
// first AIR cell; the nightgrass turf sits at h-1). Pure (seed, x, z).
export function columnHeight(seed, x, z) {
  return memoized(`c:${seed}:${x},${z}`, () => RULESET.heightMin
    + bilinear(seed, STAGE_HEIGHT, x, z, RULESET.heightLatticeStep, RULESET.heightRange)
    + bilinear(seed, STAGE_HEIGHT2, x, z, RULESET.heightLatticeStep2, RULESET.heightRange2));
}

export function cachePosition(seed) {
  const y = columnHeight(seed, CACHE_COLUMN.x, CACHE_COLUMN.z);
  return { x: CACHE_COLUMN.x, y, z: CACHE_COLUMN.z };
}

export function spawnPosition(seed) {
  const y = columnHeight(seed, SPAWN_COLUMN.x, SPAWN_COLUMN.z);
  return { x: SPAWN_COLUMN.x, y, z: SPAWN_COLUMN.z };
}

// --- sand / gravel patches (§6.1): circular blobs on a 16x16 lattice ---

const PATCH_RADIUS2 = 25;

// 'sand' | 'gravel' | null for the 16x16 patch lattice cell.
export function patchAt(seed, cellX, cellZ) {
  return memoized(`p:${seed}:${cellX},${cellZ}`, () => {
    const h = hashInts(hashInts(seed, [STAGE_PATCH]), [cellX, cellZ]);
    if (h % BigInt(RULESET.sandPatchChance) === 0n) return 'sand';
    if (h % BigInt(RULESET.gravelPatchChance) === 1n) return 'gravel';
    return null;
  });
}

function patchMaterial(seed, x, z) {
  const size = RULESET.outcropCellSize;
  const cellX = floorDiv(x, size);
  const cellZ = floorDiv(z, size);
  const kind = patchAt(seed, cellX, cellZ);
  if (kind === null) return null;
  const dx = x - (cellX * size + size / 2);
  const dz = z - (cellZ * size + size / 2);
  return dx * dx + dz * dz <= PATCH_RADIUS2 ? kind : null;
}

// --- surface outcrops: the reachable-quota guarantee ---

// One optional outcrop per 16x16 lattice cell: { x, z, material } giving
// the min corner of a 2x2 footprint, 3 deep (12 ore), whose top replaces
// the turf. Richer than a buried §6.4 vein on purpose: outcrops are the
// solvability device that makes the 300-value quota honestly reachable
// inside a 9:30 run.
export function outcropAt(seed, cellX, cellZ) {
  return memoized(`o:${seed}:${cellX},${cellZ}`, () => {
    const h = hashInts(hashInts(seed, [STAGE_OUTCROP]), [cellX, cellZ]);
    if (h % BigInt(RULESET.outcropChance) !== 0n) return null;
    const bits = Number((h >> 8n) & 0xffffffn);
    const size = RULESET.outcropCellSize;
    return {
      x: cellX * size + (bits % (size - 2)),
      z: cellZ * size + (((bits >> 8) & 0xff) % (size - 2)),
      material: ((bits >> 16) & 0xff) % 10 < 7 ? 'copper_ore' : 'coal_ore', // 70/30 copper
    };
  });
}

function outcropMaterial(seed, x, z) {
  const size = RULESET.outcropCellSize;
  // A 2x2 footprint can straddle a cell edge only if placed at size-2, and
  // placement is clamped to size-2, so only this column's own cell and the
  // one to the -x/-z side can reach it; checking the 2x2 cell neighborhood
  // is exhaustive.
  for (let dz = -1; dz <= 0; dz += 1) {
    for (let dx = -1; dx <= 0; dx += 1) {
      const o = outcropAt(seed, floorDiv(x, size) + dx, floorDiv(z, size) + dz);
      if (o !== null && x >= o.x && x <= o.x + 1 && z >= o.z && z <= o.z + 1) return o.material;
    }
  }
  return null;
}

// --- buried veins (§6.4 bands, rescaled to the DS-1c region) ---

function veinOf(seed, stage, chance, cellX, cellY, cellZ) {
  const h = hashInts(hashInts(seed, [stage]), [cellX, cellY, cellZ]);
  if (h % BigInt(chance) !== 0n) return null;
  const bits = Number((h >> 8n) & 0xffffffn);
  const size = RULESET.oreCellSize;
  return {
    x: cellX * size + (bits % (size - 1)),
    y: cellY * size + (((bits >> 8) & 0xff) % (size - 1)),
    z: cellZ * size + (((bits >> 16) & 0xff) % (size - 1)),
  };
}

// --- gnarlpine (scattered, §5.4): one optional root per 8x8 lattice cell ---

const TREE_CELL = 8;

// { x, z, len } | null for the 8x8 tree lattice cell. Filters (border,
// spawn clearing, sand patches, outcrops) are applied here so a returned
// root is always a real tree.
export function treeAt(seed, cellX, cellZ) {
  return memoized(`t:${seed}:${cellX},${cellZ}`, () => {
    const h = hashInts(hashInts(seed, [STAGE_TREE]), [cellX, cellZ]);
    if (h % BigInt(RULESET.treeCellChance) !== 0n) return null; // ~1 tree per 192 columns
    const bits = Number((h >> 8n) & 0xffffffn);
    const x = cellX * TREE_CELL + (bits % TREE_CELL);
    const z = cellZ * TREE_CELL + (((bits >> 8) & 0xff) % TREE_CELL);
    if (x < 4 || z < 4 || x >= REGION.blocksX - 4 || z >= REGION.blocksZ - 4) return null;
    const dx = x - SPAWN_COLUMN.x;
    const dz = z - SPAWN_COLUMN.z;
    if (dx >= -4 && dx <= 6 && dz >= -4 && dz <= 4) return null; // spawn/cache clearing
    if (patchMaterial(seed, x, z) !== null) return null; // no trees on sand
    if (outcropMaterial(seed, x, z) !== null) return null;
    return { x, z, len: 4 + (((bits >> 16) & 0xff) % 2) }; // trunk 4-5
  });
}

function inRegionChunk(cx, cy, cz) {
  return (
    cx >= 0 && cx < REGION.chunksX &&
    cy >= 0 && cy < REGION.chunksY &&
    cz >= 0 && cz < REGION.chunksZ
  );
}

// Stamp one tree rooted at (rx, rz) into the chunk at (cx, cy, cz).
// Leaves fill only air; the trunk overwrites air and leaves.
function stampTree(seed, chunk, cx, cy, cz, rx, rz, len) {
  const h = columnHeight(seed, rx, rz);
  const top = h + len - 1;
  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  const put = (wx, wy, wz, id, overwriteLeaves) => {
    const x = wx - baseX;
    const y = wy - baseY;
    const z = wz - baseZ;
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    const existing = chunkGet(chunk, x, y, z);
    if (existing === 'air' || (overwriteLeaves && existing === 'gnarlpine_leaves')) {
      chunkSet(chunk, x, y, z, id);
    }
  };
  // Canopy: two 5x5 layers (clipped corners), a 3x3 layer, and a cap.
  for (let ly = top - 1; ly <= top; ly += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        if (Math.abs(dx) + Math.abs(dz) > 3) continue;
        put(rx + dx, ly, rz + dz, 'gnarlpine_leaves', false);
      }
    }
  }
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      put(rx + dx, top + 1, rz + dz, 'gnarlpine_leaves', false);
    }
  }
  put(rx, top + 2, rz, 'gnarlpine_leaves', false);
  for (let wy = h; wy <= top; wy += 1) put(rx, wy, rz, 'gnarlpine_log', true);
}

// Generate one 32^3 chunk. Pure: (seed, cx, cy, cz) -> chunk.
export function generateChunk(seed, cx, cy, cz) {
  if (!inRegionChunk(cx, cy, cz)) {
    if (cy < 0) return createChunk('worldbone');
    if (cy >= REGION.chunksY) return createChunk('air');
    return createChunk('wardwall'); // beyond the ring: solid ward
  }
  if (cy * CHUNK_SIZE >= WALL_TOP) return createChunk('air'); // above everything

  const chunk = createChunk('air');
  const cache = cachePosition(seed);
  const cellSize = RULESET.oreCellSize;
  const veins = new Map(); // per-chunk memo: `${stage}:${key}` -> vein|null
  const veinAt = (stage, chance, wx, wy, wz) => {
    const cellX = floorDiv(wx, cellSize);
    const cellY = floorDiv(wy, cellSize);
    const cellZ = floorDiv(wz, cellSize);
    const key = `${stage}:${cellX},${cellY},${cellZ}`;
    let vein = veins.get(key);
    if (vein === undefined) {
      vein = veinOf(seed, stage, chance, cellX, cellY, cellZ);
      veins.set(key, vein);
    }
    return vein !== null &&
      wx >= vein.x && wx <= vein.x + 1 &&
      wy >= vein.y && wy <= vein.y + 1 &&
      wz >= vein.z && wz <= vein.z + 1;
  };

  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const border = wx === 0 || wz === 0 || wx === REGION.blocksX - 1 || wz === REGION.blocksZ - 1;
      const h = columnHeight(seed, wx, wz);
      const patch = patchMaterial(seed, wx, wz);
      const outcrop = outcropMaterial(seed, wx, wz);
      for (let y = 0; y < CHUNK_SIZE; y += 1) {
        const wy = cy * CHUNK_SIZE + y;
        let id = null;
        if (wy < RULESET.worldboneDepth) {
          id = 'worldbone';
        } else if (border) {
          if (wy < WALL_TOP) id = 'wardwall';
        } else if (outcrop !== null && wy >= h - 3 && wy <= h - 1) {
          id = outcrop; // the visible vein breaking the turf
        } else if (wy < h - RULESET.dirtDepth - 1) {
          id = 'fieldstone';
          if (wy >= RULESET.copperMinY && wy <= RULESET.copperMaxY &&
              veinAt(STAGE_COPPER, RULESET.copperChance, wx, wy, wz)) {
            id = 'copper_ore';
          } else if (wy >= RULESET.coalMinY &&
              veinAt(STAGE_COAL, RULESET.coalChance, wx, wy, wz)) {
            id = 'coal_ore';
          }
        } else if (wy < h - 1) {
          id = patch ?? 'dirt';
        } else if (wy === h - 1) {
          id = patch ?? 'nightgrass';
        } else if (wx === cache.x && wz === cache.z && wy === cache.y) {
          id = 'clan_cache';
        }
        if (id !== null) chunkSet(chunk, x, y, z, id);
      }
    }
  }

  // Trees whose canopy can reach this chunk (roots up to TREE_MARGIN
  // outside its column footprint), stamped deterministically in cell order.
  if (cy * CHUNK_SIZE <= WALL_TOP) {
    const cell0X = floorDiv(cx * CHUNK_SIZE - TREE_MARGIN, TREE_CELL);
    const cell1X = floorDiv((cx + 1) * CHUNK_SIZE + TREE_MARGIN - 1, TREE_CELL);
    const cell0Z = floorDiv(cz * CHUNK_SIZE - TREE_MARGIN, TREE_CELL);
    const cell1Z = floorDiv((cz + 1) * CHUNK_SIZE + TREE_MARGIN - 1, TREE_CELL);
    for (let tz = cell0Z; tz <= cell1Z; tz += 1) {
      for (let tx = cell0X; tx <= cell1X; tx += 1) {
        const tree = treeAt(seed, tx, tz);
        if (tree !== null) stampTree(seed, chunk, cx, cy, cz, tree.x, tree.z, tree.len);
      }
    }
  }
  return chunk;
}
