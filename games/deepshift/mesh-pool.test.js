// DS-1b Gate 1 headless proofs: the mesh-pool scheduler enforcing the F-06
// contract — revision-stamped stale rejection (at receive AND at drain),
// coalescing of superseded jobs, one in-flight job per section, and counted,
// capped in-flight input and pending output buffers.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMeshPool } from './view/mesh-pool.js';
import { createInlineTransport } from './view/mesh-transports.js';
import { snapshotSection, meshSnapshot } from './view/mesh-snapshot.js';
import { meshSection } from './view/mesher.js';

// A hand-cranked transport: jobs sit in `posted` until the test completes
// them, in any order — exactly how out-of-order worker completion happens.
function manualTransport() {
  const posted = [];
  let deliver = null;
  const transport = {
    posted,
    terminated: false,
    onResult(cb) { deliver = cb; },
    post(snapshot) { posted.push(snapshot); },
    complete(index = 0, resultBytes = 64) {
      const snapshot = posted.splice(index, 1)[0];
      deliver({
        key: snapshot.key, sx: 0, sy: 0, sz: 0,
        revision: snapshot.revision,
        indices: { length: 1 }, // shape only; policy tests never render
        bytes: resultBytes,
        payload: snapshot.payload,
      });
    },
    terminate() { transport.terminated = true; },
  };
  return transport;
}

function job(key, revision, bytes = 100, payload = null) {
  return { key, revision, bytes, payload };
}

test('a superseded in-flight job is rejected at receive; the newest revision wins', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t] });
  pool.submit(job('0,0,0', 1, 100, 'old'));
  assert.equal(t.posted.length, 1, 'rev 1 dispatched');
  pool.submit(job('0,0,0', 2, 100, 'new')); // edit landed: revision bumped
  assert.equal(t.posted.length, 1, 'one in-flight job per key — rev 2 queues');

  t.complete(0); // rev 1 arrives late
  assert.equal(pool.stats().rejectedStale, 1);
  assert.equal(pool.stats().pendingResults, 0, 'stale result never reaches drain');
  assert.equal(t.posted.length, 1, 'rev 2 dispatched the moment rev 1 cleared');

  t.complete(0); // rev 2 arrives
  const applied = [];
  pool.drain((r) => applied.push(r));
  assert.deepEqual(applied.map((r) => r.payload), ['new']);
  assert.equal(pool.stats().applied, 1);
});

test('freshness is re-checked at drain time: an edit between receive and apply rejects', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t] });
  pool.submit(job('1,2,3', 1));
  t.complete(0); // received, fresh at receive
  assert.equal(pool.stats().pendingResults, 1);

  pool.submit(job('1,2,3', 2)); // edit lands BEFORE the result is applied
  const applied = [];
  pool.drain((r) => applied.push(r));
  assert.equal(applied.length, 0, 'the rev-1 result must not apply');
  assert.equal(pool.stats().rejectedStale, 1);

  t.complete(0);
  pool.drain((r) => applied.push(r));
  assert.equal(applied.length, 1);
  assert.equal(applied[0].revision, 2);
});

test('queued jobs for the same section coalesce: superseded work is never dispatched', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t], maxInFlight: 1 });
  pool.submit(job('5,5,5', 1));
  pool.submit(job('5,5,5', 2));
  pool.submit(job('5,5,5', 3));
  pool.submit(job('5,5,5', 4));
  assert.equal(pool.stats().coalesced, 2, 'revisions 2 and 3 replaced in queue');
  assert.equal(pool.stats().queued, 1);

  t.complete(0); // rev 1: stale
  assert.equal(t.posted.length, 1);
  assert.equal(t.posted[0].revision, 4, 'only the newest queued revision dispatches');
  t.complete(0);
  let got = null;
  pool.drain((r) => { got = r; });
  assert.equal(got.revision, 4);
  assert.equal(pool.stats().dispatched, 2, '4 submits, 2 dispatches — the rest coalesced');
});

test('in-flight job count is capped; dispatch resumes as completions free slots', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t], maxInFlight: 2 });
  for (let i = 0; i < 6; i += 1) pool.submit(job(`${i},0,0`, 1));
  assert.equal(t.posted.length, 2, 'never more than maxInFlight dispatched');
  assert.equal(pool.stats().queued, 4);
  t.complete(0);
  assert.equal(t.posted.length, 2, 'a free slot refills immediately');
  t.complete(0);
  t.complete(0);
  assert.equal(pool.stats().peakInFlight, 2);
});

test('in-flight INPUT bytes are counted and capped', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t], maxInFlight: 8, maxInFlightBytes: 250 });
  pool.submit(job('0,0,0', 1, 200));
  pool.submit(job('1,0,0', 1, 200));
  pool.submit(job('2,0,0', 1, 200));
  // 200 < 250 so the first dispatches; the second would stand at 400 >= 250.
  assert.equal(t.posted.length, 1, 'byte cap holds dispatch below the limit');
  assert.equal(pool.stats().inFlightBytes, 200);
  t.complete(0);
  assert.equal(t.posted.length, 1, 'next job dispatches once bytes drain');
  assert.equal(pool.stats().inFlightBytes, 200);
});

