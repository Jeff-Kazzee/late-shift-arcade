# DEEPSHIFT — Independent Technical Feasibility Teardown

Target reviewed: `docs/DEEPSHIFT-GDD.md` (proposed 2026-07-24)

Review note: the target changed externally from 1,405 to 1,485 lines during the audit. The final finding set was revalidated against the revised §11, §13, §14, §16, and §17 clauses; stable section citations are used rather than stale line anchors.

## Classification used

- **WRONG AS WRITTEN** — the claim contradicts another GDD clause, omits state required for its stated guarantee, or cannot work under the stated browser/security model.
- **OPTIMISTIC BUT RECOVERABLE** — the goal is plausible, but an unbenchmarked workload-dependent target is presented as a guarantee or a required mechanism is missing.
- **FINE** — the decision is technically coherent and should survive the teardown.
- **UNDERSPECIFIED** — feasibility depends on an implementation choice the text does not make.

## Bottom-line verdict

DEEPSHIFT is feasible. Several guarantees and the current delivery shape are not. The document repeatedly treats a good direction as if it already proves the hard result. The largest failures are undefined simulation residency, an incomplete save format with no stated transaction protocol, undefined Runewire topology/throttle semantics, an incomplete cross-worker meshing path, and DS-1's engine-sized scope.

## Severity-ranked findings

### F-01 — Critical — UNDERSPECIFIED: view distance may change authoritative simulation

**Claim.** §11.2 says the same blocks, inputs, and tick produce the same outputs “on every platform,” while unloaded Runewire freezes by province. §13.4 unloads chunks beyond the streaming radius and freezes unloaded entities. §13.5 assigns device-specific radii: desktop 8, mobile 5, low-spec 3.

**Why it breaks.** §13.4 does not say whether its streaming “radius” is the §13.5 render view radius or a separate authoritative activation radius. If they are the same—as the text currently implies—the same replay can advance a province on desktop while freezing it on Android, changing enemies, delayed logic, clocks, sensors, and score-relevant events. A headless verifier may use a third residency set. The guarantee is therefore unsubstantiated until the two radii are separated explicitly.

**Do instead.** Separate authoritative simulation activation from rendering distance. Define one deterministic activation policy shared by client, server, save, and verifier. If residency must vary, record load/freeze transitions in the canonical replay. Specify cross-province circuit behavior explicitly.

### F-02 — Critical — SCHEMA DOES NOT SUBSTANTIATE THE CLAIM: DSAV bit-exact resume

**Claim.** §11.2 promises exact mid-computation save/load. §14.1 persists player data, chunks, selected block entities, run bookkeeping, and “logic: nothing,” rebuilding nets from blocks. §14.2 promises bit-exact RNG cursors, Runewire, enemy positions, and score.

**Why it breaks.** The displayed format does not provide an entity record despite promising enemy-position restoration, does not show the RNG cursors §14.2 names, and stores no sim tick/logic phase, evaluator frontier, pending compile state, or throttle phase/hysteresis. Rebuilding topology is not rebuilding temporal state. An oscillator, delay, or throttled circuit can resume in a different phase unless those values are serialized or proven derivable.

**Do instead.** Save only at a defined post-Phase-B boundary after topology commits and prove every transient is derivable, or serialize the full authoritative frontier. Hash the state immediately after the first resumed tick, not merely at broad gameplay boundaries.

### F-03 — High — UNDERSPECIFIED: incremental autosave has no stated crash-consistent commit

**Claim.** §14.1 writes dirty chunk rows incrementally every 30 seconds and carries a `lastSlice checksum`. DS-2 says killing the tab mid-assault must resume to a replay-matching score (§17).

**Why it breaks.** IndexedDB can atomically update multiple rows and stores, but the GDD never says that player, run, entity, block-entity, and dirty-chunk state share one transaction or committed generation. Without that mechanism, killing the tab between inventory and chunk writes can duplicate or lose ore. A checksum may detect a torn save; it does not itself define recovery.

