// The DS-1c light model (GDD §10.1: light level DRIVES spawning).
//
// light(cell) = max(sky contribution, placed-source contribution).
//   - Sky: a cell with no opaque block above it in its column receives the
//     phase sky level (day 15 / dusk 7 / night 3). An opaque roof (or a
//     gnarlpine canopy — leaves are opaque) drops the sky term to 0: caves
//     and interiors are dark at noon, per §10.1 "underground always".
//   - Sources: torches (13) and lit hearths (14) radiate with a falloff of
//     1 per Manhattan block, unoccluded (DS-1c simplification, declared:
//     BFS occlusion arrives with cave content). A torch therefore holds
//     light >= 4 across a 9-block reach — the §10.1 "~9-block falloff".
//
// All integer arithmetic; every function is a pure read of (state, cell).

import { RULESET } from './constants.js';
import { isOpaqueBlock } from './world/blocks.js';
import { getBlock } from './world/world.js';
import { REGION } from './world/worldgen.js';

export const PHASE = Object.freeze({ day: 0, dusk: 1, night: 2 });

export function phaseOf(tick) {
  if (tick < RULESET.dayTicks) return 'day';
  if (tick < RULESET.dayTicks + RULESET.duskTicks) return 'dusk';
  return 'night';
}

// The banking/score boundary (§3.3): "night" is the night phase proper.
// Dusk still counts as day — the horn is the warning, not the deadline.
export function isNight(tick) {
  return tick >= RULESET.dayTicks + RULESET.duskTicks;
}

export function skyLevelAt(tick) {
  const phase = phaseOf(tick);
  if (phase === 'day') return RULESET.skyLightDay;
  if (phase === 'dusk') return RULESET.skyLightDusk;
  return RULESET.skyLightNight;
}

// True when nothing opaque stands between the cell and the sky.
export function skyExposed(world, x, y, z) {
  for (let yy = y + 1; yy < REGION.blocksY; yy += 1) {
    if (isOpaqueBlock(getBlock(world, x, yy, z))) return false;
  }
  return true;
}

// Placed-source light at a cell: max over state.lights (torches, lit
// hearths) of level - manhattan distance.
export function sourceLightAt(lights, x, y, z) {
  let best = 0;
  for (const key in lights) {
    const level = lights[key];
    const comma1 = key.indexOf(',');
    const comma2 = key.indexOf(',', comma1 + 1);
    const lx = Number(key.slice(0, comma1));
    const ly = Number(key.slice(comma1 + 1, comma2));
    const lz = Number(key.slice(comma2 + 1));
    const d = Math.abs(x - lx) + Math.abs(y - ly) + Math.abs(z - lz);
    const v = level - d;
    if (v > best) best = v;
  }
  return best;
}

export function lightAt(state, x, y, z) {
  const sky = skyExposed(state.world, x, y, z) ? skyLevelAt(state.tick) : 0;
  const source = sourceLightAt(state.lights, x, y, z);
  return sky > source ? sky : source;
}

// §10.1 sunrise/day burn: direct sunlight = day phase + sky-exposed.
export function inDirectSun(state, x, y, z) {
  return phaseOf(state.tick) === 'day' && skyExposed(state.world, x, y, z);
}
