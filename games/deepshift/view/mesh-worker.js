// The mesh worker (DS-1b Gate 1): receives immutable section snapshots
// (mesh-snapshot.js contract), returns meshed geometry with the revision
// stamp intact. Plain ES module worker — no dependencies, no three, no sim.
// All scheduling policy (staleness, coalescing, caps) lives in the pool on
// the main thread; this file is deliberately policy-free.

import { meshSnapshot, resultTransferables } from './mesh-snapshot.js';

globalThis.onmessage = (event) => {
  const result = meshSnapshot(event.data);
  globalThis.postMessage(result, resultTransferables(result));
};
