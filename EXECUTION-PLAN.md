# Late Shift Arcade — execution plan

Status: proposed
Date: 2026-07-24
Supersedes: nothing. Sits above `tickets.md` as the ordering and staffing plan.

This plan records the decisions Jeff made on 2026-07-24, the backlog changes
they require, and how the work gets staffed across sessions and models.
`SPEC.md` remains the product contract, `GAME_ROADMAP.md` the game bar, and
`tickets.md` the ordered slices. This file says *what order* and *who builds it*.

---

## 1. Where this actually stands

Honest state, verified 2026-07-24:

| Thing | Reality |
| --- | --- |
| Games shipped | 8 in the cabinet, all playable, `npm test` 110/110 green |
| Pixel Life | Built and tested, out of the rack, source preserved |
| The "website" | **Does not exist.** Everything is drawn inside a 640×480 canvas |
| Accounts / boards / submissions | Specced in detail, zero code |
| Backlog | ~80 tickets across R0–R4, genuinely well written |
| Worktree | F-001 + F-002 complete and green but **uncommitted** |
| Production | GitHub Pages, Legacy Rack, public repo |

The planning work already done here is strong and this plan does not restart it.
The gap is that the plan's *ordering* puts the thing Jeff cares most about —
the site not feeling lame — behind ten infrastructure tickets.

### The root cause of "the website is really lame"

`index.html` is a `<canvas>` in a box. The attract screen, the game grid, and
the game detail pages are all pixels painted into a 640×480 2D context by
`shell/main.js`. Consequences, all currently true:

- **Not indexable.** Google sees an empty page. A game library that can't be
  found in search has no top of funnel.
- **Not searchable or filterable** beyond what gets hand-painted into canvas.
- **Not accessible.** No screen reader, no text selection, no browser find.
- **Portrait phones get blanked** — `@media (orientation: portrait)` hides the
  entire site behind "↻ ROTATE TO PLAY". Most phone traffic is portrait, and
  browsing a library does not need landscape.
- **Does not scale.** A 2×4 paged canvas grid is not a 30+ game catalog.

Ticket P-008 already requires "make public routes indexable," which canvas
cannot satisfy. So the backlog implicitly requires this fix but schedules it
behind auth (P-002) and the Cloudflare migration (P-001).

### The modularity problem

`games/registry.js` statically imports all eight games and hand-lists their
metadata. At 30+ games this means every game's code loads on first paint, and
adding, removing, or swapping a game is an edit to a central shared file. That
is the opposite of the interchangeable system Jeff asked for.

---

## 2. Decisions ratified 2026-07-24

These come from Jeff directly and amend `SPEC.md`, `AGENTS.md`,
`GAME_ROADMAP.md`, and `tickets.md`. Ticket **F-007** records them.

**D1 — DOM owns the site; canvas owns gameplay only.**
Real HTML/CSS for home, browse, search, filters, game detail, account, and
footer. The canvas is reduced to what it is good at: the running game. The CRT
cabinet framing and night palette are preserved as the visual identity of the
*player*, not of the whole site. Portrait browsing works; only individual games
may require landscape, and each says so in its own manifest.

**D2 — Two-tier release bar.**
The single 10-point complete-game contract becomes two tiers:

| Tier | Bar | Purpose |
| --- | --- | --- |
| **Showcase** | Full 10-point contract in `GAME_ROADMAP.md`, unchanged | The showstoppers. Pinball, Boss Foundry, Pocket Realm, the PvP title |
| **Arcade Shorts** | Goal, loss state, documented score, touch support, pure-logic tests, clean console | Fills the library fast; the honest on-ramp for community submissions |

Tier is a manifest field, shown on the card. Boards never mix tiers. This is how
the library reaches 30+ without diluting the flagships.

