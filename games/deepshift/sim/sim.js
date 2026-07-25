// The DEEPSHIFT DS-1c sim kernel — the full Dawn Run (GDD §3.2/§17 DS-1).
// Pure Node-importable: zero browser globals, zero renderer knowledge,
// injected adapters only (the sim never reads a clock — callers feed ticks;
// it never touches storage — state IS the save shape, D2/D5).
//
// One tick = one call to tickSim(state, commandsForThisTick):
//   1. commands apply in canonical (t, p, s) order
//   2. hold-to-mine progress advances (§8.1 break times, tier gating)
//   3. hearths smelt (§7.2) and their light syncs
//   4. player physics + §8.3 regen
//   5. ActiveSet from anchors (D1) — frozen entities do not run
//   6. entities update in slot order; spawning (§10.1 light-driven)
//   7. end evaluation: death anytime; the dawn verdict at runTicks
//   8. tick advances and the per-tick hash chain absorbs a state digest
//
// All positions/velocities are Q16.16 integers; HP/damage are half-points.

import { RULESET, RULESET_HASH } from './constants.js';
import { hashInts, hashAscii, fromHex64, toHex64 } from './math/xxhash64.js';
import { FP_ONE, FP_HALF, fpFloor, fpMul, floorDiv } from './math/fixed.js';
import { fpSin, fpCos } from './math/trig.js';
import { createStreams, nextInt } from './math/prng.js';
import { CMD, BUTTON, EQUIP_MODE, HEARTH_SLOT, validateCommand, sortCommands, encodeCommand } from './commands.js';
import { computeActiveSet, activeSetHas } from './activation.js';
import {
  blockCode, isBreakable, isSolid, dropOf, lightOf, hasGravity,
} from './world/blocks.js';
import { ITEM_IDS, emptyInventory, BANKABLE, toolTier, toolKindCode, TIER_IDS, meleeDamage } from './items.js';
import { RECIPES, canCraft, applyCraftInputs } from './recipes.js';
import { breakTicks, progressCapTicks, NEVER } from './mining.js';
import { emptyBankingWindow, bankedValues, quotaMet, computeScore } from './score.js';
import { phaseOf, isNight } from './light.js';
import {
  createEntityPool, updateEntities, trySpawns, findEntityById, damageEntity, ARCH_NAMES,
} from './entities.js';
import {
  createWorld, worldSeed, getBlock, setBlock, inRegionBlock, drainDirtySections,
} from './world/world.js';
import { spawnPosition, cachePosition, REGION } from './world/worldgen.js';
import { moveBody, bodyIntersectsBlock } from './physics.js';

const STATUS = Object.freeze({ running: 0, won: 1, lost: 2 });
const END_REASON = Object.freeze({ none: 0, dawn: 1, death: 2, 'dawn-timeout': 3 });
export const PLAYER_ID = 1;

export { isNight, phaseOf, computeScore, quotaMet, bankedValues };

export function createSim(seedHex) {
  const world = createWorld(seedHex);
  const seed = worldSeed(world);
  const spawn = spawnPosition(seed);
  const cache = cachePosition(seed);
  const inventory = emptyInventory();
  // §3.2 setup: dawn of Day 1, bone tools, empty hands.
  const tools = [
    { id: 1, kind: 'pick', tier: 'bone', dur: toolTier('bone').durability },
    { id: 2, kind: 'axe', tier: 'bone', dur: toolTier('bone').durability },
    { id: 3, kind: 'club', tier: 'bone', dur: toolTier('bone').durability },
  ];
  const state = {
    format: 'deepshift-run-v1',
    seedHex,
    rulesetHash: RULESET_HASH,
    tick: 0,
    status: 'running',
    endReason: null,
    score: 0,
    player: {
      id: PLAYER_ID,
      x: spawn.x * FP_ONE + FP_HALF,
      y: spawn.y * FP_ONE,
      z: spawn.z * FP_ONE + FP_HALF,
      vx: 0, vy: 0, vz: 0,
      halfW: RULESET.playerHalfWidth,
      height: RULESET.playerHeight,
      yaw: 0, pitch: 0,
      onGround: false,
      hp: RULESET.playerHp,
      attackCooldownLeft: 0,
      input: { buttons: 0, yaw: 0, pitch: 0 },
      inventory,
      tools,
      nextToolId: 4,
      equip: { mode: EQUIP_MODE.TOOL, ref: 1 }, // the bone pick starts in hand
      mining: null, // { x, y, z, progress } while holding a break
    },
    banking: { day: emptyBankingWindow(), night: emptyBankingWindow() },
    killValue: 0,
    kills: { hollowed: 0, gloomwisp: 0, ashboar: 0 },
    blocksPlaced: 0, // §3.3 tie-break penalty, reported on the shift report
    entities: createEntityPool(),
    nextEntityId: 2,
    rng: createStreams(['spawn', 'ai', 'loot']),
    hearths: {}, // "x,y,z" -> { ore, charges, progress, out }
    lights: {}, // "x,y,z" -> level (torches; lit hearths)
    cache,
    world,
    hash: '',
  };
  state.hash = toHex64(hashAscii(seed, `deepshift-run-v1:${RULESET_HASH}`));
  return state;
}

