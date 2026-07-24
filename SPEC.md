# Late Shift Arcade — platform spec

## Product charter

Late Shift Arcade is a curated compendium of small, complete, AI-made browser
games with a shared cabinet shell. The original eight shipped games form the
**Legacy Rack** and remain continuously playable while the compendium grows.
The current site keeps its CRT feel and night palette; new runtimes extend the
platform without replacing that working rack.

“AI-made” means a disclosed material AI contribution to design, code, art,
audio, testing, or iteration; human editing is expected and raw prompts are
not required for publication.

## Supported runtime and trust contract

The platform supports four code classes. The versioned game contract is their
shared behavioral seam; it does not grant every class the same privileges.

| Class | Runtime | Trust and isolation |
| --- | --- | --- |
| **Shell** | Platform-owned HTML, CSS, and JavaScript | Trusted code on the platform origin. It owns navigation, catalog and lifecycle coordination, shared input, score presentation, and all future identity/storage capability boundaries. |
| **First-party 2D cartridges** | Same-origin vanilla ES modules and Canvas | Trusted first-party code. Legacy Rack games use the current in-process cartridge interface, have no build step or dependencies, and receive only shell-supplied game context. |
| **First-party 3D cartridges** | Self-contained, isolated first-party builds using Three.js/WebGL when introduced by a later ticket | Trusted first-party code with renderer dependencies and build output isolated from the static shell. It communicates through the versioned game contract and owns cleanup of its runtime and GPU resources. |
| **Community cartridges** | Reviewed packages on a separate origin in sandboxed iframes with restrictive CSP | Reviewed code remains untrusted. It communicates only through capability-scoped versioned messages. Community code never shares the platform origin or receives platform identity, session, credential, or storage privileges. |

Publication review changes a community cartridge's catalog eligibility, not
its trust level. No future runtime may move community code onto the platform
origin or expose privileged platform objects to it.

Canonical simulation state belongs in plain, serializable data outside Canvas,
DOM, audio, Three.js, WebGL, and network objects. Pure rules advance that state;
renderers project it. Saveable state and seeded randomness stay outside render
objects wherever practical.

Every new public game must satisfy the canonical **complete-game** contract and
its **release-proof** requirements in `GAME_ROADMAP.md`, under “What qualifies
as a complete game.” That roadmap section is the source of truth; this spec
does not duplicate its checklist.

## The Legacy Rack shell

- `index.html` boots an attract screen ("LATE SHIFT ARCADE", blinking
  "INSERT COIN — coin not required"), then a game-select grid, then a game
  detail screen that precedes every launch.
- Each Legacy Rack game is an ES module implementing the current cartridge
  interface:
  `{ id, title, blurb, init(ctx), update(dt, input), draw(ctx2d), destroy() }`.
  The shell owns the canvas, fixed-timestep loop, input, and scores. Games
  own nothing global.
- `games/registry.js` pairs each cartridge factory with one deeply frozen
  schema-version-1 catalog manifest — see "The catalog manifest" below. Every
  launch creates a fresh validated instance; a failed `init` is cleaned up
  transactionally. Only validated, `published`, `first-party-2d` entries can
  launch; every other runtime and status fails closed before the factory runs.
- Every game is addressable at `?game=<slug>&version=<version>`, which opens
  its detail screen. Query parameters keep the site deployable from any static
  file server with no rewrite rules. Browser Back/Forward reconciles the route
  and disposes the outgoing screen.
- The cabinet selector is a touch-sized 2×4 grid with paging, so adding a game
  is a registry entry rather than a shell layout rewrite.
- Shared modules:
  - `shell/input.js` — keyboard (arrows/WASD/space) + mouse + touch.
  - `shell/scores.js` — per-game high scores in localStorage, 3-letter
    arcade initials entry.
  - `shell/palette.js` — ink `#0b0c14`, hairline `rgba(233,236,244,.12)`,
    amber `#e6c17e`, periwinkle `#9fa8e8`, rose `#d4818f`, deep `#7c88e8`,
    cream `#f3ebdd`.
  - `shell/crt.js` — scanlines + subtle vignette, disabled under
    `prefers-reduced-motion`.
- Pause (Esc), instant restart (R / tap), back to cabinet (Q / ✕).

## The catalog manifest

Every catalog entry owns one deeply frozen, JSON-serializable manifest. The
shell validates it when the entry is defined and rejects non-allowlisted keys,
accessor-backed values, and inherited properties, so a manifest is plain own
data by construction. Cabinet cards and detail routes read the same frozen
object, which is what prevents metadata drift between them.

