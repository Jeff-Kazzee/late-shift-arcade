# Games stream — handoff

Current truth, overwritten at every block close. Branch: `dev`.

## State

- **12 games in the rack, 258 tests green.** Pong, Breakout, Air Hockey,
  Asteroid Defender, Galaxy Raid, Neon Snake, Lunar Descent, Midnight Run,
  Pinball After Dark, Rail Switch, Orbital Salvage, Vault Heist.
- **`prod` is frozen** at the deployed commit; it moves only on Jeff's word.
- The slate, tiers, and build order to 30 live in `docs/PATH-TO-30.md`.
  DEEPSHIFT is the owner-stated flagship priority; its next action is **DS-0**,
  a paper-only design block resolving the two critical feasibility findings.

## Next unblocked block

**Batch A** — three Arcade Shorts in one synchronous run, tickets already
briefed: G-014 Evidence Board, G-020 Backpack Alchemist, G-017 Ghost
Frequency. Building them takes the rack to 15.

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
