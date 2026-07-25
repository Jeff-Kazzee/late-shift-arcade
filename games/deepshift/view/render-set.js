// RenderSet geometry (DS-1b Gate 2): which chunks a DESKTOP renderer
// streams, in what order, and when they unload.
//
// D1 discipline: this is DEVICE-LOCAL presentation policy. Nothing here is
// imported by sim/ (test-enforced), nothing here can express a residency
// opinion — authoritative activation stays SIM_RADIUS 3 regardless of what
// these functions return. Frozen-but-visible chunks are the normal case.
//
// Radii are horizontal Chebyshev distances on the chunk-column lattice
// (GDD §13.5 "view radius (chunks)"); a column loads all its vertical
// chunks within the world bounds. Load order is a spiral: ring by ring
// outward, near-first inside each ring, deterministic throughout (§13.4).

export const RENDER_RADIUS = 8; // desktop column radius (GDD §13.5)
export const UNLOAD_MARGIN = 2; // unload beyond radius + 2 (GDD §13.4)

const spiralMemo = new Map();

// Deterministic spiral offsets: all (dx, dz) with Chebyshev distance <=
// radius, ordered by ring, then squared euclidean distance, then dx, dz.
export function spiralOffsets(radius) {
  let offsets = spiralMemo.get(radius);
  if (offsets !== undefined) return offsets;
  offsets = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      offsets.push([dx, dz]);
    }
  }
  offsets.sort((a, b) => {
    const ringA = Math.max(Math.abs(a[0]), Math.abs(a[1]));
    const ringB = Math.max(Math.abs(b[0]), Math.abs(b[1]));
    if (ringA !== ringB) return ringA - ringB;
    const dA = a[0] * a[0] + a[1] * a[1];
    const dB = b[0] * b[0] + b[1] * b[1];
    if (dA !== dB) return dA - dB;
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });
  Object.freeze(offsets);
  spiralMemo.set(radius, offsets);
  return offsets;
}

export function chebyshev2(cx, cz, ax, az) {
  return Math.max(Math.abs(cx - ax), Math.abs(cz - az));
}

// Chunk columns to stream around an anchor column, spiral order, clamped
// to world bounds { chunksX, chunksZ }. Returns [cx, cz] pairs.
export function columnsAround(anchorCx, anchorCz, radius, bounds) {
  const out = [];
  for (const [dx, dz] of spiralOffsets(radius)) {
    const cx = anchorCx + dx;
    const cz = anchorCz + dz;
    if (cx < 0 || cx >= bounds.chunksX) continue;
    if (cz < 0 || cz >= bounds.chunksZ) continue;
    out.push([cx, cz]);
  }
  return out;
}

// True when a resident column has fallen outside the keep radius and must
// unload (radius + UNLOAD_MARGIN hysteresis so the boundary does not thrash).
export function shouldUnload(cx, cz, anchorCx, anchorCz, radius = RENDER_RADIUS) {
  return chebyshev2(cx, cz, anchorCx, anchorCz) > radius + UNLOAD_MARGIN;
}
