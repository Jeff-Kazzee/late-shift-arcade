// D1 — simulation activation as a memoryless pure function.
//
// ActiveSet(tick) is a function of the authoritative anchor positions and
// nothing else: no camera, no frame rate, no device class, no visited-chunk
// history. Distance is integer Chebyshev on the chunk lattice with radius
// RULESET.simRadius (a ruleset constant, in the ruleset hash). No floats,
// no libm, anywhere in this file — every operation is integer compare,
// add, and abs.
//
// Provinces (Runewire regions, none exist yet in DS-1a gameplay but the
// relation ships now per D5): a province is active iff EVERY chunk of the
// province is inside ActiveSet, and admission over MAX_ACTIVE_PROVINCES is
// deterministic — nearest province to any anchor first, ties broken by
// ascending province id.

import { RULESET } from './constants.js';
import { chebyshev3 } from './math/fixed.js';

function compareChunks(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// anchors: [{cx, cy, cz}] integer chunk coordinates of authoritative anchors.
// Returns the canonical sorted list of active chunk coords [[cx,cy,cz],...].
export function computeActiveSet(anchors, radius = RULESET.simRadius) {
  const seen = new Set();
  const out = [];
  for (const anchor of anchors) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          const cx = anchor.cx + dx;
          const cy = anchor.cy + dy;
          const cz = anchor.cz + dz;
          const key = `${cx},${cy},${cz}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push([cx, cy, cz]);
          }
        }
      }
    }
  }
  out.sort(compareChunks);
  return out;
}

export function activeSetHas(activeSet, cx, cy, cz) {
  // Binary search over the canonical sorted list — integer compares only.
  let lo = 0;
  let hi = activeSet.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = compareChunks(activeSet[mid], [cx, cy, cz]);
    if (c === 0) return true;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

// provinces: [{id (integer), chunks: [[cx,cy,cz],...]}].
// Returns { activeProvinceIds: ascending ids, admitted: admission order }.
export function computeActiveProvinces(
  anchors,
  provinces,
  radius = RULESET.simRadius,
  maxActive = RULESET.maxActiveProvinces,
) {
  const activeSet = computeActiveSet(anchors, radius);
  const candidates = [];
  for (const province of provinces) {
    if (province.chunks.length === 0) continue;
    let every = true;
    let distance = Infinity;
    for (const [cx, cy, cz] of province.chunks) {
      if (!activeSetHas(activeSet, cx, cy, cz)) {
        every = false;
        break;
      }
      for (const anchor of anchors) {
        const d = chebyshev3(cx, cy, cz, anchor.cx, anchor.cy, anchor.cz);
        if (d < distance) distance = d;
      }
    }
    if (every) candidates.push({ id: province.id, distance });
  }
  // Admission: nearest first, then ascending id. Both keys are integers.
  candidates.sort((a, b) => a.distance - b.distance || a.id - b.id);
  const admitted = candidates.slice(0, maxActive).map((c) => c.id);
  return {
    activeSet,
    admitted,
    activeProvinceIds: admitted.slice().sort((a, b) => a - b),
  };
}
