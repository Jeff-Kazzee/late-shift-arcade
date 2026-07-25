// Seeded per-chunk worldgen (GDD §5.2): every block is a pure function of
// (seed, coordinates, stageId) via xxhash64 — no shared sequential RNG, so
// any chunk generates identically in isolation and in any order.
//
// DS-1a content is deliberately tiny: a dirt-over-fieldstone heightfield in
// the surface band, coal veins, worldbone floor, a wardwall ring at the
// region edge, and the clan cache block at a deterministic column.

import { RULESET } from '../constants.js';
import { hashInts } from '../math/xxhash64.js';
import { floorDiv } from '../math/fixed.js';
import { createChunk, chunkSet, CHUNK_SIZE } from './chunk.js';

const STAGE_HEIGHT = 1;
const STAGE_ORE = 2;

export const REGION = Object.freeze({
  chunksX: RULESET.regionChunksX,
  chunksY: RULESET.regionChunksY,
  chunksZ: RULESET.regionChunksZ,
  blocksX: RULESET.regionChunksX * CHUNK_SIZE,
  blocksY: RULESET.regionChunksY * CHUNK_SIZE,
  blocksZ: RULESET.regionChunksZ * CHUNK_SIZE,
});

// The player spawn column and the clan cache column (bank target) are fixed
// region-relative constants; their heights come from the same pure function
// as everything else, so every chunk that needs them can compute them alone.
export const SPAWN_COLUMN = Object.freeze({ x: REGION.blocksX / 2, z: REGION.blocksZ / 2 });
export const CACHE_COLUMN = Object.freeze({ x: REGION.blocksX / 2 + 2, z: REGION.blocksZ / 2 });

function latticeHeight(seed, lx, lz) {
  const h = hashInts(hashInts(seed, [STAGE_HEIGHT]), [lx, lz]);
  return RULESET.heightMin + Number(h % BigInt(RULESET.heightRange));
}

// Bilinear value noise on an integer lattice, floor-rounded — the surface
// height of a column. Pure function of (seed, x, z).
export function columnHeight(seed, x, z) {
  const step = RULESET.heightLatticeStep;
  const lx = floorDiv(x, step);
  const lz = floorDiv(z, step);
  const fx = x - lx * step;
  const fz = z - lz * step;
  const h00 = latticeHeight(seed, lx, lz);
  const h10 = latticeHeight(seed, lx + 1, lz);
  const h01 = latticeHeight(seed, lx, lz + 1);
  const h11 = latticeHeight(seed, lx + 1, lz + 1);
  const top = (step - fx) * ((step - fz) * h00 + fz * h01) + fx * ((step - fz) * h10 + fz * h11);
  return floorDiv(top, step * step);
}

export function cachePosition(seed) {
  const y = columnHeight(seed, CACHE_COLUMN.x, CACHE_COLUMN.z);
  return { x: CACHE_COLUMN.x, y, z: CACHE_COLUMN.z };
}

export function spawnPosition(seed) {
  const y = columnHeight(seed, SPAWN_COLUMN.x, SPAWN_COLUMN.z);
  return { x: SPAWN_COLUMN.x, y, z: SPAWN_COLUMN.z };
}

// Coal veins: per 8^3 ore cell, one hash decides carrier and offset; a vein
// is a 2^3 cluster replacing would-be fieldstone.
function veinOf(seed, cellX, cellY, cellZ) {
  const h = hashInts(hashInts(seed, [STAGE_ORE]), [cellX, cellY, cellZ]);
  if (h % BigInt(RULESET.oreChance) !== 0n) return null;
  const bits = Number((h >> 8n) & 0xffffffn);
  const size = RULESET.oreCellSize;
  return {
    x: cellX * size + (bits % (size - 1)),
    y: cellY * size + (((bits >> 8) & 0xff) % (size - 1)),
    z: cellZ * size + (((bits >> 16) & 0xff) % (size - 1)),
  };
}

function inRegion(cx, cy, cz) {
  return (
    cx >= 0 && cx < REGION.chunksX &&
    cy >= 0 && cy < REGION.chunksY &&
    cz >= 0 && cz < REGION.chunksZ
  );
}

// Generate one 32^3 chunk. Pure: (seed, cx, cy, cz) -> chunk.
export function generateChunk(seed, cx, cy, cz) {
  if (!inRegion(cx, cy, cz)) {
    if (cy < 0) return createChunk('worldbone');
    if (cy >= REGION.chunksY) return createChunk('air');
    return createChunk('wardwall'); // the impassable ring
  }

  const chunk = createChunk('air');
  const cache = cachePosition(seed);
  const cellSize = RULESET.oreCellSize;
  const veins = new Map(); // ore-cell key -> vein or null, per-chunk memo

  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = columnHeight(seed, wx, wz);
      for (let y = 0; y < CHUNK_SIZE; y += 1) {
        const wy = cy * CHUNK_SIZE + y;
        let id = null;
        if (wy < RULESET.worldboneDepth) {
          id = 'worldbone';
        } else if (wy < h - RULESET.dirtDepth) {
          id = 'fieldstone';
          const cellX = floorDiv(wx, cellSize);
          const cellY = floorDiv(wy, cellSize);
          const cellZ = floorDiv(wz, cellSize);
          const key = `${cellX},${cellY},${cellZ}`;
          let vein = veins.get(key);
          if (vein === undefined) {
            vein = veinOf(seed, cellX, cellY, cellZ);
            veins.set(key, vein);
          }
          if (
            vein !== null &&
            wx >= vein.x && wx <= vein.x + 1 &&
            wy >= vein.y && wy <= vein.y + 1 &&
            wz >= vein.z && wz <= vein.z + 1
          ) {
            id = 'coal';
          }
        } else if (wy < h) {
          id = 'dirt';
        } else if (wx === cache.x && wz === cache.z && wy === cache.y) {
          id = 'cache';
        }
        if (id !== null) chunkSet(chunk, x, y, z, id);
      }
    }
  }
  return chunk;
}
