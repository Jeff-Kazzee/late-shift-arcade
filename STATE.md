# STATE — current truth

Focus: Recalibrate Late Shift Arcade around a finite game-development method,
validated project truth, and an explicit creator-submission destination.

Status:

- `dev` at `a13e2d` passed 459 tests before the reset branch began.
- `feat/process-reset` adopts Vivary 0.3.1 and Agent Relay 0.1.0.
- The stale merged `late-shift-arcade-w001` worktree and local branch were
  removed on 2026-07-25.
- Two Claude-owned worktrees remain: DEEPSHIFT is locked and dirty; Batch B is
  clean and unlocked but still needs review, integration or parking, and removal.
- Dorveille has been removed from the active project. Its old runtime history is
  preserved under `docs/archive/dorveille/` as non-authoritative evidence only.

Next:

1. Give `relay/tasks/0001-process-reset-and-recover-active-work.md` to the
   Fable or Opus orchestrator currently holding the active Claude process.
2. Bank DEEPSHIFT, then review and either integrate or park Batch B.
3. Close both temporary worktrees using `scripts/worktree-closeout.ps1`.
4. Review and merge `feat/process-reset` into `dev`.
5. Choose the first finite product bet from the platform wayfinder map.

Open decisions:

- First product bet: polished player arcade, creator-submission pilot, or one
  DEEPSHIFT playable-loop bet.
- Whether Batch B work earns integration after rebasing and browser review.

Blockers:

- `feat/ds-1c-first-night` has modified uncommitted files.

Checks:

- `npm test`
- `npm run brain:doctor`
- `npm run worktrees:audit`
- browser proof for the selected finite bet

Sources:

- `product-specs/ARCADE-PLATFORM-PRD.md`
- `game-designs/GDD-TEMPLATE.md`
- `game-designs/DEEPSHIFT-FIRST-NIGHT-BET.md`
- `decisions/0002-reset-game-development-process.md`
- `relay/tasks/0001-process-reset-and-recover-active-work.md`
- `planning/wayfinder/arcade-platform-map.md`

Updated: 2026-07-25