**D3 — Multiplayer is unblocked.**
The non-goals banning public rooms, lobbies, and chat are lifted. Replaced with
a safety baseline rather than a prohibition: chat is logged and retained for
moderation, reportable, rate-limited, and subject to the same export/delete
rights as everything else. A medieval PvP battle game is greenlit as a concept
(working name **IRONMARK**, `G-022`). Stranger matchmaking is now permitted
inside a lobby model.

**D4 — Modularity is a first-class architectural requirement.**
Games are self-describing packages, lazy-loaded, addable and removable without
editing shared code. Ticket **F-008**. Details in §3.

**D5 — Work is staffed across models by cost and task shape.** See §5.

**D6 — The voxel game grows past the finite extraction loop.**
Pocket Realm keeps its finite Beaconfall run as the *first* shippable slice,
because a finite loop is how the engine gets proven. Freebuild mode, real
multiplayer, and self-hosted servers follow **on the same engine** as `G-008B`.
See the open flag in §6.

**Already covered, no change needed:** passwordless email-code accounts are
specced as `P-002` (WorkOS AuthKit). One-button full data export and self-serve
account deletion are `P-005` and gated at launch by `O-000`. Jeff asked for
both; both were already in the plan.

---

## 3. The modular game system (F-008)

The target: adding a game is dropping a folder in and nothing else.

```
games/
  pong/
    manifest.js      <- metadata only, no imports of game code
    pong.js          <- the cartridge factory
    pong.test.js     <- lives with the game, not in a central test dir
    art/             <- card art, screenshots
```

Rules:

1. **`manifest.js` is data, not code.** It is statically importable, cheap, and
   never pulls in the game. The catalog is built from manifests alone, so the
   home page loads metadata for 30 games without loading 30 games.
2. **The cartridge is behind a lazy `import()`.** A game's code is fetched when
   the player launches it. First paint cost stays flat as the library grows.
3. **The registry is composed, not authored.** `games/registry.js` stops being a
   hand-maintained list. Adding a game does not touch shared code; removing one
   is deleting a folder.
4. **Tests live with the game.** A game folder is self-contained: code, tests,
   manifest, art. This is what makes a game genuinely removable.
5. **The versioned cartridge interface is the only seam.** Already true and
   already validated by `shell/cartridge.js` — F-008 keeps that and adds the
   loading boundary around it.

This is also the seam community submissions arrive through, so building it now
pays for itself twice.

---

## 4. Backlog changes

### New tickets

| ID | Title | Why |
| --- | --- | --- |
| **F-007** | Ratify the 2026-07-24 decisions | Records D1–D6 into the charter docs and reorders the backlog |
| **F-008** | Game package boundary | D4 modularity: manifests, lazy loading, composed registry |
| **F-009** | Release tier in the manifest | D2 two-tier bar, surfaced on cards and boards |
| **W-001** | DOM site chrome | **The website.** Home, browse, search, filter, game detail, responsive, portrait-first |
| **W-002** | Public routes, SEO, social cards | Indexable per-game URLs, Open Graph cards, sitemap |
| **M-002** | Lobby and logged chat | D3 safety baseline for public multiplayer |
| **G-022** | IRONMARK — medieval PvP arena | D3 greenlight, working name |
| **G-008B** | Pocket Realm: Freebuild and self-hosted servers | D6, after Beaconfall proves the engine |

### Reordering

The single most important change: **W-001 moves to the front**, ahead of auth
and the Cloudflare migration. P-008's browse requirements fold into W-001/W-002
rather than waiting behind ten R1 tickets.

`F-003` (universal run receipt) stays exactly where it is and stays next in its
stream — it is on the critical path for scores, shares, and boards, and nothing
above changes it.

---

## 5. Staffing: streams and models

Four streams. They touch disjoint file sets, which is what makes them safe to
run in parallel across sessions and subagents.

