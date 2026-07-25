// Scripted Dawn Run policies (GDD §17 DS-1 acceptance): closed-loop bots
// that read the sim through its public seams and emit canonical commands.
// Deterministic functions of sim state — a recorded log replays to the
// identical hash chain. Imports sim/ only; runs headless.
//
//   runWinPolicy      the full loop: chop, dig, craft, mine copper
//                     outcrops, bank ~30 by day + ~30 by night (the §3.4
//                     window caps FORCE working through the dark), entomb,
//                     survive to the dawn verdict
//   runIdlePolicy     stands at spawn; the night decides (death loss)
//   runTimeoutPolicy  seals a shaft, survives unpaid (dawn-timeout loss)
//   runQuotaThenDiePolicy  meets quota, then walks the night unarmed —
//                     permadeath overrides a banked quota

import { RULESET } from '../sim/constants.js';
import { FP_ONE, FP_HALF, fpFloor } from '../sim/math/fixed.js';
import { CMD, BUTTON, EQUIP_MODE } from '../sim/commands.js';
import { createSim, tickSim, readBlock, PLAYER_ID, bankedValues } from '../sim/sim.js';
import { isBreakable } from '../sim/world/blocks.js';
import {
  spawnPosition, cachePosition, columnHeight, outcropAt, treeAt, REGION,
} from '../sim/world/worldgen.js';
import { worldSeed } from '../sim/world/world.js';

const NIGHT_START = RULESET.dayTicks + RULESET.duskTicks;

function move(t, s, buttons, yaw) {
  return { t, p: PLAYER_ID, s, type: CMD.MOVE, buttons, yaw, pitch: 0 };
}

