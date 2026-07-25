// xxHash64 over BigInt — the single hashing primitive of the DEEPSHIFT sim.
// Worldgen (GDD §5.2), named PRNG streams, ruleset hashing, and the per-tick
// hash chain all bottom out here. BigInt arithmetic is exact and identical on
// every JS engine and architecture, which is the whole point.

const MASK = (1n << 64n) - 1n;
const P1 = 11400714785074694791n;
const P2 = 14029467366897019727n;
const P3 = 1609587929392839161n;
const P4 = 9650029242287828579n;
const P5 = 2870177450012600261n;

function rotl(value, bits) {
  return ((value << bits) | (value >> (64n - bits))) & MASK;
}

function round(acc, lane) {
  acc = (acc + lane * P2) & MASK;
  acc = rotl(acc, 31n);
  return (acc * P1) & MASK;
}

function mergeRound(acc, lane) {
  acc = (acc ^ round(0n, lane)) & MASK;
  return ((acc * P1) & MASK) + P4 & MASK;
}

function readU64(bytes, offset) {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) value = (value << 8n) | BigInt(bytes[offset + i]);
  return value;
}

function readU32(bytes, offset) {
  return BigInt(
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) +
      bytes[offset + 3] * 0x1000000,
  );
}

// Canonical xxHash64 of a Uint8Array. Verified against the reference vectors.
export function xxh64(bytes, seed = 0n) {
  const length = bytes.length;
  let offset = 0;
  let hash;

  if (length >= 32) {
    let v1 = (seed + P1 + P2) & MASK;
    let v2 = (seed + P2) & MASK;
    let v3 = seed & MASK;
    let v4 = (seed - P1) & MASK;
    for (; offset + 32 <= length; offset += 32) {
      v1 = round(v1, readU64(bytes, offset));
      v2 = round(v2, readU64(bytes, offset + 8));
      v3 = round(v3, readU64(bytes, offset + 16));
      v4 = round(v4, readU64(bytes, offset + 24));
    }
    hash = (rotl(v1, 1n) + rotl(v2, 7n) + rotl(v3, 12n) + rotl(v4, 18n)) & MASK;
    hash = mergeRound(hash, v1);
    hash = mergeRound(hash, v2);
    hash = mergeRound(hash, v3);
    hash = mergeRound(hash, v4);
  } else {
    hash = (seed + P5) & MASK;
  }

  hash = (hash + BigInt(length)) & MASK;

  for (; offset + 8 <= length; offset += 8) {
    hash = (hash ^ round(0n, readU64(bytes, offset))) & MASK;
    hash = ((rotl(hash, 27n) * P1) & MASK) + P4 & MASK;
  }
  if (offset + 4 <= length) {
    hash = (hash ^ ((readU32(bytes, offset) * P1) & MASK)) & MASK;
    hash = ((rotl(hash, 23n) * P2) & MASK) + P3 & MASK;
    offset += 4;
  }
  for (; offset < length; offset += 1) {
    hash = (hash ^ ((BigInt(bytes[offset]) * P5) & MASK)) & MASK;
    hash = (rotl(hash, 11n) * P1) & MASK;
  }

  hash = (hash ^ (hash >> 33n)) & MASK;
  hash = (hash * P2) & MASK;
  hash = (hash ^ (hash >> 29n)) & MASK;
  hash = (hash * P3) & MASK;
  hash = (hash ^ (hash >> 32n)) & MASK;
  return hash;
}

// Hash a sequence of signed 32-bit integers (little-endian two's complement).
// This is the canonical integer-tuple hash used by worldgen
// (`hashInts(seed, [cx, cz, stageId])`), PRNG streams, and the hash chain.
export function hashInts(seed, ints) {
  const bytes = new Uint8Array(ints.length * 4);
  for (let i = 0; i < ints.length; i += 1) {
    const v = ints[i] | 0;
    bytes[i * 4] = v & 0xff;
    bytes[i * 4 + 1] = (v >>> 8) & 0xff;
    bytes[i * 4 + 2] = (v >>> 16) & 0xff;
    bytes[i * 4 + 3] = (v >>> 24) & 0xff;
  }
  return xxh64(bytes, seed);
}

// ASCII-only string hash (block ids, stream names are ASCII by construction).
// Hand-rolled encoder so the sim depends on no encoding global at all.
export function hashAscii(seed, text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) throw new Error(`non-ASCII in sim string: ${text}`);
    bytes[i] = code;
  }
  return xxh64(bytes, seed);
}

// Canonical 16-hex-char rendering of a 64-bit hash (GDD §5.2 seed display).
export function toHex64(value) {
  return value.toString(16).padStart(16, '0');
}

// Parse a 16-hex-char seed back to BigInt. Rejects anything else loudly —
// a mistyped seed must never silently become seed 0.
export function fromHex64(text) {
  if (typeof text !== 'string' || !/^[0-9a-fA-F]{1,16}$/.test(text)) {
    throw new Error(`invalid 64-bit hex seed: ${text}`);
  }
  return BigInt(`0x${text}`);
}
