# Path to 30 games

Status: proposed slate and build order
Date: 2026-07-24
Owner decision needed on §4 (the seven new concepts) before those are built.

The rack holds **12**. This is how it reaches 30, in what order, at which tier,
and who builds each one.

## 1. Where the count comes from

| Source | Count | Status |
| --- | ---: | --- |
| Legacy Rack | 8 | Built |
| Roadmap concepts already built | 4 | Pinball, Rail Switch, Orbital Salvage, Vault Heist |
| Roadmap concepts remaining | 11 | §3 |
| New Arcade Shorts needed to reach 30 | 7 | §4 — proposed, not yet approved |
| **Total** | **30** | |

Pixel Life is built and source-preserved but unpublished; re-racking it is a
separate product decision and is not counted here.

## 2. The tier rule, which governs everything below

The single biggest cost mistake so far was building every game at Showcase
tier. Default is **Arcade Shorts**.

| Tier | Bar | Cost |
| --- | --- | --- |
| **Showcase** | Full 10-point contract: seeded determinism, pure-sim separation, adversarial bot proofs, browser playtest, phone verification | ~60–100 min, ~400k tokens |
| **Arcade Shorts** | Goal, loss state, documented score, touch support, pure-logic tests, clean console, headless win/lose proof | Target ~20–30 min, batched 2–3 per agent run |

Adversarial bot proofs are a Showcase tool. They caught one hollow game
(Rail Switch) and are worth it for a headliner; demanding them of library
filler is what made this slow.

## 3. Remaining roadmap concepts

Ranked by the roadmap's own opportunity score. Tier assigned per how much
weight the game is meant to carry.

| # | Game | Tier | Why this tier |
| --- | --- | --- | --- |
| 1 | **DEEPSHIFT** (was Pocket Realm) | Showcase | The flagship. See §5 |
| 2 | Boss Foundry | Showcase | Proves safe constrained UGC — the whole community-submission thesis rests on it |
| 3 | Creature Forge Arena | Showcase | Proves the persistent creator artifact |
| 4 | Dead Air Dispatch | Showcase | Proves private two-player rooms |
| 5 | Ragdoll Relay | Shorts | Physics toy with a clear finish line |
| 6 | Foldspace | Shorts | Authored puzzles; small content set to start |
| 7 | Backpack Alchemist | Shorts | Ticket G-020, briefed and ready |
| 8 | Evidence Board | Shorts | Ticket G-014, briefed and ready |
| 9 | Ghost Frequency | Shorts | Ticket G-017, briefed and ready |
| 10 | Wildfire Watch | Shorts | Systems puzzle, single scenario to start |
| 11 | Last Light Foundry | Shorts | Single contract to start |

## 4. Seven new Arcade Shorts — approved in direction (2026-07-25, "finish them up"); Jeff may still kill or swap any individual concept

The rack is heavy on physics and action. These fill genre gaps a browser
catalogue is expected to cover, and each is one mechanic with an obvious goal.

| Game | Hook | Fills |
| --- | --- | --- |
| **Night Shift Diner** | Serve a rush from a cramped counter; every order is a timer you chose to start | Timing / management |
| **Solder** | Trace a circuit before the current arrives; wrong path burns the board | Tracing puzzle — also a cheap rehearsal for Runewire |
| **Freight Elevator** | Stack unstable cargo up a shaft; balance is the only score | Stacking physics |
| **Cipher Desk** | Break a short daily code from frequency and crib clues | Word / logic, daily-challenge shaped |
| **Static** | Match an escalating audio-visual pattern; the trace is the score | Rhythm / reaction |
| **Repo Run** | One-button rooftop runner with a combo built on near-misses | One-button platformer |
| **Blackout Bridge** | Route limited power to keep districts alive as demand spikes | Tower-defence-lite / routing |

Kill any of these freely — they are proposals, not commitments. Seven is the
number required to hit 30; the specific seven are negotiable.

## 5. DEEPSHIFT is first, and it is gated

Jeff's stated priority. It already has:

- `docs/DEEPSHIFT-GDD.md` — 1,485 lines: orcs, classic day-safe/night-dangerous
  cycle, two ranked run formats, Runewire logic system, full block/tool/enemy
  taxonomy, phased delivery.
