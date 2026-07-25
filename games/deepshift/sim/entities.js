// DS-1c entities: a fixed-slot POOL (the AGENTS.md perf bar — no
// allocation in the per-tick hot loop, a hard ceiling by construction) and
// the §10 rules for the three Dusklands enemies plus the gloom dart
// projectile.
//
//   Ashboar   day, neutral wildlife; territorial charge (§10.2)
//   Hollowed  night melee; burns in direct sunlight (§10.1/§10.2)
//   Gloomwisp night ranged drifter; 1 dmg/s in light >= 12, disintegrates
//             in direct sun (§10.2) — lure it over your torchline
//
// Every slot is a plain always-present-fields record (state IS the save
// shape, D2). Update order is ascending slot index; slot assignment is
// lowest-free-first: both deterministic. HP/damage in half-points.

import { RULESET } from './constants.js';
import { FP_ONE, FP_HALF, fpFloor, floorDiv, clamp, isqrt } from './math/fixed.js';
import { fpSin, fpCos } from './math/trig.js';
import { nextInt } from './math/prng.js';
import { moveBody } from './physics.js';
import { isSolid, isOpaqueBlock } from './world/blocks.js';
import { getBlock, worldSeed } from './world/world.js';
import { columnHeight, REGION } from './world/worldgen.js';
import { lightAt, inDirectSun, phaseOf, isNight } from './light.js';

export const ARCH = Object.freeze({ hollowed: 1, gloomwisp: 2, ashboar: 3, dart: 4 });
export const ARCH_NAMES = Object.freeze({ 1: 'hollowed', 2: 'gloomwisp', 3: 'ashboar', 4: 'dart' });

function threatOf(arch) {
  if (arch === ARCH.hollowed) return RULESET.threatHollowed;
  if (arch === ARCH.gloomwisp) return RULESET.threatGloomwisp;
  if (arch === ARCH.ashboar) return RULESET.threatAshboar;
  return 0;
}

function deadSlot() {
  return {
    alive: 0, id: 0, arch: 0,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    halfW: 0, height: 0, hp: 0, onGround: 0,
    cd: 0, state: 0, timer: 0, tx: 0, tz: 0,
    hurt: 0, lastContact: 0, spawnTick: 0,
  };
}

export function createEntityPool() {
  const pool = [];
  for (let i = 0; i < RULESET.entityPoolSize; i += 1) pool.push(deadSlot());
  return pool;
}

const DIMS = Object.freeze({
  1: { halfW: RULESET.hollowedHalfWidth, height: RULESET.hollowedHeight, hp: RULESET.hollowedHp },
  2: { halfW: RULESET.gloomwispHalfWidth, height: RULESET.gloomwispHeight, hp: RULESET.gloomwispHp },
  3: { halfW: RULESET.ashboarHalfWidth, height: RULESET.ashboarHeight, hp: RULESET.ashboarHp },
  4: { halfW: RULESET.dartHalfWidth, height: RULESET.dartHeight, hp: 1 },
});

// Lowest free slot, stable ascending ids. Returns the slot or null (full).
export function spawnEntity(state, arch, x, y, z) {
  const pool = state.entities;
  for (let i = 0; i < pool.length; i += 1) {
    const e = pool[i];
    if (e.alive === 1) continue;
    const dims = DIMS[arch];
    e.alive = 1;
    e.id = state.nextEntityId;
    state.nextEntityId += 1;
    e.arch = arch;
    e.x = x; e.y = y; e.z = z;
    e.vx = 0; e.vy = 0; e.vz = 0;
    e.halfW = dims.halfW;
    e.height = dims.height;
    e.hp = dims.hp;
    e.onGround = 0;
    e.cd = 0; e.state = 0; e.timer = 0;
    e.tx = x; e.tz = z;
    e.hurt = 0;
    e.lastContact = state.tick;
    e.spawnTick = state.tick;
    return e;
  }
  return null;
}

function freeSlot(e) {
  const fresh = deadSlot();
  for (const key in fresh) e[key] = fresh[key];
}

export function countAlive(state, arch) {
  const pool = state.entities;
  let n = 0;
  for (let i = 0; i < pool.length; i += 1) {
    if (pool[i].alive === 1 && (arch === 0 || pool[i].arch === arch)) n += 1;
  }
  return n;
}

export function hostileCount(state) {
  const pool = state.entities;
  let n = 0;
  for (let i = 0; i < pool.length; i += 1) {
    const a = pool[i];
    if (a.alive === 1 && (a.arch === ARCH.hollowed || a.arch === ARCH.gloomwisp)) n += 1;
  }
  return n;
}

export function findEntityById(state, id) {
  const pool = state.entities;
  for (let i = 0; i < pool.length; i += 1) {
    if (pool[i].alive === 1 && pool[i].id === id) return pool[i];
  }
  return null;
}

