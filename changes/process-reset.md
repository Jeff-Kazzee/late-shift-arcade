---
project: late-shift-arcade
status: done
slice: remove the Dorveille runtime and establish Vivary truth, Relay handoffs, finite game bets, and worktree closeout
branch: feat/process-reset
related_modules: [agent-workspace, product, game-development]
verification: [process-reset-verification]
gates: [human-gates]
---
# Process reset

This slice:

- adopts the current Vivary coding scaffold without overwriting the existing repository;
- installs project-local Vivary and Agent Relay tooling;
- removes Dorveille's automatic SessionStart injection and local skill;
- establishes a platform PRD, a reusable GDD, and a finite DEEPSHIFT bet;
- adds an auditable worktree closeout tool;
- leaves one Relay task for Fable or Opus to recover active work.

The reset does not merge, discard, or continue either dirty active worker branch.