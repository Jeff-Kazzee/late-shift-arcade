// DS-1b Gate 3: adversarial stress scenes as code (F-05: "benchmark
// terrain, caves, transparency, and adversarial builds" — opaque bucket
// scenes for this slice).
//
// Each scene is a DETERMINISTIC view-side world: a pure base function of
// (seed, x, y, z) plus an edit overlay for churn — the same WorldView shape
// the renderer subscribes to ({ snap, readBlock, sectionUniform }) with
// setBlock/drainDirty for the churn harness. Scenes are presentation
// fixtures: they import only pure sim math (hash), never sim state, and
// nothing in sim/ knows they exist.
//
// All three scenes are 20x3x20 chunks (640x96x640 blocks) — wide enough
// that the desktop radius-8 RenderSet plus its +2 unload margin never runs
// out of world while the camera travels, and far beyond SIM_RADIUS 3, so
// frozen-but-visible chunks are the NORMAL case, exactly as D1 intends.

import { hashInts } from '../sim/math/xxhash64.js';
import { floorDiv } from '../sim/math/fixed.js';

export const SCENE_REGION = Object.freeze({
  chunks: 20,
  chunksY: 3,
  blocksX: 640,
  blocksY: 96,
  blocksZ: 640,
});

const SECTION = 16;

// Editable overlay + dirty-section bookkeeping over a pure base function.
// markDirty mirrors sim/world/world.js exactly: an edit on a section face
// dirties the neighbor whose visible faces it changes.
function editableWorld({ name, base, baseUniform, anchor, seedHex }) {
  const overlay = new Map(); // numeric voxel key -> block id
  const editedSections = new Set();
  let dirty = {};
  // Numeric overlay keys: snapshot capture reads this millions of times
  // and string keys allocate; the +1/+8 offsets keep halo reads positive.
  const voxelKey = (x, y, z) => ((y + 8) * 648 + (z + 4)) * 648 + (x + 4);

  const readBlock = (x, y, z) => {
    // Skip the overlay lookup entirely until churn begins.
    if (overlay.size !== 0) {
      const edited = overlay.get(voxelKey(x, y, z));
      if (edited !== undefined) return edited;
    }
    return base(x, y, z);
  };

  const sectionUniform = (sx, sy, sz) => (
    editedSections.has(`${sx},${sy},${sz}`) ? null : baseUniform(sx, sy, sz)
  );

  const markDirty = (x, y, z) => {
    const sx = floorDiv(x, SECTION);
    const sy = floorDiv(y, SECTION);
    const sz = floorDiv(z, SECTION);
    dirty[`${sx},${sy},${sz}`] = true;
    if (x - sx * SECTION === 0) dirty[`${sx - 1},${sy},${sz}`] = true;
    if (x - sx * SECTION === SECTION - 1) dirty[`${sx + 1},${sy},${sz}`] = true;
    if (y - sy * SECTION === 0) dirty[`${sx},${sy - 1},${sz}`] = true;
    if (y - sy * SECTION === SECTION - 1) dirty[`${sx},${sy + 1},${sz}`] = true;
    if (z - sz * SECTION === 0) dirty[`${sx},${sy},${sz - 1}`] = true;
    if (z - sz * SECTION === SECTION - 1) dirty[`${sx},${sy},${sz + 1}`] = true;
  };

  return {
    name,
    seedHex,
    anchor,
    snap: {
      tick: 0,
      status: 'running',
      entities: [],
      region: {
        blocksX: SCENE_REGION.blocksX,
        blocksY: SCENE_REGION.blocksY,
        blocksZ: SCENE_REGION.blocksZ,
      },
    },
    readBlock,
    sectionUniform,
    setBlock(x, y, z, id) {
      overlay.set(voxelKey(x, y, z), id);
      editedSections.add(`${floorDiv(x, SECTION)},${floorDiv(y, SECTION)},${floorDiv(z, SECTION)}`);
      markDirty(x, y, z);
    },
    drainDirty() {
      const keys = Object.keys(dirty).sort();
      dirty = {};
      return keys;
    },
    editCount: () => overlay.size,
  };
}

// --- scene 1: checkerboard slab — the greedy mesher's absolute worst case.
// Every solid voxel exposes all six faces; nothing merges. One 16-block
// slab layer over a solid floor: sections sy=2 are pure checkerboard.
export function checkerboardScene() {
  const base = (x, y, z) => {
    if (y < 0) return 'worldbone';
    if (y < 32) return 'fieldstone';
    if (y < 48) return ((x + y + z) & 1) === 0 ? 'fieldstone' : 'air';
    return 'air';
  };
  const baseUniform = (sx, sy, sz) => {
    if (sy < 0) return 'worldbone';
    if (sy <= 1) return 'fieldstone';
    if (sy === 2) return null; // the checkerboard layer
    return 'air';
  };
  return editableWorld({
    name: 'checkerboard',
    base,
    baseUniform,
    anchor: { x: 320.5, y: 58, z: 320.5 },
    seedHex: null, // seedless: the pattern is the adversary
  });
}

