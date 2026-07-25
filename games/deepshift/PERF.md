# DEEPSHIFT DS-1b — measured desktop numbers (GDD §13.5, desktop column)

Measured 2026-07-25 in a real browser. Numbers are MEASURED, not asserted
(feasibility review F-05); misses are reported plainly with the bottleneck
named. The mobile column and shelf-device capture are deferred to the DS-5
release gate per DS-0 D4 (owner's word 2026-07-24: web-first).

## Environment

- Chrome 150, Windows 11, viewport 1280×860 css px at devicePixelRatio 1.25
  (renderer pixel ratio capped at 2; effective ~1600×1000 render target).
- NVIDIA GeForce RTX 4050 Laptop GPU (ANGLE D3D11), 8 logical cores.
- 4 mesh workers (`meshWorkerCount(8)` → clamp(2..4, cores−2)).
- Served statically by `tools/serve.mjs`; no build step, no throttling.
  DevTools CPU/network throttling NOT applied — this is the unthrottled
  desktop datapoint. A 2018 UHD 620 laptop remains unmeasured here (that
  capture is DS-5 gate work together with the mobile column).

## Method

`stress.html` drives the real renderer (`view/renderer.js` — the same
module the cartridge uses) over the three adversarial scenes committed as
deterministic generators in `view/stress-scenes.js`, at RENDER_RADIUS 8
with radius+2 unload. Authoritative activation is untouched throughout:
these are render-only worlds far larger than SIM_RADIUS 3, so
frozen-but-visible chunks are the normal case, as D1 intends.

Per scene, three windows (stats reset between windows, `window.__stress()`
scraped via Chrome DevTools MCP):

1. **fill** — cold start to full radius-8 spiral fill (~8–25 s).
2. **travel** — 15 s steady state, scripted lissajous patrol (±200 blocks
   ≈ ±6 chunk columns: streaming and unload run continuously).
3. **churn** — 15 s of travel plus scripted edit bursts
   (`view/churn.js`: 24 edits per burst, ~10 bursts/s, half of all edits
   snapped onto 16-block section faces so neighbor sections dirty too).

Frame time is the requestAnimationFrame interval; at 60 Hz vsync the floor
is 16.67 ms, so p95 values of 16.8–17.0 ms are vsync quantization (mean
fps 59–60, p50 16.7), not missed frames — p99 is quoted where frames were
actually dropped. Remesh latency is job submit → geometry applied,
measured inside the mesh pool. Time-to-playable is start → every chunk
within radius 3 of the anchor streamed and settled.

## Results vs §13.5 desktop budgets

Steady-state travel window (worst of travel/churn in parentheses where
churn was worse):

| Metric (desktop budget) | caves | fortress city | checkerboard | verdict |
| --- | ---: | ---: | ---: | --- |
| Frame p95 ms (≤16.7, 60 fps) | 17.0 @ 60 fps | 17.0 @ 60 fps | 16.9 @ 59.9 (churn 33.5 @ 45 fps) | **PASS** caves+fortress; **MISS** checkerboard churn |
| Frame p99 ms | 17.0 | 17.1 | 33.3 (churn 50.0) | occasional dropped frame on checkerboard |
| Draw calls (≤600) | 124–247 | 100–188 | 152–245 | **PASS** all |
| Triangles on screen (≤1.2 M) | 0.5–1.06 M | 0.15–0.47 M | **7.5–11.1 M** | **PASS** caves+fortress; **MISS** checkerboard (by design) |
| Resident chunk meshes (≤1,000) | 388–613 | 210–438 | 388–676 | **PASS** all |
| View radius (8) | 8 | 8 | 8 | PASS (radius+2 unload observed live) |
| JS heap (≤350 MB) | 241–336 MB | 56–85 MB | **2.5–4.2 GB** | **PASS** caves+fortress; **MISS** checkerboard |
| Cold start → playable (≤5 s) | 1.08–1.57 s | 0.44–0.72 s | 1.47 s | **PASS** all |
| Remesh p95 during churn | 43 ms | 27 ms | 89 ms | no §13.5 row; GDD §13.3 "≤4 ms worker time" is per-job — queue latency dominates these numbers |
| Launch/eject leak (G-007) | — | — | — | **PASS**: graybox 10× cycle, DOM 43→43, heap flat, zero console |

Pool contract observed live during fortress-scale churn windows on caves
geometry: `rejectedStale` 41–94, `coalesced` 2–221, in-flight input peak
46 KB, pending output peak 1.4–28 MB — all within the caps below, with
dispatch stalling and resuming under output backpressure exactly as the
headless tests assert.

Graybox regression (DS-1a page through the reworked renderer): launches,
mines, HUD ticks; kill+rebuild renderer 52 ms; 10× launch/eject leak check
DOM 43→43; zero console messages.

## The honest misses, with bottlenecks named

The checkerboard slab is the designed worst case — 2,048 isolated voxels
per 16³ section, nothing merges (12,160 quads per section, pinned by
test). At radius 8 it puts **~10 M triangles** in the resident set, 8.5×
the 1.2 M budget:

1. **Triangles/heap: no density backstop.** F-05 asked for visible-mesh
   and triangle limits enforced independently of radius. DS-1b enforces
   the radius and the draw batching but has no per-chunk triangle budget
   or density-based LOD/limit. On this RTX 4050 the GPU still holds 60 fps
   at 10 M tris; the frame budget broke only when CHURN forced continuous
   1.5 MB-scale geometry rebuilds (p95 33.5 ms, 45 fps). The 2.5–4.2 GB
   heap is the same geometry retained twice on the CPU side: sectionData
   copies for chunk re-merges plus three.js's own CPU-side
   BufferAttribute arrays. On a 350 MB-budget machine this scene would
   OOM long before it slowed down.
2. **Churn frame cost: chunk-merge granularity.** The draw unit is the
   32³ chunk (8 sections merged per geometry — that batching is why draw
   calls sit at 100–250 against a 600 budget). Under churn every dirtied
   section forces its whole chunk to re-concat and re-upload; on
   checkerboard that is up to ~12 MB per chunk per burst. The 4 ms/frame
   re-merge budget spreads the work but the upload itself still spikes
   frames.

Named follow-ups (not implemented in this slice): a per-chunk triangle
budget with a fallback to per-section draws for over-dense chunks;
releasing CPU-side copies after GPU upload (three.js onUploadCallback, or
rebuilding merges from worker re-requests); GDD §13.6's LRU eviction under
memory pressure. None of these change sim behavior.

Deferred, and said so: sun-column lighting was NOT required to make these
stress results meaningful (the §13.5 rows measured here are geometry,
scheduling, and streaming budgets), so DS-1a's baked face shading stands;
smooth lighting/AO rebake fan-out remains DS-1b follow-on work under GDD
§13.3's "budget light fan-out separately".

## Buffer-count caps chosen (F-06)

- One in-flight job per section key, ever.
- `maxInFlight` = 2 × workers (8 on this machine).
- `maxInFlightBytes` (input snapshots) = 8 MB — never exceeded; a job
  larger than the whole cap may fly alone so nothing deadlocks.
- `maxPendingResultBytes` (received, unapplied output) = 32 MB — dispatch
  stalls above this until the per-frame drain frees it.
- Per-frame presentation budgets: 3 ms snapshot streaming (checked before
  every chunk), 32 results applied, 4 ms chunk re-merge.

## Reproduce

```
node games/deepshift/tools/serve.mjs 8123
# open http://127.0.0.1:8123/games/deepshift/stress.html
# pick a scene, Start; toggle "edit churn"; Reset stats window; read the
# tiles or window.__stress()
```

Screenshots in `perf-evidence/`: caves, fortress city, and checkerboard at
radius 8 with live metric tiles, plus the graybox regression page.
