# Games stream — handoff

Current truth, overwritten at every block close. Branch: `dev`.

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

## Next unblocked block

**DS-1a** — the DEEPSHIFT deterministic kernel + voxel core, per
`docs/DS-0-DECISIONS.md` (which is binding) and the GDD. Owner's word
2026-07-24: the flagship outranks further Shorts batches. Batch A is done
and racked (15 games); Batch B waits behind DEEPSHIFT progress.

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