export function equippedTool(state) {
  const equip = state.player.equip;
  if (equip.mode !== EQUIP_MODE.TOOL) return null;
  for (const tool of state.player.tools) {
    if (tool.id === equip.ref) return tool;
  }
  return null;
}

function eyeOf(player) {
  return { x: player.x, y: player.y + RULESET.playerEyeHeight, z: player.z };
}

function withinReachOfBlock(player, bx, by, bz, reachBlocks) {
  const eye = eyeOf(player);
  const dx = eye.x - (bx * FP_ONE + FP_HALF);
  const dy = eye.y - (by * FP_ONE + FP_HALF);
  const dz = eye.z - (bz * FP_ONE + FP_HALF);
  const r = reachBlocks * FP_ONE;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

// Is a station block within player reach? Scans the reach cube (rare:
// only on CRAFT commands).
export function stationNear(state, blockId) {
  const p = state.player;
  const px = fpFloor(p.x);
  const py = fpFloor(p.y);
  const pz = fpFloor(p.z);
  const r = RULESET.reach;
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const bx = px + dx;
        const by = py + dy;
        const bz = pz + dz;
        if (getBlock(state.world, bx, by, bz) !== blockId) continue;
        if (withinReachOfBlock(p, bx, by, bz, r)) return true;
      }
    }
  }
  return false;
}

// --- world edits (every mutation flows through here: journal + lights) ---

function applyEdit(state, x, y, z, id, journal) {
  const before = getBlock(state.world, x, y, z);
  const key = `${x},${y},${z}`;
  if (lightOf(before) > 0) delete state.lights[key];
  if (lightOf(id) > 0) state.lights[key] = lightOf(id);
  setBlock(state.world, x, y, z, id);
  journal.push(x, y, z, blockCode(id));
}

// §6.1 gravity: sand/gravel settle instantly (DS-1c form) when support goes.
function settleAboveRemoved(state, x, y, z, journal) {
  const world = state.world;
  let k = 0;
  while (hasGravity(getBlock(world, x, y + 1 + k, z))) k += 1;
  if (k === 0) return;
  const ids = [];
  for (let i = 0; i < k; i += 1) ids.push(getBlock(world, x, y + 1 + i, z));
  let base = y;
  while (base > RULESET.worldboneDepth && getBlock(world, x, base - 1, z) === 'air') base -= 1;
  for (let i = 0; i < k; i += 1) applyEdit(state, x, y + 1 + i, z, 'air', journal);
  for (let i = 0; i < k; i += 1) applyEdit(state, x, base + i, z, ids[i], journal);
}

function settlePlaced(state, x, y, z, journal) {
  const world = state.world;
  const id = getBlock(world, x, y, z);
  if (!hasGravity(id)) return;
  let base = y;
  while (base > RULESET.worldboneDepth && getBlock(world, x, base - 1, z) === 'air') base -= 1;
  if (base === y) return;
  applyEdit(state, x, y, z, 'air', journal);
  applyEdit(state, x, base, z, id, journal);
}

function removeBlock(state, x, y, z, journal) {
  const id = getBlock(state.world, x, y, z);
  const key = `${x},${y},${z}`;
  if (id === 'hearth' && state.hearths[key] !== undefined) {
    // Contents come back out; burning charge is spent heat, gone.
    const h = state.hearths[key];
    state.player.inventory.copper_ore += h.ore;
    state.player.inventory.copper_ingot += h.out;
    delete state.hearths[key];
  }
  applyEdit(state, x, y, z, 'air', journal);
  settleAboveRemoved(state, x, y, z, journal);
  return id;
}