| Stream | Owns | Files | Model |
| --- | --- | --- | --- |
| **A — Contract** | F-007, F-008, F-009, F-003 | `shell/cartridge.js`, `shell/catalog.js`, `games/registry.js`, charter docs | Opus 5 (lead, in-session) |
| **B — Website** | W-001, W-002 | `index.html`, `site/`, CSS, DOM chrome | Opus 5 / Fable 5 subagents |
| **C — Games** | Arcade Shorts, then Showcase titles | `games/<name>/` only | Opus 5 / Fable 5 subagents, batched 2–3 Shorts per run; dedicated run per Showcase title |
| **D — Platform** | P-001, P-002, P-003, P-005 | Worker, D1, auth — separate repo (see flag) | Codex GPT-5.6 high, reviewed by Opus |

Stream C is where parallelism pays most: each game is one folder, so batched
runs proceed with zero file contention — *once F-008 lands*. Before F-008,
they'd all collide in `registry.js`. That dependency is the reason F-008 is
near the front. Granularity follows the dispatch rules in `AGENTS.md`: 2–3
Arcade Shorts per synchronous run, one dedicated run per Showcase title.

### Model assignment

| Work | Model | Reason |
| --- | --- | --- |
| Architecture, contract, security review, final synthesis | **Opus 5** (this session) | Highest-stakes judgment; stays in the orchestrator |
| Game builds, DOM chrome | **Opus 5 / Fable 5** subagents | Jeff's explicit preference; game feel benefits from stronger models |
| Test writing, mechanical migration, second-opinion review | **Codex GPT-5.6** (Sol/Terra, high reasoning) | Independent perspective; conserves Claude tokens |
| Inventories, doc updates, asset lists, small mechanical edits | **Luna / Haiku** | Cheap, bounded, low judgment |

Token discipline: the orchestrator plans and reviews; subagents do the heavy
file reading and code writing and report back conclusions, not file dumps.

### Session handoff

Each stream keeps its own handoff file so streams can resume independently,
inside the repository:

```
docs/handoffs/<stream>.md      # contract | site | games | platform
```

(Temp-directory handoffs are retired — deliverables and state live in the repo.)

---

## 6. Open flags — need Jeff's call, not blocking

**Flag 1 — the repo is public.**
`github.com/Jeff-Kazzee/late-shift-arcade` is **PUBLIC**. Free GitHub Pages
requires that. Jeff said the site code maybe shouldn't be public. Recommendation:
split rather than hide. Keep the shell and games public — it is a portfolio
asset and the reference community submissions are written against. Put the
Worker, auth, moderation tooling, and anything touching player data in a
separate **private** repo. Decide before `P-001`, since that is when the first
non-static code lands. Nothing in the tree today is sensitive.

**Flag 2 — voxel scope.**
`GAME_ROADMAP.md` frames Pocket Realm as deliberately finite, and the non-goals
explicitly exclude "an infinite voxel world before Pocket Realm's finite
extraction loop is fun." Jeff wants open building, digging, multiplayer, and
self-hosted servers. These are reconcilable and the plan assumes reconciliation:
**one engine, two modes.** Beaconfall's 20-minute finite run ships first because
it proves chunking, determinism, save/resume, and the performance budget against
a real win condition. Freebuild then rides the same engine with those systems
already load-bearing. Building infinite-first means debugging an open sandbox
with no completion criteria — the failure mode the kill rules were written for.

---

## 7. Immediate next actions

1. **Commit F-001 and F-002.** Complete, documented, 110/110 green, browser-
   smoked — but uncommitted. The dirty tree blocks branching, so it blocks every
   parallel stream. *Needs Jeff's go-ahead.*
2. **F-007** — write D1–D6 into `AGENTS.md`, `SPEC.md`, `GAME_ROADMAP.md`, and
   `tickets.md`; add the new tickets; reorder.
3. **F-008** — the game package boundary. Unblocks parallel game builds.
4. **W-001** — the website. In parallel with F-008; disjoint files.
5. **F-003** — run receipt, unchanged, continues in Stream A.

Games do not fan out to parallel agents until F-008 lands. That is the one
sequencing constraint worth respecting.
