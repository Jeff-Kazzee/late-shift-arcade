// Named counter-based PRNG streams (DS-0 D2/D5).
//
// There is no sequential shared RNG anywhere in the sim. Each named stream is
// a pure function of (worldSeed, streamName, counter); its entire save state
// is the counter cursor. Draw N, save, restore, draw again: identical tail.
// "No stream, no save" — the stream table is part of save-shaped sim state.

import { hashAscii, hashInts } from './xxhash64.js';

// Plain serializable stream table: { name: counter }.
export function createStreams(names) {
  const table = {};
  for (const name of names) table[name] = 0;
  return table;
}

function streamKey(worldSeed, name) {
  return hashAscii(worldSeed, name);
}

// Draw the next u32 from a named stream. Mutates only the counter cursor.
export function nextU32(streams, worldSeed, name) {
  const counter = streams[name];
  if (counter === undefined) throw new Error(`unknown PRNG stream: ${name}`);
  streams[name] = counter + 1;
  const h = hashInts(streamKey(worldSeed, name), [counter | 0, floorHi(counter)]);
  return Number(h & 0xffffffffn);
}

// Uniform integer in [0, bound) via 64->32 bit hash + modulo. Bias is < 2^-20
// for every bound the sim uses (all < 4096) and identical on every engine.
export function nextInt(streams, worldSeed, name, bound) {
  if (!Number.isInteger(bound) || bound <= 0) throw new Error(`bad bound: ${bound}`);
  return nextU32(streams, worldSeed, name) % bound;
}

function floorHi(counter) {
  // Counters are ordinary integers; the high word only matters past 2^32
  // draws, but the encoding is fixed now so saves never re-interpret.
  return Math.floor(counter / 0x100000000) | 0;
}
