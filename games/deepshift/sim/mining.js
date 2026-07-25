// The §8.1 break-time model, integer form. Pure: (block, tool) -> ticks.
//
//   breakSeconds = 1.5 x hardness / speedMult   right class, HL sufficient
//                = 5.0 x hardness               wrong class, HL sufficient
//                = never completes              HL insufficient (progress
//                                               ring caps at 20%, §8.1)
//
// Integer derivation at 20 Hz with hardness x10 and speedMult x10:
//   right class: ceil(30 x hardness10 / speedMult10) ticks
//   wrong class: 10 x hardness10 ticks
// Worked §8.1 examples hold exactly: fieldstone/bone pick = 30 ticks
// (1.5 s); copper ore/fieldstone pick = 36 ticks (1.8 s).

import { block } from './world/blocks.js';
import { miningProfile } from './items.js';
import { floorDiv } from './math/fixed.js';

export const NEVER = -1; // HL-insufficient sentinel: progress never completes

function ceilDiv(a, b) {
  return floorDiv(a + b - 1, b);
}

// Ticks to break `blockId` with `tool` ({kind, tier} | null = hand).
// Returns NEVER when the harvest level is insufficient.
export function breakTicks(blockId, tool) {
  const b = block(blockId);
  if (!b.breakable) return NEVER;
  const profile = miningProfile(tool);
  if (profile.harvestLevel < b.harvestLevel) return NEVER;
  const rightClass = b.toolClass !== 'none' && b.toolClass === profile.toolClass;
  if (rightClass) return Math.max(1, ceilDiv(30 * b.hardness10, profile.speedMult10));
  // 'none'-class blocks (torch, leaves) break at the wrong-class rate for
  // every tool and the hand alike — nothing speeds them, nothing gates them.
  return Math.max(1, 10 * b.hardness10);
}

// The §8.1 UI rule: an HL-insufficient target fills its ring to 20% and
// stops. Expressed in ticks of the wrong-class time so the ring moves.
export function progressCapTicks(blockId) {
  const b = block(blockId);
  return Math.max(1, floorDiv(10 * b.hardness10, 5));
}
