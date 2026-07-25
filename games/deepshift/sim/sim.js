// The DEEPSHIFT DS-1a sim kernel. Pure Node-importable: zero browser
// globals, zero renderer knowledge, injected adapters only (the sim never
// reads a clock — callers feed ticks; it never touches storage — state IS
// the save shape, D2/D5).
//
// One tick = one call to tickSim(state, commandsForThisTick):
//   1. commands apply in canonical (t, p, s) order
//   2. ActiveSet is computed from anchors (D1) — frozen entities do not run
//   3. player physics, then entities in ascending-id order, then spawning
//   4. win/loss evaluation (death, then quota, then dawn — documented order)
//   5. tick advances and the per-tick hash chain absorbs a state digest
//
// All positions/velocities are Q16.16 integers (see README.md).

import { RULESET, RULESET_HASH } from './constants.js';
import { hashInts, hashAscii, fromHex64, toHex64 } from './math/xxhash64.js';
import { FP_ONE, FP_HALF, fpFloor, fpMul, floorDiv, clamp } from './math/fixed.js';
import { fpSin, fpCos } from './math/trig.js';
import { createStreams, nextInt } from './math/prng.js';
import { CMD, BUTTON, validateCommand, sortCommands, encodeCommand } from './commands.js';
import { computeActiveSet, activeSetHas } from './activation.js';
import { blockCode, isBreakable, dropOf } from './world/blocks.js';
import {
  createWorld, worldSeed, getBlock, setBlock, inRegionBlock, drainDirtySections,
} from './world/world.js';
import { columnHeight, spawnPosition, cachePosition, REGION } from './world/worldgen.js';
import { moveBody, bodyIntersectsBlock } from './physics.js';

const STATUS = Object.freeze({ running: 0, won: 1, lost: 2 });
const END_REASON = Object.freeze({ none: 0, 'quota-banked': 1, death: 2, 'dawn-timeout': 3 });
export const PLAYER_ID = 1;

export function isNight(tick) {
  return tick >= RULESET.dayTicks;
}

export function createSim(seedHex) {
  const world = createWorld(seedHex);
  const seed = worldSeed(world);
  const spawn = spawnPosition(seed);
  const cache = cachePosition(seed);
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
      inventory: { dirt: 0, fieldstone: 0, coal: 0 },
    },
    bankedDay: 0,
    bankedNight: 0,
    entities: {},
    nextEntityId: 2,
    rng: createStreams(['spawn', 'ai']),
    cache,
    world,
    hash: '',
  };
  state.hash = toHex64(hashAscii(seed, `deepshift-run-v1:${RULESET_HASH}`));
  return state;
}

function entityIds(state) {
  return Object.keys(state.entities).map(Number).sort((a, b) => a - b);
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
    case CMD.MINE: {
      if (!inRegionBlock(cmd.x, cmd.y, cmd.z)) return;
      const id = getBlock(state.world, cmd.x, cmd.y, cmd.z);
      if (!isBreakable(id)) return;
      if (!withinReachOfBlock(p, cmd.x, cmd.y, cmd.z, RULESET.reach)) return;
      const drop = dropOf(id);
      if (drop !== null) p.inventory[drop] += 1;
      setBlock(state.world, cmd.x, cmd.y, cmd.z, 'air');
      journal.push(cmd.x, cmd.y, cmd.z, blockCode('air'));
      return;
    }
    case CMD.PLACE: {
      if (!inRegionBlock(cmd.x, cmd.y, cmd.z)) return;
      if (getBlock(state.world, cmd.x, cmd.y, cmd.z) !== 'air') return;
      if (p.inventory[cmd.block] <= 0) return;
      if (!withinReachOfBlock(p, cmd.x, cmd.y, cmd.z, RULESET.reach)) return;
      if (bodyIntersectsBlock(p, cmd.x, cmd.y, cmd.z)) return;
      for (const id of entityIds(state)) {
        if (bodyIntersectsBlock(state.entities[id], cmd.x, cmd.y, cmd.z)) return;
      }
      p.inventory[cmd.block] -= 1;
      setBlock(state.world, cmd.x, cmd.y, cmd.z, cmd.block);
      journal.push(cmd.x, cmd.y, cmd.z, blockCode(cmd.block));
      return;
    }
    case CMD.ATTACK: {
      if (p.attackCooldownLeft > 0) return;
      const target = state.entities[cmd.entityId];
      if (target === undefined) return;
      const eye = eyeOf(p);
      const dx = eye.x - target.x;
      const dy = eye.y - (target.y + floorDiv(target.height, 2));
      const dz = eye.z - target.z;
      const r = RULESET.attackRange * FP_ONE;
      if (dx * dx + dy * dy + dz * dz > r * r) return;
      p.attackCooldownLeft = RULESET.attackCooldown;
      target.hp -= RULESET.attackDamage;
      if (target.hp <= 0) delete state.entities[cmd.entityId];
      return;
    }
    case CMD.BANK: {
      const c = state.cache;
      if (!withinReachOfBlock(p, c.x, c.y, c.z, RULESET.reach)) return;
      const amount = p.inventory.fieldstone;
      if (amount === 0) return;
      p.inventory.fieldstone = 0;
      if (isNight(state.tick)) state.bankedNight += amount;
      else state.bankedDay += amount;
      return;
    }
    default:
      throw new Error(`unknown command type: ${cmd.type}`);
  }
}

