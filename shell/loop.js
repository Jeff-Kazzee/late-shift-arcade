// Fixed-timestep accumulator. Pure so it can be tested with node --test.

export const STEP_MS = 1000 / 60;

// Longest frame we are willing to simulate; anything slower (tab was
// backgrounded, debugger paused) is treated as a hiccup, not elapsed time.
const MAX_FRAME_MS = 250;

export function advance(accumulator, frameMs, stepMs = STEP_MS, maxSteps = 5) {
  let acc = accumulator + Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);
  let steps = 0;
  while (acc >= stepMs && steps < maxSteps) {
    acc -= stepMs;
    steps += 1;
  }
  if (steps === maxSteps) acc = 0; // drop backlog instead of spiraling
  return { steps, acc };
}
