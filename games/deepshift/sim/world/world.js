// The voxel world: a chunk map over seeded worldgen. Untouched chunks
// regenerate from seed; only generated chunks are held (and only edited
// chunks would need saving — GDD §5.1).
//
// Dirty-section tracking is renderer-facing bookkeeping (16^3 mesh sections,
// the meshing unit boundary of D4) and is never part of the authoritative
// hash — it is derived data a subscriber drains.

import { fromHex64 } from '../math/xxhash64.js';
import { floorDiv } from '../math/fixed.js';
import { CHUNK_SIZE, chunkGet, chunkSet } from './chunk.js';
import { generateChunk, REGION } from './worldgen.js';
import { RULESET } from '../constants.js';

const SECTION = RULESET.sectionSize;

// BigInt seeds are runtime-only (not JSON-serializable); state carries the
// canonical 16-hex string and this memo rehydrates it per world object.
const seedMemo = new WeakMap();

export function worldSeed(world) {
  let seed = seedMemo.get(world);
  if (seed === undefined) {
    seed = fromHex64(world.seedHex);
    seedMemo.set(world, seed);
  }
  return seed;
}

export function createWorld(seedHex) {
  return { seedHex, chunks: {}, dirty: {} };
}

export function chunkKey(cx, cy, cz) {
  return `${cx},${cy},${cz}`;
}

export function getChunk(world, cx, cy, cz) {
  const key = chunkKey(cx, cy, cz);
  let chunk = world.chunks[key];
  if (chunk === undefined) {
    chunk = generateChunk(worldSeed(world), cx, cy, cz);
    world.chunks[key] = chunk;
  }
  return chunk;
}

export function getBlock(world, x, y, z) {
  if (y < 0) return 'worldbone';
  if (y >= REGION.blocksY) return 'air';
  const cx = floorDiv(x, CHUNK_SIZE);
  const cy = floorDiv(y, CHUNK_SIZE);
  const cz = floorDiv(z, CHUNK_SIZE);
  const chunk = getChunk(world, cx, cy, cz);
  return chunkGet(chunk, x - cx * CHUNK_SIZE, y - cy * CHUNK_SIZE, z - cz * CHUNK_SIZE);
}

export function inRegionBlock(x, y, z) {
  return x >= 0 && x < REGION.blocksX && y >= 0 && y < REGION.blocksY && z >= 0 && z < REGION.blocksZ;
}

function markDirty(world, x, y, z) {
  const sx = floorDiv(x, SECTION);
  const sy = floorDiv(y, SECTION);
  const sz = floorDiv(z, SECTION);
  world.dirty[`${sx},${sy},${sz}`] = true;
  // An edit on a section face changes the neighbor's visible faces too.
  if (x - sx * SECTION === 0) world.dirty[`${sx - 1},${sy},${sz}`] = true;
  if (x - sx * SECTION === SECTION - 1) world.dirty[`${sx + 1},${sy},${sz}`] = true;
  if (y - sy * SECTION === 0) world.dirty[`${sx},${sy - 1},${sz}`] = true;
  if (y - sy * SECTION === SECTION - 1) world.dirty[`${sx},${sy + 1},${sz}`] = true;
  if (z - sz * SECTION === 0) world.dirty[`${sx},${sy},${sz - 1}`] = true;
  if (z - sz * SECTION === SECTION - 1) world.dirty[`${sx},${sy},${sz + 1}`] = true;
}

// Authoritative edit. Throws outside the region — rules must validate first;
// reaching here with a bad coordinate is a sim bug, not a player mistake.
export function setBlock(world, x, y, z, id) {
  if (!inRegionBlock(x, y, z)) throw new Error(`setBlock outside region: ${x},${y},${z}`);
  const cx = floorDiv(x, CHUNK_SIZE);
  const cy = floorDiv(y, CHUNK_SIZE);
  const cz = floorDiv(z, CHUNK_SIZE);
  const chunk = getChunk(world, cx, cy, cz);
  chunkSet(chunk, x - cx * CHUNK_SIZE, y - cy * CHUNK_SIZE, z - cz * CHUNK_SIZE, id);
  markDirty(world, x, y, z);
}

// Renderer-facing: sorted section keys touched since the last drain.
export function drainDirtySections(world) {
  const keys = Object.keys(world.dirty).sort();
  world.dirty = {};
  return keys;
}
