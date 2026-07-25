// D1 conformance (DS-0 D1.6): the committed golden fixture asserts
// bit-identical ActiveSet and province membership for adversarial anchor
// paths. It must pass on every platform, forever. Regenerating the fixture
// is a ruleset event (tools/gen-d1-fixture.mjs), never a test fix.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RULESET, RULESET_HASH } from './sim/constants.js';
import { hashInts, toHex64 } from './sim/math/xxhash64.js';
import { computeActiveSet, computeActiveProvinces, activeSetHas } from './sim/activation.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/d1-activation.json', import.meta.url), 'utf8'),
);

function digestSet(activeSet) {
  const flat = [activeSet.length];
  for (const [cx, cy, cz] of activeSet) flat.push(cx, cy, cz);
  return toHex64(hashInts(0n, flat));
}

test('fixture was generated under the current ruleset', () => {
  assert.equal(fixture.rulesetHash, RULESET_HASH);
  assert.equal(fixture.simRadius, RULESET.simRadius);
  assert.equal(fixture.maxActiveProvinces, RULESET.maxActiveProvinces);
});

test('D1 conformance: bit-identical ActiveSet across adversarial anchor paths', () => {
  for (const step of fixture.steps) {
    if (step.digest === undefined) continue;
    const activeSet = computeActiveSet(step.anchors);
    assert.equal(activeSet.length, step.count, step.name);
    assert.equal(digestSet(activeSet), step.digest, step.name);
    if (step.activeSet !== undefined) {
      assert.deepEqual(activeSet, step.activeSet, step.name);
    }
  }
});

test('D1 conformance: province membership and deterministic admission', () => {
  for (const step of fixture.steps) {
    if (step.activeProvinceIds === undefined) continue;
    const result = computeActiveProvinces(step.anchors, step.provinces);
    assert.equal(digestSet(result.activeSet), step.activeSetDigest, step.name);
    assert.deepEqual(result.admitted, step.admitted, step.name);
    assert.deepEqual(result.activeProvinceIds, step.activeProvinceIds, step.name);
  }
});

test('ActiveSet is exactly the Chebyshev ball: boundary in, beyond out', () => {
  const r = RULESET.simRadius;
  const activeSet = computeActiveSet([{ cx: 10, cy: -5, cz: 7 }]);
  assert.equal(activeSet.length, (2 * r + 1) ** 3);
  assert.ok(activeSetHas(activeSet, 10 + r, -5 + r, 7 + r));
  assert.ok(activeSetHas(activeSet, 10 - r, -5, 7));
  assert.ok(!activeSetHas(activeSet, 10 + r + 1, -5, 7));
  assert.ok(!activeSetHas(activeSet, 10, -5 - r - 1, 7));
});

test('a province with any chunk outside the ActiveSet is frozen', () => {
  const anchors = [{ cx: 0, cy: 0, cz: 0 }];
  const inOut = { id: 1, chunks: [[0, 0, 0], [RULESET.simRadius + 1, 0, 0]] };
  const inside = { id: 2, chunks: [[0, 0, 0], [RULESET.simRadius, 0, 0]] };
  const result = computeActiveProvinces(anchors, [inOut, inside]);
  assert.deepEqual(result.activeProvinceIds, [2]);
});

test('admission over budget: nearest first, ties broken by ascending id', () => {
  const anchors = [{ cx: 0, cy: 0, cz: 0 }];
  const provinces = [];
  for (let i = 0; i < RULESET.maxActiveProvinces + 4; i += 1) {
    // All at distance 1 except the last four at distance 0 with high ids.
    const d = i < RULESET.maxActiveProvinces ? 1 : 0;
    provinces.push({ id: 1000 - i, chunks: [[d, 0, 0]] });
  }
  const result = computeActiveProvinces(anchors, provinces);
  assert.equal(result.admitted.length, RULESET.maxActiveProvinces);
  // The four distance-0 provinces are admitted first despite later ids...
  const distanceZeroIds = provinces.slice(RULESET.maxActiveProvinces).map((p) => p.id).sort((a, b) => a - b);
  assert.deepEqual(result.admitted.slice(0, 4), distanceZeroIds);
  // ...and within distance 1, ascending id wins.
  const admittedD1 = result.admitted.slice(4);
  assert.deepEqual(admittedD1, admittedD1.slice().sort((a, b) => a - b));
});