**Do instead.** Use copy-on-write generations: write versioned rows, then atomically switch one root manifest. Retain the prior committed root until validation and garbage-collect later. Never depend on unload completion.

### F-04 — High — OPTIMISTIC BUT RECOVERABLE: DS-1 is a product milestone, not a first implementation slice

**Claim.** DS-1 combines a generated 512×512 voxel region, roughly fifteen block categories plus a wood set, three tool tiers, mining/building, inventory/crafting/HUD, three enemies, combat, a full day/night cycle with light-driven spawning and sunrise burn-off, quota, score, permadeath, replay determinism, full touch, and 30 fps on SD665-class hardware (§17; §3.2). §3.5 requires replay verification in DS-1–3.

**Why it breaks.** Small content count does not make the engine small. DS-1 requires generation, streaming, meshing, lighting, physics, editing, remeshing, inventory transactions, combat/AI, touch first-person controls, scoring, receipts, input logging, replay, and lifecycle work before it proves the core loop. “No placeholder skips” makes it a release bar.

**Do instead.** Keep DS-1 as the first public milestone but split engineering into: (1) a tiny/prebuilt one-resource, one-enemy eight-minute touch/replay graybox; (2) streaming/edit/light/remesh stress on the shelf Android; (3) complete First Night content. The one-minute phone graybox already required by §12.2 and DS-1 is sound; promote it to a real slice.

### F-05 — High — OPTIMISTIC BUT RECOVERABLE: chunk and frame budgets do not follow from the stated mesher

**Claim.** §13.3 chooses 32³ chunks, three material buckets, one draw per chunk/bucket, and ≤4 ms worker remesh. §13.5 budgets radius 8/5/3, ≤1,000/400/180 resident meshes, ≤600/300/150 draws, and ≤1.2M/450k/150k triangles.

**Why it breaks.** A circular radius 8 is about 201 columns or roughly 1,600 vertical chunk slots at eight chunks tall; radius 5 is about 630 and radius 3 about 230. The caps depend on emptiness, frustum/visibility rejection, low bucket occupancy, and an unspecified occlusion/batching policy. At three draws per chunk, 600 draws cover only 200 fully populated bucket-chunks. Caves and player builds defeat the empty/interior assumption.

A 32³ remesh scans up to 32,768 voxels plus halos, palette decoding, AO, light, allocation, and emission. Checkerboards, foliage, caves, and detailed builds defeat greedy merging. Boundary and light edits dirty multiple chunks. The 4 ms number omits queue time, copies, stale-job cancellation, main-thread geometry creation, and GPU upload.

**What breaks first.** During radius growth, generation/remesh queues and duplicate in-flight buffers grow roughly with radius². At steady state, draw submission and triangle/fill cost likely breach before the 350 MB desktop heap headline. Mobile contention and thermal throttling follow. Radius 3/30 fps is plausible for ordinary terrain; radius 8/60 fps may be plausible on desktop. Neither is guaranteed by greedy meshing.

**Do instead.** Define radius shape and vertical residency; count bucket geometries and in-flight jobs; use 16³ mesh sections or dirty subvolumes inside 32³ storage chunks; version/coalesce jobs; budget light fan-out and GPU upload separately; benchmark terrain, caves, transparency, and adversarial builds; enforce visible-mesh/draw limits independently of radius.

### F-06 — High — UNDERSPECIFIED: the fallback meshing path has no buffer ownership model

**Claim.** The sim worker owns truth and posts dirty voxel buffers through transferables; SharedArrayBuffer is optional (§13.2). Two to four other workers mesh chunks (§13.3).

**Why it breaks.** The text does not say whether the posted buffer is canonical storage, an immutable copy, or a transferred ownership slice. Transferring canonical storage would detach it; copying sim→main→mesh worker adds memory and bandwidth. The mesher also needs neighbor/light/AO halo data, and stale results need revision rejection. Because cross-origin isolation is not assumed, this fallback path needs a first-class contract.

