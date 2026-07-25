import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createChunk, chunkGet, chunkSet, chunkIsUniform, chunkToPlain, chunkFromPlain, CHUNK_SIZE,
} from './sim/world/chunk.js';
import {
  generateChunk, columnHeight, cachePosition, spawnPosition, REGION,
} from './sim/world/worldgen.js';
import {
  createWorld, getBlock, setBlock, drainDirtySections, inRegionBlock,
} from './sim/world/world.js';
import { fromHex64 } from './sim/math/xxhash64.js';
import { RULESET } from './sim/constants.js';

const SEED_HEX = '00c0ffee00c0ffee';
const SEED = fromHex64(SEED_HEX);

test('chunk palette + bitpacked indices round-trip and repack', () => {
  const chunk = createChunk('air');
  assert.ok(chunkIsUniform(chunk));
  assert.equal(chunkGet(chunk, 0, 0, 0), 'air');
  assert.equal(chunkGet(chunk, 31, 31, 31), 'air');

  // Force palette growth 1 -> 2 -> 4 -> 5 entries (bits 0 -> 1 -> 2 -> 4).
  const ids = ['dirt', 'fieldstone', 'coal', 'worldbone'];
  const expected = new Map();
  for (let i = 0; i < ids.length; i += 1) {
    for (let n = 0; n < 64; n += 1) {
      const x = (i * 7 + n * 3) % CHUNK_SIZE;
      const y = (i * 11 + n * 5) % CHUNK_SIZE;
      const z = (i * 13 + n * 2) % CHUNK_SIZE;
      chunkSet(chunk, x, y, z, ids[i]);
      expected.set(`${x},${y},${z}`, ids[i]);
    }
  }
  assert.ok(!chunkIsUniform(chunk));
  for (const [key, id] of expected) {
    const [x, y, z] = key.split(',').map(Number);
    assert.equal(chunkGet(chunk, x, y, z), id);
  }
  // Untouched voxels survived every repack.
  assert.equal(chunkGet(chunk, 30, 1, 30), expected.get('30,1,30') ?? 'air');

  const copy = chunkFromPlain(JSON.parse(JSON.stringify(chunkToPlain(chunk))));
  for (let x = 0; x < CHUNK_SIZE; x += 4) {
    for (let y = 0; y < CHUNK_SIZE; y += 4) {
      for (let z = 0; z < CHUNK_SIZE; z += 4) {
        assert.equal(chunkGet(copy, x, y, z), chunkGet(chunk, x, y, z));
      }
    }
  }
});

test('worldgen is a pure function of (seed, chunk coords)', () => {
  const a = generateChunk(SEED, 1, 1, 2);
  const b = generateChunk(SEED, 1, 1, 2);
  assert.deepEqual(chunkToPlain(a), chunkToPlain(b));
  const other = generateChunk(fromHex64('0badc0de0badc0de'), 1, 1, 2);
  assert.notDeepEqual(chunkToPlain(a), chunkToPlain(other));
});

test('column heights stay inside the surface band', () => {
  for (let x = 0; x < REGION.blocksX; x += 11) {
    for (let z = 0; z < REGION.blocksZ; z += 13) {
      const h = columnHeight(SEED, x, z);
      assert.ok(h >= RULESET.heightMin && h < RULESET.heightMin + RULESET.heightRange,
        `height ${h} at ${x},${z}`);
    }
  }
});

test('terrain layers: worldbone floor, fieldstone core, dirt cap, coal veins', () => {
  const world = createWorld(SEED_HEX);
  assert.equal(getBlock(world, 40, 0, 40), 'worldbone');
  assert.equal(getBlock(world, 40, RULESET.worldboneDepth - 1, 40), 'worldbone');
  let sawCoal = false;
  let sawDirtCap = 0;
  for (let x = 4; x < REGION.blocksX; x += 3) {
    for (let z = 4; z < REGION.blocksZ; z += 3) {
      const h = columnHeight(SEED, x, z);
      if (getBlock(world, x, h - 1, z) === 'dirt') sawDirtCap += 1;
      assert.equal(getBlock(world, x, h + 1, z) === 'wardwall', false);
      for (let y = 10; y < h - RULESET.dirtDepth && !sawCoal; y += 1) {
        if (getBlock(world, x, y, z) === 'coal') sawCoal = true;
      }
    }
  }
  assert.ok(sawCoal, 'expected at least one coal vein in the region');
  assert.ok(sawDirtCap > 100, 'dirt should cap nearly every column');
});

test('the wardwall rings the region and the world has a floor and sky', () => {
  const world = createWorld(SEED_HEX);
  assert.equal(getBlock(world, -1, 40, 50), 'wardwall');
  assert.equal(getBlock(world, REGION.blocksX, 40, 50), 'wardwall');
  assert.equal(getBlock(world, 50, 40, -1), 'wardwall');
  assert.equal(getBlock(world, 50, 40, REGION.blocksZ), 'wardwall');
  assert.equal(getBlock(world, 50, -1, 50), 'worldbone');
  assert.equal(getBlock(world, 50, REGION.blocksY, 50), 'air');
});

test('spawn column is standable and the clan cache exists at its column', () => {
  const world = createWorld(SEED_HEX);
  const spawn = spawnPosition(SEED);
  assert.equal(getBlock(world, spawn.x, spawn.y, spawn.z), 'air');
  assert.equal(getBlock(world, spawn.x, spawn.y + 1, spawn.z), 'air');
  assert.equal(getBlock(world, spawn.x, spawn.y - 1, spawn.z), 'dirt');
  const cache = cachePosition(SEED);
  assert.equal(getBlock(world, cache.x, cache.y, cache.z), 'cache');
});

test('edits mark 16^3 mesh sections dirty, including boundary neighbors', () => {
  const world = createWorld(SEED_HEX);
  drainDirtySections(world); // clear generation noise (there is none, but be explicit)
  setBlock(world, 33, 40, 70, 'air'); // interior of section (2,2,4)
  let dirty = drainDirtySections(world);
  assert.deepEqual(dirty, ['2,2,4']);
  setBlock(world, 32, 40, 70, 'air'); // x on section boundary -> neighbor too
  dirty = drainDirtySections(world);
  assert.deepEqual(dirty, ['1,2,4', '2,2,4']);
  assert.deepEqual(drainDirtySections(world), []);
  assert.throws(() => setBlock(world, -1, 40, 70, 'air'));
  assert.ok(inRegionBlock(0, 0, 0));
  assert.ok(!inRegionBlock(REGION.blocksX, 0, 0));
});