// --- per-tick simulation ---

function updatePlayer(state) {
  const p = state.player;
  if (p.attackCooldownLeft > 0) p.attackCooldownLeft -= 1;
  const { buttons, yaw } = p.input;
  const f = (buttons & BUTTON.FORWARD ? 1 : 0) - (buttons & BUTTON.BACK ? 1 : 0);
  const r = (buttons & BUTTON.RIGHT ? 1 : 0) - (buttons & BUTTON.LEFT ? 1 : 0);
  // yaw 0 faces -Z; forward = (sin yaw, 0, -cos yaw), right = (cos yaw, 0, sin yaw).
  const wishX = f * fpSin(yaw) + r * fpCos(yaw);
  const wishZ = f * (0 - fpCos(yaw)) + r * fpSin(yaw);
  p.vx = fpMul(wishX, RULESET.moveSpeed);
  p.vz = fpMul(wishZ, RULESET.moveSpeed);
  if ((buttons & BUTTON.JUMP) !== 0 && p.onGround) p.vy = RULESET.jumpVelocity;
  p.vy = Math.max(p.vy - RULESET.gravity, 0 - RULESET.terminalVelocity);
  const hit = moveBody(state.world, p, p.vx, p.vy, p.vz);
  p.onGround = hit.onGround;
  if (hit.hitY) p.vy = 0;
  if (hit.hitX) p.vx = 0;
  if (hit.hitZ) p.vz = 0;
}

function updateEntity(state, e) {
  const p = state.player;
  if (e.attackCooldownLeft > 0) e.attackCooldownLeft -= 1;
  // Chase: per-axis approach clamped to speed (Chebyshev gait — graybox AI).
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  e.vx = clamp(dx, 0 - RULESET.hollowedSpeed, RULESET.hollowedSpeed);
  e.vz = clamp(dz, 0 - RULESET.hollowedSpeed, RULESET.hollowedSpeed);
  e.vy = Math.max(e.vy - RULESET.gravity, 0 - RULESET.terminalVelocity);
  const hit = moveBody(state.world, e, e.vx, e.vy, e.vz);
  e.onGround = hit.onGround;
  if (hit.hitY) e.vy = 0;
  if ((hit.hitX || hit.hitZ) && e.onGround) e.vy = RULESET.jumpVelocity;
  // Melee: horizontal Chebyshev range + vertical overlap.
  const adx = Math.abs(p.x - e.x);
  const adz = Math.abs(p.z - e.z);
  const horizontal = Math.max(adx, adz);
  const overlap = p.y < e.y + e.height && e.y < p.y + p.height;
  if (e.attackCooldownLeft === 0 && horizontal <= RULESET.hollowedAttackRange && overlap) {
    p.hp = Math.max(0, p.hp - RULESET.hollowedDamage);
    e.attackCooldownLeft = RULESET.hollowedAttackCooldown;
  }
}

function trySpawnHollowed(state) {
  if (!isNight(state.tick)) return;
  if (state.tick % RULESET.spawnIntervalTicks !== 0) return;
  let count = 0;
  for (const id of entityIds(state)) {
    if (state.entities[id].archetype === 'hollowed') count += 1;
  }
  if (count >= RULESET.hollowedCap) return;
  const seed = worldSeed(state.world);
  const angle = nextInt(state.rng, seed, 'spawn', 4096);
  const dist = RULESET.spawnMinDist + nextInt(state.rng, seed, 'spawn', RULESET.spawnDistRange);
  const pbx = fpFloor(state.player.x);
  const pbz = fpFloor(state.player.z);
  const bx = clamp(pbx + floorDiv(fpCos(angle) * dist, FP_ONE), 2, REGION.blocksX - 3);
  const bz = clamp(pbz + floorDiv(fpSin(angle) * dist, FP_ONE), 2, REGION.blocksZ - 3);
  const by = columnHeight(seed, bx, bz);
  // Feet cell and head cell must be free (a blocked draw is skipped, never
  // retried — the stream cursor already advanced deterministically).
  if (getBlock(state.world, bx, by, bz) !== 'air') return;
  if (getBlock(state.world, bx, by + 1, bz) !== 'air') return;
  const id = state.nextEntityId;
  state.nextEntityId += 1;
  state.entities[id] = {
    id,
    archetype: 'hollowed',
    x: bx * FP_ONE + FP_HALF,
    y: by * FP_ONE,
    z: bz * FP_ONE + FP_HALF,
    vx: 0, vy: 0, vz: 0,
    halfW: RULESET.hollowedHalfWidth,
    height: RULESET.hollowedHeight,
    hp: RULESET.hollowedHp,
    onGround: false,
    attackCooldownLeft: 0,
    spawnTick: state.tick,
  };
}