**Do instead.** Define immutable mesh-job snapshots with a one-voxel halo, light data, chunk revision, cancellation, and stale-result rejection. Count input and output buffers while in flight.

### F-07 — High — UNDERSPECIFIED: the eight-byte vertex/lighting layout is not demonstrated

**Claim.** §13.3 allocates eight bytes to position `3×u8`, normal+AO `u8`, atlas `u16`, and UV+flags `u16`, then says sunlight and block light are baked into vertices.

**Why it breaks.** The named fields occupy eight bytes, but `uv corner+flags` leaves an unspecified bit allocation that might hold lighting. The GDD does not show that allocation while also claiming up to 16,384 atlas tiles, two light channels, UV corners, and flags. Even if a launch-only packing fits, aligned GPU stride, index buffers, geometry metadata, and job buffers remain outside the headline. This is an unproven packing/budget claim, not a demonstrated contradiction.

**Do instead.** Publish the exact bit layout and WebGL attribute declarations, including the atlas-capacity tradeoff; measure the actual aligned GPU stride. If eight bytes cannot retain the required range, add a packed light byte or sample a light volume. Recalculate budgets including indices and transients.

### F-08 — High — OPTIMISTIC BUT RECOVERABLE: breaking one wire can rebuild the entire net

**Claim.** §11.5 collapses contiguous wire to one net, says a 10,000-block run is one boolean, and budgets incremental touched-net rebuilds at 3 ms/edit.

**Why it breaks.** Union-find makes additions cheap. Deleting an articulation wire may split the net and requires traversing/relabeling the old net plus reconstructing drivers, fanout, and gate edges. “Touched net” is not local. The 10,000-block example also contradicts the 4,096-wire/net cap in §11.6. Multi-frame “linking…” has no stated semantics: old graph, frozen net, or partially live graph.

**Do instead.** Use union-find for additions, bounded flood-fill for deletion, topology generations, and atomic graph swap at a logic boundary. Freeze the affected net or keep the old topology until commit. Benchmark the worst legal 4,096-block articulation split; make 3 ms a p95 target, not a universal bound.

### F-09 — High — WRONG AS AN ABSOLUTE: two-phase evaluation does not make all order irrelevant

**Claim.** §11.1 says Phase A reads previous net state, Phase B commits, so “evaluation order can never matter”. §11.4 says this eliminates glitch races.

**Why it breaks.** Double buffering removes gate iteration order inside one complete pure-gate phase. It does not define same-tick player edits/external inputs, stable IDs and dirty deduplication, simultaneous SET/RESET, pending topology commits, province boundaries with different clock divisors, or budget cutoff behavior. Unequal path depth can still produce deterministic pulses across ticks. Invalid latch release also needs a truth table.

**Do instead.** Specify the full transition relation: canonical command order, stable IDs, atomic topology generations, invalid-input semantics, and commit-all-or-skip-all province ticks. Narrow the claim to iteration order within a completed phase.

### F-10 — High — UNDERSPECIFIED: throttling does not yet preserve semantics or bound active-tick cost

**Claim.** §11.6 halves a province clock after >50,000 evaluations and says count-based throttling keeps replay/multiplayer bit-exact.

**Why it breaks.** If overrun is discovered after evaluation, the expensive tick already happened. If work stops at 50,000, subset choice becomes order-sensitive. Different divisors create clock domains with undefined sample/hold behavior. Recovery is deterministic only after queue membership, topology commit, divisor phase, and hysteresis are canonical and persisted. Halving frequency does not make a 250,000-gate active tick cheaper.

**Do instead.** Determine work before execution, then run the whole province or skip it on a global-tick modulo. Define buffered cross-province exchange and persist throttle state. Use admission limits or lower caps if active-tick latency is the true hard limit.

