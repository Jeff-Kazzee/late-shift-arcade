# Site stream — handoff

Current truth, overwritten at every block close.
Branch: `feat/w-001-dom-site` (pushed; awaiting orchestrator review/merge).

## W-001 — the real website: BUILT

DOM owns the site; canvas owns gameplay only. Shipped on the branch:

- **Home** (`index.html`): semantic HTML — hero, full 12-card rack, title
  search + genre/mode/tag filter chips, about, footer. Loads exactly 4 files
  (document, `shell/site.css`, `shell/site.js`, `shell/scores.js`) — zero
  manifests, zero game modules.
- **Detail pages** at real paths `games/<slug>/index.html` (work on the
  GitHub Pages subpath because a committed per-directory index.html costs no
  build step). Per-game `<title>`, meta description, canonical, OG/Twitter
  cards, `VideoGame` JSON-LD from the manifest. Legacy
  `?game=<slug>&version=<v>` links redirect there via `shell/site.js`.
- **The press**: `tools/generate-pages.js` renders every page from
  manifests; output is committed; `test/site-pages.test.js` fails the suite
  on any drift, on unescaped manifest text, on `source` as an anchor
  (C-003), and on any game-module reference in a page (F-008).
- **The player**: `shell/player.js` mounts the CRT cabinet as an overlay on
  the detail page; game code fetched only on PLAY through `entry.load()`
  behind `launchBlockReason()`. Blocked manifests render a page, never a
  button. Rotate-to-play now lives only inside an open cabinet that needs
  landscape (`orientation` manifest field, optional, default landscape);
  browsing is portrait-clean. `shell/main.js` (canvas site) retired.
- **SEO plumbing**: `sitemap.xml`, `robots.txt`. Note: on a project Pages
  site robots.txt is not at the domain root — submit the sitemap in Search
  Console when W-002 lands.
- Verified: 268 tests green, Lighthouse 100 a11y / 100 SEO on home and
  detail (mobile), evidence in `docs/w-001-verification/`.

## V-001 — the share loop: SHIPPED (2026-07-24 late)

Share-your-shift (Web Share / clipboard, five-line artifact, link last),
committed 1200×630 `og:image` cards for all 16 pages (`assets/og/`,
regenerate with `node tools/generate-og-cards.mjs`), and `#dare=<int>`
challenge banners with C-003 parsing discipline (`shell/share.js`).
366 tests green. Evidence: `docs/v-001-verification/`.

## Next unblocked ticket: W-002 — public routes, SEO, social cards

W-001 chose the routing scheme (real paths + committed HTML) and shipped
canonical/OG/sitemap basics; V-001 added the og:image cards. W-002 should:
pick the final public origin (custom domain vs github.io) and update
`SITE_BASE` in `tools/generate-pages.js` (single constant — OG cards
inherit it), submit the sitemap in Search Console, and regenerate cards if
the origin changes. The bigger unlock behind it: seed plumbing in the
cartridge contract, which turns the share loop into a true Daily Shift
(P-009) — design it against the DS-1a replay kernel's seed conventions.
