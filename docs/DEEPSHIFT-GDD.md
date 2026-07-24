# DEEPSHIFT — Game Design Document

Status: proposed, rev 2 — day/night polarity reverted to the classic model
per owner direction, 2026-07-24 (supersedes `GAME_ROADMAP.md` §5 "Pocket
Realm: Beaconfall")
Date: 2026-07-24
Class: first-party 3D cartridge (Showcase tier)
Audience: implementation agents. This document is the build brief. Where it
conflicts with the old Pocket Realm entry, this document wins. Where it
conflicts with `SPEC.md`, `AGENTS.md`, or the shared score contract in
`GAME_ROADMAP.md`, those win and the conflict is a bug in this document.

---

## Table of contents

1. [Identity](#1-identity)
2. [Legal posture](#2-legal-posture)
3. [Modes, death, score, and boards — the honest resolution](#3-modes-death-score-and-boards)
4. [Core loop and session structure](#4-core-loop-and-session-structure)
5. [World generation](#5-world-generation)
6. [Block and material taxonomy](#6-block-and-material-taxonomy)
7. [Crafting and stations](#7-crafting-and-stations)
8. [Tools, weapons, and equipment tiers](#8-tools-weapons-and-equipment-tiers)
9. [Character progression — the Deeds system](#9-character-progression)
10. [Enemies and threat pacing](#10-enemies-and-threat-pacing)
11. [Runewire — the logic and signal system](#11-runewire)
12. [Controls, touch, and accessibility](#12-controls-touch-and-accessibility)
13. [Technical architecture](#13-technical-architecture)
14. [Persistence, saves, and version survival](#14-persistence)
15. [Cartridge contract and the run-receipt seam](#15-cartridge-contract)
16. [Multiplayer and self-hosted servers](#16-multiplayer)
17. [Phased delivery plan](#17-phased-delivery-plan)
18. [Risks and kill criteria](#18-risks-and-kill-criteria)
19. [Decisions needed from the owner](#19-decisions-needed-from-the-owner)

---

## 1. Identity

### 1.1 Name

**DEEPSHIFT** — ratified 2026-07-24; naming is closed. The pun stands on
two legs: the platform is *Late Shift* Arcade, and the game is about mine
*shafts* and working *shifts* — the deep shift is the one you work
underground, and the late shift is the one you hold at the walls after
dark. (Alternates GRAVESHIFT, OVERBURDEN, and TUSK & EMBER were considered
and declined; record in git history.)

### 1.2 Fantasy

You are an orc of the Emberdeep clans — miners, smiths, and builders whose
old clanholds fell generations ago to **the Gloom**, a rising dark that
owns the night and the deep places. Every sunset it seeps back out of the
ground with its creatures — the Hollowed, the wisps, the wardens — and
every sunrise burns them off the land again. The clans survive the way
orcs always have: work hard by daylight, raise walls that hold, and keep
the forge lit through the dark. You are a pioneer sent to reclaim a
stretch of lost clan country: break ground, build a hold, dig down through
what the Gloom keeps, and make something that lasts.

The long-term goal of a scored expedition is the **Undergate** — one of
the buried orichalcum-and-heartstone gates that once linked the clanholds,
waiting at the bottom of the world to be re-lit. Digging out its
materials, rebuilding the ring, and holding it through its charge while
the Gloom throws everything it has at you is the deed that makes an orc's
name.

### 1.3 Why orcs are not a reskin

The orc requirement shapes systems, not just textures:

- **The forge never sleeps.** There is no sleep-skip. Orcs do not hide
  from the night in a menu; they work it. Nights are survived at the
  walls, spent at the hearth smelting and running Runewire, or braved
  outside for the night-banking score bonus (§3.3). This is a genuine
  structural break from the genre default — where a bed trivializes the
  night, DEEPSHIFT makes night the second shift, so lighting and
  fortification stay load-bearing for the whole game instead of until the
  first bed. (Homeland softens this with Hearth Rest, §4.2 — time
  acceleration, never a skip.) This is also the arcade tie re-earned
  honestly: the late shift is the one you work after dark.
- **Blood Surge.** Taking damage fills a Surge meter (0–100). At full charge
  the player can trigger a 10-second surge: +30% move speed, +50% melee
  damage, knockback immunity, followed by 8 seconds of fatigue (−20% speed).
  Orcs get *stronger* when hurt — aggression is a resource, hiding is not.
- **Bone-and-hide tier zero.** The starting toolkit is butchered from
  wildlife (bone tools, hide armor), not punched from trees. The first loop
  is hunt → butcher → craft, which is an orc verb set.
- **Deeds, not XP.** Orc culture advances by named feats, not accumulation.
  Progression (§9) grants power for doing *new* things exactly once —
  structurally grind-proof, which the roadmap's kill rules demand anyway.
- **Physicality.** Orcs sprint-shoulder (a short ram that staggers enemies
  and breaks brittle blocks like gravel in one hit), carry more (36 slots vs
  a genre-typical 27), and mine 10% faster below Y=64 ("deep comfort").
- **Art and animation.** Heavy silhouettes, underslung jaw, tusks that
  visibly grow with major Deeds (cosmetic, saved per character). Idle
  animations are labor idles: knuckle cracks, tool shoulder, ember blowing.

### 1.4 Tone and art direction

- **Look:** chunky voxels, 16×16-pixel tile textures, blocky low-poly
  characters — the genre's visual convention, executed with an original
  palette and original texture set (§2). The owner's bar — "looks and feels
  just like the original Minecraft" — is met at the level of *feel*: block
  scale (1m cubes), reach, mining rhythm, first-person hands, hotbar. Every
  actual asset, name, and number is ours.
- **Palette:** the iconic moments are nocturnal — a torch-lit hold under an
  ink sky, ember light spilling from the forge door — so night still owns
  the visual identity even with the classic polarity. Deep ink skies
  (`#0b0c14`, the shell's ink), moonlit blue-greys for stone, warm ember
  oranges/ambers (`#e6c17e`) for fire, forge, and Runewire signals, cold
  violet-greys and hollow white for the Gloom and its creatures. Days are
  brief, warm, and golden — the reward color. In-game UI (DOM-rendered,
  §13.8) uses the shell palette exactly: amber highlights, periwinkle
  info, rose damage, cream text.
- **CRT identity:** the cartridge opens with the cabinet's CRT framing; the
  post-run score screen is styled as an orcish "shift report" printed on a
  green-amber terminal readout. Scanline effect honors
  `prefers-reduced-motion` and the shell's existing CRT toggle. In-world
  rendering is clean — no scanlines over gameplay.
- **Audio:** low drums, forge hiss, wind at the mine mouth, a two-note orc
  work-chant that layers as more clanmates (multiplayer) work nearby. All
  clues that come through audio also come through visuals (§12.4).
- **Fullscreen:** the cartridge requests fullscreen on launch (§15.4).

### 1.5 Design stance

Where the classic genre convention is simply good — safe days, dangerous
nights, light-driven spawning, punch-a-tree-to-empire pacing, the
first-night panic — keep it and execute it well. The originality budget is
spent deliberately and only where it makes the game ours: the orc identity
(§1.3, §9), Runewire (§11), the ranked expedition formats (§3), and the
arcade integration (§15). Cleverness that rearranges the fundamentals is
out of scope. §2 is unchanged by this stance: we still never copy
proprietary names, textures, or assets.

---

## 2. Legal posture

This is a public site; this section is normative, not advisory.

- **No Minecraft assets, names, or trade dress.** No block, item, mob,
  enchantment, or dimension name may match Minecraft's. No texture may be
  copied or traced. The creeper silhouette, the specific title-screen trade
  dress, and the term "redstone" are off-limits. The words "craft" and
  "mine" as generic English are fine; "crafting table" is not (ours is the
  **Worktable**).
- **Mechanics are not copyrightable; specific expression is.** Voxel worlds,
  mining, tool tiers, day/night survival are genre conventions used by
  dozens of shipped games (Terraria, Vintage Story, Veloren, Minetest/Luanti,
  Hytale). We stay on the safe side of expression: original names, original
  numbers, original textures, list-based crafting instead of the 3×3 shaped
  grid (§7 — also the better touch UI), binary compiled logic instead of
  0–15 decaying redstone (§11 — also the better system).
- **Marketing rule:** never describe the game as "Minecraft in the browser"
  in any platform-authored copy, store card, or social artifact. "A voxel
  survival-builder" is the phrase.
- **Engine licenses:** Three.js is MIT. Any texture/audio brought in must be
  original, CC0, or licensed with a recorded provenance file
  (`games/deepshift/art/PROVENANCE.md`), consistent with the platform's
  AI-made disclosure rules.

---

## 3. Modes, death, score, and boards

The platform requires a win/loss state and a documented score formula. An
open sandbox has neither. **The resolution: DEEPSHIFT's platform identity is
its scored expedition mode. The sandbox modes exist, are first-class, and
are honestly, permanently unranked.** No hedging: if only the sandbox
existed, DEEPSHIFT would not qualify for release under the charter, and the
delivery plan (§17) is sequenced so the scored mode ships first and the
sandbox modes are gated behind it. This is exactly the D6 decision — the
finite loop proves the engine — applied to the superseding design.

### 3.1 The mode set

| Mode | What it is | Death | Score/boards | Ships in |
| --- | --- | --- | --- | --- |
| **Shift Runs** (ranked) | Seeded, finite expeditions with an explicit win and loss. Two formats: **Dawn Run** and **Deep Run** (§3.2) | **Permadeath.** One life. Death ends the run as a loss; the failed run's score still submits (completed runs always rank ahead, per the shared score contract) | Yes — the documented formulas in §3.3. Replay-verified per P-004 | DS-1 |
| **Homeland** (survival sandbox) | A persistent 16,384×16,384 world. Full survival: enemies, hunger, death, Deeds, Runewire | Death drops carried inventory at the death site and respawns the player at their Clan Totem. Optional **Hardcore Homeland** toggle at world creation: death deletes the world save (the "you can actually die" mode for sandbox players) | **Unranked, forever.** Emits non-competitive session receipts (`ranked:false`). Never touches boards | DS-5 |
| **Forge** (creative) | Unlimited palette, flight, instant break, no enemies, no damage, full Runewire toolkit | No death | Unranked. Share artifacts only (snapshots, blueprints, §15.3) | DS-4 |
| **Peaceful toggle** | Homeland option: no hostile spawns, Bane Nights off | Fall/slag damage only | Unranked | DS-5 |

Boards never mix formats, difficulties, or versions (shared score contract).
Dawn Run and Deep Run have separate boards. Co-op runs (§16) get separate
boards from solo.

### 3.2 The two ranked formats

**Dawn Run — one day and one night, ~10 minutes.** The demo-shaped run,
and our version of the genre's single most iconic experience: the first
night.

- **Setup:** dawn of Day 1, a seeded 512×512 surface region, bone tools,
  empty hands. Day lasts 4:00, dusk 0:30, night 5:00.
- **Win (one sentence):** bank an ore-value quota of **300** at the Clan
  Cache and be alive when the sun rises.
- **Loss:** die. Surviving to dawn short of quota completes as a loss (the
  score still submits; completed runs rank ahead, per the shared contract).
- The day is the plan: wood, tools, a wall, torches, and as much ore as
  greed allows. The night is the test — and ore banked at night scores
  1.5× (§3.3), so the skill ceiling is working *through* the dark, not
  hiding from it. Fixed duration keeps it perfect for boards, daily seeds,
  and the arcade's 20-second-demo bar: a setting sun, a half-built wall,
  and a countdown to dusk are legible instantly.

**Deep Run — seven days and nights, ~40 minutes.** The flagship format.

- **Setup:** dawn of Day 1, a seeded 1,024×1,024 region, bone tools.
  Cycle: day 3:00, dusk 0:30, night 2:00 (5:30 per cycle; ~38 minutes to
  the final dawn, plus the charge).
- **Win (one sentence):** excavate, build, and activate the Undergate,
  then survive its 90-second charge against the Gloom's final assault,
  before dawn of Day 8.
- **Loss:** die (permadeath), or the Undergate core is destroyed during
  charge, or dawn of Day 8 arrives without activation.
- Days carry the surface economy (wood, food, building, expansion); the
  deep is dark whatever the clock says, so mining pushes run at any hour.
  Ambient night pressure escalates every night, and Nights 3, 5, and 7 are
  **Bane Nights** — siege waves that batter the hold's gates (§10.4). The
  full tool ladder (§8) is tuned to be completable in 7 days by a skilled
  player, with orichalcum reachable by Day 5–6.
- At each dawn, the player drafts **one of three Knacks** (§9.3) —
  roguelite progression inside the run, zero grind.

### 3.3 Score formulas (documented, versioned with the simulation)

**Dawn Run:**

```
score = 20 × bankedOreValue (day)               (units banked 06:00–18:00)
      + 30 × bankedOreValue (night)             (units banked 18:00–06:00 — the courage knob)
        [combined banking cap: 2× quota = 600 ore value]
      + 6,000 × won                             (quota ≥ 300 banked AND alive at dawn)
      + Σ threatValue of hostile kills          (cap 3,000)
      − 0                                       (no negative terms; failure is the penalty)
tie-break: faster quota completion, then fewer blocks placed, then earliest submission
```

**Deep Run:**

```
score = 12 × bankedOreValue                     (per-tier nightly caps, §3.4)
      + 4,000 × nightsSurvived                  (max 7 → 28,000)
      + 20,000 × undergateActivated
      + 10,000 × chargeSurvived (the win)
      + Σ threatValue of hostile kills          (cap 12,000)
      + min(8,000, damage absorbed by player-built defenses during Bane
             Nights and the Undergate charge)
      + 6 × secondsRemaining at win             (cap 6,000)
tie-break: faster win time, then fewer deaths of the Undergate core shield
           segments, then earliest submission
```

Ore values are in §6.4. `threatValue` per enemy is in §10.2. Per the shared
score contract: all bonuses capped, completed runs rank ahead of failed
runs, and **no repeatable zero-risk action generates points** — see §3.4.

### 3.4 Anti-grind score caps

- Banked ore value counts **only the first N units per material per night**
  (N = 40 coal, 30 copper/tin, 24 iron, 16 silver/sulfur/glowsalt, 10
  wolfram, 6 orichalcum). Mining beyond the cap still yields the material
  for crafting — it just stops scoring. Mining forever cannot win.
- Kills score `threatValue` only for enemies that spawned naturally.
  Player-lured spawns are natural; there is no spawner block in ranked
  formats, so there is no farm to build.
- Blocks placed never score (they are a tie-break *penalty* in Dawn Run).
- Defense-absorption is capped and only counts siege-phase damage (Bane
  Nights and the Undergate charge).
- The 1.5× night-banking multiplier applies inside the same per-material
  caps, never on top of them — night play raises the ceiling's *value*,
  not its size.

### 3.5 Why this is honest

The failure mode the charter guards against is shipping a toy and calling
it a game. The sequencing guarantee is the proof: DS-1 through DS-3 ship
*only* ranked formats — win, loss, score, permadeath, replay verification —
and the graybox kill rules (§18) apply to them. Forge and Homeland are
built on the proven engine afterward as retention and showpiece surface.
The catalog card lists the goal as the Deep Run goal; the manifest's
`modes` field lists all modes with ranked/unranked labels so the card never
misrepresents what counts.

---

## 4. Core loop and session structure

### 4.1 The 30-second loop

**Read the clock → choose a target (ore, wood, food, threat) → travel/dig →
extract under time pressure → haul back → convert (craft/smelt/build) →
re-read the clock.** A meaningful decision at least every 10–20 seconds is
carried by the clock: every action either races nightfall or happens under
it.

### 4.2 The day-night loop (Deep Run, ~5.5 minutes per cycle)

1. **Dawn (relief):** surface Gloomspawn burn off in the sun. Collect
   drops, assess damage, draft one Knack.
2. **Day (~3 min):** the safe shift — wood, hunting, scouting, walls,
   expansion. The deep is dark regardless of the clock, so mining pushes
   can start now and run straight through the night.
3. **Dusk horn (60s warning):** get inside or commit; light the perimeter,
   arm defenses, set Runewire traps.
4. **Night (~2 min):** choose a posture — hold the walls and earn
   threatValue, run the forge shift indoors (smelt, craft, Runewire),
   brave the surface for 1.5× night banking, or keep pushing the deep.
5. **Bane Nights (3/5/7):** siege waves batter the gates (§10.4). Then
   dawn again.

**Homeland pacing:** the cycle stretches to 20 minutes (12 day / 8 night),
and **Hearth Rest** is available: standing inside a sealed, lit shelter
within your Great Hearth's radius with no hostiles nearby runs time at 4×
speed. It is acceleration, never a skip — damage, a breach, or a Bane
Night interrupts it instantly. This is the honest middle between "nights
matter" and "nights are a chore," and it preserves §1.3's no-sleep-skip
rule.

### 4.3 Session structure

**At 5 minutes** — a guest has finished the interactive tutorial ("First
Shift": chop wood, craft a bone pick into a stone pick, raise a wall and
place a torch before a scripted nightfall) or is mid-Dawn-Run racing the
dusk horn. They can state the goal ("bank ore and live until morning") —
the 60%-can-state-the-goal kill rule is tested against exactly this
minute.

**At 1 hour** — a player has finished one Deep Run (win or death around
night 4–5 on a first attempt), seen the shift-report score screen, shared a
seed or postcard, and started a second run with a different strategy (rush
iron vs. fortify early). Replay driver: seeded variation + Knack drafts +
board position.

**At 20 hours** — the player has won Deep Runs on multiple seeds, unlocked
the cosmetic tusk/warpaint Deeds, and lives mostly in Homeland: a fortified
clanhold, a Runewire-automated smelting hall, a first logic computer from
the in-game Runewire primer (§11.9), and Forge blueprints shared as
artifacts. The 20-hour player is the person the logic system (§11) exists
for — they are the one who stays for years.

---

## 5. World generation

### 5.1 Dimensions and coordinates

- Block = 1m cube. Y up. World height **256** (Y 0–255). Sea level Y=132.
  Surface band Y 120–180. Bedrock-equivalent (**Worldbone**, unbreakable)
  at Y 0–2 with noise dithering.
- **Shift Runs:** finite bounded regions — Dawn Run 512×512, Deep Run
  1,024×1,024 (32×32 chunks of 32³) — ringed by an impassable **Wardwall**
  (visual: a curtain of amber hearth-light). Finite regions are a *feature*
  for ranked play: bounded save size, bounded verification cost, fair seeds.
- **Homeland:** bounded 16,384×16,384 with a world border. Not infinite —
  honest browser constraint (IndexedDB quotas, float precision, save
  bounds) and 268 km² is far beyond any realistic build. Only
  generated-and-visited chunks are persisted; untouched chunks regenerate
  from seed. Origin-rebased rendering (§13.4) keeps precision safe.

### 5.2 Determinism and seeds

- Seed = 64-bit unsigned. Displayed and enterable as 16 hex chars.
- All generation derives from `xxhash64(seed, chunkX, chunkZ, stageId)` —
  no shared sequential RNG, so any chunk generates identically in isolation
  and in any order. This is mandatory for workers and multiplayer.
- Noise: hand-rolled value noise + 3-octave domain-warped fBm, integer
  lattice, fixed-point where cheap. **No `Math.sin/cos/pow` in generation
  or simulation** — those are implementation-defined per browser; ship our
  own polynomial approximations (§13.2). JS `+ − × ÷ sqrt` are IEEE-754
  deterministic and safe.
- Ranked daily seeds are published with exact game versions (P-009 pattern)
  and validated by an automated solvability sweep: generator asserts quota
  ore within reach and a viable shelter site within 60m of spawn.

### 5.3 Pipeline (per chunk column, in a worker)

1. **Continent/height:** warped fBm → surface heightmap.
2. **Biome:** temperature × moisture grid (two low-frequency noises),
   blended over 8-block borders.
3. **Strata:** fieldstone (surface–Y100) → slate (Y60–110) → basalt
   (Y25–70) → marrowstone (Y3–35), noise-jittered boundaries.
4. **Caves:** two systems — worm caves (3D ridged-noise tunnels, radius
   2–5) and cheese caverns (3D noise threshold, Y<80, some flooded with
   water or slag). Cave entrances guaranteed: ≥1 surface opening per
   96×96 area.
5. **Ores:** vein placement by depth table (§6.4), Poisson-disc within
   stratum, `stageId`-hashed.
6. **Decoration:** trees, mirecap groves, glowsalt crystals, wildlife spawn
   points, ruins (small orc watchposts with a loot chest, ≤1 per 128×128).

### 5.4 Biomes (launch set: 4 surface + underground strata)

| Biome | Terrain | Wood | Distinct rule |
| --- | --- | --- | --- |
| **Dusklands** | rolling plains, scattered gnarlpine | Gnarlpine | Baseline. Ashboar herds (food/hide) |
| **Gnarlwood** | dense forest, canopy shade | Gnarlpine + Bloodbark | Canopy keeps floor pockets below light 4 — Gloomspawn persist there in daylight, so deep-forest wood runs are never fully safe |
| **Ashfen** | swamp, shallow water, mist | Duskwillow + Mirecap | Sporelings; mirecap is the only wood that grows underground when replanted |
| **Cinder Steppe** | badlands, exposed slag flows, little wood | Ironroot (sparse) | Surface slag pools; sulfur near surface; Slaghounds hunt in packs at dusk; +25% ore density |

Biomes change resource and enemy *rules*, not just tint — the G-009A bar
("strategic choices, not visuals") applies. Deep Run regions always contain
≥2 biomes; the seed validator enforces it.

---

## 6. Block and material taxonomy

Complete launch registry. IDs are namespaced strings (`ds:slate`) — string
IDs are what saves persist (§14.3). Hardness drives break time (§8.1);
HL = harvest level required.

### 6.1 Soils, stone, and world blocks

| Block | Hardness | HL | Notes |
| --- | --- | --- | --- |
| ds:dirt | 0.5 | 0 | shovel class |
| ds:nightgrass | 0.6 | 0 | dirt with blue-grey turf; spreads at night |
| ds:sand | 0.5 | 0 | gravity-affected |
| ds:gravel | 0.6 | 0 | gravity; sprint-shoulder breaks instantly; 10% flint |
| ds:clay | 0.6 | 0 | Ashfen shores → bricks |
| ds:fieldstone | 1.5 | 0 | surface stone; drops rubble → re-craft to fieldstone |
| ds:slate | 1.8 | 1 | mid stratum; smooth dark finish |
| ds:basalt | 3.0 | 2 | deep stratum; columnar texture |
| ds:marrowstone | 4.0 | 3 | deepest stratum; pale, bone-veined |
| ds:vitrock | 30 | 4 | glassy volcanic; forms where water meets slag; blast-resistant |
| ds:slag (fluid) | — | — | lava-equivalent; light 15, 3 dmg/tick contact |
| ds:water (fluid) | — | — | static in DS-1, deterministic cellular flow from DS-5 |
| ds:worldbone | ∞ | — | unbreakable floor |
| ds:wardwall | ∞ | — | ranked-region border |

### 6.2 Woods (5 species; each has log, plank, stair, slab, fence, door variants)

| Species | Biome | Plank color | Mechanical identity |
| --- | --- | --- | --- |
| **Gnarlpine** | Dusklands/Gnarlwood | grey-brown | baseline; fastest-growing sapling (3 min) |
| **Bloodbark** | Gnarlwood | oxblood red | +50% burn time as fuel; drops resin (torch ingredient) |
| **Duskwillow** | Ashfen | silver-blue | planks float (buildable rafts later); rot-proof in water |
| **Ironroot** | Cinder Steppe | near-black | hardness 3.0 (vs 2.0), fire-immune; the siege wood — Nightwardens batter it at half rate |
| **Mirecap** | Ashfen groves | fungal ochre | grows underground on dirt at light <8 — renewable timber with no surface trip, the deep-base wood; slightly weaker (hardness 1.6) |

Logs: hardness 2.0 (Ironroot 3.0, Mirecap 1.6), HL 0, axe class.

### 6.3 Functional and crafted blocks

| Block | Recipe (list-crafting, §7) | Notes |
| --- | --- | --- |
| ds:torch | 1 stick + 1 resin (or 1 coal) → 4 | light 13 |
| ds:worktable | 4 planks + 2 rubble | unlocks tool recipes |
| ds:hearth | 8 fieldstone + 1 clay | smelting; light 14 when lit |
| ds:anvil | 5 iron ingots | metal tools T4+; repair |
| ds:runebench | 4 slate + 2 silver ingots + 1 glowsalt | logic components (§11) |
| ds:clan_cache | 8 planks + 1 iron ingot | banking point for ranked quota; storage 54 slots |
| ds:clan_totem | 4 ironroot logs + 1 bone totem carving | Homeland respawn point |
| ds:barricade | 3 planks | HP-bearing block (40 HP), the thing Nightwardens batter |
| ds:stone_wall / brick / slab / stair sets | standard conversions | building vocabulary |
| ds:glass ("duskglass") | smelt sand | semi-transparent, blue tint |
| ds:ladder, ds:scaffold, ds:rope_anchor | wood/fiber | traversal |
| ds:spike_trap | 4 bone + 2 iron nails | 6 dmg + brief slow; counts toward defense-absorb score |
| ds:undergate_frame | 6 orichalcum ingots + 2 marrowstone brick | 21 needed for the gate ring |
| ds:undergate_core | 1 heartstone + 4 orichalcum | the win object; 200 HP during charge |
| ds:heartstone | found: 1–2 per Deep Run region, Y<15, HL 5 | the endgame keystone |

Plus Runewire components (§11.3) and decorative sets (banners, hide rugs,
bone chandeliers — Forge/Homeland only, no mechanics pretending otherwise,
per the G-009 acceptance rule).

### 6.4 Ores — the full progression

| Ore | Y range | Vein size | Frequency (veins/chunk col.) | HL to mine | Smelts to | Ore value (score) |
| --- | --- | --- | --- | --- | --- | --- |
| **Coal** | 40–200 | 6–16 | 5.0 | 0 | — (fuel: 8 smelts) | 2 |
| **Copper** | 80–160 | 4–10 | 3.2 | 1 | copper ingot | 5 |
| **Tin** | 70–140 | 3–8 | 2.4 | 1 | tin ingot | 6 |
| **Iron** | 20–110 | 3–8 | 2.6 | 2 | iron ingot | 12 |
| **Silver** | 10–70 | 2–6 | 1.4 | 2 | silver ingot (Runewire conductor) | 18 |
| **Glowsalt** | 30–90 (cave walls) | 2–5 | 1.2 | 2 | — (drops dust; light 9 as placed crystal) | 8 |
| **Sulfur** | 10–60 (near slag) | 3–7 | 1.0 | 3 | — (blast charges, DS-5) | 10 |
| **Wolfram** | 5–40 | 2–5 | 0.8 | 3 | wolfram ingot (needs hearth + bellows heat, §7.3) | 30 |
| **Orichalcum** | 1–20 | 1–3 | 0.35 | 4 | orichalcum ingot (anvil-folded, §7.3) | 60 |

Alloy: **Bronze** = 2 copper + 1 tin at the hearth → 2 bronze ingots. The
copper→bronze step teaches alloying early so wolfram/orichalcum's special
processing (§7.3) isn't a surprise.

Design note: silver's role as the logic conductor puts the Runewire economy
inside the mining loop — builders mine, miners build.

---

## 7. Crafting and stations

### 7.1 List-based crafting (decision)

Crafting is **recipe-list based**, not shaped-grid: open a station, see the
recipe list (unknowns shown as silhouettes with "?" until first ingredient
is discovered), tap/click to craft, hold for repeat. Rationale:

1. **Touch-first.** Dragging items into a 3×3 grid is exactly the
   "compromised second control scheme" the kill rules ban. List-crafting is
   one tap on every input device.
2. **Legally cleaner** (§2).
3. **Discovery stays**: recipes unlock visibly as materials are first
   acquired, which preserves the "what can I make now?" dopamine without a
   wiki. Recommended precedent: Terraria proved this model at scale.

### 7.2 Stations

| Station | Grants | Notes |
| --- | --- | --- |
| **Hands** (no station) | torches, sticks, planks, bone tools, barricade, campfire | survival floor |
| **Worktable** | stone/copper/bronze tools, wood sets, ladders, clan cache, traps | the hub |
| **Hearth** | smelting, bronze alloying, glass, cooking | fuel-driven; smelt time 5s/item, coal = 8 items, log = 1, bloodbark log = 1.5 |
| **Hearth + Bellows** | wolfram smelting (12s/item) | bellows is a Runewire-actuatable block — first automation hook |
| **Anvil** | iron/wolfram/orichalcum tools, armor plating, tool repair (costs 1 ingot, restores 50%) | |
| **Runebench** | all §11 components | requires silver economy |

### 7.3 Progression-critical recipes (exact)

```
bone pick        = 2 bone + 1 stick                 (hands)
stone pick       = 3 fieldstone rubble + 2 sticks   (worktable)
copper pick      = 3 copper ingots + 2 sticks       (worktable)
bronze pick      = 3 bronze ingots + 2 sticks       (worktable)
iron pick        = 3 iron ingots + 2 sticks         (anvil)
wolfram pick     = 3 wolfram ingots + 1 iron pick   (anvil; consumes the iron pick as the haft)
orichalcum pick  = 3 orichalcum + 1 wolfram pick    (anvil)
```

(Axes/shovels/blades follow the same ingot counts: axe 3, shovel 1, blade
2 + 1 hilt.) Top-tier tools consuming the previous tier is deliberate: it
keeps earlier metals relevant and makes the ladder feel like *forging up*,
not replacing.

---

## 8. Tools, weapons, and equipment tiers

### 8.1 Break-time model

```
breakSeconds = 1.5 × hardness / speedMult     if tool class correct AND tool HL ≥ block HL
             = 5.0 × hardness                  if wrong class but HL sufficient (hand counts as HL 0, speed 1.0)
             = ∞ (no drop, no progress bar fill past 20%)  if HL insufficient
```

Worked examples: fieldstone with bone pick = 1.5×1.5/1.5 = **1.5s**; copper
ore with stone pick = 1.5×3.0/2.5 = **1.8s**; orichalcum ore with wolfram
pick = 1.5×6.0/8.0 = **1.13s**; iron ore by hand = never.

### 8.2 Tool tiers (pick/axe/shovel share these; blade uses damage column)

| Tier | speedMult | Durability | Harvest level | Blade damage | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| **Bone** (T0) | 1.5× | 60 | 0 | 3 | from wildlife; craftable in the first 90 seconds |
| **Fieldstone** (T1) | 2.5× | 130 | 1 | 4 | |
| **Copper** (T2) | 3.5× | 190 | 2 | 4.5 | fast to reach, wears fast |
| **Bronze** (T3) | 4.5× | 380 | 2 | 5 | same HL as copper — better *performance*, the alloy lesson |
| **Iron** (T4) | 6.0× | 640 | 3 | 6.5 | the workhorse |
| **Wolfram** (T5) | 8.0× | 1,100 | 4 | 8 | heavy: −5% move speed while held |
| **Orichalcum** (T6) | 10.0× | 1,900 | 5 | 10 | spends no durability on HL≤1 blocks; faint amber glow (light 5) |

Other equipment: **club/blade** (melee), **hunting bow** (bone + sinew;
12 arrows craftable from flint), **sprint-shoulder** (innate, 4 dmg + 
stagger, 5s cooldown), **shield** (planks + hide; blocks 70% frontal,
degrades).

### 8.3 Armor

Damage reduction = `armor / (armor + 20)` (smooth curve, no immunity).

| Set | Total armor | Reduction | Recipe basis | Extra |
| --- | ---: | ---: | --- | --- |
| Hide | 4 | 17% | 8 ashboar hide | silent movement (wildlife flees later) |
| Bone-lacquer | 6 | 23% | 10 bone + 4 hide | +10 Blood Surge charge rate |
| Copper | 8 | 29% | 12 copper ingots | |
| Bronze | 11 | 35% | 12 bronze | |
| Iron | 14 | 41% | 14 iron | |
| Wolfram | 18 | 47% | 14 wolfram | knockback −50%, −8% move speed |
| Orichalcum | 22 | 52% | 14 orichalcum | Gloomward: hostiles notice you at 70% of normal range |

Player: base HP **24** (orc-thick; genre baseline is 20), regen 1 HP/4s
when Meat meter >60% (Homeland) or always in Shift Runs above 25% HP
(no hunger in ranked formats — the clock is the pressure, hunger would be
noise; decision per §4.1).

---

## 9. Character progression

The roadmap bans grind-based wins. DEEPSHIFT's answer is structural: **all
progression comes from Deeds — named, non-repeatable feats.** There is no
XP bar, no level, nothing that accumulates from repeating an action.

### 9.1 Deeds

A Deed is a one-time achievement detected from simulation events. Examples
from the launch list of **40** (full list lives in
`games/deepshift/design/deeds.md` as a build artifact):

| Deed | Trigger | Grant |
| --- | --- | --- |
| First Blood | first hostile kill | 1 Mark |
| Bonesmith | craft any bone tool | 1 Mark |
| The Alloy Lesson | smelt bronze | 1 Mark |
| Delver 64 / 32 / 8 | reach depth Y | 1 Mark each |
| Nightwalker | survive a full night outdoors with no shelter | 2 Marks |
| Held the Line | Bane Night repelled with zero barricade losses | 2 Marks |
| Deepshift | mine orichalcum | 2 Marks + tusk cosmetic |
| Gatewright | activate an Undergate | 3 Marks + warpaint cosmetic |
| First Spark | power any Runewire circuit | 1 Mark |
| The Thinking Stone | build a working Runewire latch (detected pattern) | 2 Marks |

### 9.2 Knacks (what Marks buy)

Marks are spent on **Knacks** — a flat tree of 24 perks, each purchasable
once, costs 1–3 Marks. No Knack is a straight damage/HP percentage larger
than 15%, and the win condition is never gated on any Knack.

Sample Knacks: `Thick Skull` (+4 HP), `Deep Lungs` (+50% breath),
`Ember Hands` (smelt speed +20%), `Longstride` (+8% move), `Surge Discipline`
(Blood Surge fatigue removed), `Packmule` (+6 inventory slots),
`Cat's Landing` (fall damage −50%), `Vein Sense` (ores within 8 blocks
shimmer faintly for 5s after a sprint-shoulder — an active, skill-timed
scan, not a wallhack).

### 9.3 Where progression lives per mode

- **Shift Runs:** Deeds/Knacks reset every run. At each dawn the player
  drafts **1 of 3 offered Knacks** (seeded offer). Within a run, power
  comes from the tool ladder + up to 6 drafted Knacks. Boards therefore
  compare skill, never account age. Meta-progression from ranked play is
  **cosmetic and informational only**: tusk stages, warpaints, banner
  sigils, and unlocked *starting loadout variants* that are
  score-equivalent (e.g., "start with 8 torches instead of a bone club").
- **Homeland:** Deeds/Marks persist per world. All 24 Knacks reachable in
  ~15 hours of varied play; then progression is entirely in what you build.
- **Why it never becomes a grind:** every source of power is finite and
  non-repeatable; repetition yields materials (capped for score) but never
  character power. The 20-hour retention hook is Runewire and building,
  not a number going up.

---

## 10. Enemies and threat pacing

### 10.1 Spawn rules

**Light level drives spawning.** A hostile can spawn only in a cell with
light <4, on an opaque block, more than 24m from any player. Placing
light is therefore a genuine building decision, not decoration: a torch
(light 13) suppresses spawns across its ~9-block falloff, and auditing a
base's perimeter and interior lighting is real gameplay for the entire
run. This is the classic model, kept on purpose (§1.5).

- **Surface, day:** the sun channel is 15 — no hostile spawns anywhere the
  sky reaches. Wildlife roams (Ashboar herds; the hunting window).
  Gloomspawn caught in direct sunlight burn (2 dmg/s, then disintegrate) —
  the classic morning relief, in our own fiction. Exception: canopy and
  overhang pockets below light 4 stay spawn-capable all day (the Gnarlwood
  rule, §5.4).
- **Surface, night:** ambient light falls to 3 (moon-phase modulated) —
  everywhere unlit becomes spawn-legal. Ambient density scales by night
  number in ranked formats (§10.4).
- **Underground (always):** darkness is permanent below the surface, so
  caves are equally dangerous at noon and midnight. Same light <4 rule.
- **Caps:** 20 hostiles per player "province" (4×4×4 chunks); despawn
  beyond 48m after 30s without player contact.
- **Dusk horn:** 60 seconds before nightfall, a horn sounds (with the
  screen-edge visual pulse, §12.4).
- **Bane Nights (Shift Runs + optional Homeland toggle):** scripted siege
  waves spawn at the hold perimeter on Nights 3/5/7, per §10.4, on top of
  ambient spawns.

### 10.2 Roster (launch: 9 + boss)

| Enemy | HP | Damage | Speed | Habitat | Behavior | threatValue |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| **Ashboar** | 16 | 3 (charge) | fast | surface day | neutral wildlife; charges when hurt; drops meat/hide/bone — the day-shift hunting target | 40 |
| **Duskmoth** | 6 | 0 | flying | surface night | harmless; drops sinew; light-seeking (torch traps work) | 10 |
| **Hollowed** | 20 | 4 | walk | surface night, light <4 | a gloom-taken orc husk; melee; burns in direct sunlight; the baseline night pressure | 100 |
| **Gloomwisp** | 12 | 3 ranged | slow drift | surface night; dark pockets by day | fires gloom darts every 2.5s at 16m; takes 1 dmg/s in light ≥12 and burns instantly in direct sun — lure it over your torchline | 120 |
| **Hollow Miner** | 20 | 4 | walk | caves, light <4 | the cave-strain of the Hollowed; melee; *mines toward noise* — 1 block/6s through soil/fieldstone only (never player-placed blocks) | 150 |
| **Sporeling** | 8 | 2 + poison (1/s, 5s) | slow | Ashfen, wet caves | bursts on death: spore cloud 3m | 100 |
| **Slaghound** | 14 | 3 | fast | Cinder Steppe dusk/night, deep slag shores | packs of 3–5; flanking; fears (won't cross) glowsalt light | 130 |
| **Vitrock Lurker** | 30 | 6 | ambush | Y<40 near vitrock | camouflaged as a vitrock block until approach <3m | 300 |
| **Nightwarden** | 40 | 7 melee; 12 vs barricades | slow siege | Bane Nights only | walks to the hold, batters barricades/doors (Ironroot at half rate); armored: ranged damage −50%; collapses to slag at sunrise | 350 |
| **Hollow Tyrant** (boss) | 400 | 9 melee / 6 AoE slam | phase-based | final Undergate charge | 3 phases: summons wisps → slam waves (dodge via terrain) → exposed-core windows after each slam | 3,000 |

All enemy logic is pure simulation (utility-scored state machines, seeded),
testable headless per the release-proof contract. Pathfinding: hierarchical
A* on a per-province nav-cache invalidated by block edits, budgeted at 2ms
per sim tick — enemies beyond the budget defer a tick (deterministic
ordering by entity ID).

### 10.3 The block-breaking decision

Only **Nightwardens** damage blocks, and only player-placed
*barricade-class* blocks (barricades, doors, hatches) — never terrain,
never walls. Rationale: full terrain destruction by mobs makes building
feel futile (the heart of the game is building); zero destruction makes
Bane Nights trivially cheesable by one dirt wall. Attacking only the
"gate" blocks makes the player design real fortifications: walls funnel,
gates are the contested point, Runewire traps cover the gap. Cheese check
in graybox: if players just entomb themselves in raw stone with no
entrance, the siege ends but scores zero defense-absorb and no kills —
surviving by turtling is legal but never optimal. On ordinary (non-Bane)
nights no enemy damages any block, so ambient nights pressure the player
outdoors and in the caves, not the architecture.

### 10.4 Threat pacing (Deep Run nights)

Ambient surface spawn density scales ×(1 + 0.25 × (night − 1)). On top of
that, Bane Nights bring scripted sieges to the hold perimeter:

| Night | Ambient character | Event / new pressure |
| ---: | --- | --- |
| 1 | a few Hollowed, one Gloomwisp | learn: torches and one wall are enough — barely |
| 2 | denser Hollowed; wisps drift closer | learn: the perimeter needs finishing |
| 3 | ambient | **Bane Night I:** 2 Nightwardens + 4 wisps — learn: the gate is the target |
| 4 | ambient + Slaghound packs (biome-driven) | fast flankers — walls must close |
| 5 | ambient | **Bane Night II:** 3 Nightwardens + hounds + wisps — multi-side pressure |
| 6 | ambient + a Vitrock Lurker infiltrator (spawns *inside* unlit rooms) | interior lighting audit |
| 7 | ambient | **Bane Night III** — or, once the player triggers the charge, the finale: the Hollow Tyrant + continuous adds |

Difficulty setting (Shift Runs): one global **Shift Difficulty** —
*Standard* and *Ironclad* (+40% enemy HP, +1 Nightwarden per siege wave,
quota +25%). Separate boards per difficulty, never mixed (shared score
contract). Homeland: Peaceful / Standard / Ironclad / Hardcore-world
toggle.

---

## 11. Runewire — the logic and signal system

The owner's bar: people build computers inside Minecraft; that must be
possible here. Runewire is designed to be **strictly better as a computing
substrate** than the genre baseline: deterministic by construction, no
update-order bugs, no signal-strength decay, and it scales because circuits
compile to a gate graph instead of being simulated block-by-block.

Fiction: orc rune-smithing — silver channels ("emberwire") carrying forge-
spark, carved idols that gate it. Signal states render as ember-orange
(on) vs cold blue-grey (off), plus a shape change (raised vs recessed rune)
for color-independence (§12.4).

### 11.1 Signal model (decisions)

- **Binary signals.** A net is ON or OFF. No 0–15 analog strength, no
  distance decay. Rationale: determinism and performance (a net is one
  boolean after compilation, wire length is free), a cleaner mental model
  for learners, a cleaner legal distance from redstone's expression, and
  computational universality needs nothing more. Analog richness is
  provided by explicit counter/latch components rather than wire physics.
- **Wired-OR nets.** All emberwire connected (6-adjacency, plus explicit
  Bridge Brace crossings) forms one **net**. A net is ON iff at least one
  driver on it is ON. Wire is passive; only components drive.
- **Synchronous two-phase tick.** Logic ticks at **10 Hz** (every 2nd sim
  tick). Phase A: every component computes its next output from the
  *previous* tick's net states. Phase B: all outputs commit; nets
  re-evaluate. Consequence: **evaluation order can never matter.** Identical
  circuits behave identically everywhere, forever — on any client, any
  server, any replay. A self-feeding inverter is a clean period-2 clock,
  not undefined behavior.
- **Component delay:** every active component has exactly 1 logic tick
  (100ms) of latency unless stated. Wire has zero.

### 11.2 Determinism guarantees (normative)

1. Same blocks + same inputs + same tick ⇒ same outputs, on every platform.
2. No randomness anywhere in Runewire.
3. Saving and loading mid-computation is exact: component states (latch
   bits, delay pipelines, counter values) serialize with the world (§14).
4. Chunk load/unload does not perturb logic: circuits in unloaded chunks
   are **frozen** (not ticked), and the freeze/thaw boundary is the
   province (§11.6), never a chunk seam through a circuit's middle unless
   the circuit itself spans provinces — which the UI warns about at
   placement time ("this circuit spans provinces; it will only run when
   both are loaded").

### 11.3 Component roster (launch: 16)

All crafted at the Runebench. `Si` = silver ingot, `Gd` = glowsalt dust.

| Component | Recipe | Behavior |
| --- | --- | --- |
| **Emberwire** | 1 Si + 1 Gd → 8 | passive conductor; attaches to any solid face; auto-joins adjacent wire |
| **Bridge Brace** | 2 wire + 1 slate | two independent crossing paths in one block |
| **Sparkstone** | 1 Si + 1 coal | constant ON driver |
| **Toggle Idol** | 1 bone + 1 Si | lever; drives ON/OFF on interact |
| **Stud** | 1 fieldstone + 1 Si | button; ON for 5 logic ticks (0.5s) |
| **Weight Plate** | 2 slate + 1 Si | ON while any entity stands on it |
| **Dusk Eye** | 1 duskglass + 2 Gd | ON from dusk to dawn — lamps and defenses arm themselves at nightfall |
| **Ore Eye** | 1 duskglass + 1 Si | ON while the block it faces is non-air (block sensor) |
| **Growl Gate** | 2 Si + 1 basalt | **inverter**: output = NOT(input net), 1 tick |
| **Delay Totem** | 1 Si + 1 gnarlpine log | output = input delayed N ticks, N configurable 1–8 by interact |
| **Ward Latch** | 3 Si + 1 marrowstone | SR latch: SET input, RESET input, stored Q output; survives save/load |
| **Pulse Fang** | 2 Si + 1 bone | rising edge in → exactly 1 tick ON out |
| **Tally Stone** | 4 Si + 1 slate | 4-bit counter: count-up input, reset input, 4 output faces (bits); overflow face pulses on wrap |
| **Glyph Lamp** | 2 duskglass + 2 Gd + 1 Si | display: 4 input faces read as a nibble, renders hex glyph 0–F on its face; also emits light 10 when any input ON |
| **Ember Lamp** | 1 duskglass + 1 Gd | light 14 while driven |
| **Alarm Horn** | 1 bone + 1 copper ingot | sound + visible shockwave ring while driven (deaf-accessible) |

**Actuated blocks** (targets, not components — driven by an adjacent wire
net): Rune Door / Rune Hatch / Rune Gate (open while driven), Bellows
(powers hearth to wolfram heat), Spike Trap (armed while driven), Hopper
Chute (item transfer, DS-8), **Ram** (piston-equivalent block mover,
DS-8 — deliberately deferred; moving blocks invalidate meshes and nets and
are the single most expensive feature in the genre; the computing story
does not need them).

### 11.4 Proof of computational universality

Claim: Runewire is Turing-complete in the bounded-memory sense (equivalent
to any physical computer; a strict Turing machine needs unbounded tape,
which no finite world provides — the same caveat applies to redstone).

1. **NOR is available.** Wired-OR (free, on nets) into a Growl Gate
   (inverter) is exactly NOR: `out = NOT(a OR b)`. NOR is functionally
   complete (Sheffer 1913 dual) — every combinational function is
   buildable. AND = NOR(NOT a, NOT b); XOR from 4 NORs + inverters.
2. **Sequential logic.** Two cross-coupled Growl Gates form an SR latch
   from first principles (the Ward Latch is a convenience, not a
   requirement). A gated D flip-flop = 4 gates + a Pulse Fang clock edge.
   The synchronous two-phase tick makes flip-flop timing *reliable by
   construction* — no glitch races, because all gates sample the same
   previous-tick state.
3. **Memory.** An N-bit register = N D flip-flops. RAM = address decoder
   (combinational) + registers + output multiplexer. A 16×8-bit RAM is
   ≈2,600 gate-equivalents.
4. **A machine.** Registers + ALU (ripple-carry adder: 4-bit = 36 gates)
   + program counter (Tally Stones) + instruction decode = a von Neumann
   machine. A minimal 4-bit CPU is ~10–14k gates — inside one province's
   evaluation budget (§11.6).
5. **Executable proof, in CI.** DS-4 acceptance includes a headless fixture
   that loads a serialized blueprint of (a) a NOR gate truth-table rig,
   (b) a D flip-flop, (c) a 4-bit adder, and (d) a 4-bit programmable
   counter running an 8-instruction program — and asserts exact outputs at
   exact ticks. Universality is not a marketing claim; it is a regression
   test.

### 11.5 Compilation: why huge builds stay fast

Naive per-block simulation dies at scale. Runewire never simulates blocks.

- **Net-list extraction.** When wire/components change, the affected
  region recompiles: contiguous wire collapses into a single **net node**;
  components become **gate nodes** with input-net and output-net edges.
  A 10,000-block wire run is *one boolean* at runtime. Compilation is
  incremental (only the touched net(s) rebuild) and runs in the sim worker,
  budgeted at 3ms/edit; oversized single edits (paste operations in Forge)
  queue and compile across frames with a visible "linking…" shimmer.
- **Event-driven evaluation.** Per logic tick, only gates whose input nets
  changed last tick are evaluated (a dirty queue). A quiescent circuit —
  however enormous — costs **zero**. A 100k-gate memory bank costs only
  the gates actually switching.
- **Memory layout:** structure-of-arrays typed arrays — per gate: type
  (u8), state bits (u8), input net ids (2×u32), output net id (u32),
  config (u8) ⇒ ~16 bytes/gate. 100k gates ≈ 1.6 MB. Net states: 1 bit
  each in a Uint32Array bitset.

### 11.6 The performance budget and deterministic throttling

- Budget: **50,000 gate evaluations per logic tick per province** (a
  province = 4×4×4 chunks = 128³ m). Median frame cost at full budget on
  the reference low-spec device: <2ms in the sim worker.
- If a province exceeds its budget on a tick, its **logic clock halves**
  (evaluates every 2nd logic tick), halving again down to a floor of
  1/8 rate, recovering when three consecutive ticks come in under 60%
  budget. This is **deterministic** — a pure function of gate-evaluation
  counts, never wall-clock — so replays and multiplayer stay bit-exact.
  Overdriven provinces show an amber "OVERDRIVEN ×2/×4/×8" badge on their
  components; builders get a Runebench diagnostic listing eval counts per
  circuit. Slow is honest; nondeterministic is forbidden.
- Hard caps (fail-closed at placement with a clear message): 4,096 wire
  blocks per net, 250,000 gates per province, 2,000,000 gates per world.

### 11.7 Interaction with world systems

- Component drops when its support block breaks (like torches).
- Slag/fire destroys wire (it is silver — it melts). Vitrock housings are
  the fireproofing strategy.
- Nightwardens do not damage Runewire directly, but they batter the doors
  it actuates — defense circuits are load-bearing gameplay in Shift Runs
  (auto-closing gates on Weight Plates, Dusk Eye auto-sealing and
  lamp-lighting at nightfall, alarm horns on perimeter plates: all
  buildable by Night 3 with ~20 silver).
- In ranked formats Runewire is available but the silver budget keeps
  circuits tactical (door logic, traps, alarms), not industrial. The
  computer-building audience lives in Homeland/Forge, which is where the
  caps are sized for them.

### 11.8 What is deliberately *not* in v1

Item logistics (Hopper Chutes), block movers (Rams), wireless signals, and
analog comparators are DS-8 candidates, in that order. Each is listed with
its cost in §17. Computers need none of them.

### 11.9 The Runewire Primer

An in-game, DOM-rendered illustrated manual (unlocked by the First Spark
Deed): 12 guided pages from "light a lamp" to "build a latch" to "the
counting machine," each with a ghost-blueprint the player can toggle as an
overlay hologram and build against. The primer is the on-ramp that turns
survival players into the logic builders who stay for years. Ships in DS-4.

---

## 12. Controls, touch, and accessibility

### 12.1 Keyboard/mouse (desktop default)

WASD move, Space jump, Shift sprint (double-tap W also sprints), Ctrl
crouch/edge-guard, mouse look, LMB mine/attack (hold), RMB place/use, E
inventory, Q drop, 1–9/wheel hotbar, F sprint-shoulder, Tab Deeds/Knacks,
Esc pause (pauses solo sim; opens menu; shell contract per G-007). Every
binding remappable in the DOM settings pane; conflicts flagged inline.

### 12.2 Touch (first-class, not a port)

Layout proven in the mandatory one-minute phone graybox (G-008 rule
inherited by DS-1 acceptance — DS-1 does not proceed past one resource and
one enemy until this passes):

- **Left thumb:** floating virtual stick (appears where the thumb lands,
  left 40% of screen). Flick-up on the stick = jump; hold stick edge =
  sprint.
- **Right thumb:** drag anywhere right 60% = camera. Tap = context action
  on the reticle target (attack enemy / use door / place against face when
  build mode armed).
- **Mining:** press-and-hold on the reticle target starts breaking with a
  radial progress ring; releasing cancels. Reticle sticky-assist: ±2° of
  angular snap to the block face being broken so camera micro-jitter
  doesn't reset progress.
- **Build mode toggle** (hammer button, booleans the right-thumb tap to
  *place*): shows a green ghost-preview of the placement cell before
  commit; drag along a face paints a run of blocks (max 8/gesture) — this
  is where touch *beats* mouse for building.
- **Buttons (all ≥64px, thumb-arc placed):** jump (redundant), shoulder,
  hotbar (5 visible + swipe for 9), inventory. Inventory/crafting opens as
  a full-screen DOM sheet and **pauses the solo simulation** (roadmap
  touch-proof pattern), so no simultaneous-gesture demand exists anywhere.
- No gesture requires more than two concurrent touches. Verified on a
  375×812 viewport.

### 12.3 Controller

Standard Gamepad API mapping (sticks move/look, RT mine, LT place, A jump,
B shoulder, X inventory, bumpers hotbar). Ships DS-3 (it "materially
improves" a 40-minute run session; charter threshold met).

### 12.4 Accessibility (contract items, tested per release proof)

- **No hue-only information:** Runewire ON/OFF = brightness + raised/
  recessed rune shape; enemy telegraphs = shape + flash; ore tiles carry
  distinct pattern glyphs at the texture level (colorblind-safe by design,
  validated with a deuteranopia/protanopia/tritanopia filter pass).
- **No audio-only information:** pre-dawn horn has a screen-edge amber
  pulse + HUD countdown; Alarm Horn emits a visible ring; enemy attacks
  telegraph visually.
- **Motion:** FOV slider (60–110°), camera-shake off, head-bob off,
  `prefers-reduced-motion` honored (disables CRT effect, screen pulses
  become static borders).
- **Night visibility:** the classic polarity means long stretches of play
  in dark scenes — a real readability hazard on dim mobile panels. The sim
  keeps true light values; the *renderer* applies a calibrated night
  ambience floor plus a user "night brightness" slider (0–30% lift,
  default 10%). Spawn rules never change with the slider, so it is an
  accessibility control, not an advantage.
- **Difficulty of input, not challenge:** hold-to-mine can be toggled to
  tap-to-start/tap-to-stop; sprint toggle vs hold; interaction reach
  +0.5m assist option on touch (flagged on ranked receipts as an input
  assist — allowed, listed, never hidden).
- **Text:** all UI is DOM: screen-reader labels on every menu, scalable
  text (browser zoom respected), no text baked into canvas.
- Subtitle track for the few voiced grunts; full play possible muted
  (Ghost Frequency's standard applied game-wide).

---

## 13. Technical architecture

### 13.1 Renderer: Three.js/WebGL2, and the WebGPU question

**Decision: Three.js, WebGL2 baseline.** Justification against
alternatives:

- *Raw WebGL:* a voxel renderer uses a narrow slice of Three.js, but scene
  graph, texture/atlas management, frustum culling, WebXR-adjacent camera
  utilities, and battle-tested context-loss handling are exactly the
  undifferentiated heavy lifting we shouldn't rewrite. Three.js is also
  what `SPEC.md` names for this trust class — using it is charter-aligned.
- *Babylon.js:* comparable; Three.js wins on ecosystem size and the
  team's ability to source reference voxel implementations.
- *WebGPU status (honest):* shipped in Chrome/Edge (2023), Firefox
  (2024–25 rollout), Safari (2025, Safari 26). It is no longer exotic —
  but WebGL2 remains the only floor that covers every device the arcade
  serves, including 5-year-old Android phones. Three.js's WebGPURenderer
  shares the frontend API. **Plan:** WebGL2 is the contract through DS-6;
  the renderer sits behind our own `WorldView` seam (below), so a
  WebGPU backend is a DS-8+ opportunistic upgrade (compute-shader meshing,
  bigger draw batching) that must never become a fork of game logic —
  which it can't, because game logic doesn't know the renderer exists.

### 13.2 The simulation/render seam (charter rule, enforced by structure)

```
games/deepshift/
  sim/          ← pure. Zero imports from three, dom, net. All game truth.
    world/      chunks, voxels, worldgen, lighting
    entity/     player, enemies, items, physics
    logic/      Runewire compiler + evaluator
    rules/      crafting, deeds, score, siege director
    math/       deterministic math (own sin/cos/pow approximations, xxhash,
                fixed-point helpers). Math.* transcendentals are lint-banned
                in sim/ (ESLint no-restricted-properties).
  view/         ← Three.js. Meshers, materials, cameras, particles, audio.
                Reads sim snapshots; owns zero truth; disposable.
  ui/           ← DOM. HUD, inventory, crafting, menus, primer, score screen.
  cart/         ← cartridge adapter: manifest, lifecycle, receipts, input.
  server/       ← (DS-8) Node server package; imports sim/ only.
  test/         node --test suites over sim/ exclusively.
```

The sim runs in a **dedicated worker** at a fixed 20 Hz tick (logic 10 Hz,
§11.1). Main thread: renderer + UI + input capture. Input events are
timestamped to sim ticks and posted to the worker; the worker posts back
(a) dirty-chunk voxel buffers for remeshing and (b) a compact
entity/player interpolation snapshot per tick (transferables;
SharedArrayBuffer + Atomics used when cross-origin-isolation headers are
available, transferable-postMessage fallback otherwise — both paths
shipped, COI is not assumed). Render interpolates between the last two
snapshots. **The renderer can be killed and rebuilt at any time from sim
state alone** — that is the acceptance test for the seam (DS-0), and it is
also exactly what WebGL context-loss recovery requires (G-007).

Physics: AABB vs voxel grid, fixed-step, deterministic (no float
accumulation across variable frames — the sim never sees render dt).

### 13.3 Chunking and meshing

- **Chunk = 32×32×32.** World column = 8 chunks tall. Rationale vs 16³:
  8× fewer chunk objects and draw calls; remesh cost stays inside budget
  with greedy meshing in workers. Voxel storage: palette-compressed —
  per-chunk palette of block-state ids + bit-packed indices (4 bits when
  palette ≤16, else 8/16); typical terrain chunk ≈ 20–40 KB raw, most
  all-air/all-stone chunks collapse to a single-entry palette (~40 bytes).
- **Meshing: greedy quads** per material bucket (opaque / cutout / 
  transparent), in a pool of 2–4 mesh workers (navigator.hardwareConcurrency
  aware). Vertex format packed to **8 bytes**: position (3×u8, chunk-local),
  normal+AO (u8: 3b normal index, 2b baked vertex AO, 3b spare), atlas tile
  (u16), uv corner+flags (u16). Per-chunk interleaved buffer, one draw per
  chunk per bucket.
- **Lighting:** voxel light — sunlight column pass + BFS block-light
  (torch 13, hearth 14, glowsalt 9, slag 15), computed in the sim worker,
  baked into vertices at mesh time; smooth (per-vertex averaged) for the
  soft look. Day/night = shader uniform ramp over the sun channel, so
  time-of-day never triggers remeshing.
- **Remesh budget:** an edited chunk remeshes in ≤4ms worker time; edits
  batch per frame; a chunk is never remeshed twice per frame.
- Texture atlas: 2048², 16px tiles (up to 16,384 tiles; launch uses ~600),
  nearest-neighbor, 4 mip levels with edge-padded tiles to stop bleed.

### 13.4 Precision and streaming

Camera-relative rendering (origin rebase every 512m of player travel) keeps
float32 vertex math safe across the 16k Homeland world. Chunk streaming:
load/generate by spiral distance, unload beyond radius+2 (sim state for
unloaded chunks persists in the save layer; entities in unloaded chunks
freeze — same rule as Runewire provinces, §11.2.4).

### 13.5 Performance budgets (ratified numbers for the G-009B-equivalent gate)

| Metric | Desktop | Mobile mid-tier | Low-spec floor |
| --- | ---: | ---: | ---: |
| Frame time (p95) | 16.7ms (60fps) | 33ms (30fps) | 33ms (30fps) |
| Sim worker tick (p95) | ≤6ms | ≤8ms | ≤8ms |
| Main-thread render (p95) | ≤10ms | ≤22ms | ≤22ms |
| Draw calls | ≤600 | ≤300 | ≤150 |
| Triangles on screen | ≤1.2M | ≤450k | ≤150k |
| View radius (chunks) | 8 (256m) | 5 | 3 |
| Resident chunk meshes | ≤1,000 | ≤400 | ≤180 |
| JS heap (total, both threads) | ≤350MB | ≤220MB | ≤150MB |
| GPU memory (buffers+textures) | ≤400MB | ≤200MB | ≤120MB |
| Hostile entities simulated | ≤60 | ≤32 | ≤16 |
| Cold load → playable | ≤5s | ≤8s | ≤10s |
| Launch/eject leak (G-007) | 0 growth over 10 cycles | same | same |

**Reference low-spec device (must be a physical device on the shelf, named
in DS-1 acceptance):** a 2020-class Android (e.g., Moto G8 / SD665-class)
and a 2018 Intel UHD 620 laptop. The kill rule "cannot hold budgets on the
low-spec device" is measured on these, not in DevTools throttling.

**Low-spec fallback path (automatic + manual):** triggers when p95 frame
time over the first 120 rendered frames exceeds 40ms, or WebGL reports
<2048 max texture size / no instancing. Fallback: radius 3, shadows off
(shadows are desktop-only anyway — directional shadow map is a desktop
luxury feature), fog pulled to 80m, particle cap 100, entity cap 16,
resolution scale 0.75, vertex AO only (no smooth lighting rebake). Choice
persisted; user-overridable in settings ("Performance: Auto / Full /
Lantern" — Lantern is the low mode's friendly name).

### 13.6 Error handling and lifecycle (G-007 conventions)

Context loss → renderer disposes, sim keeps ticking, auto-rebuild on
`webglcontextrestored`, resume within 2s, zero sim divergence.
`visibilitychange` hidden → solo sim pauses (ranked timer pauses with it —
seeded runs are turn-fair because the siege director is sim-time based).
Tab OOM defense: chunk mesh LRU eviction under `performance.memory`
pressure signals where available; save-on-interval (§14) bounds loss to
30s. All GPU resources tracked in a disposal registry; eject = registry
sweep + worker terminate; the 10-cycle leak test is CI-run in headless
Chrome.

### 13.7 Dependency and build isolation

Per AGENTS.md: Three.js and the build (Vite, ES2020 target, no
polyfills) live entirely inside `games/deepshift/`; output is a
self-contained hashed bundle lazy-loaded through the F-008 package
boundary. The static shell's zero-dependency guarantee is untouched.
Bundle budget: **≤1.2MB gzipped** code+atlas for first playable (Three.js
~170KB gz, sim ~200KB, atlas ~300KB, audio streamed after boot).

### 13.8 DOM UI rule

Every textual/menu surface — HUD numbers, hotbar, inventory, crafting,
primer, settings, score screen — is DOM overlaying the canvas (G-007:
"text-heavy UI in DOM"). Only the world, hands, particles, and damage
flashes render in WebGL. This buys accessibility (§12.4), the shell's
visual identity for free, and screenshot-diffable UI tests.

---

## 14. Persistence

### 14.1 Save format (`DSAV`, versioned)

```
header   : magic "DSAV" | u16 formatVersion | gameVersion semver | mode |
           seed u64 | createdAt | playedMs | lastSlice checksum
player   : CBOR (position, HP, surge, inventory, knacks, deeds, spawn)
world    : chunk table — for each *modified-or-visited* chunk:
           key (cx,cy,cz) → deflate( palette[] (string block ids) +
           bitpacked indices + blockEntity list (CBOR: chests, latches,
           tallies, delays, hearth fuel/progress, undergate state) )
run      : (ranked only) run id, format, difficulty, night, quota state,
           score accumulators, input-log segment index
logic    : nothing — compiled nets rebuild from blocks + blockEntities on
           load (blocks are the single source of truth; §11.2.3 state
           lives in blockEntities)
```

Compression via native `CompressionStream('deflate')`. Storage: IndexedDB,
one DB per game slug (`ds.saves`), chunk rows written incrementally —
autosave every 30s and at phase boundaries (dusk/dawn/craft-menu open)
writes only dirty chunks. Size budgets: Dawn Run ≤4MB, Deep Run ≤10MB,
Homeland soft cap 200MB with an in-game storage meter and per-world
export/delete UI (platform data-rights posture applies locally too).

**Export/import:** any world downloads as a `.dsav` file and re-imports on
another device — this is also the honest offline backup story and feeds
the share/snapshot pipeline (§15.3).

### 14.2 Save/resume acceptance (DS-2)

Resume at mining/crafting/siege/charge boundaries reproduces inventory,
world, RNG cursors, Runewire state, enemy positions, and score accumulators
**bit-exactly** (hash-compared in tests). Corrupt saves and future
formatVersions fail closed with a readable error and never touch other
local data (G-008A bar, inherited).

### 14.3 Surviving game version bumps

- **String block IDs in palettes** — numeric runtime ids are never
  persisted, so registry reordering can never corrupt a world.
- **Unknown-block preservation:** a save containing a block id the current
  build doesn't know renders it as an inert placeholder and **round-trips
  it untouched** on next save — worlds survive downgrades and partial
  content removals without data loss.
- **Migration ladder:** each formatVersion bump ships a pure migrator
  (`migrate_vN_to_vN+1(save) → save`); migrations chain; every migrator
  keeps a fixture save in the repo tested forever.
- **Ranked compatibility:** run receipts pin sim version; boards never
  compare across incompatible sim versions (shared score contract); an old
  in-progress ranked save on a new incompatible sim version converts to an
  honorable abandon (no score) rather than replaying wrongly.

---

## 15. Cartridge contract and the run-receipt seam

### 15.1 Manifest (F-002 / `shell/cartridge.js` schema v1)

```js
{
  schemaVersion: 1,
  slug: 'deepshift', version: '0.x.y',
  title: 'DEEPSHIFT', summary: 'Voxel survival on the late shift. Mine by day, hold the walls by night, re-light your clan\'s buried gate.',
  creator: 'Late Shift Arcade', runtime: 'first-party-3d',
  trustLevel: 'trusted-first-party',
  modes: ['dawn-run (ranked)', 'deep-run (ranked)', 'homeland (unranked)', 'forge (unranked)'],
  goal: 'Activate the Undergate and survive its charge before the 8th dawn.',
  scoreLabel: 'Shift Report', controls: ['keyboard+mouse', 'touch', 'controller'],
  artwork: { accent: '#e6c17e' }, releaseStatus: 'published',
  contentNotes: ['fantasy combat'], madeWith: '…', genre: 'survival-builder',
  players: '1 (co-op later)', tags: ['voxel','3d','showcase'],
  // via F-009: tier: 'showcase'; via F-008: lazy entry point
}
```

Note for DS-0: `activateCartridge` currently hard-blocks
`runtime !== 'first-party-2d'` (shell/cartridge.js:213). Lifting that for
`first-party-3d` behind the G-007 boundary is the first line of real work.

### 15.2 Run receipts (F-003)

- Ranked runs emit the full receipt: start, finish, win/loss, **score
  breakdown mirroring §3.3 term-by-term**, seed, difficulty, duration, sim
  version, input-assist flags, and a replay reference (compact input log:
  ≤40 bytes/s typical — tick-delta + button bitfield + quantized look;
  a 45-min Deep Run log ≤120KB deflated).
- Verification (P-004 pattern): the deterministic sim replays the input log
  headless in an isolated verifier; matching terminal state ⇒ verified
  score. This is the anti-cheat spine for solo boards and it falls out of
  the determinism work for free.
- Homeland/Forge sessions emit session receipts with `ranked:false` — they
  satisfy the universal start/finish protocol, appear in personal history,
  and are structurally excluded from boards.
- Duplicate-finish idempotency by run id (F-003 acceptance inherited).

### 15.3 Share artifacts (P-011 data-only contract)

1. **Shift Report card** — score breakdown + seed + version as URL;
   recipient plays the same seed/format (challenge loop).
2. **Snapshot tour** — a bounded world excerpt (≤96×96×96 blocks, ≤64
   block-entity states, no free text beyond a 48-char title) rendered as an
   orbitable immutable viewer; the showpiece surface for the website.
3. **Runewire blueprint** — serialized block region (same bounds), placed
   as a ghost-hologram overlay in the recipient's own world. Data-only,
   validated against the block registry, zero executable content.

All three: private by default, immutable provenance, report/delist/export/
delete per the artifact contract.

### 15.4 Fullscreen

On launch (a user gesture, so the Fullscreen API permits it) the cartridge
requests fullscreen on its container; Esc/system-back exits to the shell
per the G-007 lifecycle. If the request is denied (iframe policy, iOS
Safari quirks), the game runs in the largest available viewport with a
"⛶ fullscreen" DOM button — degraded, never broken. Orientation: landscape
requested via manifest field (D1: per-game, not site-wide); portrait shows
the rotate prompt *inside the cartridge only*.

---

## 16. Multiplayer

Phased honestly: this is the hardest engineering in the document, and it is
deliberately **after** the solo game is complete and scored (D6, G-021
precedent). Nothing in DS-1–6 blocks on netcode; everything in DS-1–6 makes
netcode cheaper (deterministic sim, serializable state, input-log replays).

### 16.1 Authority model (decision)

**Server-authoritative simulation with client prediction.** Lockstep
determinism (peer-to-peer) is tempting given the deterministic sim, but it
couples every player's latency, makes join-in-progress and reconnection
hard, and offers no anti-cheat story. Instead the *server runs the same
`sim/` code* — the sim/render seam means the server is the sim worker with
a socket instead of a renderer. Clients predict their own movement and
block edits optimistically; the server's tick stream corrects them
(rollback for self, interpolation for others).

### 16.2 Netcode specifics

- Transport: WebSocket (binary). Protocol: length-prefixed frames,
  little-endian, `protocolVersion` semver handshake; documented in
  `games/deepshift/server/PROTOCOL.md` from day one (self-hosting depends
  on this being public and stable).
- Tick: server 20 Hz; snapshot delta-compression against last acked state;
  interest management = chunk radius 4 per player; typical steady-state
  bandwidth target ≤25 KB/s per client, burst on chunk send (chunks ship
  as the same palette-compressed format as saves).
- Block edits: client applies optimistically, server validates (reach
  ≤5.5m, rate ≤12 edits/s, harvest level, tool durability) and either
  confirms or reverts with the authoritative cell state. Inventory is
  fully server-side (dupe-proofing lives in one place).
- Runewire in multiplayer: evaluated server-side only; clients receive net
  state deltas (1 bit/net) — determinism makes deltas tiny.

### 16.3 Hosted co-op (platform path, DS-7 ≈ G-021/M-001)

- 2–4 invited players per expedition, room = one SQLite-backed Durable
  Object running the compiled sim (the `server/` build), M-001's invite/
  expiry/report baseline, D3's chat rules if/when chat is added (logged,
  reportable, rate-limited).
- Ranked co-op: separate boards; the room's authoritative result *is* the
  receipt (no client trust); one shared revive per night (G-021's revive
  rule), team score = shared formula, no per-player split (co-op is
  cooperative).
- Honest cost note: a 20 Hz voxel sim in a Durable Object is unproven for
  us. DS-7 starts with a 2-player, Dawn-Run-only tracer bullet and
  measures DO CPU-ms per tick before green-lighting 4-player Deep Runs.
  If DO limits bite, the fallback is host-migration-free relay through the
  DO with one *client* as sim authority for unranked co-op only — ranked
  co-op does not ship unless server-authority fits the platform budget.

### 16.4 Self-hosted servers (DS-8 ≈ G-008B, the owner's requirement)

- **Package:** `deepshift-server` — a Node ≥20 npm package + downloadable
  zip from the game's detail page. `npx deepshift-server --world ./myworld
  --port 25565` starts a server; config in `deepshift.json` (max players
  ≤8, allowlist of invited player names, world seed/mode, autosave
  interval). No native deps: the sim is pure JS/TS by construction.
- **Same code, one truth:** the server imports `sim/` verbatim. Version
  skew handled by the protocol handshake: client and server must match
  sim major.minor; the client says exactly what to update.
- **Distribution:** npm + zip download with SHA-256 printed on the site.
  It runs on the operator's machine/VPS; players connect by host:port
  (direct WebSocket; ws:// for LAN, wss:// behind the operator's own
  reverse proxy for internet play — documented, not automated; we do not
  run a relay or NAT-punching service, and the docs say so plainly).
- **Trust posture (explicit):** self-hosted servers are **untrusted by the
  platform**. Their runs never submit to platform boards, full stop.
  Server operators can enable local, server-scoped scoreboards. No
  platform account credentials ever flow to a self-hosted server —
  players connect with a local display name; the platform's only
  involvement is serving the client and the download. This is the only
  honest anti-cheat posture for code we don't run, and it protects the
  platform's boards from ever laundering a self-hosted score.
- Moderation posture: self-hosted worlds are private spaces run by their
  operators, like any game's private servers; platform content rules apply
  only to artifacts brought *back* onto the platform (snapshots,
  blueprints), which pass the P-011 pipeline as always.

---

## 17. Phased delivery plan

Every slice is independently shippable and provable, keeps `npm test`
green, and ends in a demoable capability. Ticket mapping: DS-0 = G-007
(unchanged); DS-1/2/3/5 replace G-008/G-008A/G-009+G-009A/G-009B; DS-6 =
G-010; DS-7 = G-021 (+M-001 dependency); DS-8 = G-008B. G-009's ticket text
should be updated to reference this document (one-line change, part of the
F-007 ratification wave).

### DS-0 — 3D cartridge boundary (= G-007, blocked by F-001/F-003/P-001)

Minimal Three.js scene through the versioned contract. **Demo:** launch a
lit spinning voxel chunk from the cabinet, eject cleanly.
**Accept:** G-007's own criteria verbatim (leak-free 10-cycle launch/eject,
context-loss recovery, mobile resize/visibility, sim-outside-renderer,
fullscreen request + fallback). *Adds from this GDD:* the `WorldView`
seam exists and the renderer-rebuild-from-sim-state test passes.

### DS-1 — "First Night" ranked vertical slice (replaces G-008)

The Dawn Run, minimal content: Dusklands only; blocks = dirt, nightgrass,
sand, gravel, fieldstone, gnarlpine set, coal, copper, torch, worktable,
hearth, clan cache, barricade; tools = bone + fieldstone + copper picks/
axe/club; enemies = Ashboar, Hollowed, Gloomwisp; full day/night cycle
with light-driven spawning and sunrise burn-off; quota + survive-to-dawn
win/loss; score formula §3.3 live (including the 1.5× night-banking knob);
permadeath; DOM HUD/inventory/crafting; KB/M + full touch layout.
**Demo:** a stranger on a phone completes or fails a Dawn Run and reads
their shift report.
**Accept:** no placeholder skips anywhere in the loop (G-008 rule); all
rules modules deterministic + tested headless; the one-minute phone graybox
passes *before* content beyond one ore/one enemy is added; 60% of ≥5
observed first-timers state the goal after one minute; low-spec device
holds 30fps at radius 3.

### DS-2 — Save, resume, lifecycle (replaces G-008A)

Autosave/resume for interrupted runs, pause, visibilitychange, context
recovery under load, corrupt/future-version rejection, DSAV v1 + first
migration fixture. **Demo:** kill the tab mid-siege, reopen, finish the
run; score matches replay verification. **Accept:** §14.2 bit-exact bar.

### DS-3 — The Deep Run (replaces G-009 depth work)

Full 7-day format: complete ore ladder (tin→orichalcum), all stations,
armor, remaining launch enemies, the night-siege director and Bane Nights
(§10.4), Knack drafting, Deeds v1, Undergate excavation + build + charge +
the Hollow Tyrant, both difficulties, controller support, daily seed hook
(P-009-ready).
**Demo:** a full 40-minute winnable run with ≥3 observed distinct winning
strategies (rush-depth / fortress / hunter economy — G-009's three-viable-
strategies bar).
**Accept:** seed validator green across 200-seed sweep; score anti-grind
caps verified by a bot that mines forever and cannot beat a par human
score; replay verification reproduces 50/50 recorded runs.

### DS-4 — Runewire v1 + Forge mode

All 16 components + actuated doors/hatches/bellows/spike traps/lamps; net
compiler + event-driven evaluator + province budgets; the Primer; Forge
mode (creative palette, flight, instant break — trivially cheap once the
engine exists, and it is the logic-builder's workshop).
**Demo:** the CI universality fixture (§11.4.5) passes, and a human builds
the Primer's counting machine on a phone.
**Accept:** 100k-gate quiescent world costs <0.2ms/tick; 50k-gate active
circuit holds budget on the low-spec device; save/load mid-computation
bit-exact; overdrive throttle deterministic across 3 replay runs.

### DS-5 — Homeland + biomes + performance gate (absorbs G-009A + G-009B)

All 4 biomes with distinct rules; cellular water; sulfur/blast charges;
Homeland persistent worlds (16k border, hunger, totems, Hearth Rest,
hardcore toggle, peaceful toggle); storage meter; world export/import; **the ratified
budget table (§13.5) enforced by automated stress fixtures + physical-
device captures — this slice is the release gate.**
**Demo:** a week-old Homeland world with a Runewire-automated smelting hall
runs at budget on the shelf devices.
**Accept:** G-009B criteria verbatim against §13.5 numbers; biome
strategy-difference playtest (G-009A bar).

### DS-6 — Showcase and share (= G-010, needs P-011)

Shift Report cards, snapshot tours, blueprint sharing, postcard renderer;
the game detail page embeds a rotating snapshot tour — the website
showpiece moment. **Accept:** G-010 criteria verbatim (artifact limits,
delete removes media).

### DS-7 — Hosted co-op tracer (= G-021, needs M-001)

2-player Dawn Run co-op on a Durable Object; measure; then 4-player Deep
Run if budgets hold (§16.3). **Accept:** G-021 criteria (authoritative
ordering, reconnect, dupe-pickup, grief limits, solo untouched) + DO
CPU-ms/tick report published in the ticket.

### DS-8 — Self-hosted servers + Runewire v2 (= G-008B)

`deepshift-server` package, protocol doc, download page with hashes;
Hopper Chutes, then Rams (in that order, each behind its own perf fixture);
WebGPU backend spike (timeboxed, non-blocking).
**Accept:** a clean Windows machine and a $5 VPS each host an 8-player
world through a documented walkthrough; platform boards provably reject
self-hosted receipts; Ram-based builds hold mesh/logic budgets or Rams
stay Forge-only.

---

## 18. Risks and kill criteria

| # | Risk | Honest assessment | Mitigation | Kill/rescope trigger (per phase) |
| --- | --- | --- | --- | --- |
| 1 | **Mobile perf on a real voxel world** | The single most likely failure. Greedy meshing + palette chunks + DOM UI is a proven recipe, but mid-tier Android GPUs and thermal throttling are brutal over 40-minute runs | Budgets in §13.5 with physical shelf devices from DS-1; Lantern mode; radius floor of 3 | **DS-1/DS-5:** low-spec device cannot hold 30fps at radius 3 after two optimization passes ⇒ cut world height to 192 and view floor to 2; if still failing, DEEPSHIFT ships desktop/tablet-first and the charter's touch rule forces a formal owner decision — this is the roadmap kill rule and it is real |
| 2 | **The ranked mode isn't fun** (graybox risk) | Dawn Run is a strong hypothesis, not a fact. Time pressure can read as stress, not thrill | 3-loop graybox iteration rule; the 60% goal-statement test at DS-1 | **DS-1:** not fun after three iteration loops ⇒ stop, redesign the format (candidates: shorter nights, quota-free "survive and escalate" scoring) before any DS-3 content |
| 3 | **Runewire compiler complexity** | Incremental net recompilation with province budgets is real compiler engineering; the naive version will be built first and it will be too slow | Event-driven evaluator is the fallback even without incremental compile (full-region recompile at 3ms budget covers circuits <50k gates); caps fail closed | **DS-4:** if deterministic throttling can't hold budget on low-spec ⇒ halve province budget and cap Forge worlds' gate count; if the CI universality fixture can't run in real time ⇒ the feature is *wrong*, not late — rescope to logic-lite (doors/traps only) and say so publicly |
| 4 | **Determinism leaks** (replay verification fails) | Float math discipline, worker scheduling, and JS engine differences are subtle; one `Math.sin` in the sim breaks everything | Lint ban §13.2; 50-run replay soak in CI on 3 engines (V8, JSC via playwright-webkit, Gecko) from DS-1 | **DS-2:** replay mismatch rate >0 after soak fixes ⇒ ranked boards launch verified-on-same-engine-only (documented), full cross-engine verification becomes a DS-5 exit criterion |
| 5 | **Durable Object co-op CPU cost** | Unproven; a 20Hz sim per room may exceed platform budget | DS-7 tracer measures before committing | **DS-7:** DO cost per room-hour exceeds the O-003 budget envelope ⇒ ranked co-op is cut, unranked co-op ships via client-authority relay, self-hosted becomes the only 4+ player path |
| 6 | **Scope gravity** ("just one more block") | This genre eats teams. The taxonomy in §6 is a *ceiling* for launch, not a floor | Every content add must name the strategic choice it creates (G-009 rule) | **Any phase:** two consecutive slices miss their demo ⇒ freeze content, ship the current slice's mode set as the release |
| 7 | **Legal drift toward Minecraft's expression** | Agents building "like Minecraft" will unconsciously copy names/looks | §2 is normative; PR checklist includes a name/texture originality pass | **DS-6 (public showcase):** any asset failing the originality pass blocks release of the slice, no exceptions |
| 8 | **Sandbox modes cannibalize the ranked identity** | If Homeland lands before boards are healthy, DEEPSHIFT becomes "a toy with a leaderboard nobody uses" | Sequencing (ranked ships 3 slices earlier); catalog card leads with the Deep Run goal | **DS-5 exit:** if <20% of DS-5-era sessions ever start a ranked run, revisit the mode front-door (default to Dawn Run on first launch) before DS-6 |
| 9 | **Reduced differentiation** (the honest cost of the classic polarity, rev 2) | Reverting to safe-day/dangerous-night removes the design's biggest structural novelty and its protected nightly build window; ranked days are short (3:00), so building happens under more pressure; long dark stretches add a real readability cost on mobile (§12.4). The game is now, deliberately, "the thing people already love, executed well" — which means the originality burden sits entirely on orcs (§1.3), Runewire (§11), the ranked formats (§3), and no-sleep-skip + night banking | Concentrate polish and marketing on those four; night-brightness floor (§12.4); Homeland's 12-minute days keep a comfortable build window | **DS-1/DS-3 graybox:** if playtesters describe the game as "a worse Minecraft" rather than naming any of the four differentiators unprompted, the identity work has failed — revisit §1 before content scale-out |

---

## 19. Decisions needed from the owner

1. **Mobile floor:** confirm the shelf devices (§13.5) and that risk #1's
   rescope ladder is acceptable — this is the decision that most changes
   cost if it goes wrong late.
2. **Ranked/unranked split:** ratify §3 (scored expeditions are the
   platform identity; Homeland/Forge permanently unranked). This amends
   the roadmap's Pocket Realm entry and should ride the F-007 wave.
3. **Night-skip policy:** ratify §1.3/§4.2 — no sleep-skip anywhere;
   Homeland gets Hearth Rest (4× time acceleration, interruptible), and
   ranked runs are always real time. This is now the main place the design
   deliberately diverges from the genre default, it is where the orc
   identity does structural work, and it is cheap to change today and
   expensive later (Bane Night pacing, the 1.5× night-banking score knob,
   and Runewire defense play all assume nights actually happen).
4. **Self-hosted trust posture:** confirm §16.4 (self-hosted runs never
   reach platform boards; no platform credentials to third-party servers).
5. **Runewire v1 scope:** confirm binary-signal design and the deferral of
   Rams/item logistics to DS-8 (§11.8).

(Name: DEEPSHIFT ratified 2026-07-24; naming is closed, §1.1.)