function wearTool(state, tool) {
  if (tool === null) return;
  tool.dur -= 1;
  if (tool.dur > 0) return;
  const tools = state.player.tools;
  const idx = tools.indexOf(tool);
  if (idx !== -1) tools.splice(idx, 1);
  const equip = state.player.equip;
  if (equip.mode === EQUIP_MODE.TOOL && equip.ref === tool.id) {
    state.player.equip = { mode: EQUIP_MODE.HAND, ref: 0 };
  }
}

// --- command application (invalid commands are deterministic no-ops) ---

function applyCommand(state, cmd, journal) {
  const p = state.player;
  switch (cmd.type) {
    case CMD.MOVE: {
      p.input = { buttons: cmd.buttons, yaw: cmd.yaw, pitch: cmd.pitch };
      p.yaw = cmd.yaw;
      p.pitch = cmd.pitch;
      return;
    }
    case CMD.MINE_START: {
      p.mining = null;
      if (!inRegionBlock(cmd.x, cmd.y, cmd.z)) return;
      if (!isBreakable(getBlock(state.world, cmd.x, cmd.y, cmd.z))) return;
      if (!withinReachOfBlock(p, cmd.x, cmd.y, cmd.z, RULESET.reach)) return;
      p.mining = { x: cmd.x, y: cmd.y, z: cmd.z, progress: 0 };
      return;
    }
    case CMD.MINE_STOP: {
      p.mining = null;
      return;
    }
    case CMD.PLACE: {
      if (!inRegionBlock(cmd.x, cmd.y, cmd.z)) return;
      if (getBlock(state.world, cmd.x, cmd.y, cmd.z) !== 'air') return;
      if (p.inventory[cmd.block] === undefined || p.inventory[cmd.block] <= 0) return;
      if (!withinReachOfBlock(p, cmd.x, cmd.y, cmd.z, RULESET.reach)) return;
      if (isSolid(cmd.block)) {
        if (bodyIntersectsBlock(p, cmd.x, cmd.y, cmd.z)) return;
        const pool = state.entities;
        for (let i = 0; i < pool.length; i += 1) {
          if (pool[i].alive === 1 && bodyIntersectsBlock(pool[i], cmd.x, cmd.y, cmd.z)) return;
        }
      }
      p.inventory[cmd.block] -= 1;
      applyEdit(state, cmd.x, cmd.y, cmd.z, cmd.block, journal);
      if (cmd.block === 'hearth') {
        state.hearths[`${cmd.x},${cmd.y},${cmd.z}`] = { ore: 0, charges: 0, progress: 0, out: 0 };
      }
      settlePlaced(state, cmd.x, cmd.y, cmd.z, journal);
      state.blocksPlaced += 1;
      return;
    }
    case CMD.ATTACK: {
      if (p.attackCooldownLeft > 0) return;
      const target = findEntityById(state, cmd.entityId);
      if (target === null) return;
      const eye = eyeOf(p);
      const dx = eye.x - target.x;
      const dy = eye.y - (target.y + floorDiv(target.height, 2));
      const dz = eye.z - target.z;
      const r = RULESET.attackRange * FP_ONE;
      if (dx * dx + dy * dy + dz * dz > r * r) return;
      p.attackCooldownLeft = RULESET.attackCooldown;
      const tool = equippedTool(state);
      damageEntity(state, target, meleeDamage(tool), true);
      wearTool(state, tool);
      return;
    }
    case CMD.BANK: {
      const c = state.cache;
      if (!withinReachOfBlock(p, c.x, c.y, c.z, RULESET.reach)) return;
      const window = isNight(state.tick) ? state.banking.night : state.banking.day;
      for (const bank of BANKABLE) {
        const units = p.inventory[bank.item];
        if (units > 0) {
          p.inventory[bank.item] = 0;
          window[bank.item] += units;
        }
      }
      return;
    }
    case CMD.CRAFT: {
      const r = RECIPES[cmd.recipeId];
      if (r.station === 'worktable' && !stationNear(state, 'worktable')) return;
      if (!canCraft(p.inventory, r)) return;
      applyCraftInputs(p.inventory, r);
      if (r.tool !== undefined) {
        p.tools.push({
          id: p.nextToolId, kind: r.tool.kind, tier: r.tool.tier,
          dur: toolTier(r.tool.tier).durability,
        });
        p.nextToolId += 1;
      }
      return;
    }
    case CMD.EQUIP: {
      if (cmd.mode === EQUIP_MODE.HAND) {
        p.equip = { mode: EQUIP_MODE.HAND, ref: 0 };
      } else if (cmd.mode === EQUIP_MODE.TOOL) {
        for (const tool of p.tools) {
          if (tool.id === cmd.ref) {
            p.equip = { mode: EQUIP_MODE.TOOL, ref: cmd.ref };
            return;
          }
        }
      } else {
        p.equip = { mode: EQUIP_MODE.ITEM, ref: cmd.ref };
      }
      return;
    }
    case CMD.HEARTH_PUT: {
      const key = `${cmd.x},${cmd.y},${cmd.z}`;
      if (getBlock(state.world, cmd.x, cmd.y, cmd.z) !== 'hearth') return;
      if (!withinReachOfBlock(p, cmd.x, cmd.y, cmd.z, RULESET.reach)) return;
      const h = state.hearths[key] ?? (state.hearths[key] = { ore: 0, charges: 0, progress: 0, out: 0 });
      if (cmd.slot === HEARTH_SLOT.ORE) {
        if (p.inventory.copper_ore > 0) {
          p.inventory.copper_ore -= 1;
          h.ore += 1;
        }
      } else if (p.inventory.coal > 0) {
        p.inventory.coal -= 1;
        h.charges += RULESET.coalSmelts;
      } else if (p.inventory.gnarlpine_log > 0) {
        p.inventory.gnarlpine_log -= 1;
        h.charges += RULESET.logSmelts;
      }
      return;
    }
    case CMD.HEARTH_TAKE: {
      const key = `${cmd.x},${cmd.y},${cmd.z}`;
      const h = state.hearths[key];
      if (h === undefined) return;
      if (!withinReachOfBlock(p, cmd.x, cmd.y, cmd.z, RULESET.reach)) return;
      if (h.out > 0) {
        p.inventory.copper_ingot += h.out;
        h.out = 0;
      } else if (h.ore > 0) {
        p.inventory.copper_ore += h.ore;
        h.ore = 0;
        h.progress = 0;
      }
      return;
    }
    default:
      throw new Error(`unknown command type: ${cmd.type}`);
  }
}

