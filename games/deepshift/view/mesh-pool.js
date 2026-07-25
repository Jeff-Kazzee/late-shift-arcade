// The mesh-job scheduler (DS-1b Gate 1, the F-06 contract made executable).
//
// Invariants:
//   - One in-flight job per section key, ever.
//   - submit() records the section's newest revision; a result whose
//     revision no longer matches is REJECTED — at receive time and again at
//     drain time (an edit can land between receive and apply).
//   - A queued job superseded by a newer submit for the same key is
//     COALESCED (replaced in place) — superseded work is never dispatched.
//   - In-flight input bytes, pending (received, unapplied) output bytes,
//     and in-flight job count are all counted and CAPPED; dispatch stalls
//     under any cap and resumes as the pressure drains. Backpressure delays
//     presentation only — the sim never waits on this pool.
//
// Transport-agnostic and headless-testable: a transport is anything with
// { onResult(cb), post(snapshot), terminate() }. Real Web Workers, an
// inline synchronous fallback, and the tests' manual fake all qualify.

export const DEFAULT_MAX_IN_FLIGHT_PER_TRANSPORT = 2;
export const DEFAULT_MAX_IN_FLIGHT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_PENDING_RESULT_BYTES = 32 * 1024 * 1024;
const LATENCY_WINDOW = 512;

export function createMeshPool({
  transports,
  maxInFlight = transports.length * DEFAULT_MAX_IN_FLIGHT_PER_TRANSPORT,
  maxInFlightBytes = DEFAULT_MAX_IN_FLIGHT_BYTES,
  maxPendingResultBytes = DEFAULT_MAX_PENDING_RESULT_BYTES,
  now = () => (globalThis.performance === undefined ? 0 : globalThis.performance.now()),
} = {}) {
  if (!Array.isArray(transports) || transports.length === 0) {
    throw new TypeError('createMeshPool needs at least one transport');
  }

  const latest = new Map(); // key -> newest submitted revision (the authority)
  const queued = new Map(); // key -> { snapshot, submittedAt }, insertion-ordered
  const inFlight = new Map(); // key -> { bytes, submittedAt, slot }
  const results = []; // received, fresh-at-receive, awaiting drain
  const slotLoad = new Array(transports.length).fill(0);
  const latencies = [];

  let inFlightBytes = 0;
  let pendingResultBytes = 0;
  let disposed = false;
  let pumping = false;
  const counters = {
    submitted: 0, dispatched: 0, completed: 0, applied: 0,
    rejectedStale: 0, coalesced: 0,
    peakInFlight: 0, peakInFlightBytes: 0, peakPendingResultBytes: 0, peakQueued: 0,
  };

  function receive(result) {
    const job = inFlight.get(result.key);
    if (job === undefined) return; // terminated / unknown — drop silently
    inFlight.delete(result.key);
    inFlightBytes -= job.bytes;
    slotLoad[job.slot] -= 1;
    counters.completed += 1;
    if (result.revision !== latest.get(result.key)) {
      counters.rejectedStale += 1;
    } else {
      results.push({ result, submittedAt: job.submittedAt });
      pendingResultBytes += result.bytes;
      if (pendingResultBytes > counters.peakPendingResultBytes) {
        counters.peakPendingResultBytes = pendingResultBytes;
      }
    }
    pump();
  }

  transports.forEach((transport) => transport.onResult(receive));

  function pickSlot() {
    let best = 0;
    for (let i = 1; i < slotLoad.length; i += 1) {
      if (slotLoad[i] < slotLoad[best]) best = i;
    }
    return best;
  }

  function pump() {
    if (pumping || disposed) return;
    pumping = true;
    let progressed = true;
    while (progressed) {
      progressed = false;
      if (queued.size === 0) break;
      if (inFlight.size >= maxInFlight) break;
      if (inFlightBytes >= maxInFlightBytes) break;
      if (pendingResultBytes >= maxPendingResultBytes) break;
      for (const [key, entry] of queued) {
        if (inFlight.has(key)) continue; // one in-flight job per key
        queued.delete(key);
        const slot = pickSlot();
        inFlight.set(key, { bytes: entry.snapshot.bytes, submittedAt: entry.submittedAt, slot });
        inFlightBytes += entry.snapshot.bytes;
        slotLoad[slot] += 1;
        counters.dispatched += 1;
        if (inFlight.size > counters.peakInFlight) counters.peakInFlight = inFlight.size;
        if (inFlightBytes > counters.peakInFlightBytes) counters.peakInFlightBytes = inFlightBytes;
        transports[slot].post(entry.snapshot); // may deliver synchronously
        progressed = true;
        break; // re-evaluate every cap before the next dispatch
      }
    }
    pumping = false;
  }

  return {
    // Submit an immutable snapshot. Its revision becomes the key's newest;
    // any older queued job for the key is coalesced away.
    submit(snapshot) {
      if (disposed) return;
      counters.submitted += 1;
      latest.set(snapshot.key, snapshot.revision);
      if (queued.has(snapshot.key)) {
        counters.coalesced += 1;
        queued.delete(snapshot.key); // re-insert to keep newest-submit order
      }
      queued.set(snapshot.key, { snapshot, submittedAt: now() });
      if (queued.size > counters.peakQueued) counters.peakQueued = queued.size;
      pump();
    },

    // Apply up to maxResults / maxBytes of received results. Freshness is
    // re-checked here: a result that was fresh at receive time but has been
    // superseded since is rejected, never applied.
    drain(apply, { maxResults = Infinity, maxBytes = Infinity } = {}) {
      let applied = 0;
      let bytes = 0;
      while (results.length > 0 && applied < maxResults && bytes < maxBytes) {
        const { result, submittedAt } = results.shift();
        pendingResultBytes -= result.bytes;
        if (result.revision !== latest.get(result.key)) {
          counters.rejectedStale += 1;
          continue;
        }
        apply(result);
        counters.applied += 1;
        applied += 1;
        bytes += result.bytes;
        latencies.push(now() - submittedAt);
        if (latencies.length > LATENCY_WINDOW) latencies.shift();
      }
      pump();
      return applied;
    },

    // Drop a section entirely (chunk unloaded): queued job discarded, any
    // in-flight result will arrive stale against the cleared authority.
    forget(key) {
      queued.delete(key);
      latest.delete(key);
    },

    // True while the key has any work anywhere in the pipeline.
    busy(key) {
      if (queued.has(key) || inFlight.has(key)) return true;
      for (const entry of results) {
        if (entry.result.key === key) return true;
      }
      return false;
    },

    idle() {
      return queued.size === 0 && inFlight.size === 0 && results.length === 0;
    },

    stats() {
      return {
        ...counters,
        queued: queued.size,
        inFlight: inFlight.size,
        pendingResults: results.length,
        inFlightBytes,
        pendingResultBytes,
        transports: transports.length,
        maxInFlight,
        maxInFlightBytes,
        maxPendingResultBytes,
        latencies: latencies.slice(),
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      queued.clear();
      latest.clear();
      inFlight.clear();
      results.length = 0;
      inFlightBytes = 0;
      pendingResultBytes = 0;
      for (const transport of transports) transport.terminate();
    },
  };
}
