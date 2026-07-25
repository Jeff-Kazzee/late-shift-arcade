# W-001 — the real website

Status: next block. Approved 2026-07-24, not started.
Read this first if you are a fresh session picking up the site stream.

## The problem, stated plainly

`index.html` is a `<canvas>` in a box. The attract screen, the game grid, and
every game detail page are **pixels painted into a 640×480 2D context** by
`shell/main.js`. There is no website. There never was one — the repo began as a
single-cabinet arcade toy and grew platform ambitions around a substrate that
cannot carry them.

What that costs today, all currently true:

- **Google sees an empty page.** A game library that cannot be found in search
  has no top of funnel. This is the thing that matters most.
- **No screen reader, no text selection, no browser find.** Every word on the
  site is a drawing of a word.
- **Portrait phones are blanked** behind `↻ ROTATE TO PLAY` —
  `@media (orientation: portrait) and (max-width: 700px)` in `index.html`.
  Browsing a catalogue does not need landscape. Most phone traffic is portrait.
- **It does not scale.** A 2×4 paged canvas grid is not a 30-game catalogue,
  and 12 games already spill onto page 2.

Ticket **P-008** already requires "make public routes indexable," which canvas
cannot satisfy. So the backlog implicitly demanded this fix and then scheduled
it behind auth and the Cloudflare migration.

## The one piece of good news

**The data model is already right.** F-002 built a validated, versioned manifest
per game carrying exactly what a page needs: `slug`, `title`, `summary`, `goal`,
`genre`, `players`, `controls`, `tags`, `modes`, `scoreLabel`, `contentNotes`,
`madeWith`, `creator`, `version`. F-008 then made manifests importable **without
loading any game code**.

So the catalogue can render 30 games' worth of real HTML without pulling a
single game module. The hard part is done; this block spends it.

## Target

**DOM owns the site. Canvas owns gameplay only.**

| Surface | Owner |
| --- | --- |
| Home, browse, search, filters, game detail, about, footer | Real HTML + CSS |
| The running game | Canvas, unchanged |

The CRT cabinet framing and night palette stay — they are the identity of the
*player*, not of the whole site. A game keeps its cabinet; the site around it
becomes a website.

## Deliverables

1. **Real pages.** Home with the full rack, a per-game detail page, and a
   browse/search view. Semantic HTML — headings, lists, links, `<main>`.
2. **Per-game URLs that work from static hosting.** Today it is
   `?game=<slug>&version=<version>` and it must keep working (F-002 shipped it,
   and share links depend on it). Prefer real paths (`/games/<slug>/`) if they
   can be made to work on GitHub Pages **without a build step** — investigate
   and decide; do not assume. Query params are an acceptable answer if paths
   cost a build.
3. **Indexability**: `<title>` and `<meta name="description">` per game,
   Open Graph and Twitter card tags, `sitemap.xml`, `robots.txt`, canonical
   links, and `VideoGame` JSON-LD structured data generated from the manifest.
4. **Portrait works.** The blanket rotate blocker dies for browsing. Individual
   games may still require landscape — that belongs in the game's own manifest
   and detail page, announced before launch, not as a wall across the site.
5. **Responsive layout** that holds 30+ cards, with genre/mode/tag filters and
   title search driven by manifest data.
6. **Accessible**: keyboard navigable, focus visible, real link semantics,
   alt text, sensible contrast.

## Hard constraints

- **Zero dependencies. No build step. No framework.** `index.html` must run
  from any static file server exactly as-is. This is a charter rule in
  `AGENTS.md`, not a preference.
- Deployed under a **subpath** (`/late-shift-arcade/`) on GitHub Pages —
  relative URLs, no absolute paths.
- **All 12 games keep working**, keyboard/mouse and touch, with existing local
  high scores intact.
- **Do not regress F-008**: manifests load without game code; a game module is
  fetched only on launch. If the new home page pulls 30 game modules, the block
  has failed.
- **Do not regress the security posture**: `launchBlockReason()` stays the sole
  launch policy, consumed by the gate *and* the UI. Suspended and
  non-in-process entries must render a detail page but never launch.
- Manifest text is **untrusted-shaped by design** — community submissions will
  supply it later. Insert it as text nodes, never as HTML. `source` currently
  accepts loopback and userinfo-spoofed URLs (see `tickets.md` C-003); do not
  render it as a live anchor until that is tightened.

## Verification

- Every game reachable and playable from the new site, desktop and phone,
  **in portrait**.
- View-source shows real game titles and descriptions in HTML.
- Network panel: home page loads manifests, **zero** game modules.
- Lighthouse SEO and accessibility passes, reported with numbers.
- `npm test` green; `node --check`; `git diff --check`.
- Screenshots at desktop and phone widths.

## Sequencing note

This block is why the arcade is not launchable, and it outranks more games.
Twelve games behind an unindexable canvas is worth less than six games on a
site people can find. `docs/PATH-TO-30.md` holds the game slate; it should run
*alongside* this, not ahead of it.