### F-11 — High — UNDERSPECIFIED: dirty-input evaluation needs a scheduled wake source

**Claim.** §11.5 evaluates only gates whose input nets changed and says a quiescent circuit costs zero.

**Why it breaks.** Stud expiry, Delay Totem pipelines, pulse state, and throttle recovery can change output without a newly changed input net. Dusk Eyes and Weight Plates can work if world/time systems explicitly enqueue them, but that external enqueue contract is not stated.

**Do instead.** Add a deterministic timing wheel/scheduled-component queue beside the dirty-net queue. External sensors enqueue canonical boundary events. Narrow “zero cost” to circuits with neither dirty nets nor scheduled state.

### F-12 — High — OPTIMISTIC BUT RECOVERABLE: browser determinism is underspecified

**Claim.** §5.2 uses per-chunk xxhash, bans selected transcendentals, and calls basic IEEE operations safe. §13.2 adds fixed 20 Hz simulation, tick-stamped inputs, and deterministic AABB physics. §15.2 says verification falls out “for free”.

**Why it breaks.** Missing contracts include a whole-sim `Math.random` ban and named PRNG streams; stable iteration/collision/edit/pickup tie-breaks; canonical async worker result order; rounding/fixed-point/NaN rules; quantization before live simulation rather than only replay encoding; all touch/controller axes; and event-to-tick assignment under message latency. Map/Set order can still inherit async insertion order. Fixed dt removes frame-rate dependence, not state-transition ambiguity.

**Do instead.** Make live play and replay consume the same canonical quantized command stream. Inject named/counter-based PRNGs, use stable IDs and canonical iteration, explicit collision tie-breaks, fixed-point or explicit authoritative rounding, canonical serialization, and per-tick hashes. Differential-test V8/JSC/Gecko continuously. The per-chunk/stage hash design in §5.2 is genuinely sound.
### F-13 — High — WRONG AS A VERSION-SURVIVAL CLAIM: schema migrations do not preserve behavior

**Claim.** §14.3 says string block IDs, unknown-block round-tripping, and pure format migrators let worlds survive version bumps. Untouched Homeland chunks regenerate from seed (§5.1).

**Why it breaks.** Data shape is not semantics. Changing a gate truth table, port layout, tick delay, throttle rule, or province boundary can silently change old circuits. An inert unknown placeholder can split a net unless ports/connectivity are retained, and opaque block-entity payload round-trip is not specified. Worldgen changes make untouched chunks regenerate under new rules beside old visited chunks. `gameVersion` is stored, but no policy pins worldgen, simulation rules, or logic semantics.

**Do instead.** Persist `worldgenVersion`, `simRulesetVersion`, `logicSemanticsVersion`, stable port IDs, and block-entity schema versions. Keep legacy evaluators/generators, open incompatible worlds read-only, or perform an explicit backed-up breaking upgrade. Add golden circuit traces and world seams. String IDs and permanent migration fixtures are **FINE foundations**, but they do not prove semantic survival.

### F-14 — High — OPTIMISTIC BUT RECOVERABLE: multiplayer is not “the sim worker with a socket”

**Claim.** §16.1 chooses server authority and describes the server as the same sim worker with a socket. Clients predict movement and block edits; “rollback for self” corrects them. §16.2 lists validation and server-side inventory.

**Why it breaks.** Pure shared sim code is necessary, but solo code can still bake in one player, camera-driven residency, browser workers, global pause, UI timestamps, and browser persistence. A server needs stable actor/entity IDs, canonical multi-actor commands, authoritative time, storage/compression adapters, interest references, revisions/snapshots, backpressure, and abuse controls. Predicted voxel edits affect collision, lighting, mesh jobs, inventory, other entities, and Runewire. §16.2 does provide an authoritative cell revert, but it does not define the prediction-history scope or reconciliation order needed to make that revert coherent with the other affected state. Reach/rate/tool validation is illustrative, not a complete authority contract. The §16.2 promise of one-bit-per-net deltas also assumes stable net identity, but splitting or merging wire changes compiled topology; clients need server-issued net IDs plus topology generations, or component-output deltas. Its radius-4 interest set is smaller than the desktop radius-8 view, so the protocol must separately define how visible out-of-interest chunk modifications arrive.