// --- scene 2: cave-riddled terrain — heightfield minus blobby cave noise.
// Defeats the "solid underground is invisible" assumption (F-05): carved
// voids expose interior faces in nearly every underground section.
export function cavesScene(seedHex = '00000000deadbeef') {
  const seed = BigInt(`0x${seedHex}`);
  const HSTEP = 24;
  const CSTEP = 8;
  const NY = SCENE_REGION.blocksY / CSTEP; // 12 vertical cave-lattice cells
  const CAVE_THRESHOLD = 105; // ~30% of interpolated space carves

  // Snapshot capture is the hot path (per-voxel, millions of calls), so
  // everything expensive is cached per COLUMN with numeric keys: surface
  // height, and the cave-density profile at the 13 vertical lattice rows —
  // per voxel that leaves one linear interpolation.
  const lat2 = new Map(); // height lattice hash
  const lat3 = new Map(); // cave lattice hash
  const heights = new Map(); // column -> surface height
  const densities = new Map(); // column -> Float64Array(NY + 1)
  const colKey = (x, z) => x * 4096 + z;

  const h2 = (lx, lz) => {
    const k = lx * 4096 + lz;
    let v = lat2.get(k);
    if (v === undefined) {
      v = Number(hashInts(seed, [11, lx, lz]) & 0xffn);
      lat2.set(k, v);
    }
    return v;
  };
  const c3 = (lx, ly, lz) => {
    const k = (lx * 4096 + lz) * 16 + ly;
    let v = lat3.get(k);
    if (v === undefined) {
      v = Number(hashInts(seed, [13, lx, ly, lz]) & 0xffn);
      lat3.set(k, v);
    }
    return v;
  };

  const columnHeight = (x, z) => {
    const k = colKey(x, z);
    let h = heights.get(k);
    if (h !== undefined) return h;
    const lx = floorDiv(x, HSTEP);
    const lz = floorDiv(z, HSTEP);
    const fx = (x - lx * HSTEP) / HSTEP;
    const fz = (z - lz * HSTEP) / HSTEP;
    const top = (1 - fx) * ((1 - fz) * h2(lx, lz) + fz * h2(lx, lz + 1))
      + fx * ((1 - fz) * h2(lx + 1, lz) + fz * h2(lx + 1, lz + 1));
    h = 40 + Math.floor((top / 256) * 24); // 40..63
    heights.set(k, h);
    return h;
  };

  const densityColumn = (x, z) => {
    const k = colKey(x, z);
    let col = densities.get(k);
    if (col !== undefined) return col;
    const lx = floorDiv(x, CSTEP);
    const lz = floorDiv(z, CSTEP);
    const fx = (x - lx * CSTEP) / CSTEP;
    const fz = (z - lz * CSTEP) / CSTEP;
    col = new Float64Array(NY + 1);
    for (let ly = 0; ly <= NY; ly += 1) {
      col[ly] = (1 - fx) * ((1 - fz) * c3(lx, ly, lz) + fz * c3(lx, ly, lz + 1))
        + fx * ((1 - fz) * c3(lx + 1, ly, lz) + fz * c3(lx + 1, ly, lz + 1));
    }
    densities.set(k, col);
    return col;
  };

  const caveAt = (x, y, z) => {
    if (y < 8) return false; // a floor the caves never breach
    const col = densityColumn(x, z);
    const ly = floorDiv(y, CSTEP);
    const fy = (y - ly * CSTEP) / CSTEP;
    return col[ly] * (1 - fy) + col[ly + 1] * fy < CAVE_THRESHOLD;
  };

  const base = (x, y, z) => {
    if (y < 0) return 'worldbone';
    const h = columnHeight(x, z);
    if (y >= h) return 'air';
    if (caveAt(x, y, z)) return 'air';
    return y >= h - 3 ? 'dirt' : 'fieldstone';
  };
  const baseUniform = (sx, sy, sz) => {
    if (sy < 0) return 'worldbone';
    if (sy >= 4) return 'air'; // max height 63 < 64
    return null; // caves everywhere below: no cheap uniformity
  };
  return editableWorld({
    name: 'caves',
    base,
    baseUniform,
    anchor: { x: 320.5, y: 72, z: 320.5 },
    seedHex,
  });
}

// --- scene 3: a dense player-built fortress spanning section AND chunk
// boundaries. Walls sit exactly ON 16-block section planes (x,z % 8 == 0
// hits 288, 304, 320...), floors slice every 8 blocks vertically, windows
// punch holes so nothing merges wide — the face-ownership stress case.
export function fortressScene() {
  const IN = (v) => v >= 280 && v < 360;
  const base = (x, y, z) => {
    if (y < 0) return 'worldbone';
    if (y < 37) return 'fieldstone';
    if (y < 40) return 'dirt';
    if (y < 80 && IN(x) && IN(z)) {
      const fy = (y - 40) % 8;
      const wallX = ((x - 280) % 8) === 0;
      const wallZ = ((z - 280) % 8) === 0;
      if (fy === 0) {
        // Floor slab with a stairwell hole per 32-block bay.
        if (((x - 280) % 32) < 2 && ((z - 280) % 32) < 2) return 'air';
        return 'wardwall';
      }
      if (wallX || wallZ) {
        // Window band: two rows out of eight, punched through mid-wall.
        if ((fy === 3 || fy === 4) && ((x + z) % 8) >= 2 && ((x + z) % 8) <= 5) return 'air';
        return 'wardwall';
      }
      if (((x - 280) % 8) === 4 && ((z - 280) % 8) === 4) return 'cache'; // pillar
      return 'air';
    }
    return 'air';
  };
  const baseUniform = (sx, sy, sz) => {
    if (sy < 0) return 'worldbone';
    if (sy <= 1) return 'fieldstone'; // y 0..31 solid
    if (sy >= 5) return 'air'; // y >= 80 above the fortress
    const x0 = sx * SECTION;
    const z0 = sz * SECTION;
    const touches = x0 < 360 && x0 + SECTION > 280 && z0 < 360 && z0 + SECTION > 280;
    if (sy === 2) return null; // ground surface band
    return touches ? null : 'air'; // sy 3..4: air unless inside the build
  };
  return editableWorld({
    name: 'fortress',
    base,
    baseUniform,
    anchor: { x: 320.5, y: 60, z: 244.5 },
    seedHex: null,
  });
}

export const SCENES = Object.freeze({
  checkerboard: checkerboardScene,
  caves: cavesScene,
  fortress: fortressScene,
});