// Damage an entity. Kills credit threatValue only when the player dealt
// them (§3.4: burn-off and torchlight pay nothing).
export function damageEntity(state, e, halves, byPlayer) {
  e.hp -= halves;
  e.hurt = 1;
  if (e.hp > 0) return false;
  if (byPlayer && threatOf(e.arch) > 0) {
    state.killValue += threatOf(e.arch);
    state.kills[ARCH_NAMES[e.arch]] += 1;
    if (e.arch === ARCH.ashboar) {
      // §10.2: meat/hide/bone — the day-shift hunting target.
      state.player.inventory.bone += 2;
      state.player.inventory.hide += 1;
      state.player.inventory.meat += 1;
    }
  }
  freeSlot(e);
  return true;
}

function hurtPlayer(state, halves) {
  const p = state.player;
  p.hp = Math.max(0, p.hp - halves);
}

function autoJump(e, hit) {
  if ((hit.hitX || hit.hitZ) && e.onGround === 1) e.vy = RULESET.jumpVelocity;
}

function walkerGravity(e) {
  e.vy = Math.max(e.vy - RULESET.gravity, 0 - RULESET.terminalVelocity);
}

function meleeReach(state, e) {
  const p = state.player;
  const adx = Math.abs(p.x - e.x);
  const adz = Math.abs(p.z - e.z);
  const horizontal = Math.max(adx, adz);
  const overlap = p.y < e.y + e.height && e.y < p.y + p.height;
  return horizontal <= RULESET.hollowedAttackRange + (e.halfW - RULESET.hollowedHalfWidth) && overlap;
}

// --- per-archetype updates ---

function updateHollowed(state, e) {
  const p = state.player;
  if (e.cd > 0) e.cd -= 1;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  e.vx = clamp(dx, 0 - RULESET.hollowedSpeed, RULESET.hollowedSpeed);
  e.vz = clamp(dz, 0 - RULESET.hollowedSpeed, RULESET.hollowedSpeed);
  walkerGravity(e);
  const hit = moveBody(state.world, e, e.vx, e.vy, e.vz);
  e.onGround = hit.onGround ? 1 : 0;
  if (hit.hitY) e.vy = 0;
  autoJump(e, hit);
  if (e.cd === 0 && meleeReach(state, e)) {
    hurtPlayer(state, RULESET.hollowedDamage);
    e.cd = RULESET.hollowedAttackCooldown;
  }
  // §10.1 sunrise burn-off: 2 dmg/s in direct sun, then gone.
  if (state.tick % RULESET.sunBurnIntervalTicks === 0 &&
      inDirectSun(state, fpFloor(e.x), fpFloor(e.y), fpFloor(e.z))) {
    damageEntity(state, e, 1, false);
  }
}

function fireDart(state, e) {
  const p = state.player;
  const fromX = e.x;
  const fromY = e.y + floorDiv(e.height, 2);
  const fromZ = e.z;
  const dx = p.x - fromX;
  const dy = p.y + floorDiv(p.height, 2) - fromY;
  const dz = p.z - fromZ;
  const len = isqrt(dx * dx + dy * dy + dz * dz);
  if (len === 0) return;
  const dart = spawnEntity(state, ARCH.dart, fromX, fromY, fromZ);
  if (dart === null) return; // pool full: the wisp holds its fire
  dart.vx = floorDiv(dx * RULESET.dartSpeed, len);
  dart.vy = floorDiv(dy * RULESET.dartSpeed, len);
  dart.vz = floorDiv(dz * RULESET.dartSpeed, len);
  dart.timer = RULESET.dartLifeTicks;
}

function updateGloomwisp(state, e) {
  const p = state.player;
  if (e.cd > 0) e.cd -= 1;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const hd = isqrt(dx * dx + dz * dz);
  const keepMin = RULESET.gloomwispKeepMin * FP_ONE;
  const keepMax = RULESET.gloomwispKeepMax * FP_ONE;
  const drift = RULESET.gloomwispDriftSpeed;
  let vx = 0;
  let vz = 0;
  if (hd > 0) {
    if (hd > keepMax) {
      vx = floorDiv(dx * drift, hd);
      vz = floorDiv(dz * drift, hd);
    } else if (hd < keepMin) {
      vx = floorDiv(0 - dx * drift, hd);
      vz = floorDiv(0 - dz * drift, hd);
    }
  }
  const targetY = p.y + RULESET.gloomwispHoverAbove * FP_ONE;
  const vy = clamp(targetY - e.y, 0 - floorDiv(drift, 2), floorDiv(drift, 2));
  e.vx = vx; e.vy = vy; e.vz = vz;
  const hit = moveBody(state.world, e, vx, vy, vz);
  e.onGround = 0;
  if (hit.hitX || hit.hitZ) moveBody(state.world, e, 0, drift, 0); // rise over terrain
  if (e.cd === 0 && hd <= RULESET.gloomwispDartRange * FP_ONE) {
    fireDart(state, e);
    e.cd = RULESET.gloomwispDartCooldown;
  }
  const bx = fpFloor(e.x);
  const by = fpFloor(e.y);
  const bz = fpFloor(e.z);
  // §10.2: burns instantly in direct sun; 1 dmg/s in light >= 12.
  if (inDirectSun(state, bx, by, bz)) {
    damageEntity(state, e, e.hp, false);
    return;
  }
  if (state.tick % RULESET.lightHurtIntervalTicks === 0 &&
      lightAt(state, bx, by, bz) >= RULESET.lightHurtThreshold) {
    damageEntity(state, e, 1, false);
  }
}

