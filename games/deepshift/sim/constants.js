// The DS-1a ruleset. Every constant here is authoritative sim truth and is
// folded into RULESET_HASH — a replay or save recorded under one hash can
// never silently run under different rules (DS-0 D1.2, D5/F-13).

import { hashAscii, hashInts, toHex64 } from './math/xxhash64.js';

export const RULESET = Object.freeze({
  // --- versioning (D5 / F-13: in every save header from the first byte) ---
  worldgenVersion: 1,
  simRulesetVersion: 1,
  logicSemanticsVersion: 1,

  // --- clock ---
  tickHz: 20, // fixed-step; the sim never sees render dt
  dayTicks: 3600, // 3:00 of day
  nightTicks: 6000, // 5:00 of night; dawn ends the run
  runTicks: 9600, // 8-minute graybox (DS-0 D4)

  // --- D1 activation (ruleset constants, never device settings) ---
  simRadius: 3, // Chebyshev, chunk lattice, integer only
  maxActiveProvinces: 16,

  // --- world shape (graybox region: 4x4 columns of 3 chunks) ---
  chunkSize: 32,
  sectionSize: 16, // meshing unit boundary inside storage chunks
  regionChunksX: 4,
  regionChunksY: 3,
  regionChunksZ: 4,

  // --- worldgen (tiny content: dirt / fieldstone / coal) ---
  heightLatticeStep: 16,
  heightMin: 34,
  heightRange: 20, // surface band Y 34..53
  dirtDepth: 3,
  worldboneDepth: 3,
  oreCellSize: 8,
  oreChance: 5, // 1-in-5 ore cells carry a coal vein

  // --- player ---
  playerHalfWidth: 19660, // Q16.16 (~0.30 blocks)
  playerHeight: 118784, // Q16.16 (1.8125 blocks)
  playerEyeHeight: 106496, // Q16.16 (1.625 blocks)
  playerHp: 20,
  moveSpeed: 14090, // Q16.16 blocks per tick (~4.3 blocks/s)
  jumpVelocity: 29310, // Q16.16 blocks per tick
  gravity: 5243, // Q16.16 blocks per tick^2 (~32 blocks/s^2)
  terminalVelocity: 131072, // Q16.16 blocks per tick (2.0)
  reach: 5, // blocks, mining/placing/banking
  attackRange: 3, // blocks
  attackDamage: 5,
  attackCooldown: 10, // ticks

  // --- the Hollowed (one enemy) ---
  hollowedHp: 10,
  hollowedHalfWidth: 19660,
  hollowedHeight: 118784,
  hollowedSpeed: 6554, // Q16.16 blocks per tick (~2.0 blocks/s)
  hollowedDamage: 4,
  hollowedAttackCooldown: 20, // ticks
  hollowedAttackRange: 78643, // Q16.16 (~1.2 blocks, Chebyshev horizontal)
  hollowedCap: 4,
  spawnIntervalTicks: 300,
  spawnMinDist: 12, // blocks from player
  spawnDistRange: 8,

  // --- the quota win (Gate 2) ---
  fieldstoneQuota: 12,

  // --- score (documented in README.md §Score) ---
  scorePerBankedDay: 100,
  scorePerBankedNight: 150, // the 1.5x night-banking knob
  scoreWinBonus: 500,
  scorePerSurvivedSecond: 1,
});

// Canonical ruleset hash: every numeric constant, in sorted key order, plus
// the format tag. Changing any rule changes the hash; reordering this file
// does not.
function computeRulesetHash() {
  const keys = Object.keys(RULESET).sort();
  const ints = [];
  for (const key of keys) ints.push(RULESET[key] | 0);
  let seed = hashAscii(0n, `deepshift-ruleset-v${RULESET.simRulesetVersion}:${keys.join(',')}`);
  return toHex64(hashInts(seed, ints));
}

export const RULESET_HASH = computeRulesetHash();
