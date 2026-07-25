// Scripted graybox policies (DS-0 D4 Gate 2): closed-loop bots that read the
// sim through its public seams (snapshot/readBlock) and emit canonical
// commands. Deterministic functions of sim state — the recorded log replays
// to the identical hash chain. Imports sim/ only; runs headless.

import { RULESET } from '../sim/constants.js';
import { FP_ONE, FP_HALF, fpFloor } from '../sim/math/fixed.js';
import { CMD, BUTTON } from '../sim/commands.js';
import { createSim, tickSim, snapshot, readBlock, PLAYER_ID } from '../sim/sim.js';
import { isBreakable } from '../sim/world/blocks.js';
import { spawnPosition } from '../sim/world/worldgen.js';
import { worldSeed } from '../sim/world/world.js';

// Reach-sphere scan offsets in canonical order (nearest first, then by
// dx, dy, dz) — the mining bot's deterministic target preference.
const SCAN_OFFSETS = (() => {
  const out = [];
  for (let dx = -5; dx <= 5; dx += 1) {
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dz = -5; dz <= 5; dz += 1) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        out.push([dx, dy, dz]);
      }
    }
  }
  out.sort((a, b) => {
    const da = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    const db = b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
    return da - db || a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
  return out;
})();

function move(t, s, buttons, yaw) {
  return { t, p: PLAYER_ID, s, type: CMD.MOVE, buttons, yaw, pitch: 0 };
}

