# STATE — current truth

Focus: **PARKED** (owner decision, 2026-07-25). Not complete, not abandoned,
no longer the priority. No active bet. Resuming requires an explicit owner
decision; the first-bet candidates from the reset remain listed in
`planning/wayfinder/arcade-platform-map.md`.

Status:

- `dev` = `origin/dev` at `d28366f` — process reset merged; 459 tests green;
  `npm run brain:doctor` ok; `npm run worktrees:audit` reports only the main
  checkout (clean, unlocked). Both temporary Claude worktrees are removed.
- Public site: `main` = `prod` = `4045d5d`, the owner-authorized 2026-07-25
  release (DOM site, 15 games, share loop). Nothing after the process reset
  was promoted or deployed.
- Dorveille is rejected for active use (see
  `decisions/0002-reset-game-development-process.md`). Its runtime history is
  preserved under `docs/archive/dorveille/` as non-authoritative evidence
  only; do not reintroduce it.

Banked work (branch → tip, all pushed to origin):

- `feat/ds-1c-first-night` → `6f7387d` (contains bank point `57ca209`).
  DEEPSHIFT First Night, partially built and parked: v2 content registries,
  Dusklands worldgen, light-driven spawning, pooled entities,
  mining/crafting/smelting, score + dawn verdict committed; 443/459 pass on
  the branch and all 16 failures are declared v1→v2 fixture mismatches
  awaiting a fixtures-only regeneration commit. Exact pickup point:
  `relay/receipts/0001-process-reset-closeout.md`.
- `feat/g-batch-b` → `806bba0`. Four action Shorts (Graveyard Shift,
  Stratofire, Neon Tide, Ragdoll Relay) built and wired into a 19-game rack
  with regenerated pages and OG cards, 552 tests green on the branch,
  review-ready. Integration into `dev` was deliberately not performed.

Next:

1. Nothing in this repository. The next substantive product task is
   canonical Vivary (`C:\Users\jeffk\hq\dev\Jeff-Kazzee\vivary`): the
   `adopt` launcher defect and Doctor legacy compatibility, as a fresh,
   explicitly scoped task.
2. The GitHub estate audit is a separate, read-only-first task.

Open decisions (deferred while parked):

- First product bet on resume: polished player arcade, creator-submission
  pilot, or one DEEPSHIFT playable-loop bet.
- Whether Batch B earns integration (browser boot-review done; gameplay
  review outstanding).

Checks (last run 2026-07-25, closeout):

- `npm test` — 459/459 on `dev`
- `npm run brain:doctor` — ok
- `npm run worktrees:audit` — main checkout only
- `git status --short --branch` — clean, synced

Sources:

- `relay/receipts/0001-process-reset-closeout.md`
- `decisions/0002-reset-game-development-process.md`
- `product-specs/ARCADE-PLATFORM-PRD.md`
- `planning/wayfinder/arcade-platform-map.md`

Updated: 2026-07-25
