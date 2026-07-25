// The DS-1c item and tool-tier registries (GDD §6-§8, DS-1 launch subset).
//
// Items are the inventory vocabulary: string ids persist, integer codes are
// the canonical hashing/encoding identity (append-only, never renumbered).
// Tool tiers carry the §8.2 columns for the three DS-1 tiers. All damage and
// HP in the DS-1c ruleset are integer HALF-POINTS (GDD half-step values like
// the copper blade's 4.5 stay exact: 4.5 damage = 9 halves).

export const ITEMS = Object.freeze([
  Object.freeze({ id: 'dirt', code: 0, place: 'dirt' }),
  Object.freeze({ id: 'rubble', code: 1, place: null }), // fieldstone drops rubble (§6.1)
  Object.freeze({ id: 'fieldstone', code: 2, place: 'fieldstone' }), // re-crafted from rubble
  Object.freeze({ id: 'coal', code: 3, place: null }), // bankable ore value 2; fuel; torch part
  Object.freeze({ id: 'sand', code: 4, place: 'sand' }),
  Object.freeze({ id: 'gravel', code: 5, place: 'gravel' }),
  Object.freeze({ id: 'flint', code: 6, place: null }), // 10% gravel side-drop (§6.1); arrows are DS-3
  Object.freeze({ id: 'copper_ore', code: 7, place: null }), // bankable ore value 5; smelts to ingot
  Object.freeze({ id: 'copper_ingot', code: 8, place: null }),
  Object.freeze({ id: 'gnarlpine_log', code: 9, place: 'gnarlpine_log' }),
  Object.freeze({ id: 'gnarlpine_planks', code: 10, place: 'gnarlpine_planks' }),
  Object.freeze({ id: 'stick', code: 11, place: null }),
  Object.freeze({ id: 'torch', code: 12, place: 'torch' }),
  Object.freeze({ id: 'worktable', code: 13, place: 'worktable' }),
  Object.freeze({ id: 'hearth', code: 14, place: 'hearth' }),
  Object.freeze({ id: 'barricade', code: 15, place: 'barricade' }),
  Object.freeze({ id: 'bone', code: 16, place: null }), // Ashboar drop; bone-tool part
  Object.freeze({ id: 'hide', code: 17, place: null }), // Ashboar drop (armor is DS-3)
  Object.freeze({ id: 'meat', code: 18, place: null }), // Ashboar drop (no hunger in ranked, §8.3)
]);

const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function item(id) {
  const it = ITEM_BY_ID.get(id);
  if (it === undefined) throw new Error(`unknown item id: ${id}`);
  return it;
}

export function itemCode(id) {
  return item(id).code;
}

// Canonical inventory key order (hash digests iterate this, never object
// key order).
export const ITEM_IDS = Object.freeze(ITEMS.map((i) => i.id));

export function emptyInventory() {
  const inv = {};
  for (const id of ITEM_IDS) inv[id] = 0;
  return inv;
}

// Ore banking values (GDD §6.4 score column) and §3.4 per-material caps
// (units per banking bucket; Dawn Run has a day bucket and a night bucket).
export const BANKABLE = Object.freeze([
  Object.freeze({ item: 'coal', value: 2, capUnits: 40 }),
  Object.freeze({ item: 'copper_ore', value: 5, capUnits: 30 }),
]);

// --- tools (GDD §8.2, DS-1 tiers only) ---

export const TOOL_KINDS = Object.freeze(['pick', 'axe', 'club']);

// speedMult10 = §8.2 speedMult x10; clubDamage in half-points.
export const TOOL_TIERS = Object.freeze({
  bone: Object.freeze({ tier: 'bone', code: 0, speedMult10: 15, durability: 60, harvestLevel: 0, clubDamage: 6 }),
  fieldstone: Object.freeze({ tier: 'fieldstone', code: 1, speedMult10: 25, durability: 130, harvestLevel: 1, clubDamage: 8 }),
  copper: Object.freeze({ tier: 'copper', code: 2, speedMult10: 35, durability: 190, harvestLevel: 2, clubDamage: 9 }),
});

export const TIER_IDS = Object.freeze(['bone', 'fieldstone', 'copper']);

export function toolTier(tier) {
  const t = TOOL_TIERS[tier];
  if (t === undefined) throw new Error(`unknown tool tier: ${tier}`);
  return t;
}

export function toolKindCode(kind) {
  const idx = TOOL_KINDS.indexOf(kind);
  if (idx === -1) throw new Error(`unknown tool kind: ${kind}`);
  return idx;
}

// Melee damage in half-points for whatever is in the acting hand (§8.2
// blade column; non-club tools swing badly, bare hands worse).
export function meleeDamage(tool) {
  if (tool === null) return 2; // bare hand: 1.0
  if (tool.kind === 'club') return toolTier(tool.tier).clubDamage;
  return 4; // a pick or axe swung as a weapon: 2.0
}

// Mining class/speed/HL for whatever is in the acting hand. A hand is
// HL 0, speed 1.0, no class (§8.1).
export function miningProfile(tool) {
  if (tool === null || tool.kind === 'club') {
    return { toolClass: 'none', speedMult10: 10, harvestLevel: 0 };
  }
  const tier = toolTier(tool.tier);
  return {
    toolClass: tool.kind === 'pick' ? 'pick' : 'axe',
    speedMult10: tier.speedMult10,
    harvestLevel: tier.harvestLevel,
  };
}
