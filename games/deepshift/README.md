# DEEPSHIFT — DS-1a kernel + DS-1b stress slices

The first engineering slices of the DEEPSHIFT voxel game (DS-0 D4). DS-1a:
a pure, deterministic, headless sim kernel; an eight-minute graybox proven
winnable and losable by scripted policies; a Three.js renderer behind the
cartridge boundary; and a headless verifier that replays any run
byte-identically. DS-1b: worker meshing behind the F-06 snapshot contract,
radius-8 desktop render streaming, adversarial stress scenes with an edit
churn harness, and MEASURED §13.5 desktop numbers (`PERF.md`).
Binding decisions: `docs/DS-0-DECISIONS.md`; architecture: GDD §13.

## Layout

```
sim/       pure kernel. Imports NOTHING outside sim/ (test-enforced).
  math/    xxhash64 (BigInt), Q16.16 fixed point, integer trig, counter PRNGs
  world/   block registry, 32^3 palette+bitpacked chunks, seeded worldgen, world map
  activation.js  D1 ActiveSet + province admission (pure integer function)
  commands.js    canonical quantized command stream
  physics.js     20 Hz fixed-step AABB voxel physics
  sim.js         state, rules, tick, per-tick hash chain, WorldView snapshot
  replay.js      headless replay + run-log envelope
view/      renderer side. Pure and headless-tested: mesher.js, registry.js,
           mesh-snapshot.js (F-06 immutable section+halo job snapshots),
           mesh-pool.js (revision-stamped scheduler: stale rejection,
           coalescing, counted+capped buffers), render-set.js (radius-8
           spiral streaming, radius+2 unload), stress-scenes.js + churn.js
           (DS-1b adversarial fixtures). Browser-side: mesh-worker.js (plain
           module worker), mesh-transports.js (2-4 workers, inline fallback),
           renderer.js — the Three.js subscriber, streams sections through
           the pool and draws one merged geometry per 32^3 chunk.
cart/      the F-008 cartridge adapter: lifecycle, input (KB/M + touch), DOM HUD.
vendor/    three 0.185.1 (module + core, minified ES modules) + MIT license.
tools/     verify-run.mjs (the DS-1a acceptance verifier), scripted policies,
           fixture regenerators, serve.mjs (dev static server for stress runs).
fixtures/  d1-activation.json (D1 conformance golden), golden-run.json.
stress.html      DS-1b measurement harness (window.__stress()).
PERF.md          measured §13.5 desktop numbers + methodology + misses.
perf-evidence/   screenshots behind PERF.md.
```

## DS-1b in one paragraph

Meshing runs in 2-4 plain module workers. Every job is an immutable
snapshot of one 16^3 section plus a one-voxel halo, stamped with the
section's revision; results carry the revision back and are rejected if
stale — at receive time and again at apply time. Superseded queued jobs
coalesce; in-flight input bytes, pending output bytes, and job counts are
capped with real backpressure (dispatch stalls, never the sim). The
renderer streams chunk columns in spiral order to radius 8 around the
camera (device-local presentation only — D1 activation stays radius 3, a
ruleset constant; frozen-but-visible chunks are the normal case), unloads
beyond radius+2, and draws one merged geometry per 32^3 chunk so draw
calls stay ~100-250 against the 600 budget. Correctness under churn is
proven headless: scripted boundary-biased edit bursts against two
out-of-order transports must leave every touched section byte-identical
to a fresh remesh of the final world.

No build step, no bundler: everything runs from a static file server; the
repo root stays zero-dependency. Vendored three: 752 KB raw, ~188 KB gzip
across the two files, entirely inside `games/deepshift/`.

## Determinism contract

- **One hash primitive:** xxHash64 over BigInt (`sim/math/xxhash64.js`,
  verified against reference vectors). Worldgen, PRNG streams, the ruleset
  hash, and the per-tick hash chain all derive from it. BigInt arithmetic is
  exact on every engine and architecture.
- **Named counter PRNG streams** (`spawn`, `ai`): value =
  `xxh64(streamKey, counter)`. Save state is the counter — restore and the
  tail reproduces exactly. No `Math.random` anywhere in `sim/`
  (`purity.test.js` scans every file).
- **Ruleset hash:** every constant in `sim/constants.js` folds into
  `RULESET_HASH`; run logs carry it and the verifier refuses a mismatch.
- **Per-tick hash chain:** `h(t) = xxh64(h(t-1), digest(t))` where the digest
  covers player, entities (ascending id), RNG cursors, banking, this tick's
  canonical commands, and this tick's voxel edits. Same seed + same log ⇒
  identical chain, tick by tick (`replay.test.js`).
- **No wall clocks, no browser globals, no transcendentals** in `sim/` —
  scanned and enforced. Callers inject time by calling `tickSim`; storage
  adapters are a later slice (state is already save-shaped plain data, D2).

## Fixed-point conventions

