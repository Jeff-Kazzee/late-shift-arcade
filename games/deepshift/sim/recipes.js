// List-based crafting (GDD §7.1 decision) — the DS-1c recipe table.
//
// A recipe is plain data: integer id (canonical, append-only), station
// ('hands' | 'worktable'), inputs [[item, n]...], and either stackable
// outputs [[item, n]...] or a tool output { kind, tier }. Smelting is NOT a
// recipe — the hearth is a block entity with its own §7.2 fuel/time rules
// (sim.js). Exact §7.3 recipes where defined; DS-1c deviations are marked.

export const RECIPES = Object.freeze([
  // --- hands (§7.2 survival floor) ---
  Object.freeze({ id: 0, name: 'gnarlpine planks', station: 'hands', inputs: [['gnarlpine_log', 1]], outputs: [['gnarlpine_planks', 4]] }),
  Object.freeze({ id: 1, name: 'sticks', station: 'hands', inputs: [['gnarlpine_planks', 2]], outputs: [['stick', 4]] }),
  // §6.3: 1 stick + 1 resin (or 1 coal) -> 4. Resin is Bloodbark (Gnarlwood)
  // content; the Dusklands slice ships the coal form.
  Object.freeze({ id: 2, name: 'torches', station: 'hands', inputs: [['stick', 1], ['coal', 1]], outputs: [['torch', 4]] }),
  Object.freeze({ id: 3, name: 'fieldstone', station: 'hands', inputs: [['rubble', 1]], outputs: [['fieldstone', 1]] }), // §6.1 re-craft
  Object.freeze({ id: 4, name: 'bone pick', station: 'hands', inputs: [['bone', 2], ['stick', 1]], tool: { kind: 'pick', tier: 'bone' } }), // §7.3 exact
  Object.freeze({ id: 5, name: 'bone axe', station: 'hands', inputs: [['bone', 2], ['stick', 1]], tool: { kind: 'axe', tier: 'bone' } }),
  Object.freeze({ id: 6, name: 'bone club', station: 'hands', inputs: [['bone', 2], ['stick', 1]], tool: { kind: 'club', tier: 'bone' } }),
  Object.freeze({ id: 7, name: 'worktable', station: 'hands', inputs: [['gnarlpine_planks', 4], ['rubble', 2]], outputs: [['worktable', 1]] }), // §6.3
  Object.freeze({ id: 8, name: 'barricade', station: 'hands', inputs: [['gnarlpine_planks', 3]], outputs: [['barricade', 1]] }), // §6.3
  // --- worktable (§7.2 the hub) ---
  Object.freeze({ id: 9, name: 'fieldstone pick', station: 'worktable', inputs: [['rubble', 3], ['stick', 2]], tool: { kind: 'pick', tier: 'fieldstone' } }), // §7.3 exact
  Object.freeze({ id: 10, name: 'fieldstone axe', station: 'worktable', inputs: [['rubble', 3], ['stick', 2]], tool: { kind: 'axe', tier: 'fieldstone' } }),
  Object.freeze({ id: 11, name: 'fieldstone club', station: 'worktable', inputs: [['rubble', 2], ['stick', 1]], tool: { kind: 'club', tier: 'fieldstone' } }), // blade 2 + 1 hilt
  Object.freeze({ id: 12, name: 'copper pick', station: 'worktable', inputs: [['copper_ingot', 3], ['stick', 2]], tool: { kind: 'pick', tier: 'copper' } }), // §7.3 exact
  Object.freeze({ id: 13, name: 'copper axe', station: 'worktable', inputs: [['copper_ingot', 3], ['stick', 2]], tool: { kind: 'axe', tier: 'copper' } }),
  Object.freeze({ id: 14, name: 'copper club', station: 'worktable', inputs: [['copper_ingot', 2], ['stick', 1]], tool: { kind: 'club', tier: 'copper' } }),
  // §6.3 says 8 fieldstone + 1 clay; clay is Ashfen shore content (DS-3+).
  // DS-1c deviation, declared: the Dusklands hearth is all fieldstone.
  Object.freeze({ id: 15, name: 'hearth', station: 'worktable', inputs: [['fieldstone', 8]], outputs: [['hearth', 1]] }),
]);

export function recipe(id) {
  const r = RECIPES[id];
  if (r === undefined || r.id !== id) throw new Error(`unknown recipe id: ${id}`);
  return r;
}

export function canCraft(inventory, r) {
  for (const [itemId, n] of r.inputs) {
    if (inventory[itemId] < n) return false;
  }
  return true;
}

// Consume inputs and grant stackable outputs. Tool outputs are the
// caller's job (sim.js mints the tool instance with a stable id).
export function applyCraftInputs(inventory, r) {
  for (const [itemId, n] of r.inputs) inventory[itemId] -= n;
  if (r.outputs !== undefined) {
    for (const [itemId, n] of r.outputs) inventory[itemId] += n;
  }
}