`schemaVersion` is `1`. Every field is required except `source`.

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | number | Must be `1` |
| `slug` | string | Lowercase alphanumerics with single hyphens. Stable catalog key, and the local high-score key |
| `version` | string | `MAJOR.MINOR.PATCH`. Immutable once published |
| `title` | string | Display name |
| `summary` | string | One-line description |
| `creator` | string | Attribution |
| `runtime` | enum | `first-party-2d`, `first-party-3d`, `community-iframe` |
| `trustLevel` | enum | `trusted-first-party`, `untrusted-community` |
| `modes` | string[] | e.g. `solo`, `local-multiplayer` |
| `goal` | string | The win condition in one sentence |
| `scoreLabel` | string | What the score measures |
| `controls` | string[] | e.g. `MOVE`, `DRAG`, `FIRE` |
| `genre` | string | Catalog facet |
| `players` | string | e.g. `1`, `1–2` |
| `tags` | string[] | Catalog facets |
| `artwork` | object | `{ accent }` — a colour key from `shell/palette.js` |
| `releaseStatus` | enum | `published`, `suspended` |
| `contentNotes` | string[] | Content disclosure. May be empty |
| `madeWith` | string | The AI-made disclosure |
| `source` | string | **Optional.** HTTP(S) URL |

Two rules are enforced rather than merely documented:

- **Runtime and trust level are paired.** `community-iframe` requires
  `untrusted-community`, and `untrusted-community` requires `community-iframe`.
  Community code cannot claim first-party trust, and first-party runtimes
  cannot be marked untrusted.
- **Suspension hides the game, not the page.** A `suspended` entry stays
  resolvable so its detail screen can explain the suspension, but it cannot
  launch.

Schema changes are versioned. Raising `schemaVersion` is a migration ticket,
not an edit.

## The Legacy Rack games

### 1. PONG

Classic. Player vs CPU, first to 7. Ball angle depends on where it hits the
paddle; speed creeps up each rally. 2-player local mode (W/S vs arrows).
Touch: drag your paddle.

### 2. BREAKOUT

Paddle, ball, brick wall. 3 lives. Power-up bricks drop: wide paddle (10s),
double ball, sticky paddle (catch and aim). 5 levels, then endless with
rising speed. Touch: drag.

### 3. AIR HOCKEY

Top-down table, free 2D mallet movement (mouse/touch drag), CPU opponent,
puck with friction and wall bounce, goals at each end, first to 7. CPU
difficulty ramps after each game won.

### 4. ASTEROID DEFENDER

Missile Command-style. Asteroids fall toward a city skyline at the bottom;
click/tap anywhere to fire an interceptor that detonates at that point in a
growing blast circle; blasts chain. Limited missiles per wave, rebuilt
between waves. Lose all six city blocks and it's over. Score: asteroids
destroyed, bonus for surviving buildings and unused missiles.

### 5. GALAXY RAID

Galaga-style formation shooter. Enemies swoop in along staggered curves,
settle into a breathing formation, and peel off in dive runs that fire
aimed shots. Player ship moves horizontally (hover/drag/arrows), two shots
in the air max. Three enemy tiers (bee, butterfly, armored boss) scoring
more when hit mid-dive. 3 lives with respawn invulnerability; waves escalate
in size and dive frequency.

### 6. NEON SNAKE

Grid survival with swipe/arrow turns, timed food chains, escalating speed,
and short-lived bonus pickups. The run waits for the player's first direction
before the clock starts. Touch: swipe anywhere on the playfield.

### 7. LUNAR DESCENT

Precision lander physics across shifting moon terrain. Rotate, manage finite
fuel, read the velocity/tilt envelope, and settle on progressively narrower
pads. Touch: three held zones for rotate left, thrust, and rotate right.

### 8. MIDNIGHT RUN

Top-down endless traffic racer. Thread four lanes, build near-miss combos,
collect boost pickups, and survive rising speed and spawn pressure across
three lives. The run waits for the player's first steering input. Touch: drag
the car horizontally.

> Note: the original slot-5 game, PIXEL LIFE (BitLife-style sim, 60+ event
> table in `games/pixel-life/events.js`), is built, tested, and kept in the
> tree — swapped out of the cabinet for GALAXY RAID on 2026-07-23.

## Legacy Rack completion contract

- Shell + eight games playable with keyboard/mouse AND touch on a phone.
- `npm test` green: pure-logic tests per game (paddle/ball math, puck
  physics step, blast-chain resolution, life-event engine draws and stat
  gating).
- No console errors; runs from any static file server.
- Deployed to GitHub Pages.

These criteria remain supported throughout later platform migrations. New
compendium releases also pass the complete-game and release-proof contracts in
`GAME_ROADMAP.md` through the runtime and trust class assigned above.
