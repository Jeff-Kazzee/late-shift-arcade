# DS-0 — the DEEPSHIFT design gate

Status: decided 2026-07-24. Paper only; no engine code exists yet.
Resolves the two critical findings of `docs/DEEPSHIFT-feasibility-review.md`
(F-01, F-02, plus F-03), narrows the Runewire claim (F-09), and splits DS-1
(F-04). These decisions bind every DEEPSHIFT slice; a slice that cannot
honor one comes back to this document before it improvises.

Naming note: the GDD's §17 "DS-0" (the G-007 spinning-chunk cartridge
boundary) is a build ticket, not this gate. It becomes the first task
inside DS-1a below. This document is the DS-0 of `docs/PATH-TO-30.md` §5.

---

## D1 — Simulation activation is a pure function; rendering is a subscriber

Replaces the ambiguous §13.4/§13.5 radius language. The bug being killed:
if authoritative residency follows a per-device render radius, the same
replay advances a circuit on desktop and freezes it on a phone.

**The policy.**

1. `ActiveSet(tick)` — the set of simulated chunks — is a **memoryless pure
   function** of (a) the authoritative anchor positions at that tick
   (players; later, server-tracked actors) and (b) the world topology at
   that tick. Nothing else. No camera, no frame rate, no device class, no
   visited-chunk history.
2. Distance is **integer Chebyshev distance on the chunk lattice**, radius
   `SIM_RADIUS` — a **ruleset constant** carried in the ruleset hash, not a
   device setting. Launch value: 3 (the low-spec floor). Desktop's radius-8
   view is *render-only*: `RenderSet` is device-local, non-authoritative,
   never serialized under `sim/`, and typed as a one-way subscriber — the
   sim-facing API has no residency setter, no radius parameter, and no
   camera handle, so a renderer *cannot express* a residency opinion.
   No floats, no libm, anywhere in the activation predicate.
3. **Provinces** (Runewire regions): a province is active iff every chunk
   of the province intersecting `ActiveSet` per rule 2 — and a circuit
   spanning provinces runs only when **all** member provinces are active
   (GDD §11.2.4 retained, now deterministic on every device). Frozen means
   frozen: no settlement/catch-up on thaw. Thaw and freeze occur only at
   tick boundaries, derived from the same pure function — so they need no
   recording in the replay.
4. **Bounded by construction:** `MAX_ACTIVE_PROVINCES` is a ruleset
   constant. Admission when over budget is deterministic: nearest province
   to any anchor first, ties broken by ascending province id. Worst-case
   simulation load is therefore identical on every device class.
5. **Backpressure stalls the clock, never skips it.** A device that cannot
   finish tick N in budget renders late; the authoritative tick sequence
   is gapless. Silent step-dropping is unrepresentable: ticks are counted,
   and the per-tick hash chain would expose a skip immediately.
6. **Conformance:** a golden fixture asserts bit-identical `ActiveSet`
   membership across x86/ARM/WASM for adversarial anchor paths (boundary
   chunks, diagonal moves, multi-anchor overlaps). Ships in DS-1a, runs in
   CI forever.

**Consequences.** The headless verifier and future server import `sim/`
only and reproduce province state byte-identically with no renderer
attached — that test is the DS-1a acceptance proof for this decision.
Phones simulate exactly what desktops simulate; desktops merely *see*
more. Named fallback (carried, not chosen): if DS-7 server interest
management ever forces residency to vary, residency transitions become
recorded replay events — that is a ruleset version bump, never a silent
change.

## D2 — DSAV serializes the full authoritative frontier, transactionally

Replaces §14.1 "logic: nothing" and substantiates §14.2's bit-exact claim.
Rebuilding topology is not rebuilding temporal state.

1. **Save boundary.** Saves exist only at the **post-Phase-B inter-tick
   boundary**, after topology and gate commits. Topology commits are atomic
   within a tick, so "pending compile state" cannot exist in a save by
   construction.
2. **DSAV additions** (new sections; §14.1's block/blockEntity model is
   retained beneath them):
   - `simTick` u64, and the ruleset hash the run was recorded under.
   - `rng`: every named PRNG stream → counter cursor. No stream, no save.
   - `entities`: stable id, archetype, fixed-point position/velocity, HP,
     AI state + target id, spawn provenance. (The promised enemy
     restoration finally has a record to restore from.)
   - `logicRuntime`: per province — clock divisor, phase offset, throttle
     state and hysteresis counters; the timing wheel as (dueTick,
     componentId) pairs. Latch/delay/counter *values* stay in
     blockEntities per the GDD; this section is the runtime frontier
     above them.