function updateAshboar(state, e) {
  const p = state.player;
  if (e.cd > 0) e.cd -= 1;
  if (e.timer > 0) e.timer -= 1;
  const adx = Math.abs(p.x - e.x);
  const adz = Math.abs(p.z - e.z);
  const playerDist = Math.max(adx, adz);
  if (e.state === 0) {
    // Neutral wildlife (§10.2): shies away from an approaching orc, but
    // charges when hurt — or when truly cornered (the territorial rule).
    if (e.hurt === 1 || playerDist <= RULESET.ashboarTerritorialDist * FP_HALF) {
      e.state = 1;
      e.timer = RULESET.ashboarChargeTicks;
    } else if (playerDist <= 6 * FP_ONE) {
      e.tx = e.x + (e.x - p.x); // back off: double the gap
      e.tz = e.z + (e.z - p.z);
      e.timer = RULESET.ashboarWanderRetarget;
    } else if (e.timer === 0) {
      const seed = worldSeed(state.world);
      e.tx = e.x + (nextInt(state.rng, seed, 'ai', 17) - 8) * FP_ONE;
      e.tz = e.z + (nextInt(state.rng, seed, 'ai', 17) - 8) * FP_ONE;
      e.timer = RULESET.ashboarWanderRetarget;
    }
  }
  let speed = RULESET.ashboarWalkSpeed;
  let toX = e.tx;
  let toZ = e.tz;
  if (e.state === 1) {
    speed = RULESET.ashboarChargeSpeed;
    toX = p.x;
    toZ = p.z;
    if (e.timer === 0) {
      e.state = 2;
      e.timer = RULESET.ashboarRestTicks;
      e.hurt = 0;
    }
  } else if (e.state === 2) {
    speed = 0;
    if (e.timer === 0) e.state = 0;
  }
  e.vx = clamp(toX - e.x, 0 - speed, speed);
  e.vz = clamp(toZ - e.z, 0 - speed, speed);
  walkerGravity(e);
  const hit = moveBody(state.world, e, e.vx, e.vy, e.vz);
  e.onGround = hit.onGround ? 1 : 0;
  if (hit.hitY) e.vy = 0;
  autoJump(e, hit);
  if (e.state === 1 && e.cd === 0 && meleeReach(state, e)) {
    hurtPlayer(state, RULESET.ashboarDamage);
    e.cd = RULESET.ashboarAttackCooldown;
  }
}

function pointInPlayer(state, x, y, z) {
  const p = state.player;
  return (
    x > p.x - p.halfW && x < p.x + p.halfW &&
    y > p.y && y < p.y + p.height &&
    z > p.z - p.halfW && z < p.z + p.halfW
  );
}

function updateDart(state, e) {
  e.timer -= 1;
  if (e.timer <= 0) {
    freeSlot(e);
    return;
  }
  e.x += e.vx;
  e.y += e.vy;
  e.z += e.vz;
  if (pointInPlayer(state, e.x, e.y, e.z)) {
    hurtPlayer(state, RULESET.dartDamage);
    freeSlot(e);
    return;
  }
  if (isSolid(getBlock(state.world, fpFloor(e.x), fpFloor(e.y), fpFloor(e.z)))) {
    freeSlot(e); // gloom splashes on stone
  }
}