- **Format:** Q16.16. One block = 65536 units. All positions, velocities,
  reach checks, and physics run in this format, stored in ordinary JS
  numbers (exact integers; magnitudes stay far below 2^52).
- **Rounding:** every narrowing operation floors toward −∞ (`floorDiv`,
  implemented with truncation + remainder correction — float quotients are
  never trusted near integer boundaries). `fpMul(a,b) = floorDiv(a*b, 65536)`.
- **Angles:** a full turn = 4096 integer units (the look-command lattice);
  pitch clamps to ±1000. `fpSin`/`fpCos` are an integer Bhaskara-I
  approximation — bounded, odd, periodic, and byte-identical everywhere.
  Negative zero is normalized out; `-0` never enters sim state.
- **Activation metric (D1):** integer Chebyshev distance on the chunk
  lattice, radius `SIM_RADIUS = 3` (a ruleset constant). No floats anywhere
  in the predicate. Province admission over `MAX_ACTIVE_PROVINCES = 16` is
  nearest-province-first, ties broken by ascending province id.
- **Physics:** AABBs are `[x±halfW) × [y, y+height) × [z±halfW)` with
  exclusive max faces (a body flush on a boundary does not occupy the next
  cell). Axis resolution order is fixed: **Y, then X, then Z**. Each axis
  sweeps crossed voxel layers in order and clamps at the first solid layer,
  so nothing below one chunk/tick can tunnel. Rest positions are exact
  integer boundaries.
- **Voxel order:** chunk index = `((y*32)+z)*32 + x`; sections are 16^3, the
  meshing unit (D4); section keys are `sx,sy,sz`.

## The graybox (Gate 2)

Dawn Run, 8 minutes at 20 Hz (`runTicks = 9600`): 3:00 day, 5:00 night.
Mine fieldstone (instant break, reach 5, no line-of-sight check — graybox
simplification), bank it at the clan cache (amber beacon). Win: bank
**12 fieldstone** before dawn. Lose: HP 0 (`death`) or the clock
(`dawn-timeout`). At night, Hollowed spawn near the player every 15 s (cap
4), walk at the player, and melee for 4. The player clubs back for 5.

**Score (Shift Report):**

```
score = 100·bankedDay + 150·bankedNight        (night banking pays 1.5×)
      + ⌊endTick / 20⌋ · 1                      (1 point per survived second)
      + 500 if the run was won
```

`tools/policies.mjs` holds the scripted bots: the miner-banker wins across
seeds, the idle bot dies at night, the sealed-shaft bot times out at dawn —
all asserted in `graybox.test.js`.

## The verifier (Gate 4 — D1's acceptance proof)

```
node games/deepshift/tools/verify-run.mjs <run-log.json> [--expect-hash H]
```

Replays seed + canonical command log with **no renderer imported** (the
purity test asserts the import graph) and prints the terminal tick, status,
score, and hash-chain head. Exit 0 on match. The cartridge's
`getRunLog()` (and the detail page's "download run log" button) emit
exactly this format. `fixtures/golden-run.json` pins a winning run and its
expected hash forever.

Fixture regeneration (`tools/gen-d1-fixture.mjs`, `tools/gen-golden-run.mjs`)
is a **ruleset event**: goldens change only when the rules deliberately do.

## The cartridge boundary (Gate 3)

- `manifest.js` validates against shell schema v1 with
  `runtime: 'first-party-3d'`. The shell's launch gate currently returns
  `runtime unavailable: first-party-3d` — lifting that (GDD §15.1) is shell
  work owned by the orchestrator; `games/deepshift/index.html` hosts the
  boundary demo directly until then and says so on the page.
- The renderer (`view/renderer.js`) is a one-way subscriber: it receives a
  read-only `{ snap, readBlock }` view, can be destroyed and rebuilt from a
  snapshot alone (the page's "kill + rebuild renderer" button), and tracks
  every disposable in a registry — eject is one sweep. Mesh rebuild
  byte-identity across live vs replayed states is asserted headless in
  `mesher.test.js`; the 10-cycle launch/eject leak check runs from the
  detail page (DOM-node count must not move; registry bookkeeping is
  asserted in `cartridge-contract.test.js`).
- Controls: WASD + mouse-look (pointer lock), click mine / right-click
  place / 1-3 select block / E bank / F attack / Space jump; touch: left
  zone joystick, right zone look, tap to mine, on-screen JUMP/MINE/PLACE/
  FIGHT/BANK buttons.

## Tests

`npm test` at the repo root discovers `games/deepshift/*.test.js` like every
other game. 93 tests: math/hash vectors, chunk/worldgen/world, D1
conformance (golden fixture), physics, purity scans (now including the
worker import-graph: sim/ can never reference Worker/postMessage or the
mesh pipeline), replay + verifier CLI, graybox win/loss policies, mesher +
WorldView seam, cartridge contract, and the DS-1b set — mesh-job snapshot
immutability/byte-identity, pool stale-rejection/coalescing/caps,
render-set spiral/unload, stress-scene determinism, and remesh-under-churn
correctness.
