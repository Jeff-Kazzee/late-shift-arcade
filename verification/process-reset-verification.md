---
project: late-shift-arcade
status: passed
target: process-reset
command: npm test && npm run brain:doctor && npm run worktrees:audit
evidence: 459 tests passed; Vivary doctor 18 nodes, 67 edges, 0 broken; worktree audit accounted for one locked dirty and one clean unmerged recovery task
related_modules: [agent-workspace, product, game-development]
related_changes: [process-reset]
---
# Process reset verification

Pass when:

- the existing automated suite is green;
- Vivary doctor reports no broken project-truth relationships;
- the worktree audit names only the main checkout or explicitly accounted-for active tasks;
- no active hook, skill, or agent instruction loads Dorveille;
- the platform PRD, GDD template, current DEEPSHIFT bet, and Relay recovery task are reachable from `STATE.md`.