test('pending OUTPUT bytes are counted and backpressure dispatch until drained', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t], maxInFlight: 1, maxPendingResultBytes: 50 });
  pool.submit(job('0,0,0', 1));
  pool.submit(job('1,0,0', 1));
  t.complete(0, 64); // 64 pending bytes >= 50 cap
  assert.equal(pool.stats().pendingResultBytes, 64);
  assert.equal(t.posted.length, 0, 'output backpressure stalls dispatch');
  pool.drain(() => {});
  assert.equal(pool.stats().pendingResultBytes, 0);
  assert.equal(t.posted.length, 1, 'dispatch resumes after the drain');
});

test('drain respects its per-frame budgets and preserves arrival order', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t], maxInFlight: 4 });
  for (let i = 0; i < 4; i += 1) pool.submit(job(`${i},0,0`, 1, 100, i));
  for (let i = 0; i < 4; i += 1) t.complete(0);
  const first = [];
  assert.equal(pool.drain((r) => first.push(r.payload), { maxResults: 3 }), 3);
  assert.deepEqual(first, [0, 1, 2]);
  const rest = [];
  pool.drain((r) => rest.push(r.payload));
  assert.deepEqual(rest, [3]);
});

test('forget() makes an unloaded section unable to apply, even mid-flight', () => {
  const t = manualTransport();
  const pool = createMeshPool({ transports: [t] });
  pool.submit(job('9,9,9', 1));
  pool.forget('9,9,9'); // chunk unloaded while the job is in flight
  t.complete(0);
  const applied = [];
  pool.drain((r) => applied.push(r));
  assert.equal(applied.length, 0);
  assert.equal(pool.stats().rejectedStale, 1);
  assert.ok(pool.idle());
});

test('work spreads across transports by load', () => {
  const a = manualTransport();
  const b = manualTransport();
  const pool = createMeshPool({ transports: [a, b], maxInFlight: 4 });
  for (let i = 0; i < 4; i += 1) pool.submit(job(`${i},0,0`, 1));
  assert.equal(a.posted.length, 2);
  assert.equal(b.posted.length, 2);
});

test('dispose terminates every transport and drops all work', () => {
  const a = manualTransport();
  const b = manualTransport();
  const pool = createMeshPool({ transports: [a, b] });
  pool.submit(job('0,0,0', 1));
  pool.dispose();
  assert.ok(a.terminated);
  assert.ok(b.terminated);
  assert.ok(pool.idle());
  pool.submit(job('1,0,0', 1)); // post-dispose submits are inert
  assert.equal(a.posted.length + b.posted.length, 1, 'only the pre-dispose dispatch happened');
});

test('end to end on the inline transport: applied meshes equal direct meshing', () => {
  const cells = new Map([['3,3,3', 'fieldstone'], ['4,3,3', 'coal'], ['15,0,0', 'dirt']]);
  const read = (x, y, z) => cells.get(`${x},${y},${z}`) ?? 'air';
  const pool = createMeshPool({ transports: [createInlineTransport()] });
  pool.submit(snapshotSection(read, 0, 0, 0, 1));
  const applied = [];
  pool.drain((r) => applied.push(r));
  assert.equal(applied.length, 1);
  const direct = meshSection(read, 0, 0, 0);
  assert.deepEqual(Array.from(applied[0].positions), Array.from(direct.positions));
  assert.deepEqual(Array.from(applied[0].indices), Array.from(direct.indices));
  const stats = pool.stats();
  assert.equal(stats.applied, 1);
  assert.equal(stats.latencies.length, 1);
  assert.ok(stats.latencies[0] >= 0);
});

test('inline and (simulated) worker paths produce byte-identical results', () => {
  // The worker file calls meshSnapshot on the posted snapshot — replicate
  // that exact call here and compare against the inline transport result.
  const cells = new Map([['1,2,3', 'wardwall'], ['2,2,3', 'wardwall'], ['1,3,3', 'cache']]);
  const read = (x, y, z) => cells.get(`${x},${y},${z}`) ?? 'air';
  const snapshot = snapshotSection(read, 0, 0, 0, 5);
  const workerResult = meshSnapshot(snapshot); // == mesh-worker.js onmessage body
  const pool = createMeshPool({ transports: [createInlineTransport()] });
  pool.submit(snapshotSection(read, 0, 0, 0, 5));
  let inlineResult = null;
  pool.drain((r) => { inlineResult = r; });
  assert.deepEqual(Array.from(inlineResult.positions), Array.from(workerResult.positions));
  assert.deepEqual(Array.from(inlineResult.colors), Array.from(workerResult.colors));
  assert.deepEqual(Array.from(inlineResult.indices), Array.from(workerResult.indices));
});
