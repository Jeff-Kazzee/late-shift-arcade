// The DS-1c Dusklands block registry (GDD §6, DS-1 launch subset).
//
// String ids are the persistent identity (GDD §14.3: numeric runtime ids are
// never persisted). `code` is the canonical integer used ONLY for command
// encoding and hashing; it is part of the ruleset, frozen here, and appending
// new blocks never renumbers old ones. Codes 0-6 are inherited from DS-1a
// (the 'coal' id became 'coal_ore' in the declared v2 ruleset bump — ids are
// rule content and DS-1c IS the ruleset event).
//
// Fields (all rule-bearing, all folded into RULESET_HASH by constants.js):
//   solid      collides / occludes placement
//   opaque     blocks sky light (torch is solid=false, opaque=false)
//   hardness10 GDD §8.1 hardness x10 (integer; fieldstone 1.5 -> 15)
//   toolClass  'pick' | 'axe' | 'shovel' | 'none' (breaking class, §8.1)
//   harvestLevel  HL required to harvest (§6.1/§6.4)
//   drop       item id granted on break (null = nothing)
//   light      emitted light level (torch 13; hearth light is lit-state
//              driven by sim.js, not a block constant)
//   gravity    sand/gravel settle when unsupported (§6.1)

export const BLOCKS = Object.freeze([
  Object.freeze({ id: 'air', code: 0, solid: false, opaque: false, breakable: false, hardness10: 0, toolClass: 'none', harvestLevel: 0, drop: null, light: 0, gravity: false }),
  Object.freeze({ id: 'dirt', code: 1, solid: true, opaque: true, breakable: true, hardness10: 5, toolClass: 'shovel', harvestLevel: 0, drop: 'dirt', light: 0, gravity: false }),
  Object.freeze({ id: 'fieldstone', code: 2, solid: true, opaque: true, breakable: true, hardness10: 15, toolClass: 'pick', harvestLevel: 0, drop: 'rubble', light: 0, gravity: false }),
  Object.freeze({ id: 'coal_ore', code: 3, solid: true, opaque: true, breakable: true, hardness10: 30, toolClass: 'pick', harvestLevel: 0, drop: 'coal', light: 0, gravity: false }),
  Object.freeze({ id: 'worldbone', code: 4, solid: true, opaque: true, breakable: false, hardness10: 0, toolClass: 'none', harvestLevel: 0, drop: null, light: 0, gravity: false }),
  Object.freeze({ id: 'wardwall', code: 5, solid: true, opaque: true, breakable: false, hardness10: 0, toolClass: 'none', harvestLevel: 0, drop: null, light: 0, gravity: false }),
  Object.freeze({ id: 'clan_cache', code: 6, solid: true, opaque: true, breakable: false, hardness10: 0, toolClass: 'none', harvestLevel: 0, drop: null, light: 0, gravity: false }),
  Object.freeze({ id: 'nightgrass', code: 7, solid: true, opaque: true, breakable: true, hardness10: 6, toolClass: 'shovel', harvestLevel: 0, drop: 'dirt', light: 0, gravity: false }),
  Object.freeze({ id: 'sand', code: 8, solid: true, opaque: true, breakable: true, hardness10: 5, toolClass: 'shovel', harvestLevel: 0, drop: 'sand', light: 0, gravity: true }),
  Object.freeze({ id: 'gravel', code: 9, solid: true, opaque: true, breakable: true, hardness10: 6, toolClass: 'shovel', harvestLevel: 0, drop: 'gravel', light: 0, gravity: true }),
  Object.freeze({ id: 'copper_ore', code: 10, solid: true, opaque: true, breakable: true, hardness10: 30, toolClass: 'pick', harvestLevel: 1, drop: 'copper_ore', light: 0, gravity: false }),
  Object.freeze({ id: 'gnarlpine_log', code: 11, solid: true, opaque: true, breakable: true, hardness10: 20, toolClass: 'axe', harvestLevel: 0, drop: 'gnarlpine_log', light: 0, gravity: false }),
  Object.freeze({ id: 'gnarlpine_leaves', code: 12, solid: true, opaque: true, breakable: true, hardness10: 2, toolClass: 'none', harvestLevel: 0, drop: null, light: 0, gravity: false }),
  Object.freeze({ id: 'gnarlpine_planks', code: 13, solid: true, opaque: true, breakable: true, hardness10: 20, toolClass: 'axe', harvestLevel: 0, drop: 'gnarlpine_planks', light: 0, gravity: false }),
  Object.freeze({ id: 'torch', code: 14, solid: false, opaque: false, breakable: true, hardness10: 1, toolClass: 'none', harvestLevel: 0, drop: 'torch', light: 13, gravity: false }),
  Object.freeze({ id: 'worktable', code: 15, solid: true, opaque: true, breakable: true, hardness10: 25, toolClass: 'axe', harvestLevel: 0, drop: 'worktable', light: 0, gravity: false }),
  Object.freeze({ id: 'hearth', code: 16, solid: true, opaque: true, breakable: true, hardness10: 30, toolClass: 'pick', harvestLevel: 0, drop: 'hearth', light: 0, gravity: false }),
  Object.freeze({ id: 'barricade', code: 17, solid: true, opaque: true, breakable: true, hardness10: 20, toolClass: 'axe', harvestLevel: 0, drop: 'barricade', light: 0, gravity: false }),
]);

const BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));

export function block(id) {
  const b = BY_ID.get(id);
  if (b === undefined) throw new Error(`unknown block id: ${id}`);
  return b;
}

export function blockCode(id) {
  return block(id).code;
}

export function isSolid(id) {
  return block(id).solid;
}

export function isOpaqueBlock(id) {
  return block(id).opaque;
}

export function isBreakable(id) {
  return block(id).breakable;
}

export function dropOf(id) {
  return block(id).drop;
}

export function lightOf(id) {
  return block(id).light;
}

export function hasGravity(id) {
  return block(id).gravity;
}

// What a player may hold and place (and therefore what PLACE commands may
// name). Order is canonical for command validation, tests, and the hotbar.
// Ore blocks are not placeable: mining them yields items, not blocks.
export const PLACEABLE = Object.freeze([
  'dirt', 'fieldstone', 'sand', 'gravel', 'gnarlpine_log', 'gnarlpine_planks',
  'torch', 'worktable', 'hearth', 'barricade',
]);