// --- score (documented in README.md) ---

export function computeScore(state) {
  let score = state.bankedDay * RULESET.scorePerBankedDay
    + state.bankedNight * RULESET.scorePerBankedNight
    + floorDiv(state.tick, RULESET.tickHz) * RULESET.scorePerSurvivedSecond;
  if (state.status === 'won') score += RULESET.scoreWinBonus;
  return score;
}

// --- the per-tick hash chain ---

function digestInts(state, commands, journal) {
  const p = state.player;
  const ints = [
    state.tick, STATUS[state.status], END_REASON[state.endReason ?? 'none'],
    p.x, p.y, p.z, p.vx, p.vy, p.vz,
    p.yaw, p.pitch, p.hp, p.onGround ? 1 : 0, p.attackCooldownLeft,
    p.input.buttons, p.input.yaw, p.input.pitch,
    p.inventory.dirt, p.inventory.fieldstone, p.inventory.coal,
    state.bankedDay, state.bankedNight,
    state.rng.spawn, state.rng.ai,
    state.nextEntityId,
  ];
  const ids = entityIds(state);
  ints.push(ids.length);
  for (const id of ids) {
    const e = state.entities[id];
    ints.push(e.id, e.hp, e.x, e.y, e.z, e.vx, e.vy, e.vz,
      e.onGround ? 1 : 0, e.attackCooldownLeft, e.spawnTick);
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

  // D1: ActiveSet from authoritative anchors only (the player).
  const anchors = [{
    cx: floorDiv(fpFloor(state.player.x), 32),
    cy: floorDiv(fpFloor(state.player.y), 32),
    cz: floorDiv(fpFloor(state.player.z), 32),
  }];
  const activeSet = computeActiveSet(anchors);

  updatePlayer(state);
  for (const id of entityIds(state)) {
    const e = state.entities[id];
    const ecx = floorDiv(fpFloor(e.x), 32);
    const ecy = floorDiv(fpFloor(e.y), 32);
    const ecz = floorDiv(fpFloor(e.z), 32);
    // Frozen means frozen (D1): entities outside the ActiveSet do not run.
    if (activeSetHas(activeSet, ecx, ecy, ecz)) updateEntity(state, e);
  }
  trySpawnHollowed(state);

  // End evaluation, in documented order: death, quota, dawn.
  if (state.player.hp <= 0) {
    state.status = 'lost';
    state.endReason = 'death';
  } else if (state.bankedDay + state.bankedNight >= RULESET.fieldstoneQuota) {
    state.status = 'won';
    state.endReason = 'quota-banked';
  } else if (state.tick + 1 >= RULESET.runTicks) {
    state.status = 'lost';
    state.endReason = 'dawn-timeout';
  }

  state.tick += 1;
  if (state.status !== 'running') state.score = computeScore(state);
  const prev = fromHex64(state.hash);
  state.hash = toHex64(hashInts(prev, digestInts(state, ordered, journal)));
  return state;
}

// --- the WorldView seam (renderer-facing, read-only) ---

// Plain-data snapshot: everything a renderer needs, nothing it may write.
export function snapshot(state) {
  const p = state.player;
  return {
    tick: state.tick,
    status: state.status,
    endReason: state.endReason,
    score: state.status === 'running' ? computeScore(state) : state.score,
    night: isNight(state.tick),
    ticksLeft: Math.max(0, RULESET.runTicks - state.tick),
    quota: RULESET.fieldstoneQuota,
    banked: { day: state.bankedDay, night: state.bankedNight },
    cache: { ...state.cache },
    region: { ...REGION },
    player: {
      x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz,
      yaw: p.yaw, pitch: p.pitch, hp: p.hp, maxHp: RULESET.playerHp,
      onGround: p.onGround,
      inventory: { ...p.inventory },
    },
    entities: entityIds(state).map((id) => {
      const e = state.entities[id];
      return { id: e.id, archetype: e.archetype, x: e.x, y: e.y, z: e.z, hp: e.hp };
    }),
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