// The sim's own reach predicate (eye to block center, squared, Q16.16),
// tightened one block so the hold never drops to jitter.
function inReach(p, bx, by, bz) {
  const dx = p.x - (bx * FP_ONE + FP_HALF);
  const dy = p.y + RULESET.playerEyeHeight - (by * FP_ONE + FP_HALF);
  const dz = p.z - (bz * FP_ONE + FP_HALF);
  const r = (RULESET.reach - 1) * FP_ONE;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

function runPolicy(seedHex, decide, maxTicks = RULESET.runTicks) {
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

// --- movement: axis-walk with held jump, stuck-mining, stuck-pillaring ---

function walkToward(state, memo, commands, tx, tz) {
  const t = state.tick;
  const p = state.player;
  const px = fpFloor(p.x);
  const py = fpFloor(p.y);
  const pz = fpFloor(p.z);
  const dx = tx - p.x;
  const dz = tz - p.z;
  const step = (3 * FP_ONE) / 4;
  let buttons = 0;
  let yaw = 0;
  let dirX = 0;
  let dirZ = 0;
  if (dx > step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 1024; dirX = 1; }
  else if (dx < -step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 3072; dirX = -1; }
  else if (dz > step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 2048; dirZ = 1; }
  else if (dz < -step) { buttons = BUTTON.FORWARD | BUTTON.JUMP; yaw = 0; dirZ = -1; }
  commands.push(move(t, 0, buttons, yaw));
  if (buttons === 0) return true; // arrived
  // Unstick: mine through a too-tall ledge; pillar-fill a pit.
  if (memo.lastX === p.x && memo.lastZ === p.z) {
    memo.stuck = (memo.stuck ?? 0) + 1;
  } else memo.stuck = 0;
  memo.lastX = p.x;
  memo.lastZ = p.z;
  if (memo.stuck > 24 && (dirX !== 0 || dirZ !== 0)) {
    for (const dy of [1, 0, 2]) {
      const bx = px + dirX;
      const by = py + dy;
      const bz = pz + dirZ;
      if (isBreakable(readBlock(state, bx, by, bz)) && inReach(p, bx, by, bz)) {
        holdMine(state, commands, bx, by, bz);
        return false;
      }
    }
    if (!p.onGround && readBlock(state, px, py - 1, pz) === 'air' && p.inventory.dirt > 0) {
      commands.push({ t, p: PLAYER_ID, s: 5, type: CMD.PLACE, x: px, y: py - 1, z: pz, block: 'dirt' });
    }
  }
  return false;
}

// Keep exactly one hold-to-mine running on the target cell (re-issuing
// MINE_START would reset the §8.1 progress).
function holdMine(state, commands, bx, by, bz) {
  const m = state.player.mining;
  if (m !== null && m.x === bx && m.y === by && m.z === bz) return;
  commands.push({ t: state.tick, p: PLAYER_ID, s: 2, type: CMD.MINE_START, x: bx, y: by, z: bz });
}

// The distinct cells directly under the player's four footprint corners —
// digging down must clear ALL of them (the AABB stands on any edge).
function cellsUnderFeet(p) {
  const y = fpFloor(p.y) - 1;
  const x0 = fpFloor(p.x - p.halfW);
  const x1 = fpFloor(p.x + p.halfW - 1);
  const z0 = fpFloor(p.z - p.halfW);
  const z1 = fpFloor(p.z + p.halfW - 1);
  const cells = [[x0, y, z0]];
  if (x1 !== x0) cells.push([x1, y, z0]);
  if (z1 !== z0) cells.push([x0, y, z1]);
  if (x1 !== x0 && z1 !== z0) cells.push([x1, y, z1]);
  return cells;
}

// Hold a dig on the first solid support cell. Returns true when all are air.
function digDown(state, commands, p) {
  for (const [bx, by, bz] of cellsUnderFeet(p)) {
    if (by < 3) continue;
    if (isBreakable(readBlock(state, bx, by, bz))) {
      holdMine(state, commands, bx, by, bz);
      return false;
    }
  }
  return true;
}

// Mine every cell in `cells` (skipping already-air), standing still while
// in reach, walking closer otherwise. Returns true when all are gone.
function mineCells(state, memo, commands, cells) {
  const p = state.player;
  for (const [bx, by, bz] of cells) {
    if (!isBreakable(readBlock(state, bx, by, bz))) continue;
    if (inReach(p, bx, by, bz)) {
      commands.push(move(state.tick, 0, 0, p.yaw));
      holdMine(state, commands, bx, by, bz);
      return false;
    }
    walkToward(state, memo, commands, bx * FP_ONE + FP_HALF, bz * FP_ONE + FP_HALF);
    return false;
  }
  return true;
}

function craft(state, commands, recipeId, s = 3) {
  commands.push({ t: state.tick, p: PLAYER_ID, s, type: CMD.CRAFT, recipeId });
}

function toolOf(state, kind, tier) {
  for (const tool of state.player.tools) {
    if (tool.kind === kind && tool.tier === tier) return tool;
  }
  return null;
}

// --- the winning decider (also reused by the quota-then-die bot) ---

// Copper outcrops sorted by distance from the cache. An outcrop's ore
// cells are its 2x2 columns, three deep from each column's own turf line.
function surveyOutcrops(seed) {
  const size = RULESET.outcropCellSize;
  const cache = cachePosition(seed);
  const out = [];
  for (let cz = 0; cz < REGION.blocksZ / size; cz += 1) {
    for (let cx = 0; cx < REGION.blocksX / size; cx += 1) {
      const o = outcropAt(seed, cx, cz);
      if (o === null || o.material !== 'copper_ore') continue;
      if (o.x < 4 || o.z < 4 || o.x > REGION.blocksX - 6 || o.z > REGION.blocksZ - 6) continue;
      const d = Math.abs(o.x - cache.x) + Math.abs(o.z - cache.z);
      out.push({ ...o, d });
    }
  }
  out.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  return out;
}

function outcropCells(seed, o) {
  const cells = [];
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const h = columnHeight(seed, o.x + dx, o.z + dz);
    for (let y = h - 1; y >= h - 3; y -= 1) cells.push([o.x + dx, y, o.z + dz]);
  }
  return cells;
}

function nearestTree(seed, fromX, fromZ) {
  let best = null;
  let bestD = Infinity;
  const cells = REGION.blocksX / 8;
  for (let cz = 0; cz < cells; cz += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const tree = treeAt(seed, cx, cz);
      if (tree === null) continue;
      const d = Math.abs(tree.x - fromX) + Math.abs(tree.z - fromZ);
      if (d < bestD) { bestD = d; best = tree; }
    }
  }
  return best;
}

