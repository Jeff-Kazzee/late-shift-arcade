// DS-1b Gate 3: the scripted edit-churn harness. Deterministic mine/place
// bursts over a stress scene, biased hard toward SECTION-BOUNDARY
// coordinates so edits constantly dirty neighbor sections — the remesh
// path's adversarial case. Pure and headless: the same script drives the
// node correctness tests and the browser measurement page.

import { hashInts } from '../sim/math/xxhash64.js';

const SECTION = 16;

// The i-th churn op for a seed: deterministic, stateless, replayable.
// Half of all ops snap one horizontal coordinate onto a section-face cell
// (x%16 in {0,15} / z%16 in {0,15}), so both adjoining sections remesh.
export function churnOp(seed, i, center, spread) {
  const h = hashInts(seed, [0x0c48, i]);
  const bits = (shift, mod) => Number((h >> BigInt(shift)) % BigInt(mod));
  let x = center.x - spread + bits(0, 2 * spread);
  let y = center.y - 8 + bits(12, 16);
  let z = center.z - spread + bits(24, 2 * spread);
  const boundaryKind = bits(36, 4);
  if (boundaryKind === 0) x = x - (((x % SECTION) + SECTION) % SECTION); // x%16 == 0
  else if (boundaryKind === 1) x = x - (((x % SECTION) + SECTION) % SECTION) + (SECTION - 1);
  else if (boundaryKind === 2) z = z - (((z % SECTION) + SECTION) % SECTION); // z%16 == 0
  // boundaryKind 3: interior edit, left where it landed
  const place = bits(40, 2) === 0;
  return { x, y, z, id: place ? 'wardwall' : 'air' };
}

// Apply `opsPerBurst` ops as one burst (one sim-tick's worth of edits) and
// return the dirty section keys the burst produced. Ops are clamped inside
// the scene region so every dirtied section is meshable.
export function applyBurst(world, seed, burst, opsPerBurst, center, spread) {
  const region = world.snap.region;
  for (let i = 0; i < opsPerBurst; i += 1) {
    const op = churnOp(seed, burst * opsPerBurst + i, center, spread);
    const x = Math.min(Math.max(op.x, 1), region.blocksX - 2);
    const y = Math.min(Math.max(op.y, 1), region.blocksY - 2);
    const z = Math.min(Math.max(op.z, 1), region.blocksZ - 2);
    world.setBlock(x, y, z, op.id);
  }
  return world.drainDirty();
}
