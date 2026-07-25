// Greedy meshing per 16^3 section, opaque bucket only (DS-0 D4 Gate 3).
//
// PURE view-side geometry: no three import, no DOM — importable and
// testable headless. Input is the sim's read-only voxel view; output is
// plain typed arrays. Deterministic: identical world state produces
// byte-identical buffers, which is how the WorldView rebuild seam is
// tested (GDD §17 DS-0).

export const SECTION_SIZE = 16;

// View-side block colors (linear-ish RGB). Solid blocks only — an id
// missing here is not part of the opaque bucket.
export const BLOCK_COLORS = Object.freeze({
  dirt: [0.478, 0.353, 0.227],
  fieldstone: [0.545, 0.561, 0.580],
  coal: [0.184, 0.192, 0.212],
  worldbone: [0.078, 0.078, 0.098],
  wardwall: [0.902, 0.757, 0.494],
  cache: [1.0, 0.78, 0.35],
});

// Baked directional shade per axis [positive-face, negative-face]:
// sun-lit tops, dim bottoms, two side levels for shape readability.
const FACE_SHADE = [
  [0.80, 0.80], // +x / -x
  [1.00, 0.45], // +y / -y
  [0.62, 0.62], // +z / -z
];

export function isOpaque(id) {
  return Object.hasOwn(BLOCK_COLORS, id);
}

// BLOCK_COLORS are authored as display (sRGB) values; vertex colors feed
// the renderer's linear pipeline, so convert once here (gamma 2.2 approx).
// View-side floats — determinism of the sim is untouched.
const LINEAR_COLORS = Object.fromEntries(
  Object.entries(BLOCK_COLORS).map(([id, c]) => [id, c.map((v) => v ** 2.2)]),
);

function sameFace(a, b) {
  return a !== null && b !== null && a.id === b.id && a.front === b.front;
}

// Mesh one section. readBlock(x, y, z) is world-coordinate voxel access
// (the one-voxel halo across section boundaries comes from it for free).
// Returns { positions, colors, indices, quadCount }.
export function meshSection(readBlock, sx, sy, sz) {
  const S = SECTION_SIZE;
  const base = [sx * S, sy * S, sz * S];
  const positions = [];
  const colors = [];
  const indices = [];
  let quadCount = 0;

  const x = [0, 0, 0];
  const q = [0, 0, 0];
  const mask = new Array(S * S);

  for (let d = 0; d < 3; d += 1) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    q[0] = 0; q[1] = 0; q[2] = 0;
    q[d] = 1;

    for (x[d] = -1; x[d] < S;) {
      // Build the face mask for the plane between slice x[d] and x[d]+1.
      let n = 0;
      for (x[v] = 0; x[v] < S; x[v] += 1) {
        for (x[u] = 0; x[u] < S; x[u] += 1) {
          const a = readBlock(base[0] + x[0], base[1] + x[1], base[2] + x[2]);
          const b = readBlock(base[0] + x[0] + q[0], base[1] + x[1] + q[1], base[2] + x[2] + q[2]);
          const aO = isOpaque(a);
          const bO = isOpaque(b);
          // Face ownership: a face is emitted only by the section that owns
          // its SOLID cell, so a shared boundary plane is never meshed twice
          // (the neighbor sees the same plane through its own halo).
          if (aO === bO) mask[n] = null;
          else if (aO) mask[n] = x[d] >= 0 ? { id: a, front: true } : null;
          else mask[n] = x[d] < S - 1 ? { id: b, front: false } : null;
          n += 1;
        }
      }
      x[d] += 1;

      // Greedy-merge the mask into maximal rectangles.
      n = 0;
      for (let j = 0; j < S; j += 1) {
        for (let i = 0; i < S;) {
          const m = mask[n];
          if (m === null) {
            i += 1;
            n += 1;
            continue;
          }
          let w = 1;
          while (i + w < S && sameFace(mask[n + w], m)) w += 1;
          let h = 1;
          outer: while (j + h < S) {
            for (let k = 0; k < w; k += 1) {
              if (!sameFace(mask[n + h * S + k], m)) break outer;
            }
            h += 1;
          }

          // Emit the quad.
          const pos = [0, 0, 0];
          pos[d] = x[d];
          pos[u] = i;
          pos[v] = j;
          const du = [0, 0, 0];
          const dv = [0, 0, 0];
          du[u] = w;
          dv[v] = h;
          const p0 = [base[0] + pos[0], base[1] + pos[1], base[2] + pos[2]];
          const p1 = [p0[0] + du[0], p0[1] + du[1], p0[2] + du[2]];
          const p2 = [p1[0] + dv[0], p1[1] + dv[1], p1[2] + dv[2]];
          const p3 = [p0[0] + dv[0], p0[1] + dv[1], p0[2] + dv[2]];
          const vertexBase = positions.length / 3;
          positions.push(...p0, ...p1, ...p2, ...p3);

          const tint = LINEAR_COLORS[m.id];
          const shade = FACE_SHADE[d][m.front ? 0 : 1];
          for (let c = 0; c < 4; c += 1) {
            colors.push(tint[0] * shade, tint[1] * shade, tint[2] * shade);
          }
          if (m.front) {
            indices.push(vertexBase, vertexBase + 1, vertexBase + 2,
              vertexBase, vertexBase + 2, vertexBase + 3);
          } else {
            indices.push(vertexBase, vertexBase + 2, vertexBase + 1,
              vertexBase, vertexBase + 3, vertexBase + 2);
          }
          quadCount += 1;

          for (let l = 0; l < h; l += 1) {
            for (let k = 0; k < w; k += 1) mask[n + l * S + k] = null;
          }
          i += w;
          n += w;
        }
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    quadCount,
  };
}
