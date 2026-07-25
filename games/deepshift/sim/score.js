// The §3.3 Dawn Run score formula, live, with the §3.4 anti-grind caps.
//
//   score = 20 x bankedOreValue(day)     [day = 06:00-18:00: day + dusk]
//         + 30 x bankedOreValue(night)   [the 1.5x courage knob]
//           [per-material unit caps: 40 coal / 30 copper per phase bucket;
//            combined banking cap 600 = 2x quota, day counted first]
//         + 6000 x won                   [quota >= 300 AND alive at dawn]
//         + sum threatValue of hostile kills, capped 3000
//         - nothing                      [failure is the penalty]
//
// Banked units beyond a cap still bank (the material leaves the player)
// but stop scoring — mining forever cannot win (§3.4). The 1.5x multiplier
// applies INSIDE the caps, never on top of them.

import { RULESET } from './constants.js';
import { BANKABLE } from './items.js';

// state.banking = { day: {coal, copper_ore}, night: {coal, copper_ore} } —
// raw banked UNITS per phase bucket. Value applies the §3.4 caps.
export function emptyBankingWindow() {
  const bucket = {};
  for (const bank of BANKABLE) bucket[bank.item] = 0;
  return bucket;
}

export function windowValue(bucket) {
  let value = 0;
  for (const bank of BANKABLE) {
    value += Math.min(bucket[bank.item], bank.capUnits) * bank.value;
  }
  return value;
}

// Capped banked value per phase bucket, with the combined 600 cap consuming
// the day bucket first (banking is chronological; night trims last).
export function bankedValues(banking) {
  const day = Math.min(windowValue(banking.day), RULESET.bankValueCap);
  const night = Math.min(windowValue(banking.night), RULESET.bankValueCap - day);
  return { day, night, total: day + night };
}

export function quotaMet(banking) {
  return bankedValues(banking).total >= RULESET.quotaValue;
}

export function computeScore(state) {
  const values = bankedValues(state.banking);
  let score = values.day * RULESET.scorePerValueDay
    + values.night * RULESET.scorePerValueNight
    + Math.min(state.killValue, RULESET.killScoreCap);
  if (state.status === 'won') score += RULESET.scoreWinBonus;
  return score;
}
