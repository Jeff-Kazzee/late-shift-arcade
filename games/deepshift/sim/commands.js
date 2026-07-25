// The canonical quantized command stream (D3/D5), DS-1c vocabulary.
//
// A command is plain data: { t (tick), p (player id), s (sequence), type,
// ...integer args }. Look angles are pre-quantized (a full turn = 4096
// units, pitch clamped to +-1000); the stream is canonical when every field
// is already an integer in range and commands sort strictly by (t, p, s).
// The verifier REJECTS non-canonical logs rather than repairing them — a
// log that hashes must be the log that ran.
//
// DS-1c additions: hold-to-mine start/stop (§8.1 break times), crafting
// (§7), equipping, and the hearth block entity (§7.2 smelting).

import { ANGLE_TURN } from './math/trig.js';
import { blockCode, PLACEABLE } from './world/blocks.js';
import { itemCode, ITEMS } from './items.js';
import { RECIPES } from './recipes.js';

export const CMD = Object.freeze({
  MOVE: 0,
  MINE_START: 1,
  PLACE: 2,
  ATTACK: 3,
  BANK: 4,
  MINE_STOP: 5,
  CRAFT: 6,
  EQUIP: 7,
  HEARTH_PUT: 8,
  HEARTH_TAKE: 9,
});

export const BUTTON = Object.freeze({
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  SPRINT: 32,
  CROUCH: 64,
});

export const BUTTON_MASK = 127;
export const PITCH_LIMIT = 1000; // ~88 degrees in 4096-per-turn units

// EQUIP modes: what the acting hand holds.
export const EQUIP_MODE = Object.freeze({ HAND: 0, TOOL: 1, ITEM: 2 });

// HEARTH_PUT slots.
export const HEARTH_SLOT = Object.freeze({ ORE: 0, FUEL: 1 });

// Live-input helper: fold arbitrary device input onto the canonical lattice.
export function quantizeLook(yaw, pitch) {
  const qy = ((Math.trunc(yaw) % ANGLE_TURN) + ANGLE_TURN) % ANGLE_TURN;
  const qp = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.trunc(pitch)));
  return { yaw: qy, pitch: qp };
}

function isInt(v) {
  return Number.isSafeInteger(v);
}

function check(ok, message) {
  if (!ok) throw new Error(`invalid command: ${message}`);
}

// Validate one canonical command. Throws on anything off-lattice.
export function validateCommand(cmd) {
  check(cmd !== null && typeof cmd === 'object', 'not an object');
  check(isInt(cmd.t) && cmd.t >= 0, 't must be a non-negative integer');
  check(isInt(cmd.p) && cmd.p >= 1, 'p must be a positive integer');
  check(isInt(cmd.s) && cmd.s >= 0, 's must be a non-negative integer');
  switch (cmd.type) {
    case CMD.MOVE:
      check(isInt(cmd.buttons) && (cmd.buttons & ~BUTTON_MASK) === 0, 'buttons out of range');
      check(isInt(cmd.yaw) && cmd.yaw >= 0 && cmd.yaw < ANGLE_TURN, 'yaw off-lattice');
      check(isInt(cmd.pitch) && Math.abs(cmd.pitch) <= PITCH_LIMIT, 'pitch off-lattice');
      break;
    case CMD.MINE_START:
      check(isInt(cmd.x) && isInt(cmd.y) && isInt(cmd.z), 'mine target must be integers');
      break;
    case CMD.MINE_STOP:
      break;
    case CMD.PLACE:
      check(isInt(cmd.x) && isInt(cmd.y) && isInt(cmd.z), 'place target must be integers');
      check(PLACEABLE.includes(cmd.block), `block not placeable: ${cmd.block}`);
      break;
    case CMD.ATTACK:
      check(isInt(cmd.entityId) && cmd.entityId >= 1, 'entityId must be a positive integer');
      break;
    case CMD.BANK:
      break;
    case CMD.CRAFT:
      check(isInt(cmd.recipeId) && cmd.recipeId >= 0 && cmd.recipeId < RECIPES.length, 'unknown recipe');
      break;
    case CMD.EQUIP:
      check(isInt(cmd.mode) && cmd.mode >= 0 && cmd.mode <= 2, 'unknown equip mode');
      check(isInt(cmd.ref) && cmd.ref >= 0, 'equip ref must be a non-negative integer');
      if (cmd.mode === EQUIP_MODE.ITEM) check(cmd.ref < ITEMS.length, 'unknown item ref');
      break;
    case CMD.HEARTH_PUT:
      check(isInt(cmd.x) && isInt(cmd.y) && isInt(cmd.z), 'hearth target must be integers');
      check(cmd.slot === HEARTH_SLOT.ORE || cmd.slot === HEARTH_SLOT.FUEL, 'unknown hearth slot');
      break;
    case CMD.HEARTH_TAKE:
      check(isInt(cmd.x) && isInt(cmd.y) && isInt(cmd.z), 'hearth target must be integers');
      break;
    default:
      check(false, `unknown type: ${cmd.type}`);
  }
  return cmd;
}