// --- per-tick systems ---

// §8.1 hold-to-mine: progress accrues while the hold lasts and the target
// stays valid; HL-insufficient targets cap at the 20% ring and never break.
function progressMining(state, journal) {
  const p = state.player;
  const m = p.mining;
  if (m === null) return;
  const id = getBlock(state.world, m.x, m.y, m.z);
  if (!isBreakable(id) || !withinReachOfBlock(p, m.x, m.y, m.z, RULESET.reach)) {
    p.mining = null;
    return;
  }
  const tool = equippedTool(state);
  const total = breakTicks(id, tool);
  if (total === NEVER) {
    m.progress = Math.min(m.progress + 1, progressCapTicks(id));
    return;
  }
  m.progress += 1;
  if (m.progress < total) return;
  // The break lands.
  const drop = dropOf(id);
  if (drop !== null) p.inventory[drop] += 1;
  if (id === 'gravel' &&
      nextInt(state.rng, worldSeed(state.world), 'loot', RULESET.flintChance) === 0) {
    p.inventory.flint += 1; // §6.1: 10% flint
  }
  removeBlock(state, m.x, m.y, m.z, journal);
  wearTool(state, tool);
  p.mining = null;
}

// §7.2 hearths: 5 s/item; coal buys 8 smelts, a log 1. Lit = smelting.
function updateHearths(state) {
  const keys = Object.keys(state.hearths).sort();
  for (const key of keys) {
    const h = state.hearths[key];
    const smelting = h.ore > 0 && h.charges > 0;
    if (smelting) {
      h.progress += 1;
      if (h.progress >= RULESET.smeltTicks) {
        h.ore -= 1;
        h.charges -= 1;
        h.out += 1;
        h.progress = 0;
      }
    } else {
      h.progress = 0;
    }
    // Light 14 when lit (§6.3); sync the light table to the truth.
    const lit = h.ore > 0 && h.charges > 0;
    if (lit) state.lights[key] = RULESET.hearthLight;
    else if (state.lights[key] === RULESET.hearthLight) delete state.lights[key];
  }
}