**Do instead.** Pull a headless Node smoke test, injected adapters, stable IDs, command ordering, snapshots/hashes, and chunk revisions into DS-0/DS-1. Initially predict avatar movement only and show pending block feedback until confirmation, or keep a bounded world-cell rollback journal. Freeze the public protocol after the DS-7 tracer, not “from day one,” while freezing internal state identities early. The server-authoritative choice itself is **FINE**.

### F-15 — High — WRONG AS WRITTEN: self-host transport and identity do not work for the stated client

**Claim.** §16.4 says the HTTPS platform serves the client, which connects by `ws://` on LAN or `wss://` behind an operator reverse proxy on the internet; no relay/NAT service exists. It combines an allowlist of player names with unauthenticated local display names.

**Why it breaks.** An HTTPS arcade client generally cannot open insecure `ws://` mixed active content. LAN mode needs a locally served client or trusted TLS. Internet hosting needs port forwarding/public hosting, DNS, certificate, and proxy. An allowlisted display name is not authentication; anyone can impersonate it. A LAN server also needs Origin checks against drive-by webpages.

**Do instead.** Make the server serve a version-matched local web client, or ship a native wrapper. For internet use, provide an integrated TLS tunnel/relay or explicitly target technical operators. Use bearer invite codes or password-authenticated joining, install identity keys, nonce/replay protection, an Origin allowlist, and separate admin authentication. None requires platform credentials. Excluding self-hosted runs from platform boards and withholding platform credentials (§16.4) is **FINE and exactly right**.

### F-16 — High — OPTIMISTIC BUT RECOVERABLE: replay is a useful anti-cheat spine, not a free solution

**Claim.** §15.2 says terminal-state replay verification is the solo-board anti-cheat spine and falls out of determinism for free.

**Why it breaks.** Calling replay an anti-cheat spine is fair: it proves that a command stream is legal for a sim build and reaches the submitted state. What does not fall out “for free” is canonical capture, retained verifier builds, run authorization/signing, abuse controls, and provenance. Replay cannot detect mechanically legal solver, bot, or tool-assisted play; human-versus-tool provenance remains adversarial and open-ended.

**Do instead.** Call it deterministic run validation. Issue signed run IDs containing seed, ruleset hash, start window, and assists; validate command rates/transitions; rate-limit and anomaly-review submissions; state that tool assistance is prohibited but not perfectly detectable.

### F-17 — Medium — OPTIMISTIC BUT RECOVERABLE: 1.6 MB is only the core gate record

**Claim.** §11.5 totals listed fields to ~16 bytes/gate and calls 100k gates ~1.6 MB.

**Why it breaks.** Total memory also includes driver/fanout adjacency, net ranges, dirty/scheduled queues, block-to-node mapping, topology generations, free lists, outputs/state, compiler scratch, save form, and transfer buffers.

**Do instead.** Keep typed structure-of-arrays, which is sound, but measure end-to-end bytes per gate/net/wire including peak rebuild memory. Label 1.6 MB “core gate records.”

### F-18 — Medium — UNDERSPECIFIED: one transparent draw per chunk will sort incorrectly

**Claim.** §13.3 greedily meshes opaque, cutout, and transparent buckets with one draw per chunk/bucket.

**Why it breaks.** Alpha-blended faces need ordering finer than Three.js object-level sorting. Water, duskglass, and overlapping transparent builds will artifact.

**Do instead.** Use alpha test/dither where possible and a separate liquid/translucency strategy with smaller sections, explicit limits, or deliberate OIT/depth handling. This does not invalidate greedy opaque meshing.