// Advance every live entity in slot order. Frozen chunks (outside the D1
// ActiveSet) freeze their entities: no AI, no physics, no draws.
export function updateEntities(state, activeSetHasChunk) {
  const pool = state.entities;
  const p = state.player;
  for (let i = 0; i < pool.length; i += 1) {
    const e = pool[i];
    if (e.alive !== 1) continue;
    if (!activeSetHasChunk(floorDiv(fpFloor(e.x), 32), floorDiv(fpFloor(e.y), 32), floorDiv(fpFloor(e.z), 32))) {
      continue; // frozen means frozen (D1)
    }
    if (e.arch === ARCH.hollowed) updateHollowed(state, e);
    else if (e.arch === ARCH.gloomwisp) updateGloomwisp(state, e);
    else if (e.arch === ARCH.ashboar) updateAshboar(state, e);
    else if (e.arch === ARCH.dart) updateDart(state, e);
    if (e.alive !== 1) continue;
    // §10.1 despawn: beyond 48 blocks for 30 s without player contact.
    if (e.arch !== ARCH.dart) {
      const far = Math.max(Math.abs(p.x - e.x), Math.abs(p.z - e.z)) > RULESET.despawnDist * FP_ONE;
      if (!far) e.lastContact = state.tick;
      else if (state.tick - e.lastContact > RULESET.despawnTicks) freeSlot(e);
    }
  }
}

// --- spawning (§10.1: light-driven) ---

// The surface walk: worldgen height corrected for player edits (a few
// bounded probes, never a full column scan).
export function surfaceYAt(state, x, z) {
  const world = state.world;
  let y = columnHeight(worldSeed(world), x, z);
  let guard = 0;
  while (guard < 24 && isSolid(getBlock(world, x, y, z))) { y += 1; guard += 1; }
  while (guard < 48 && y > 3 && !isSolid(getBlock(world, x, y - 1, z))) { y -= 1; guard += 1; }
  return y;
}

function drawSpawnColumn(state, minDist, range) {
  const seed = worldSeed(state.world);
  const angle = nextInt(state.rng, seed, 'spawn', 4096);
  const dist = minDist + nextInt(state.rng, seed, 'spawn', range);
  const pbx = fpFloor(state.player.x);
  const pbz = fpFloor(state.player.z);
  const bx = clamp(pbx + floorDiv(fpCos(angle) * dist, FP_ONE), 2, REGION.blocksX - 3);
  const bz = clamp(pbz + floorDiv(fpSin(angle) * dist, FP_ONE), 2, REGION.blocksZ - 3);
  return { bx, bz, pbx, pbz };
}

function spawnHostileDraw(state) {
  const { bx, bz, pbx, pbz } = drawSpawnColumn(state, RULESET.spawnMinDist, RULESET.spawnDistRange);
  // The clamp can pull a draw closer than the §10.1 minimum near the wall.
  if (Math.max(Math.abs(bx - pbx), Math.abs(bz - pbz)) < RULESET.spawnMinDist) return;
  const seed = worldSeed(state.world);
  const wispRoll = nextInt(state.rng, seed, 'spawn', 4) === 3;
  const y = surfaceYAt(state, bx, bz);
  const world = state.world;
  if (getBlock(world, bx, y, bz) !== 'air') return;
  if (getBlock(world, bx, y + 1, bz) !== 'air') return;
  const below = getBlock(world, bx, y - 1, bz);
  if (!isSolid(below) || !isOpaqueBlock(below)) return; // §10.1: on an opaque block
  if (lightAt(state, bx, y, bz) >= RULESET.spawnLightMax) return; // §10.1: light < 4
  if (wispRoll && countAlive(state, ARCH.gloomwisp) < RULESET.gloomwispCap) {
    spawnEntity(state, ARCH.gloomwisp,
      bx * FP_ONE + FP_HALF, (y + 3) * FP_ONE, bz * FP_ONE + FP_HALF);
  } else {
    spawnEntity(state, ARCH.hollowed,
      bx * FP_ONE + FP_HALF, y * FP_ONE, bz * FP_ONE + FP_HALF);
  }
}

function spawnAshboarDraw(state) {
  const { bx, bz } = drawSpawnColumn(state, 16, 16);
  const y = surfaceYAt(state, bx, bz);
  const world = state.world;
  if (getBlock(world, bx, y, bz) !== 'air') return;
  if (getBlock(world, bx, y + 1, bz) !== 'air') return;
  if (getBlock(world, bx, y - 1, bz) !== 'nightgrass') return; // herds keep to the turf
  spawnEntity(state, ARCH.ashboar,
    bx * FP_ONE + FP_HALF, y * FP_ONE, bz * FP_ONE + FP_HALF);
}

export function trySpawns(state) {
  if (isNight(state.tick)) {
    if (state.tick % RULESET.nightSpawnIntervalTicks !== 0) return;
    for (let d = 0; d < RULESET.nightSpawnDraws; d += 1) {
      if (hostileCount(state) >= RULESET.hostileCap) return;
      spawnHostileDraw(state);
    }
    return;
  }
  if (phaseOf(state.tick) === 'day') {
    if (state.tick % RULESET.ashboarSpawnIntervalTicks !== 0) return;
    if (countAlive(state, ARCH.ashboar) >= RULESET.ashboarCap) return;
    spawnAshboarDraw(state);
  }
}
