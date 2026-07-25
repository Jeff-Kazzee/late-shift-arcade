# Late Shift Arcade — agent contract

Late Shift Arcade is a curated browser arcade that will accept community game
submissions. Preserve the working Legacy Rack while growing the real product in
small, playable, reviewable releases.

## Start here

Read only:

1. `STATE.md` — the single current-state summary.
2. `modules/index.md` — route to the relevant Vivary module.
3. The one product, game-design, change, or Relay task linked from `STATE.md`.

Do not preload `tickets.md`, `GAME_ROADMAP.md`, every GDD, old handoffs, archived
Dorveille state, or sibling worktrees. Git and passing checks outrank prose that
claims a branch is current.

## Authority and system boundaries

- **Vivary/Tropo owns project truth.** Decisions, changes, gates, verification,
  modules, and `STATE.md` must agree. Run `npm run brain:doctor` before handoff.
- **Agent Relay owns assignments and receipts.** A Relay task says who does what,
  with which source material, limits, stop rules, and done evidence. It is not a
  second product spec or source of project truth.
- **Game-design documents own player experience.** Platform architecture does
  not define a game's fun, and a technical design does not replace a GDD.
- **Git owns code and branch truth.** Never call an uncommitted or unmerged change
  complete.
- **Dorveille is optional reflection only.** Invoke it only when Jeff explicitly
  asks to sleep on, dream-pass, or adversarially reconsider a decision. It does
  not control sessions, hooks, chips, agents, branches, worktrees, memory, or
  completion.

One fact gets one owner. Link to it elsewhere instead of copying it.

## Development method

Use one primary agent by default. Do not create subagents, background agent runs,
or additional worktrees unless the task contains independently verifiable work
that genuinely benefits from parallelism and Jeff has asked for it.

Every implementation bet has:

- a fixed appetite in hours or days;
- one player-visible or operator-visible outcome;
- variable scope and an explicit cut order;
- one primary human/browser proof;
- supporting automated checks;
- a stop rule.

If the appetite expires, cut scope or stop. Do not silently extend time to satisfy
an old roadmap or a full future-vision document.

## Game-development contract

Before substantial game code, create or update a GDD using
`game-designs/GDD-TEMPLATE.md`. A GDD must state the player fantasy, verbs,
core loop, win/loss, controls, session shape, content budget, visual/audio
direction, onboarding, accessibility, current vertical slice, cut order, and
playtest questions.

Build the smallest complete playable loop first. The primary gate is a browser
playtest of that loop. Headless simulation, deterministic replay, performance,
and unit tests support the experience; they do not substitute for it.

The full DEEPSHIFT document is a future design vision, not a commitment to build
every section before the arcade can ship. Its active scope is only the bet linked
from `STATE.md`.

## Platform and community submissions

`product-specs/ARCADE-PLATFORM-PRD.md` owns the platform destination and release
sequence. The arcade can ship and improve without waiting for DEEPSHIFT or a
30-game catalog.

Community code is untrusted. It never runs on the platform origin and never
receives identity, credentials, platform storage, or privileged shell objects.
Submission, moderation, publication, and runtime isolation are separate stages;
accepting a submission does not execute it or publish it.

## Branches, worktrees, and cleanup

`dev` is the integration branch. Use a short-lived `feat/*` branch for a bounded
milestone. `prod` is frozen and moves only when Jeff explicitly approves a
release.

Prefer the main checkout. A temporary worktree is permitted only when a named
Relay task records its owner, branch, absolute path, source branch, and cleanup
condition. Unless Jeff explicitly approves a parallel wave, there may be at most
one non-main worktree.

A worktree task is not done until:

1. useful work is committed and pushed, or explicitly parked with a receipt;
2. the target branch is integrated or deliberately retained;
3. the worktree is clean;
4. `scripts/worktree-closeout.ps1` removes the merged worktree and local branch;
5. `npm run worktrees:audit` proves what remains and why.

Never remove a dirty, locked, unbanked, unmerged, or main worktree. Never use
broad filesystem deletion for worktree cleanup.

## Verification and delivery

Plan verification before implementation. At minimum:

- `npm test`
- the active bet's browser/playtest proof
- `npm run brain:doctor`
- `npm run worktrees:audit`
- `git status --short --branch`

Update `STATE.md`, the owning Vivary artifact, and the Relay receipt. Keep the
handoff short and point to canonical files. Do not overwrite multiple competing
"current truth" documents.