### F-19 — Medium — UNDERSPECIFIED: browser memory measurement/accounting

**Claim.** §13.5 caps total heap across threads and GPU memory; §13.6 uses `performance.memory` pressure for LRU eviction.

**Why it breaks.** §13.6 correctly qualifies `performance.memory` with “where available,” but the GDD does not state how its total cross-thread heap and GPU targets will be measured. The API is not a portable aggregate, WebGL exposes no dependable total GPU memory, and driver copies/deferred deletion are invisible.

**Do instead.** Keep targets, but enforce application-owned accounting for voxel, mesh, index, texture, snapshot, queue, and in-flight buffers. Treat browser memory APIs/context loss as optional telemetry and recovery.

### F-20 — Medium — OPTIMISTIC BUT RECOVERABLE: the server package targets technical operators

**Claim.** §16.4 proposes Node 20, `npx`, JSON config, and a documented reverse proxy. DS-8 accepts a clean Windows machine and a $5 VPS following a walkthrough (§17).

**Why it breaks.** Node, shells, firewall/NAT, VPS security, DNS, certificates, proxying, backup, upgrades, and logs are technical-operator tasks. A zip does not remove them unless it embeds runtime and launcher.

**Do instead.** Label it technical self-hosting, or ship a signed portable installer with embedded runtime, GUI/config, updater, backup/restore, firewall/connectivity diagnostics, and supported tunnel/TLS. Test with a genuinely nontechnical operator.

### F-21 — Medium — OPTIMISTIC: major.minor matching is not “same code, one truth”

**Claim.** §16.4 requires matching sim major.minor and says the client tells the operator what to update.

**Why it breaks.** Patch fixes can change deterministic state. The static platform may serve only the newest client while an old server/world requires another build, and updating may migrate the world irreversibly.

**Do instead.** Handshake on exact sim/content hash plus protocol range. Let the server serve its matching client or retain version-routed clients. Include backup/migration/rollback in updates.

### F-22 — Medium — OPTIMISTIC: worker count and fallback probes are weak low-end policy

**Claim.** §13.3 chooses 2–4 mesh workers from `hardwareConcurrency`. §13.5 triggers Lantern mode from early p95, low texture size, or no instancing.

**Why it breaks.** On SD665 big.LITTLE, four mesh workers plus sim, render, compositor, and OS can worsen latency and thermal throttling. Capability probes poorly distinguish the intended WebGL2 low end; cold shader/streaming frames can make automatic selection sticky until the user overrides it.

**Do instead.** Start mobile at one mesh worker and conservative settings, adapt from stable measured throughput/tick misses, and persist an informed user choice.

### F-23 — Medium — FINE THEORY, OVERSTATED TEST: universality is plausible; four fixtures do not prove the implementation

**Claim.** §11.4 derives NOR, state, RAM, and a CPU, then calls NOR/D-flip-flop/adder/counter fixtures executable proof.

**Assessment.** Wired-OR into inversion is NOR; NOR is functionally complete. With scalable state, the bounded-memory computing claim and caveat are sound. The four fixtures prove only those examples, not arbitrary compilation, edits, invalid inputs, saves, province clocks, or throttling. The exact “gated D flip-flop = 4 gates + a Pulse Fang” cost/timing claim also needs a schematic and same-tick clock/data rule.

**Do instead.** Keep them and add exhaustive truth tables, generated small circuits against a slow reference evaluator, topology-mutation differential tests, invalid/simultaneous inputs, save checkpoints every tick phase, and cross-engine hashes. Three replay repetitions in DS-4 acceptance (§17) are inadequate.

## Later-phase work that is actually phase-1 architecture

