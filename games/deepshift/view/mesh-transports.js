// Transports for the mesh pool (DS-1b Gate 1).
//
// Browser: a pool of 2-4 plain module Web Workers (GDD §13.3,
// hardwareConcurrency-aware), snapshots and results moved by transfer list.
// Headless / no-Worker fallback: an inline transport that meshes
// synchronously on post — same meshSnapshot code path, byte-identical
// output, so every pool behavior is testable without a browser.

import { meshSnapshot, snapshotTransferables } from './mesh-snapshot.js';

export const MIN_MESH_WORKERS = 2;
export const MAX_MESH_WORKERS = 4;

export function meshWorkerCount(hardwareConcurrency) {
  const cores = typeof hardwareConcurrency === 'number' && hardwareConcurrency >= 1
    ? hardwareConcurrency : 4;
  return Math.max(MIN_MESH_WORKERS, Math.min(MAX_MESH_WORKERS, cores - 2));
}

export function createWorkerTransports(count) {
  return Array.from({ length: count }, () => {
    const worker = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' });
    let deliver = null;
    worker.onmessage = (event) => {
      if (deliver !== null) deliver(event.data);
    };
    return {
      onResult(callback) { deliver = callback; },
      post(snapshot) { worker.postMessage(snapshot, snapshotTransferables(snapshot)); },
      terminate() { worker.terminate(); },
    };
  });
}

// Synchronous inline transport: post() meshes immediately and delivers the
// result before returning. The pool is written to tolerate this reentrancy.
export function createInlineTransport() {
  let deliver = null;
  return {
    onResult(callback) { deliver = callback; },
    post(snapshot) {
      if (deliver !== null) deliver(meshSnapshot(snapshot));
    },
    terminate() {},
  };
}

export function defaultTransports() {
  if (typeof Worker === 'function') {
    return createWorkerTransports(meshWorkerCount(globalThis.navigator?.hardwareConcurrency));
  }
  return [createInlineTransport()];
}
