---
name: feature-spec-and-charter-update
description: Workflow command scaffold for feature-spec-and-charter-update in late-shift-arcade.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-spec-and-charter-update

Use this workflow when working on **feature-spec-and-charter-update** in `late-shift-arcade`.

## Goal

Documenting new features, platform rules, or architectural changes in specification and charter files.

## Common Files

- `AGENTS.md`
- `SPEC.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit or add to AGENTS.md to define agent or trust class changes.
- Edit or update SPEC.md to reflect new specifications or platform rules.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.