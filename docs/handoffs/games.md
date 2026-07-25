# Games stream — handoff

Current truth, overwritten at every block close. Branch: `dev`.

**Standing owner priority (2026-07-25): DEEPSHIFT is finished before the
arcade counts as completely live. Keep a DEEPSHIFT slice in flight at all
times; everything else is second-slot work. The full game is the GDD's
scope — after DS-1b: DS-1c First Night (the real playable game), then
DS-2 save/resume, DS-3 Deep Run, DS-4 Runewire, DS-5 release gate (where
the deferred mobile budgets return), DS-6 showcase.**

## State

- **15 games in the rack, 351 tests green.** Pong, Breakout, Air Hockey,
  Asteroid Defender, Galaxy Raid, Neon Snake, Lunar Descent, Midnight Run,
  Pinball After Dark, Rail Switch, Orbital Salvage, Vault Heist, Evidence
  Board, Backpack Alchemist, Ghost Frequency. The site is real DOM now
  (W-001); pages regenerate via `node tools/generate-pages.js` whenever the
  registry changes, and `test/site-pages.test.js` enforces it.
- **`prod` is frozen** at the deployed commit; it moves only on Jeff's word.
- The slate, tiers, and build order to 30 live in `docs/PATH-TO-30.md`.
  DEEPSHIFT is the owner-stated flagship priority; its next action is **DS-0**,
  a paper-only design block resolving the two critical feasibility findings.

## DS-1a: DONE (2026-07-24 late) — merged to dev

The DEEPSHIFT kernel exists and its determinism is proven three ways: the
same seed+command log reaches the identical per-tick hash in the Node
verifier CLI, in node --test, and in the browser. 59 tests; suite at 410.
Q16.16 fixed point throughout sim (conventions in `games/deepshift/README.md`),
D1 activation conformance fixture golden in CI, vendored three.js (~188KB gz,
no build step), playable one-resource/one-enemy graybox behind the cartridge
boundary.

**DEEPSHIFT is deliberately NOT in the registry yet**: it is an engine
slice, not a public game, and `launchBlockReason` still blocks
`first-party-3d` (a pinned test documents this). Racking happens at DS-1c
with a real shell-gate ticket for the 3D trust class, plus a 3D-aware
generate-pages template.

## DS-1b: DONE (2026-07-25) — merged to dev, suite 459

Worker meshing behind the F-06 snapshot contract (stale rejection proven),
radius-8 spiral streaming with chunk-merged draws (100-250 calls), frustum
culling, adversarial fixtures + churn harness, honest measured numbers in
`games/deepshift/PERF.md`. Normal terrain passes the desktop column at
60fps; the adversarial checkerboard misses tris/heap by design — named
follow-ups (per-chunk density backstop, upload granularity, CPU-side
double-retention), none touching sim. Mobile column: DS-5.

## In flight

**DS-1c — First Night** (the real game: full Dusklands content, 3 enemies,
day/night spawning, crafting/smelting, quota + permadeath, §3.3 score,
DOM HUD, touch) — dispatched worktree-isolated. The "5 observed
first-timers" acceptance line is human work and stays open for Jeff.
**Batch B (action redirect)** — GRAVEYARD SHIFT, STRATOFIRE, NEON TIDE,
Ragdoll Relay.

The tier rule and all dispatch rules are in `AGENTS.md` ("Dispatch rules") —
they are mandatory, not advisory. Package format: `games/<slug>/` holding
`manifest.js` (data only), `logic.js` (pure sim), `<slug>.js` (cartridge,
default export), `<slug>.test.js`. Agents never touch `games/registry.js`;
the orchestrator wires entries.

## Verification gate

`npm test` (falls back to `node --test --test-isolation=none` on sandbox
spawn EPERM), `node --check` on changed files, `git diff --check`. Browser
playtest is a Showcase requirement; Arcade Shorts need a headless
winnable-and-losable proof plus an orchestrator spot-check.

## Approvals outstanding

- `docs/PATH-TO-30.md` §4 — the seven new Arcade Shorts concepts need Jeff's
  nod before Batch C. Not blocking Batches A/B or any DEEPSHIFT step.
