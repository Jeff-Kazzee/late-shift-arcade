---
project: late-shift-arcade
status: draft
game: DEEPSHIFT First Night playable bet
related_modules: [game-development, product]
related_changes: [process-reset]
verification: [process-reset-verification]
gates: [human-gates]
---
# DEEPSHIFT — First Night playable bet

The full future design remains in `docs/DEEPSHIFT-GDD.md`. This document alone defines the next playable implementation bet.

## Promise

You are an orc miner racing sunset: gather enough fuel to light a defensible hearth, then survive one night against the Gloom.

## Protected experience

- Mining and hauling create pressure before sunset.
- The hearth visibly turns preparation into safety.
- Night changes the player's behavior.
- Dawn or death produces a clear shift report and immediate restart.

## Current bet

- **Appetite:** two focused development days after the process-reset branch is merged and active worker changes are recovered.
- **Target:** desktop keyboard/mouse browser play first.
- **Complete loop:** gather one resource, return to one hearth, craft or fuel one useful defense, face one enemy type, survive until dawn or die.
- **World:** one bounded handcrafted/seeded test area; no infinite-world promise.
- **Content ceiling:** one resource, one tool, one station/hearth, one defense, one enemy, one day/night cycle.
- **Primary proof:** Jeff can play the full loop in the browser and identify the goal, danger, and result without reading implementation notes.
- **Supporting proof:** deterministic rules tests for the implemented loop, launch/eject cleanup, and no console errors.
- **Stop rule:** after two days, ship the smallest coherent loop or stop and review the design. Do not add content to rescue an unclear loop.

## Cut order

1. Scoring multipliers and ranked receipt details.
2. Procedural variation beyond the bounded test area.
3. Crafting UI beyond the single required action.
4. Touch controls and low-spec mobile optimization.
5. Extra blocks, tools, enemies, resources, smelting, inventory depth, and persistence.

Protected even after cuts: preparation, night threat, dawn/death, and restart.

## Playtest questions

- Does the player know what must be ready before sunset?
- Do they understand what the hearth changes?
- Does night create a meaningful change rather than simple darkness?
- Can they explain why they survived or died?
- Do they choose to restart?

## Not authorized by this bet

The bet does not authorize the full DS-1 content list, three enemies, smelting,
mobile support, infinite terrain, multiplayer, Runewire, save/resume, 30-game
roadmap work, or later DEEPSHIFT phases.