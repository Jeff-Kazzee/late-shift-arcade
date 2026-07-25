// The DS-1c "First Night" ruleset. Every constant here — and every
// rule-bearing table (blocks, items, tiers, recipes) — folds into
// RULESET_HASH: a replay or save recorded under one hash can never silently
// run under different rules (DS-0 D1.2, D5/F-13).
//
// simRulesetVersion 2 / worldgenVersion 2: the DECLARED DS-1c ruleset bump.
// DS-1a's graybox rules (12-fieldstone quota, 8-minute clock, single enemy)
// are replaced by the GDD Dawn Run (§3.2/§3.3/§17 DS-1). Golden replay
// fixtures are regenerated in the same change; the D1 activation fixture's
// membership content is untouched (simRadius/maxActiveProvinces unchanged).
//
// Conventions: all damage and HP are integer HALF-POINTS (GDD 4.5 damage =
// 9 halves; player 24 HP = 48 halves). Positions Q16.16. Hardness x10.

import { hashAscii, hashInts, toHex64 } from './math/xxhash64.js';
import { BLOCKS, PLACEABLE } from './world/blocks.js';
import { ITEMS, BANKABLE, TOOL_TIERS, TIER_IDS, TOOL_KINDS } from './items.js';
import { RECIPES } from './recipes.js';

export const RULESET = Object.freeze({
  // --- versioning (D5 / F-13: in every save header from the first byte) ---
  worldgenVersion: 2,
  simRulesetVersion: 2,
  logicSemanticsVersion: 1,

  // --- clock (GDD §3.2 Dawn Run: day 4:00, dusk 0:30, night 5:00) ---
  tickHz: 20, // fixed-step; the sim never sees render dt
  dayTicks: 4800, // day ends, dusk begins
  duskTicks: 600, // dusk ends at 5400: night begins
  runTicks: 11400, // dawn: the verdict tick (9:30 total)
  hornTicks: 1200, // dusk horn: 60 s before nightfall (§10.1)

  // --- D1 activation (ruleset constants, never device settings) ---
  simRadius: 3, // Chebyshev, chunk lattice, integer only — UNCHANGED from v1
  maxActiveProvinces: 16, // UNCHANGED from v1

  // --- world shape ---
  // DS-1c region: 8x8 columns of 4 chunks (256x256x128 blocks). The GDD's
  // full 512x512x256 Dawn Run region is deferred to the DS-2/DS-3 save and
  // streaming work; this region keeps DS-1b's measured streaming envelope.
  chunkSize: 32,
  sectionSize: 16,
  regionChunksX: 8,
  regionChunksY: 4,
  regionChunksZ: 8,

  // --- worldgen (Dusklands, §5.4 baseline biome) ---
  heightLatticeStep: 16,
  heightMin: 72,
  heightRange: 14, // octave 1: surface band base Y 72..85
  heightLatticeStep2: 8,
  heightRange2: 4, // octave 2: rolling detail
  dirtDepth: 3, // dirt cells under the nightgrass turf
  worldboneDepth: 3,
  oreCellSize: 8,
  coalChance: 5, // 1-in-5 ore cells in the coal band carry a vein
  coalMinY: 16,
  copperChance: 6, // 1-in-6 ore cells in the copper band
  copperMinY: 24,
  copperMaxY: 80,
  outcropCellSize: 16, // surface outcrops per 16x16 lattice cell (§5.2's
  outcropChance: 2, // "quota ore within reach" guarantee, 1-in-2 cells)
  treeCellChance: 3, // 1-in-3 8x8 cells root a gnarlpine (scattered, §5.4)
  sandPatchChance: 6, // 1-in-6 16x16 cells carry a sand patch
  gravelPatchChance: 12,

  // --- player (GDD §8.3: orc-thick 24 HP; §12.1 movement) ---
  playerHalfWidth: 19660, // Q16.16 (~0.30 blocks)
  playerHeight: 118784, // Q16.16 (1.8125 blocks)
  playerEyeHeight: 106496, // Q16.16 (1.625 blocks)
  playerHp: 48, // half-points (24.0)
  regenIntervalTicks: 80, // 1 HP / 4 s ...
  regenAboveHp: 12, // ... while above 25% HP (§8.3, Shift Run rule)
  moveSpeed: 14090, // Q16.16 blocks/tick (~4.3 b/s)
  sprintSpeed: 18320, // ~5.6 b/s
  crouchSpeed: 7045, // ~2.15 b/s
  jumpVelocity: 29310,
  gravity: 5243,
  terminalVelocity: 131072,
  reach: 5, // blocks: mining/placing/banking/stations
  attackRange: 3, // blocks
  attackCooldown: 10, // ticks

  // --- entities (pooled; §10.1 caps) ---
  entityPoolSize: 64, // fixed slot pool — the allocation ceiling
  hostileCap: 20, // §10.1: hostiles per player province
  gloomwispCap: 4,
  ashboarCap: 5,
  entityStressCap: 60, // headless stress bar: pool holds this many live

  // --- spawning (§10.1: light-driven) ---
  spawnLightMax: 4, // hostile spawn needs light < 4
  nightSpawnIntervalTicks: 100, // a spawn wave attempt every 5 s at night
  nightSpawnDraws: 2,
  ashboarSpawnIntervalTicks: 200,
  spawnMinDist: 24, // §10.1: >24 blocks from any player
  spawnDistRange: 16,
  despawnDist: 48, // §10.1: despawn beyond 48 after 30 s no contact
  despawnTicks: 600,
  skyLightDay: 15, // §10.1: the sun channel
  skyLightDusk: 7, // twilight: no spawns yet, no burn
  skyLightNight: 3, // everywhere unlit becomes spawn-legal

  // --- the Hollowed (§10.2: HP 20, dmg 4, walk) ---
  hollowedHp: 40,
  hollowedDamage: 8,
  hollowedSpeed: 6554, // ~2.0 b/s
  hollowedAttackCooldown: 20,
  hollowedAttackRange: 78643, // Q16.16 (~1.2 blocks Chebyshev horizontal)
  hollowedHalfWidth: 19660,
  hollowedHeight: 118784,

  // --- the Gloomwisp (§10.2: HP 12, 3 ranged, slow drift) ---
  gloomwispHp: 24,
  gloomwispHalfWidth: 16384, // 0.5-block cube, floating
  gloomwispHeight: 32768,
  gloomwispDriftSpeed: 3277, // ~1.0 b/s
  gloomwispKeepMin: 8, // blocks: backs off inside this
  gloomwispKeepMax: 14, // blocks: closes in beyond this
  gloomwispDartCooldown: 50, // fires every 2.5 s ...
  gloomwispDartRange: 16, // ... at 16 blocks (§10.2)
  gloomwispHoverAbove: 3, // blocks above the player's feet
  lightHurtThreshold: 12, // §10.2: 1 dmg/s in light >= 12
  lightHurtIntervalTicks: 10, // 1 half-point per 10 ticks = 1.0/s

  // --- gloom darts (pooled projectiles) ---
  dartSpeed: 39322, // ~12 b/s
  dartDamage: 6, // 3.0
  dartLifeTicks: 40,
  dartHalfWidth: 6554,
  dartHeight: 13107,

  // --- the Ashboar (§10.2: HP 16, 3 charge, fast, neutral wildlife) ---
  ashboarHp: 32,
  ashboarDamage: 6,
  ashboarWalkSpeed: 4587, // ~1.4 b/s wandering
  ashboarChargeSpeed: 16384, // ~5.0 b/s charging
  ashboarHalfWidth: 26214, // 0.8-block footprint
  ashboarHeight: 65536,
  ashboarTerritorialDist: 3, // blocks: charges when approached (§10.2)
  ashboarChargeTicks: 60,
  ashboarRestTicks: 40,
  ashboarWanderRetarget: 80,
  ashboarAttackCooldown: 40,

  // --- sunrise burn-off (§10.1: 2 dmg/s in direct sun, then gone) ---
  sunBurnIntervalTicks: 5, // 1 half-point per 5 ticks = 2.0/s (Hollowed)
  // Gloomwisps burn INSTANTLY in direct sun (§10.2) — no constant needed.

  // --- flint (§6.1: gravel 10% flint) ---
  flintChance: 10,

  // --- hearth smelting (§7.2: 5 s/item, coal = 8 smelts) ---
  smeltTicks: 100,
  coalSmelts: 8,
  logSmelts: 1,
  hearthLight: 14, // §6.3: light 14 when lit

  // --- the quota win (§3.2: bank 300 ore value AND be alive at dawn) ---
  quotaValue: 300,

  // --- score (§3.3 Dawn Run + §3.4 caps) ---
  scorePerValueDay: 20,
  scorePerValueNight: 30, // the 1.5x night-banking knob
  bankValueCap: 600, // combined banking cap: 2x quota
  scoreWinBonus: 6000,
  killScoreCap: 3000,
  threatAshboar: 40,
  threatHollowed: 100,
  threatGloomwisp: 120,
});

