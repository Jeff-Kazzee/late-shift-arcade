// GPU/DOM resource disposal registry (GDD §13.6): every disposable the
// renderer creates is tracked here; eject = one registry sweep. The
// 10-cycle leak test is bookkeeping over this structure: after dispose,
// size() must be zero and every disposer must have run exactly once.

export function createRegistry() {
  let nextToken = 1;
  const disposers = new Map();
  return {
    // Track a resource with its disposer. Returns a token for early release.
    track(resource, dispose) {
      if (typeof dispose !== 'function') throw new TypeError('track needs a disposer');
      const token = nextToken;
      nextToken += 1;
      disposers.set(token, () => dispose(resource));
      return token;
    },
    // Dispose one resource now (e.g. a section geometry being replaced).
    release(token) {
      const dispose = disposers.get(token);
      if (dispose === undefined) return false;
      disposers.delete(token);
      dispose();
      return true;
    },
    // Dispose everything, newest first. Idempotent; returns count swept.
    sweep() {
      const entries = [...disposers.values()].reverse();
      disposers.clear();
      for (const dispose of entries) dispose();
      return entries.length;
    },
    size() {
      return disposers.size;
    },
  };
}
