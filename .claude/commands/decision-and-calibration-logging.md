---
name: decision-and-calibration-logging
description: Workflow command scaffold for decision-and-calibration-logging in late-shift-arcade.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /decision-and-calibration-logging

Use this workflow when working on **decision-and-calibration-logging** in `late-shift-arcade`.

## Goal

Recording decisions, calibration data, and project history in dorveille logs.

## Common Files

- `.dorveille/calibration.md`
- `.dorveille/f-002-decisions.md`
- `.dorveille/hypnogram.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit or add markdown files in .dorveille/ to record new decisions or calibration data.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.