// Canonical ruleset hash: every numeric RULESET constant in sorted key
// order, then every rule-bearing content table, then the format tag.
// Changing any rule changes the hash; reordering source files does not.
function computeRulesetHash() {
  const keys = Object.keys(RULESET).sort();
  const ints = [];
  for (const key of keys) ints.push(RULESET[key] | 0);
  let seed = hashAscii(0n, `deepshift-ruleset-v${RULESET.simRulesetVersion}:${keys.join(',')}`);
  seed = hashInts(seed, ints);
  for (const b of BLOCKS) {
    seed = hashAscii(seed, `block:${b.id}:${b.toolClass}:${b.drop ?? ''}`);
    seed = hashInts(seed, [b.code, b.solid ? 1 : 0, b.opaque ? 1 : 0, b.breakable ? 1 : 0,
      b.hardness10, b.harvestLevel, b.light, b.gravity ? 1 : 0]);
  }
  seed = hashAscii(seed, `placeable:${PLACEABLE.join(',')}`);
  for (const it of ITEMS) seed = hashAscii(hashInts(seed, [it.code]), `item:${it.id}:${it.place ?? ''}`);
  for (const bank of BANKABLE) {
    seed = hashAscii(hashInts(seed, [bank.value, bank.capUnits]), `bank:${bank.item}`);
  }
  seed = hashAscii(seed, `toolkinds:${TOOL_KINDS.join(',')}`);
  for (const tierId of TIER_IDS) {
    const t = TOOL_TIERS[tierId];
    seed = hashAscii(hashInts(seed, [t.code, t.speedMult10, t.durability, t.harvestLevel, t.clubDamage]), `tier:${tierId}`);
  }
  for (const r of RECIPES) {
    seed = hashAscii(seed, `recipe:${r.id}:${r.station}:${JSON.stringify(r.inputs)}:${JSON.stringify(r.outputs ?? null)}:${r.tool === undefined ? '' : `${r.tool.kind}/${r.tool.tier}`}`);
  }
  return toHex64(seed);
}

export const RULESET_HASH = computeRulesetHash();
