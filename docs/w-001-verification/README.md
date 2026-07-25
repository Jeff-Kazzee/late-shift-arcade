# W-001 verification evidence

Captured 2026-07-24 against this branch, served locally with
`python -m http.server` from the repo root (static files, no build step).

## Screenshots

| File | Shows |
| --- | --- |
| `home-desktop-hero.png` | Home at 1440×900 — hero, search, genre/mode/tag filter chips |
| `home-desktop-1440.png` | Home at 1440×900 — the full 12-card rack, local `HI` badge, about section |
| `home-desktop-filtered.png` | Genre chip `PUZZLE` pressed — 2 of 12 cards rendered, live count, clear button |
| `detail-desktop-neon-snake.png` | Detail page at 1440×900 — facts, goal, local best scores, provenance |
| `cabinet-desktop-neon-snake.png` | NEON SNAKE running in the CRT cabinet overlay after PLAY |
| `home-phone-portrait-390.png` | Home at 390×844 portrait — browsing works, no rotate wall |
| `detail-phone-portrait-pong.png` | PONG detail at 390×844 portrait — readable, playable-from, landscape announced |
| `cabinet-phone-portrait-rotate.png` | PLAY pressed in portrait — ROTATE TO PLAY veil over the cabinet only |
| `cabinet-phone-landscape-pong.png` | PONG menu running at 844×390 landscape phone |

## Network proof (F-008: zero game modules until launch)

Chrome DevTools network log, fresh navigation:

- `/` loads exactly 4 requests: the document, `shell/site.css`,
  `shell/site.js`, `shell/scores.js`. **No manifests, no game modules.**
- `/games/neon-snake/` loads the document, `site.css`, `shell/player.js`,
  9 shell modules, `games/registry.js`, and the 12 manifests.
  **No game modules.**
- Clicking **INSERT COIN — PLAY NOW** adds exactly two requests:
  `games/neon-snake/neon-snake.js` and `games/neon-snake/logic.js`.

Also verified live: legacy `/?game=vault-heist&version=1.0.0` redirects to
`/games/vault-heist/`; ejecting the cabinet removes the overlay, restores
scroll and focus, and leaves a clean console; existing localStorage high
scores (NEON SNAKE `AAA 2850`) surface on both the card badge and the
detail page.