function updatePlayer(state) {
  const p = state.player;
  if (p.attackCooldownLeft > 0) p.attackCooldownLeft -= 1;
  const { buttons, yaw } = p.input;
  const f = (buttons & BUTTON.FORWARD ? 1 : 0) - (buttons & BUTTON.BACK ? 1 : 0);
  const r = (buttons & BUTTON.RIGHT ? 1 : 0) - (buttons & BUTTON.LEFT ? 1 : 0);
  // yaw 0 faces -Z; forward = (sin yaw, 0, -cos yaw), right = (cos yaw, 0, sin yaw).
  const wishX = f * fpSin(yaw) + r * fpCos(yaw);
  const wishZ = f * (0 - fpCos(yaw)) + r * fpSin(yaw);
  const speed = (buttons & BUTTON.CROUCH) !== 0 ? RULESET.crouchSpeed
    : (buttons & BUTTON.SPRINT) !== 0 ? RULESET.sprintSpeed : RULESET.moveSpeed;
  p.vx = fpMul(wishX, speed);
  p.vz = fpMul(wishZ, speed);
  if ((buttons & BUTTON.JUMP) !== 0 && p.onGround) p.vy = RULESET.jumpVelocity;
  p.vy = Math.max(p.vy - RULESET.gravity, 0 - RULESET.terminalVelocity);
  const hit = moveBody(state.world, p, p.vx, p.vy, p.vz);
  p.onGround = hit.onGround;
  if (hit.hitY) p.vy = 0;
  if (hit.hitX) p.vx = 0;
  if (hit.hitZ) p.vz = 0;
  // §8.3: regen 1 HP / 4 s above 25% HP (no hunger in ranked formats).
  if (state.tick % RULESET.regenIntervalTicks === 0 &&
      p.hp > RULESET.regenAboveHp && p.hp < RULESET.playerHp) {
    p.hp = Math.min(RULESET.playerHp, p.hp + 2);
  }
}

// --- the per-tick hash chain ---

function digestInts(state, commands, journal) {
  const p = state.player;
  const ints = [
    state.tick, STATUS[state.status], END_REASON[state.endReason ?? 'none'],
    p.x, p.y, p.z, p.vx, p.vy, p.vz,
    p.yaw, p.pitch, p.hp, p.onGround ? 1 : 0, p.attackCooldownLeft,
    p.input.buttons, p.input.yaw, p.input.pitch,
    p.equip.mode, p.equip.ref, p.nextToolId,
  ];
  if (p.mining === null) ints.push(-1, 0, 0, 0, 0);
  else ints.push(1, p.mining.x, p.mining.y, p.mining.z, p.mining.progress);
  for (const itemId of ITEM_IDS) ints.push(p.inventory[itemId]);
  ints.push(p.tools.length);
  for (const tool of p.tools) {
    ints.push(tool.id, toolKindCode(tool.kind), TIER_IDS.indexOf(tool.tier), tool.dur);
  }
  for (const bank of BANKABLE) ints.push(state.banking.day[bank.item]);
  for (const bank of BANKABLE) ints.push(state.banking.night[bank.item]);
  ints.push(state.killValue, state.kills.hollowed, state.kills.gloomwisp, state.kills.ashboar);
  ints.push(state.blocksPlaced);
  ints.push(state.rng.spawn, state.rng.ai, state.rng.loot);
  ints.push(state.nextEntityId);
  const pool = state.entities;
  let alive = 0;
  for (let i = 0; i < pool.length; i += 1) if (pool[i].alive === 1) alive += 1;
  ints.push(alive);
  for (let i = 0; i < pool.length; i += 1) {
    const e = pool[i];
    if (e.alive !== 1) continue;
    ints.push(i, e.id, e.arch, e.x, e.y, e.z, e.vx, e.vy, e.vz, e.hp,
      e.onGround, e.cd, e.state, e.timer, e.tx, e.tz, e.hurt, e.lastContact, e.spawnTick);
  }
  const hearthKeys = Object.keys(state.hearths).sort();
  ints.push(hearthKeys.length);
  for (const key of hearthKeys) {
    const h = state.hearths[key];
    const [x, y, z] = key.split(',').map(Number);
    ints.push(x, y, z, h.ore, h.charges, h.progress, h.out);
  }
  const lightKeys = Object.keys(state.lights).sort();
  ints.push(lightKeys.length);
  for (const key of lightKeys) {
    const [x, y, z] = key.split(',').map(Number);
    ints.push(x, y, z, state.lights[key]);
  }
  ints.push(commands.length);
  for (const cmd of commands) ints.push(...encodeCommand(cmd));
  ints.push(journal.length);
  ints.push(...journal);
  return ints;
}