function winDecide(state, memo) {
  const t = state.tick;
  const p = state.player;
  const px = fpFloor(p.x);
  const py = fpFloor(p.y);
  const pz = fpFloor(p.z);
  const commands = [];
  if (memo.phase === undefined) {
    const seed = worldSeed(state.world);
    memo.seed = seed;
    memo.spawn = spawnPosition(seed);
    memo.cache = cachePosition(seed);
    memo.tree = nearestTree(seed, memo.spawn.x, memo.spawn.z);
    memo.outcrops = surveyOutcrops(seed);
    memo.outcropIndex = 0;
    memo.phase = 'tree';
  }
  const inv = p.inventory;
  const banked = bankedValues(state.banking);

  switch (memo.phase) {
    case 'tree': {
      if (inv.gnarlpine_log >= 2) {
        craft(state, commands, 0); // planks
        commands.push(move(t, 0, 0, p.yaw));
        memo.phase = 'sticks';
        return commands;
      }
      const th = columnHeight(memo.seed, memo.tree.x, memo.tree.z);
      mineCells(state, memo, commands, [
        [memo.tree.x, th, memo.tree.z], [memo.tree.x, th + 1, memo.tree.z],
      ]);
      return commands;
    }
    case 'sticks': {
      craft(state, commands, 1); // 2 planks -> 4 sticks
      commands.push(move(t, 0, 0, p.yaw));
      memo.phase = 'pit';
      memo.pitX = memo.spawn.x - 2;
      memo.pitZ = memo.spawn.z - 2;
      return commands;
    }
    case 'pit': {
      // Dig straight down beside spawn until 7 rubble are in hand.
      if (inv.rubble >= 7) {
        memo.phase = 'climb';
        memo.surfaceY = columnHeight(memo.seed, px, pz);
        return [move(t, 0, 0, p.yaw)];
      }
      if (memo.pitArrived !== true) {
        if (walkToward(state, memo, commands, memo.pitX * FP_ONE + FP_HALF, memo.pitZ * FP_ONE + FP_HALF)) {
          memo.pitArrived = true;
        }
        return commands;
      }
      commands.push(move(t, 0, 0, p.yaw));
      if (p.onGround) digDown(state, commands, p);
      return commands;
    }
    case 'climb': {
      if (py >= memo.surfaceY) {
        memo.phase = 'craft';
        return [move(t, 0, 0, p.yaw)];
      }
      commands.push(move(t, 0, BUTTON.JUMP, p.yaw));
      if (!p.onGround && readBlock(state, px, py - 1, pz) === 'air') {
        const block = inv.dirt > 0 ? 'dirt' : inv.sand > 0 ? 'sand' : null;
        if (block !== null) {
          commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.PLACE, x: px, y: py - 1, z: pz, block });
        }
      }
      return commands;
    }
    case 'craft': {
      if (inv.gnarlpine_planks < 4 && inv.gnarlpine_log > 0 && inv.worktable === 0) {
        craft(state, commands, 0); // more planks
        commands.push(move(t, 0, 0, p.yaw));
        return commands;
      }
      if (inv.worktable === 0 && toolOf(state, 'pick', 'fieldstone') === null &&
          inv.rubble >= 6 && inv.gnarlpine_planks >= 4) {
        craft(state, commands, 7); // worktable
        commands.push(move(t, 0, 0, p.yaw));
        return commands;
      }
      if (inv.worktable > 0) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const bx = px + dx;
          const bz = pz + dz;
          if (readBlock(state, bx, py, bz) === 'air' &&
              readBlock(state, bx, py + 1, bz) === 'air' &&
              readBlock(state, bx, py - 1, bz) !== 'air') {
            commands.push(move(t, 0, 0, p.yaw));
            commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.PLACE, x: bx, y: py, z: bz, block: 'worktable' });
            return commands;
          }
        }
        walkToward(state, memo, commands, p.x + FP_ONE, p.z); // find flatter ground
        return commands;
      }
      const pick = toolOf(state, 'pick', 'fieldstone');
      if (pick === null) {
        craft(state, commands, 9); // fieldstone pick
        craft(state, commands, 11, 4); // fieldstone club
        commands.push(move(t, 0, 0, p.yaw));
        return commands;
      }
      commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.EQUIP, mode: EQUIP_MODE.TOOL, ref: pick.id });
      commands.push(move(t, 0, 0, p.yaw));
      memo.phase = 'copper';
      return commands;
    }
    case 'copper': {
      const carried = inv.copper_ore;
      const needTotal = RULESET.quotaValue - banked.total;
      if (carried >= 33 || carried * 5 >= needTotal + 15) {
        memo.phase = 'bank';
        return [move(t, 0, 0, p.yaw)];
      }
      const o = memo.outcrops[memo.outcropIndex];
      if (o === undefined) {
        memo.phase = 'bank'; // out of outcrops: bank what we have
        return [move(t, 0, 0, p.yaw)];
      }
      if (mineCells(state, memo, commands, outcropCells(memo.seed, o))) {
        memo.outcropIndex += 1;
      }
      return commands;
    }
    case 'bank': {
      const cacheX = memo.cache.x * FP_ONE + FP_HALF;
      const cacheZ = (memo.cache.z + 1) * FP_ONE + FP_HALF; // stand beside
      const nearCache = Math.abs(p.x - cacheX) < 2 * FP_ONE && Math.abs(p.z - cacheZ) < 2 * FP_ONE;
      if (!nearCache) {
        walkToward(state, memo, commands, cacheX, cacheZ);
        return commands;
      }
      commands.push(move(t, 0, 0, p.yaw));
      // §3.4 window caps make the split explicit: fill the day window
      // first; hold the second load at the cache until night opens.
      const dayWindowValue = banked.day;
      const wouldOvershootDay = dayWindowValue >= 150 ||
        inv.copper_ore * 5 + dayWindowValue > 165;
      if (t < NIGHT_START && wouldOvershootDay && dayWindowValue > 0) {
        return commands; // wait out the dusk beside the cache
      }
      commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.BANK });
      return commands;
    }
    case 'entomb': {
      commands.push(move(t, 0, 0, p.yaw));
      if (memo.entombY === undefined) memo.entombY = py;
      if (memo.entombY - py < 3) {
        if (p.onGround) digDown(state, commands, p);
        return commands;
      }
      // Seal every column of the shaft mouth (the footprint can straddle).
      let s = 1;
      for (const [bx, , bz] of cellsUnderFeet(p)) {
        if (readBlock(state, bx, py + 2, bz) !== 'air') continue;
        const block = inv.dirt > 0 ? 'dirt'
          : inv.sand > 0 ? 'sand'
            : inv.fieldstone > 0 ? 'fieldstone' : null;
        if (block !== null) {
          commands.push({ t, p: PLAYER_ID, s, type: CMD.PLACE, x: bx, y: py + 2, z: bz, block });
          s += 1;
        }
      }
      return commands;
    }
    default:
      return [move(t, 0, 0, 0)];
  }
}

