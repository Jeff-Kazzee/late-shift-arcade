# Late Shift Arcade — spec

One static website, five retro games, one cabinet shell. CRT feel, night
palette. No dependencies, no build step. Keep it simple.

## The shell (build first)

- `index.html` boots an attract screen ("LATE SHIFT ARCADE", blinking
  "INSERT COIN — coin not required"), then a game-select grid.
- Each game is an ES module implementing the cartridge interface:
  `{ id, title, blurb, init(ctx), update(dt, input), draw(ctx2d), destroy() }`.
  The shell owns the canvas, fixed-timestep loop, input, and scores. Games
  own nothing global.
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

## The games (one WAKE block each, in this order)

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

> Note: the original slot-5 game, PIXEL LIFE (BitLife-style sim, 60+ event
> table in `games/pixel-life/events.js`), is built, tested, and kept in the
> tree — swapped out of the cabinet for GALAXY RAID on 2026-07-23.

## Done means

- Shell + five games playable with keyboard/mouse AND touch on a phone.
- `npm test` green: pure-logic tests per game (paddle/ball math, puck
  physics step, blast-chain resolution, life-event engine draws and stat
  gating).
- No console errors; runs from any static file server.
- Deployed to GitHub Pages.