1. **Replay/state identity.** DS-1 already requires ranked replay (§3.5, §15.2, §17): stable IDs, canonical commands, PRNG policy, hashes, and headless replay are DS-1 work.
2. **Save-shaped state.** User autosave may wait until DS-2, but authoritative state must already be serializable and transactional. Retrofitting IDs/schedulers/inventory later is a rewrite.
3. **Server portability.** Netcode waits until DS-7; Node importability, injected time/storage/compression, actor IDs, command order, snapshot revisions, and non-camera simulation residency do not.
4. **Runewire-ready block entities.** The compiler waits until DS-4; versioned block entities, stable face/port identities, neighbor invalidation, atomic edits, and deterministic activation belong in the voxel model now.
5. **Meshing stress before content.** DS-0's spinning chunk proves cartridge lifecycle, not streaming, edit churn, light fan-out, copied jobs, stale results, or adversarial geometry. Prove these before DS-1 content, not at DS-5's full gate.

## Claimed solved but open or unproven

No voxel, meshing, or circuit mechanism here is an unsolved theoretical research problem; known techniques exist. The document's problem is that unresolved engineering and validation targets are written as guarantees. The genuinely open-ended adversarial area is proving human provenance for mechanically legal solo inputs.

- **Solo anti-cheat:** mechanically legal replay is not human provenance; tool-assisted detection remains adversarial and open-ended.
- **Cross-platform bit-exactness:** known techniques can achieve a narrow contract, but fixed dt, two phases, a lint rule, and soak tests do not prove it. Numeric, ordering, input, residency, and serialization rules are incomplete.
- **Semantic survival of arbitrary Runewire worlds:** schema migration cannot automatically preserve the intended behavior of user computers after logic changes. Pin rulesets, retain legacy evaluation, or make explicit breaking upgrades.
- **Dynamic connectivity under 3 ms:** difficult engineering, not unsolved computer science. The missing pieces are bounded benchmarks and atomic semantics.
- **Durable Object cost:** §16.3 correctly calls this unproven and gates it behind a tracer. This is honest, not a false claim.

## Genuinely sound decisions

- Pure serializable `sim/` and disposable Three.js `view/`, with renderer rebuild from state (§13.2).
- WebGL2 baseline and private renderer seam; optional WebGPU does not infect sim (§13.1).
- Per-chunk/stage hashed worldgen (§5.2).
- Fixed-step AABB voxel physics as a foundation (§13.2).
- Wired-OR plus complete two-buffer gate commits within a fully specified tick (§11.1).
- Deferring Rams/item logistics, which invalidate meshes, topology, lighting, and saves (§11.3, §11.8).
- String block IDs and permanent one-step migration fixtures (§14.3), as storage primitives.
- Server-authoritative hosted co-op (§16.1).
- Treating self-hosted servers as untrusted and excluding their receipts/credentials (§16.4).
- The Durable Object tracer/cut rule (§16.3, §18).
- Phone graybox and physical shelf-device gates (§12.2, §13.5, §17).
- Touch-specific list crafting, paused inventory, ghost placement, sticky mining assist, and two-touch ceiling (§12.2), subject to the human validation already required.

## Final feasibility judgment

**DS-1 is not a valid first bounded implementation slice.** It is a valid first public vertical slice and reasonable product milestone if treated as an epic with internal gates. It currently combines engine construction, game-design validation, mobile UX, deterministic scoring, and low-end optimization; any one can force architecture change.

Before content beyond the one-resource/one-enemy graybox, require three proofs:

1. a deterministic command/state/replay kernel whose simulation activation is render-independent;
2. a crash-consistent state model capable of backing DSAV; and
3. a measured streaming/edit/remesh pipeline on the actual 2020 Android, including copied worker snapshots and adversarial chunks.

Runewire can remain DS-4 content, but its block-entity, topology-version, and save semantics must shape DS-1 interfaces. Multiplayer can remain DS-7, but Node portability, stable IDs, command order, and snapshot revisions must be designed now. With those prerequisites pulled forward and DS-1 split internally, DEEPSHIFT is feasible without abandoning static hosting or the isolated 3D-cartridge boundary.