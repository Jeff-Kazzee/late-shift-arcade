---
name: feature-implementation-and-test-update
description: Workflow command scaffold for feature-implementation-and-test-update in late-shift-arcade.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-implementation-and-test-update

Use this workflow when working on **feature-implementation-and-test-update** in `late-shift-arcade`.

## Goal

Implementing new features or catalog changes and ensuring they are covered by tests.

## Common Files

- `games/registry.js`
- `shell/cartridge.js`
- `shell/catalog.js`
- `shell/main.js`
- `test/cartridge.test.js`
- `test/catalog.test.js`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit or add to core implementation files (e.g., games/registry.js, shell/*.js).
- Update or add corresponding test files (e.g., test/*.test.js) to cover new logic.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.