// Regenerates fixtures/d1-activation.json — the D1 cross-input conformance
// fixture (DS-0 D1.6). The committed fixture is GOLDEN: CI asserts today's
// implementation reproduces it bit-identically on every platform, forever.
// Regenerating is a ruleset event, not a refactor.
//
//   node games/deepshift/tools/gen-d1-fixture.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RULESET, RULESET_HASH } from '../sim/constants.js';
import { hashInts, toHex64 } from '../sim/math/xxhash64.js';
import { computeActiveSet, computeActiveProvinces } from '../sim/activation.js';

function digestSet(activeSet) {
  const flat = [activeSet.length];
  for (const [cx, cy, cz] of activeSet) flat.push(cx, cy, cz);
  return toHex64(hashInts(0n, flat));
}

function setStep(name, anchors, { full = false } = {}) {
  const activeSet = computeActiveSet(anchors);
  const step = { name, anchors, count: activeSet.length, digest: digestSet(activeSet) };
  if (full) step.activeSet = activeSet;
  return step;
}

function provinceStep(name, anchors, provinces) {
  const result = computeActiveProvinces(anchors, provinces);
  return {
    name,
    anchors,
    provinces,
    activeSetDigest: digestSet(result.activeSet),
    admitted: result.admitted,
    activeProvinceIds: result.activeProvinceIds,
  };
}

const steps = [];

// Adversarial anchor paths: chunk-boundary crossings and diagonal moves,
// one step per tick of the path (membership must shift by exactly one slab).
steps.push(setStep('origin', [{ cx: 0, cy: 0, cz: 0 }], { full: true }));
for (let x = -2; x <= 2; x += 1) {
  steps.push(setStep(`boundary-path x=${x}`, [{ cx: x, cy: 0, cz: 0 }]));
}
for (let i = -2; i <= 2; i += 1) {
  steps.push(setStep(`diagonal-path i=${i}`, [{ cx: i, cy: i, cz: i }]));
}
steps.push(setStep('negative-far', [{ cx: -100, cy: -3, cz: -77 }]));
steps.push(setStep('duplicate-anchors', [{ cx: 5, cy: 5, cz: 5 }, { cx: 5, cy: 5, cz: 5 }]));
steps.push(setStep('two-anchor-overlap', [{ cx: 0, cy: 0, cz: 0 }, { cx: 4, cy: 1, cz: -2 }], { full: true }));
steps.push(setStep('two-anchor-disjoint', [{ cx: 0, cy: 0, cz: 0 }, { cx: 20, cy: 0, cz: 0 }]));

// Province activation: "active iff every chunk inside ActiveSet", plus the
// deterministic admission order (distance, then ascending id).
steps.push(provinceStep('provinces-membership', [{ cx: 0, cy: 0, cz: 0 }], [
  { id: 1, chunks: [[0, 0, 0], [1, 0, 0]] }, // fully inside
  { id: 2, chunks: [[3, 0, 0], [4, 0, 0]] }, // one chunk outside -> inactive
  { id: 3, chunks: [[3, 3, 3]] }, // corner, exactly radius
  { id: 4, chunks: [] }, // empty -> never active
  { id: 5, chunks: [[-3, -3, -3], [3, 3, 3]] }, // both corners inside
]));

// Over-budget admission with distance ties: 20 candidates, budget 16.
const crowd = [];
let id = 100;
for (let d = 0; d <= 3; d += 1) {
  for (let k = 0; k < 5; k += 1) {
    crowd.push({ id: id + k * 10 + d, chunks: [[d, k <= d ? 0 : 0, k % 4 === 0 ? d : 0]] });
  }
}
steps.push(provinceStep('provinces-admission-budget', [{ cx: 0, cy: 0, cz: 0 }], crowd));

// Multi-anchor province distances (nearest ANY anchor decides admission).
steps.push(provinceStep('provinces-two-anchors', [{ cx: 0, cy: 0, cz: 0 }, { cx: 6, cy: 0, cz: 0 }], [
  { id: 7, chunks: [[6, 0, 0]] },
  { id: 8, chunks: [[3, 0, 0]] }, // distance 3 from both
  { id: 9, chunks: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]] },
]));

const fixture = {
  description: 'DS-0 D1 conformance: bit-identical ActiveSet/province membership',
  rulesetHash: RULESET_HASH,
  simRadius: RULESET.simRadius,
  maxActiveProvinces: RULESET.maxActiveProvinces,
  steps,
};

const out = fileURLToPath(new URL('../fixtures/d1-activation.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`);
process.stdout.write(`wrote ${out}: ${steps.length} steps\n`);
