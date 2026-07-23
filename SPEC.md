# Hoolio's Late Shift Arcade — spec

One static site, five games, one cabinet. Retro CRT feel, night palette,
Hoolio's deadpan voice. No dependencies, no build step.

## The shell (build first)

- `index.html` boots the cabinet: attract screen ("LATE SHIFT ARCADE",
  blinking "INSERT COIN — coin not required"), then a game-select grid.
- Every game is an ES module implementing the cartridge interface:
  `{ id, title, blurb, init(ctx), update(dt, input), draw(ctx2d), destroy() }`.
  The shell owns the canvas, the loop (fixed-timestep update, rAF draw),
  input, and score persistence. Games own nothing global.
- Shared modules:
  - `shell/input.js` — keyboard (arrows/WASD/space) + touch (tap, hold,
    swipe, on-screen buttons where a game declares them).
  - `shell/scores.js` — per-game high scores in localStorage, 3-letter
    arcade initials entry.
  - `shell/palette.js` — night palette: ink `#0b0c14`, hairline
    `rgba(233,236,244,.12)`, amber `#e6c17e`, periwinkle `#9fa8e8`, rose
    `#d4818f`, deep `#7c88e8`, cream `#f3ebdd`.
  - `shell/crt.js` — scanline + subtle vignette overlay, `prefers-reduced-
    motion` disables flicker.
- Pause (Esc / ⏸), instant restart (R / tap), back to cabinet (Q / ✕).
- Hoolio appears only on the cabinet screen and game-over cards, one dry
  line each, e.g. game over in Break Room: "The mug is fine. Back to work."

## The games (one WAKE block each, in this order)

### 1. WIRE SNAKE — snake (simplest first; proves the cartridge interface)

Grid snake. You are a workshop cable; eat connectors, grow, don't cross
yourself or the bench edges. Speed ramps every 5 connectors. Score = length.
Touch: swipe to turn. Juice: subtle screen shake on death, amber trail.

### 2. BREAK ROOM — breakout

Coffee-mug paddle, ball, brick walls of unlabeled boxes. 3 lives. Power-ups
drop from special bricks: hot refill (wide paddle, 10s), double shot (two
balls), sticky mug (catch and aim). 5 levels, then endless with rising ball
speed. Touch: drag to move.

### 3. NEST INVADERS — fixed shooter

Waves of bugs descend on the nest in formation; every wave, 2-3 peel off and
dive (Galaga-style). Player ship strafes and shoots; 3 destructible shields.
Wave counter, extra life at 10k. Touch: drag to strafe, auto-fire.

### 4. MIDNIGHT GLIDE — one-button flappy

Hoolio glides through gaps between filing cabinets. Tap/space to flap.
Parallax night office background, score per cabinet passed, medal tiers
(bronze 10 / silver 25 / gold 50). Death is instant restart — under 1s.

### 5. OWL LIFE — BitLife-style life sim (text, data-driven)

Hatch as an owlet; one AGE UP button. Each year draws 1-2 events from a
data table (`games/owl-life/events.js`): school, jobs, molting, rivals,
coffee. Stats: Wisdom, Coffee, Feathers, Savings — events shift them and
gate later events. Life ends somewhere in your 30s-60s (owl years) with an
obituary card summarizing the run. All content in Hoolio's deadpan register;
funny through understatement, never zany. 60+ events minimum; dying with
maxed Wisdom unlocks a hoot easter egg (the only "hoo" ever permitted, and
it is a typo in the obituary).

## Done means

- Shell + all five games playable, mouse/keyboard AND touch.
- `npm test` green: pure-logic tests per game (snake movement/collision,
  brick collision math, wave formation stepping, flap physics, life-event
  engine draws and stat gating).
- Lighthouse-reasonable: loads fast, no console errors, works from
  `python -m http.server` or any static host.
- Deployed to GitHub Pages; playable on a phone.
