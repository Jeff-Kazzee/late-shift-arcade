# Hoolio's Late Shift Arcade — agent instructions

This project is built under the **dorveille** discipline. Before any work,
read `skills/dorveille/SKILL.md` and follow it for the whole session: state
chip on every response, obey the sleep-pressure table, keep `.dorveille/`
current. The session is not done until N3 runs.

## What this is

A retro arcade cabinet website: five games in one CRT-styled shell. See
`SPEC.md` for the shell contract and per-game specs. Hoolio, the Little AI
Company owl, works the late shift; this is his break room. His voice is dry
and brief (see the character notes in SPEC.md) — never wacky.

## Rules

- Vanilla JavaScript ES modules + canvas. Zero dependencies. No build step:
  `index.html` must run from a static file server as-is.
- Game logic lives in pure functions separate from rendering, tested with
  `node --test`. The N3 replay step runs `npm test`.
- One game per WAKE block. Finish a game's block (playable + tests) before
  starting the next. Shell first.
- Mobile matters: every game playable by touch alone.
- Do not touch anything outside this repository.