// Canonical order: (t, p, s), strictly increasing — duplicates are refused.
export function sortCommands(commands) {
  const sorted = commands.slice().sort((a, b) => a.t - b.t || a.p - b.p || a.s - b.s);
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a.t === b.t && a.p === b.p && a.s === b.s) {
      throw new Error(`duplicate command key: t=${a.t} p=${a.p} s=${a.s}`);
    }
  }
  return sorted;
}

// Validate + canonically order a whole log.
export function normalizeLog(commands) {
  if (!Array.isArray(commands)) throw new Error('command log must be an array');
  for (const cmd of commands) validateCommand(cmd);
  return sortCommands(commands);
}

// Fixed-width integer encoding for the hash chain: every command becomes
// exactly 8 ints, so streams differing anywhere differ as int sequences.
export function encodeCommand(cmd) {
  switch (cmd.type) {
    case CMD.MOVE:
      return [cmd.t, cmd.p, cmd.s, CMD.MOVE, cmd.buttons, cmd.yaw, cmd.pitch, 0];
    case CMD.MINE_START:
      return [cmd.t, cmd.p, cmd.s, CMD.MINE_START, cmd.x, cmd.y, cmd.z, 0];
    case CMD.MINE_STOP:
      return [cmd.t, cmd.p, cmd.s, CMD.MINE_STOP, 0, 0, 0, 0];
    case CMD.PLACE:
      return [cmd.t, cmd.p, cmd.s, CMD.PLACE, cmd.x, cmd.y, cmd.z, blockCode(cmd.block)];
    case CMD.ATTACK:
      return [cmd.t, cmd.p, cmd.s, CMD.ATTACK, cmd.entityId, 0, 0, 0];
    case CMD.BANK:
      return [cmd.t, cmd.p, cmd.s, CMD.BANK, 0, 0, 0, 0];
    case CMD.CRAFT:
      return [cmd.t, cmd.p, cmd.s, CMD.CRAFT, cmd.recipeId, 0, 0, 0];
    case CMD.EQUIP:
      return [cmd.t, cmd.p, cmd.s, CMD.EQUIP, cmd.mode, cmd.ref, 0, 0];
    case CMD.HEARTH_PUT:
      return [cmd.t, cmd.p, cmd.s, CMD.HEARTH_PUT, cmd.x, cmd.y, cmd.z, cmd.slot];
    case CMD.HEARTH_TAKE:
      return [cmd.t, cmd.p, cmd.s, CMD.HEARTH_TAKE, cmd.x, cmd.y, cmd.z, 0];
    default:
      throw new Error(`unknown command type: ${cmd.type}`);
  }
}

// Re-export for validation symmetry (EQUIP item refs are item codes).
export { itemCode };
