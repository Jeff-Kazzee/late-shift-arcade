# Process reset and recover active work

Status: ready
Priority: critical
Project: Late Shift Arcade

## Outcome

Recover the useful work in the two active Claude worktrees, integrate or park it
deliberately, remove the temporary worktrees, and leave `dev` ready for one finite product bet under the new process.

## Owner / next actor

Fable or Opus orchestrator currently controlling Claude PID 24504. Use one primary orchestrator. Do not dispatch another worker wave.

## Source material

- `STATE.md`
- `AGENTS.md`
- `changes/process-reset.md`
- `decisions/0002-reset-game-development-process.md`
- `game-designs/DEEPSHIFT-FIRST-NIGHT-BET.md`
- `product-specs/ARCADE-PLATFORM-PRD.md`
- Git worktree and branch truth

## Context / decisions so far

- `late-shift-arcade-w001` was clean, merged, and removed.
- `feat/ds-1c-first-night` is active and has uncommitted modifications.
- `feat/g-batch-b` is active, stale relative to `dev`, and has an untracked `games/ragdoll-relay/` directory.
- Do not continue the prior full-GDD or Path-to-30 execution policy.
- Vivary owns current truth. Relay owns this assignment and its receipts.

## Allowed actions

- Inspect diffs, tests, browser behavior, commits, and branch ancestry.
- Commit and push coherent recoverable work on its existing branch.
- Rebase, merge, or cherry-pick only after the work is banked and the integration choice is explicit.
- Park work with a receipt when it does not support the selected product bet.
- Remove a worktree only after it is clean and its useful work is banked.
- Update `STATE.md` and the owning Vivary change/verification artifacts.

## Stop rules / human gates

- Do not delete or force-remove dirty/unbanked work.
- Do not move `prod`, publish, deploy, or announce.
- Do not start another game, platform feature, or agent wave.
- Do not treat passing unit tests as proof that a game is fun or shippable.
- Stop for Jeff if a branch contains mutually incompatible product directions or if useful work cannot be separated safely.

## Done evidence / receipt

- Each active branch has a named disposition: integrated, review-ready, or parked, with commit IDs.
- `npm test` result is recorded on the integrated tree.
- `npm run brain:doctor` is green.
- `npm run worktrees:audit` reports only the main checkout, unless a retained worktree has a named owner and explicit reason.
- `git status --short --branch` is clean.
- A receipt in `relay/receipts/` names what was recovered, cut, retained, and removed.
- `STATE.md` points to exactly one next finite bet.

## Stop

Status: ready
Reason: waiting for the current Fable or Opus orchestrator to bank active work
What I completed: process-reset task definition and constraints
What I did not do: alter either dirty active worker branch
What I need next: execute recovery from the process holding those worktrees
Next actor: Fable or Opus orchestrator
Receipt: pending