// The sim's own reach predicate (eye to block center, squared, Q16.16) —
// the bot must never queue a mine the rules would refuse.
function inReach(p, bx, by, bz) {
  const dx = p.x - (bx * FP_ONE + FP_HALF);
  const dy = p.y + RULESET.playerEyeHeight - (by * FP_ONE + FP_HALF);
  const dz = p.z - (bz * FP_ONE + FP_HALF);
  const r = RULESET.reach * FP_ONE;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

function runPolicy(seedHex, decide, maxTicks) {
  const state = createSim(seedHex);
  const log = [];
  const memo = {}; // policy-local scratch (not sim state)
  while (state.status === 'running' && state.tick < maxTicks) {
    const commands = decide(state, memo);
    for (const cmd of commands) log.push(cmd);
    tickSim(state, commands);
  }
  return { state, log };
}

// --- the winning bot: dig a shallow pit, mine the reach sphere, climb out,
// walk to the cache, bank ---

export function runWinPolicy(seedHex, { stoneTarget = 16 } = {}) {
  return runPolicy(seedHex, (state, memo) => {
    const snap = snapshot(state);
    const t = snap.tick;
    const p = snap.player;
    const px = fpFloor(p.x);
    const py = fpFloor(p.y);
    const pz = fpFloor(p.z);
    if (memo.surfaceY === undefined) {
      memo.surfaceY = spawnPosition(worldSeed(state.world)).y;
    }

    // Phase 3+4: enough stone — climb out and bank at the cache. The climb
    // consumes up to one block per pit depth, so the target scales with it;
    // if banking still comes up short, drop back to mining for the rest.
    const depthNow = Math.max(0, memo.surfaceY - py);
    const banked = snap.banked.day + snap.banked.night;
    const need = Math.max(stoneTarget, snap.quota + depthNow + 2);
    if (memo.escaping && banked + p.inventory.fieldstone < snap.quota) {
      memo.escaping = false;
    }
    if (p.inventory.fieldstone + banked >= need || memo.escaping) {
      memo.escaping = true;
      const cacheX = snap.cache.x * FP_ONE + FP_HALF;
      const cacheZ = snap.cache.z * FP_ONE + FP_HALF;
      const commands = [];
      if (py < memo.surfaceY) {
        // Pillar: jump; while airborne, place under the feet cell.
        commands.push(move(t, 0, BUTTON.JUMP, 1024));
        if (!p.onGround) {
          // Risen past a cell boundary: the cell now under the feet is the
          // one we vacated (air) — fill it and land one block higher.
          const cell = [px, py - 1, pz];
          if (readBlock(state, cell[0], cell[1], cell[2]) === 'air') {
            const block = p.inventory.dirt > 0 ? 'dirt'
              : p.inventory.coal > 0 ? 'coal' : 'fieldstone';
            if (p.inventory[block] > 0) {
              commands.push({
                t, p: PLAYER_ID, s: 1, type: CMD.PLACE,
                x: cell[0], y: cell[1], z: cell[2], block,
              });
            }
          }
        }
        return commands;
      }
      // On the surface: axis-walk (jump held) toward the cache, bank always.
      const dx = cacheX - p.x;
      const dz = cacheZ - p.z;
      let buttons = 0;
      let yaw = 0;
      let dirX = 0;
      let dirZ = 0;
      const step = (3 * FP_ONE) / 4;
      if (dx > step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 1024; dirX = 1; }
      else if (dx < -step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 3072; dirX = -1; }
      else if (dz > step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 2048; dirZ = 1; }
      else if (dz < -step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 0; dirZ = -1; }
      commands.push(move(t, 0, buttons, yaw));
      commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.BANK });
      // Unstick: a ledge too tall to jump gets mined through instead.
      if (memo.lastX === p.x && memo.lastZ === p.z) memo.stuck = (memo.stuck ?? 0) + 1;
      else memo.stuck = 0;
      memo.lastX = p.x;
      memo.lastZ = p.z;
      if (memo.stuck > 20 && (dirX !== 0 || dirZ !== 0)) {
        for (const dy of [1, 0, 2]) {
          const bx = px + dirX;
          const by = py + dy;
          const bz = pz + dirZ;
          if (isBreakable(readBlock(state, bx, by, bz))) {
            commands.push({ t, p: PLAYER_ID, s: 2, type: CMD.MINE, x: bx, y: by, z: bz });
            break;
          }
        }
      }
      return commands;
    }

    // Phase 1+2: mine. Stand still; one mine command per grounded tick.
    const commands = [move(t, 0, 0, 1024)];
    if (!p.onGround) return commands; // settle first
    const depth = memo.surfaceY - py;
    if (depth < 2) {
      // Dig the pit straight down.
      commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.MINE, x: px, y: py - 1, z: pz });
      return commands;
    }
    // Scan the reach sphere for fieldstone, nearest first.
    for (const [dx, dy, dz] of SCAN_OFFSETS) {
      const bx = px + dx;
      const by = py + dy;
      const bz = pz + dz;
      if (by < 3) continue;
      if (readBlock(state, bx, by, bz) !== 'fieldstone') continue;
      if (!inReach(p, bx, by, bz)) continue;
      commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.MINE, x: bx, y: by, z: bz });
      return commands;
    }
    // Nothing in reach (mined out): deepen the pit one block.
    if (py - 1 >= 3 && isBreakable(readBlock(state, px, py - 1, pz))) {
      commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.MINE, x: px, y: py - 1, z: pz });
    }
    return commands;
  }, 4000);
}

// --- the sealed-shaft bot: digs deep, seals the shaft, waits out the night.
// Enemies cannot break blocks, so this run must end in dawn-timeout. ---

export function runTimeoutPolicy(seedHex) {
  return runPolicy(seedHex, (state, memo) => {
    const snap = snapshot(state);
    const t = snap.tick;
    const p = snap.player;
    const px = fpFloor(p.x);
    const py = fpFloor(p.y);
    const pz = fpFloor(p.z);
    if (memo.surfaceY === undefined) {
      memo.surfaceY = spawnPosition(worldSeed(state.world)).y;
    }
    const commands = [move(t, 0, 0, 0)];
    if (!p.onGround) return commands;
    if (memo.surfaceY - py < 10 && py - 1 >= 3) {
      commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.MINE, x: px, y: py - 1, z: pz });
      return commands;
    }
    if (!memo.sealed && readBlock(state, px, py + 2, pz) === 'air') {
      const block = p.inventory.dirt > 0 ? 'dirt' : 'fieldstone';
      if (p.inventory[block] > 0) {
        commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.PLACE, x: px, y: py + 2, z: pz, block });
        memo.sealed = true;
      }
    }
    return commands;
  }, RULESET.runTicks);
}

// --- the idle bot: stands at spawn and lets the night decide ---

export function runIdlePolicy(seedHex) {
  return runPolicy(seedHex, () => [], RULESET.runTicks);
}
