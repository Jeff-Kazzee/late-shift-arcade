// Fixed-step (20 Hz) AABB voxel physics, all Q16.16 integers.
//
// A body is { x, y, z, halfW, height }: (x, z) is the footprint center,
// y the bottom face; the AABB is [x-halfW, x+halfW) x [y, y+height) x
// [z-halfW, z+halfW) with EXCLUSIVE max faces — a body whose face sits
// exactly on a block boundary does not occupy the next block.
//
// Axis resolution order is fixed and documented: Y, then X, then Z (the
// deterministic tie-break of D5). Each axis sweeps the voxel layers the
// move crosses in order and clamps at the first solid layer, so no speed
// below one chunk per tick can tunnel.

import { FP_ONE, fpFloor } from './math/fixed.js';
import { isSolid } from './world/blocks.js';
import { getBlock } from './world/world.js';

function solidAt(world, bx, by, bz) {
  return isSolid(getBlock(world, bx, by, bz));
}

function footprintSolid(world, x0, x1, layer, z0, z1) {
  for (let bx = x0; bx <= x1; bx += 1) {
    for (let bz = z0; bz <= z1; bz += 1) {
      if (solidAt(world, bx, layer, bz)) return true;
    }
  }
  return false;
}

function wallSolid(world, column, y0, y1, w0, w1, axisIsX) {
  for (let by = y0; by <= y1; by += 1) {
    for (let bw = w0; bw <= w1; bw += 1) {
      const hit = axisIsX ? solidAt(world, column, by, bw) : solidAt(world, bw, by, column);
      if (hit) return true;
    }
  }
  return false;
}

// Advance a body by (dx, dy, dz) fixed-point units with collision.
// Mutates body position; returns { hitX, hitY, hitZ, onGround }.
export function moveBody(world, body, dx, dy, dz) {
  const result = { hitX: false, hitY: false, hitZ: false, onGround: false };

  // --- Y ---
  if (dy !== 0) {
    const x0 = fpFloor(body.x - body.halfW);
    const x1 = fpFloor(body.x + body.halfW - 1);
    const z0 = fpFloor(body.z - body.halfW);
    const z1 = fpFloor(body.z + body.halfW - 1);
    if (dy < 0) {
      const from = fpFloor(body.y);
      const to = fpFloor(body.y + dy);
      let newY = body.y + dy;
      for (let layer = from; layer >= to; layer -= 1) {
        if (footprintSolid(world, x0, x1, layer, z0, z1)) {
          newY = (layer + 1) * FP_ONE;
          result.hitY = true;
          result.onGround = true;
          break;
        }
      }
      body.y = newY;
    } else {
      const from = fpFloor(body.y + body.height - 1);
      const to = fpFloor(body.y + body.height + dy - 1);
      let newY = body.y + dy;
      for (let layer = from; layer <= to; layer += 1) {
        if (footprintSolid(world, x0, x1, layer, z0, z1)) {
          newY = layer * FP_ONE - body.height;
          result.hitY = true;
          break;
        }
      }
      body.y = newY;
    }
  } else {
    // Standing check: solid directly below the (possibly unmoved) feet.
    const x0 = fpFloor(body.x - body.halfW);
    const x1 = fpFloor(body.x + body.halfW - 1);
    const z0 = fpFloor(body.z - body.halfW);
    const z1 = fpFloor(body.z + body.halfW - 1);
    result.onGround = footprintSolid(world, x0, x1, fpFloor(body.y - 1), z0, z1);
  }

  const y0 = fpFloor(body.y);
  const y1 = fpFloor(body.y + body.height - 1);

  // --- X ---
  if (dx !== 0) {
    const z0 = fpFloor(body.z - body.halfW);
    const z1 = fpFloor(body.z + body.halfW - 1);
    if (dx > 0) {
      const from = fpFloor(body.x + body.halfW - 1);
      const to = fpFloor(body.x + body.halfW + dx - 1);
      let newX = body.x + dx;
      for (let col = from + 1; col <= to; col += 1) {
        if (wallSolid(world, col, y0, y1, z0, z1, true)) {
          newX = col * FP_ONE - body.halfW;
          result.hitX = true;
          break;
        }
      }
      body.x = newX;
    } else {
      const from = fpFloor(body.x - body.halfW);
      const to = fpFloor(body.x - body.halfW + dx);
      let newX = body.x + dx;
      for (let col = from - 1; col >= to; col -= 1) {
        if (wallSolid(world, col, y0, y1, z0, z1, true)) {
          newX = (col + 1) * FP_ONE + body.halfW;
          result.hitX = true;
          break;
        }
      }
      body.x = newX;
    }
  }

  const nx0 = fpFloor(body.x - body.halfW);
  const nx1 = fpFloor(body.x + body.halfW - 1);

  // --- Z ---
  if (dz !== 0) {
    if (dz > 0) {
      const from = fpFloor(body.z + body.halfW - 1);
      const to = fpFloor(body.z + body.halfW + dz - 1);
      let newZ = body.z + dz;
      for (let col = from + 1; col <= to; col += 1) {
        if (wallSolid(world, col, y0, y1, nx0, nx1, false)) {
          newZ = col * FP_ONE - body.halfW;
          result.hitZ = true;
          break;
        }
      }
      body.z = newZ;
    } else {
      const from = fpFloor(body.z - body.halfW);
      const to = fpFloor(body.z - body.halfW + dz);
      let newZ = body.z + dz;
      for (let col = from - 1; col >= to; col -= 1) {
        if (wallSolid(world, col, y0, y1, nx0, nx1, false)) {
          newZ = (col + 1) * FP_ONE + body.halfW;
          result.hitZ = true;
          break;
        }
      }
      body.z = newZ;
    }
  }

  return result;
}

// Does an axis-aligned body intersect the unit block cell (bx, by, bz)?
// Used by placement rules so a block can never be placed inside a body.
export function bodyIntersectsBlock(body, bx, by, bz) {
  const minX = bx * FP_ONE;
  const minY = by * FP_ONE;
  const minZ = bz * FP_ONE;
  return (
    body.x - body.halfW < minX + FP_ONE &&
    body.x + body.halfW > minX &&
    body.y < minY + FP_ONE &&
    body.y + body.height > minY &&
    body.z - body.halfW < minZ + FP_ONE &&
    body.z + body.halfW > minZ
  );
}
