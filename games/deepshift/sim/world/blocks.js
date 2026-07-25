// The DS-1a block registry — tiny content on purpose: dirt / fieldstone /
// coal terrain plus the structural blocks the graybox needs.
//
// String ids are the persistent identity (GDD §14.3: numeric runtime ids are
// never persisted). `code` is the canonical integer used ONLY for command
// encoding and hashing; it is part of the ruleset, frozen here, and appending
// new blocks never renumbers old ones.

export const BLOCKS = Object.freeze([
  Object.freeze({ id: 'air', code: 0, solid: false, breakable: false, drop: null }),
  Object.freeze({ id: 'dirt', code: 1, solid: true, breakable: true, drop: 'dirt' }),
  Object.freeze({ id: 'fieldstone', code: 2, solid: true, breakable: true, drop: 'fieldstone' }),
  Object.freeze({ id: 'coal', code: 3, solid: true, breakable: true, drop: 'coal' }),
  Object.freeze({ id: 'worldbone', code: 4, solid: true, breakable: false, drop: null }),
  Object.freeze({ id: 'wardwall', code: 5, solid: true, breakable: false, drop: null }),
  Object.freeze({ id: 'cache', code: 6, solid: true, breakable: false, drop: null }),
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

export function isBreakable(id) {
  return block(id).breakable;
}

export function dropOf(id) {
  return block(id).drop;
}

// What a player may hold and place (and therefore what PLACE commands may
// name). Order is canonical for tests and UI.
export const PLACEABLE = Object.freeze(['dirt', 'fieldstone', 'coal']);