3. **Resume acceptance strengthened:** hash the full sim state immediately
   after the **first resumed tick** and require equality with the
   uninterrupted run's hash at the same tick — not merely at broad
   gameplay boundaries.
4. **Crash consistency (resolves F-03):** copy-on-write generations.
   Versioned rows are written first; then one **root manifest row** is
   swapped in a single IndexedDB transaction. The prior root survives
   until the new one validates; orphaned generations are garbage-collected
   later. Nothing ever depends on unload handlers completing.

## D3 — The Runewire ordering claim, narrowed to what two phases buy

§11.1's "evaluation order can never matter" is wrong as an absolute and is
replaced by the following transition relation:

- Two-phase evaluation removes **gate iteration order within one completed
  phase of one committed topology generation**. That is the whole claim.
- **Same-tick player edits** are canonical commands, applied in stream
  order at the tick boundary *before* Phase A. A tick evaluates exactly
  one topology generation; "linking…" states never leak into evaluation.
- **Simultaneous SET and RESET** on a Ward Latch: RESET dominates
  (fail-safe — doors shut, traps disarm). The full invalid-input truth
  table ships with the component roster in DS-4.
- **Province ticks are commit-all-or-skip-all** on divisor boundaries;
  cross-province signals exchange through values buffered at the last
  committed province tick. Admission (run vs skip) is decided **before**
  evaluation from previous-tick counts, per the review's F-10 remedy.
- Stable component ids and canonical command order are DS-1a kernel
  invariants (D5), not DS-4 afterthoughts.

## D4 — DS-1 is an epic; its engineering slices are these

DS-1 stays the first *public* milestone; internally it is three gates, per
review F-04 and the final feasibility judgment's three proofs:

| Slice | Deliverable | Gate |
| --- | --- | --- |
| **DS-1a — kernel** | The G-007 cartridge boundary demo first (lit spinning chunk, leak-free eject); then the deterministic command/state/replay kernel: chunking, meshing (16³ mesh sections inside 32³ storage chunks), D1 activation, canonical quantized command stream, named counter-PRNGs, stable ids, per-tick hash chain, fixed-step AABB physics — proven by a **one-resource, one-enemy, eight-minute touch graybox** | Headless Node verifier replays the graybox byte-identically with no renderer; D1 conformance fixture green |
| **DS-1b — stress** | Streaming/edit/light/remesh under churn on the shelf 2020 Android: immutable mesh-job snapshots with one-voxel halos, revision-stamped cancellation and stale rejection (F-06); measured — not asserted — budget numbers (F-05); mobile starts at one mesh worker (F-22) | Budget table populated from the physical device; adversarial-geometry fixtures (caves, checkerboards, player builds) hold 30fps at radius 3 |
| **DS-1c — First Night** | The GDD's full DS-1 content list and acceptance, unchanged | GDD §17 DS-1 bar verbatim |

DS-2+ keep their GDD numbering and scope, with DSAV as amended by D2.

## D5 — Pulled-forward invariants that bind DS-1a's interfaces

From the review's "later-phase work that is actually phase-1 architecture";
none of these wait for the phase that needs them:

- Stable actor/entity/component ids; canonical command ordering; named
  counter-based PRNG streams; per-tick hashes. (Replay, DS-1)
- All authoritative state serializable and transaction-shaped from day
  one. (Save, DS-2)
- `sim/` imports cleanly in Node with injected time/storage/compression
  adapters; no camera-driven residency (D1 guarantees this), no browser
  globals. (Server, DS-7)
- Versioned block entities with stable face/port identities and atomic
  neighbor invalidation. (Runewire, DS-4)
- `worldgenVersion`, `simRulesetVersion`, `logicSemanticsVersion` in every
  save header from the first DSAV byte. (F-13)

## Finding → slice map (highs not already resolved above)

| Finding | Owner slice |
| --- | --- |
| F-05 mesh/frame budgets | DS-1b (measured) |
| F-06 buffer ownership | DS-1b (job snapshot contract) |
| F-07 vertex packing | DS-1b (publish exact bit layout before content) |
| F-08 net rebuild cost | DS-4 (bounded flood-fill deletion, p95 target) |
| F-10/F-11 throttle + timing wheel | D3 here; implemented DS-4 |
| F-12 browser determinism contracts | DS-1a kernel invariants (D5) |
| F-13 semantic versioning | D5 headers now; legacy evaluators DS-8 |
| F-14/F-15 multiplayer & self-host | DS-7/DS-8, with D5's portability laid now |
| F-16 replay ≠ anti-cheat | Rename to "deterministic run validation" in W-002-era copy; signed run ids DS-3 |
