// 32^3 storage chunks: per-chunk palette of block-state ids + bit-packed
// indices (GDD §13.3). A uniform chunk is a single-entry palette with no
// index array at all. Chunks are plain serializable data: strings, numbers,
// and one Uint32Array (structured-clone/IndexedDB safe; `chunkToPlain`
// flattens it for JSON transport).

export const CHUNK_SIZE = 32;
export const CHUNK_VOXELS = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

// Canonical voxel order: index = ((y * 32) + z) * 32 + x.
export function voxelIndex(x, y, z) {
  return (((y << 5) | z) << 5) | x;
}

export function createChunk(fillId = 'air') {
  return { palette: [fillId], bits: 0, data: null };
}

// Palette sizes map to index widths that pack cleanly into 32-bit words.
function bitsFor(paletteLength) {
  if (paletteLength <= 1) return 0;
  if (paletteLength <= 2) return 1;
  if (paletteLength <= 4) return 2;
  if (paletteLength <= 16) return 4;
  if (paletteLength <= 256) return 8;
  return 16;
}

function readIndex(chunk, i) {
  if (chunk.bits === 0) return 0;
  const per = 32 / chunk.bits;
  const word = chunk.data[(i / per) | 0];
  const shift = (i % per) * chunk.bits;
  return (word >>> shift) & ((1 << chunk.bits) - 1);
}

function writeIndex(chunk, i, value) {
  const per = 32 / chunk.bits;
  const w = (i / per) | 0;
  const shift = (i % per) * chunk.bits;
  const mask = ((1 << chunk.bits) - 1) << shift;
  chunk.data[w] = ((chunk.data[w] & ~mask) | (value << shift)) >>> 0;
}

function repack(chunk, newBits) {
  const nextData = new Uint32Array((CHUNK_VOXELS * newBits) / 32 || 1);
  const old = { palette: chunk.palette, bits: chunk.bits, data: chunk.data };
  const staged = { palette: chunk.palette, bits: newBits, data: nextData };
  for (let i = 0; i < CHUNK_VOXELS; i += 1) {
    const v = readIndex(old, i);
    if (v !== 0) writeIndex(staged, i, v);
  }
  chunk.bits = newBits;
  chunk.data = nextData;
}

export function chunkGet(chunk, x, y, z) {
  return chunk.palette[readIndex(chunk, voxelIndex(x, y, z))];
}

export function chunkSet(chunk, x, y, z, id) {
  let pi = chunk.palette.indexOf(id);
  if (pi === -1) {
    chunk.palette.push(id);
    pi = chunk.palette.length - 1;
    const need = bitsFor(chunk.palette.length);
    if (need > chunk.bits) repack(chunk, need);
  }
  writeIndex(chunk, voxelIndex(x, y, z), pi);
}

export function chunkIsUniform(chunk) {
  return chunk.bits === 0;
}

// JSON-safe form (palette of string ids + plain word array), and back.
export function chunkToPlain(chunk) {
  return {
    palette: chunk.palette.slice(),
    bits: chunk.bits,
    data: chunk.data === null ? null : Array.from(chunk.data),
  };
}

export function chunkFromPlain(plain) {
  return {
    palette: plain.palette.slice(),
    bits: plain.bits,
    data: plain.data === null ? null : Uint32Array.from(plain.data),
  };
}
