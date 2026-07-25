---
project: late-shift-arcade
status: active
module_area: progressive disclosure router
related_modules: [agent-workspace, codebase, product, game-development]
verification: [scaffold-smoke, process-reset-verification]
gates: [human-gates]
---
# Modules

Use this file to choose what to open next. Do not load every module by default.

- `agent-workspace` -> `modules/agent-workspace/index.md`
- `codebase` -> `modules/codebase/index.md`
- `product` -> `modules/product/index.md`
- `game-development` -> `modules/game-development/index.md`

## DRY Rule

Each fact gets one owner. Put the short routing summary in the module index, keep canonical detail in the owning file, and link instead of copying.