// Advance exactly one tick. `commands` are this tick's canonical commands.
export function tickSim(state, commands = []) {
  if (state.status !== 'running') throw new Error('tickSim called on a finished run');
  for (const cmd of commands) {
    validateCommand(cmd);
    if (cmd.t !== state.tick) throw new Error(`command tick ${cmd.t} != sim tick ${state.tick}`);
  }
  const ordered = sortCommands(commands);
  const journal = [];
  for (const cmd of ordered) applyCommand(state, cmd, journal);

  progressMining(state, journal);
  updateHearths(state);

  // D1: ActiveSet from authoritative anchors only (the player).
  const anchors = [{
    cx: floorDiv(fpFloor(state.player.x), 32),
    cy: floorDiv(fpFloor(state.player.y), 32),
    cz: floorDiv(fpFloor(state.player.z), 32),
  }];
  const activeSet = computeActiveSet(anchors);

  updatePlayer(state);
  updateEntities(state, (cx, cy, cz) => activeSetHas(activeSet, cx, cy, cz));
  trySpawns(state);

  // End evaluation: death at any tick; the quota verdict only at dawn
  // (§3.2 — the win requires BEING ALIVE when the sun rises).
  if (state.player.hp <= 0) {
    state.status = 'lost';
    state.endReason = 'death';
  } else if (state.tick + 1 >= RULESET.runTicks) {
    if (quotaMet(state.banking)) {
      state.status = 'won';
      state.endReason = 'dawn';
    } else {
      state.status = 'lost';
      state.endReason = 'dawn-timeout';
    }
  }

  state.tick += 1;
  if (state.status !== 'running') state.score = computeScore(state);
  const prev = fromHex64(state.hash);
  state.hash = toHex64(hashInts(prev, digestInts(state, ordered, journal)));
  return state;
}

// --- the WorldView seam (renderer-facing, read-only) ---

// Plain-data snapshot: everything a renderer or DOM HUD needs, nothing it
// may write.
export function snapshot(state) {
  const p = state.player;
  const values = bankedValues(state.banking);
  const nightStart = RULESET.dayTicks + RULESET.duskTicks;
  const tool = equippedTool(state);
  let mining = null;
  if (p.mining !== null) {
    const id = getBlock(state.world, p.mining.x, p.mining.y, p.mining.z);
    const total = isBreakable(id) ? breakTicks(id, tool) : NEVER;
    mining = {
      x: p.mining.x, y: p.mining.y, z: p.mining.z,
      progress: p.mining.progress,
      total: total === NEVER ? 0 : total,
      gated: total === NEVER, // HL insufficient: the 20% ring
      cap: progressCapTicks(id),
    };
  }
  const hearths = {};
  for (const key of Object.keys(state.hearths)) {
    const h = state.hearths[key];
    hearths[key] = { ore: h.ore, charges: h.charges, progress: h.progress, out: h.out };
  }
  return {
    tick: state.tick,
    status: state.status,
    endReason: state.endReason,
    score: state.status === 'running' ? computeScore(state) : state.score,
    phase: phaseOf(state.tick),
    night: isNight(state.tick),
    ticksLeft: Math.max(0, RULESET.runTicks - state.tick),
    ticksToNight: Math.max(0, nightStart - state.tick),
    quota: RULESET.quotaValue,
    banked: {
      dayValue: values.day,
      nightValue: values.night,
      value: values.total,
      day: { ...state.banking.day },
      night: { ...state.banking.night },
    },
    killValue: state.killValue,
    kills: { ...state.kills },
    blocksPlaced: state.blocksPlaced,
    cache: { ...state.cache },
    region: { ...REGION },
    seedHex: state.seedHex,
    player: {
      x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz,
      yaw: p.yaw, pitch: p.pitch, hp: p.hp, maxHp: RULESET.playerHp,
      onGround: p.onGround,
      inventory: { ...p.inventory },
      tools: p.tools.map((t) => ({ ...t })),
      equip: { ...p.equip },
      mining,
    },
    hearths,
    entities: (() => {
      const out = [];
      const pool = state.entities;
      for (let i = 0; i < pool.length; i += 1) {
        const e = pool[i];
        if (e.alive !== 1) continue;
        out.push({
          id: e.id, archetype: ARCH_NAMES[e.arch],
          x: e.x, y: e.y, z: e.z, hp: e.hp, state: e.state,
        });
      }
      return out;
    })(),
  };
}

// Read-only voxel access for meshing. Memoized pure generation may fault
// chunks in, but never changes any observable value.
export function readBlock(state, x, y, z) {
  return getBlock(state.world, x, y, z);
}

export function drainDirty(state) {
  return drainDirtySections(state.world);
}
