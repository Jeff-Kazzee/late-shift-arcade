# Late Shift Arcade — agent instructions

This project is built under the **dorveille** discipline. Before any work,
read `skills/dorveille/SKILL.md` and follow it for the whole session: state
chip on every response, obey the sleep-pressure table, keep `.dorveille/`
current. The session is not done until N3 runs.

## What this is

A retro arcade website: eight games in one CRT-styled cabinet shell. See
`SPEC.md`. That's it — a website with games. Do not add lore, mascots,
frameworks, or build tooling.

## Rules

- Vanilla JavaScript ES modules + canvas. Zero dependencies. No build step:
  `index.html` must run from a static file server as-is.
- Game logic in pure functions separate from rendering, tested with
  `node --test`. The N3 replay step runs `npm test`.
- Shell first, then one game per WAKE block, in SPEC order. A game's block
  ends when it's playable with tests green.
- Mobile matters: every game playable by touch alone.
- Do not touch anything outside this repository.