- `docs/DEEPSHIFT-feasibility-review.md` — independent Codex teardown. Verdict:
  **feasible; several of its guarantees are not.**

**Two critical findings must be resolved before any DS-1 code is written.**
Both are cheap to fix on paper and ruinous to fix after an engine exists:

1. **Simulation residency is not separated from render distance.** The GDD sets
   view radius 8 desktop / 5 mobile / 3 low-spec and separately freezes
   unloaded logic, without saying whether those are the same radius. If they
   are, the same replay advances a circuit on desktop and freezes it on
   Android — and every determinism, replay, score, and multiplayer guarantee
   collapses. Fix: define one authoritative activation policy shared by client,
   server, save, and verifier, independent of what is drawn.
2. **The save format does not support its own bit-exact resume claim.** No
   entity record despite promising enemy restoration, no RNG cursors, no sim
   tick or logic-phase state. Rebuilding topology is not rebuilding temporal
   state.

Also narrow the Runewire claim: "evaluation order can never matter" is wrong as
an absolute. Two-phase evaluation removes gate iteration order *within one
completed phase* and says nothing about same-tick player edits, simultaneous
set/reset, or provinces on different clock divisors.

The teardown further judges **DS-1 a product milestone, not a first
implementation slice** — it needs splitting internally before anyone builds it.

### DEEPSHIFT build order

| Step | Deliverable | Tier |
| --- | --- | --- |
| DS-0 | Resolve the two critical findings and split DS-1 into real slices. Paper only, no engine | Design block |
| DS-1a | Voxel core: chunking, meshing, a deterministic command/state kernel with simulation activation independent of rendering | Showcase |
| DS-1b | The playable Dawn Run loop: one biome, ~15 blocks, three tool tiers, two enemies, win and loss | Showcase |
| DS-2 | Save/resume proven against the fixed format | Showcase |
| DS-4 | Runewire | Showcase |
| DS-7 | Multiplayer and the self-hosted server | Showcase |

DS-0 is the next DEEPSHIFT action, and it is a planning block — not a build.

## 6. How the work actually gets dispatched

Learned the hard way today; ignoring these is what cost eight agent-runs.

1. **Synchronous agents only** (`run_in_background: false`). Background agents
   do not survive a host process restart. Eight were lost that way.
2. **Batch Arcade Shorts** — one agent carries two or three small games per
   run. One agent per small game is the wrong granularity.
3. **Agents commit and push before they are finished.** A pushed half-game
   beats an unpushed whole one.
4. **Agents never edit `games/registry.js`.** Concurrent edits collide every
   time. They ship a self-contained folder; the orchestrator wires the entry.
5. **Deliverables go in the repo, never a scratchpad.** Two major documents
   nearly vanished from temp folders today.
6. Package format is fixed: `games/<slug>/` with `manifest.js` (data only),
   `logic.js` (pure sim), `<slug>.js` (cartridge, **default export**), and
   `<slug>.test.js`.

## 7. Sequence (reordered 2026-07-24 evening, owner's word)

Jeff's redirect: the flagship outranks further batches. DEEPSHIFT leads;
Shorts batches ride behind it, never ahead of it again.

1. ~~**Batch A**~~ — done, racked. → **15 games**
2. ~~**DS-0**~~ — done: `docs/DS-0-DECISIONS.md` (activation policy, DSAV
   frontier, Runewire narrowing, DS-1 split into 1a/1b/1c).
3. **DS-1a** — the deterministic kernel + voxel core (Showcase). ← next
4. **DS-1b / DS-1c** — shelf-device stress, then First Night content.
5. **Batch B** (one run, Shorts, behind DEEPSHIFT): Ragdoll Relay,
   Foldspace, Wildfire Watch, Last Light Foundry → 19 games
6. **DS-2+** per the GDD phase plan.
7. **Batch C** (Shorts): the seven §4 concepts, if approved → 26 games
8. **Showcase run**: Boss Foundry, Creature Forge Arena, Dead Air Dispatch
   → 29 games, plus DEEPSHIFT → **30**

Note that the website work (W-001 DOM chrome) and the player spine (accounts,
global boards) are separate streams in `EXECUTION-PLAN.md` and are not counted
here. Thirty games sitting behind a 640×480 canvas that Google cannot index is
still not a launchable arcade.