// Phase transitions that depend on the PREVIOUS tick's bank landing.
function winDecideWithVerdict(state, memo) {
  if (memo.phase === 'bank' && state.player.inventory.copper_ore === 0) {
    memo.phase = bankedValues(state.banking).total >= RULESET.quotaValue ? 'entomb' : 'copper';
  }
  return winDecide(state, memo);
}

export function runWinPolicy(seedHex, { trace = null } = {}) {
  return runPolicy(seedHex, trace === null ? winDecideWithVerdict : (state, memo) => {
    const commands = winDecideWithVerdict(state, memo);
    trace(state, memo, commands);
    return commands;
  });
}

// --- the losing bots ---

export function runIdlePolicy(seedHex) {
  return runPolicy(seedHex, () => []);
}

// Digs a shaft, seals it, survives to dawn far short of quota.
export function runTimeoutPolicy(seedHex) {
  return runPolicy(seedHex, (state, memo) => {
    const t = state.tick;
    const p = state.player;
    const px = fpFloor(p.x);
    const py = fpFloor(p.y);
    const pz = fpFloor(p.z);
    if (memo.surfaceY === undefined) {
      memo.surfaceY = spawnPosition(worldSeed(state.world)).y;
    }
    const commands = [move(t, 0, 0, 0)];
    if (!p.onGround) return commands;
    if (memo.surfaceY - py < 6) {
      if (!digDown(state, commands, p)) return commands;
    }
    if (!memo.sealed && readBlock(state, px, py + 2, pz) === 'air') {
      const block = p.inventory.dirt > 0 ? 'dirt' : 'fieldstone';
      if (p.inventory[block] > 0) {
        commands.push({ t, p: PLAYER_ID, s: 1, type: CMD.PLACE, x: px, y: py + 2, z: pz, block });
        memo.sealed = true;
      }
    }
    return commands;
  });
}

// Meets the quota, then stands in the open all night with empty hands:
// permadeath overrides a banked quota (loss, reason death).
export function runQuotaThenDiePolicy(seedHex) {
  return runPolicy(seedHex, (state, memo) => {
    if (bankedValues(state.banking).total >= RULESET.quotaValue) {
      return state.tick % 2 === 0 ? [move(state.tick, 0, 0, 0)] : [];
    }
    return winDecideWithVerdict(state, memo);
  });
}
