# Late Shift Arcade — game compendium roadmap

Status: proposed build slate for the platform pivot
Date: 2026-07-24

## Product thesis

Late Shift Arcade should become a curated home for small, complete, AI-made
browser games. It is closer to early Newgrounds, Miniclip, and itch.io than to
an infinite feed of disposable demos:

- anyone can play public games without an account;
- every public game has a clear goal, loss state, score, and replay reason;
- accounts add global scores, creator attribution, saved artifacts, and
  challenge links;
- first-party and community games use the same versioned game contract;
- community games are reviewed before publication and can be suspended or
  removed;
- depth is judged by meaningful decisions and mastery, not map size or feature
  count.

The current eight-game rack stays playable while the platform grows around it.
It becomes the "Legacy Rack," not discarded prototype code.

## What qualifies as a complete game

Every public game must ship with a small design contract:

1. **Fantasy and verbs:** what the player is and what they repeatedly do.
2. **Session loop:** a meaningful choice or execution challenge at least every
   10–20 seconds.
3. **Terminal outcome:** an explicit win/loss or chapter-complete state that
   can be explained in one sentence.
4. **Score:** a documented formula rewarding skill, not merely time spent.
5. **Mastery:** at least two mechanics whose interaction creates better play.
6. **Replay:** seeded variation, escalating difficulty, authored levels, daily
   challenges, opponents, or build experimentation.
7. **Share artifact:** a replay, seed, ghost, build card, challenge code, or
   result card that works as a URL.
8. **Fair input:** keyboard/pointer and touch support; controller support when
   it materially improves the game.
9. **Deterministic core:** saveable simulation state and seeded randomness
   outside the renderer wherever practical.
10. **Release proof:** pure-logic tests, browser playtest, screenshots from
    representative states, mobile verification, and a clean console.

A large toy without a victory condition is not a game release.

## Rating method

Each concept is scored from 1–10 on the four factors Jeff named:

- **Fun:** moment-to-moment pleasure and mastery.
- **Viral:** likelihood that challenges, clips, builds, or co-op stories get
  shared.
- **Demo:** how compelling the game looks within 20 seconds.
- **Enjoyment:** depth, replay value, and likelihood of return play.

The opportunity score is:

`35% Fun + 25% Viral + 20% Demo + 20% Enjoyment`

Opportunity rank is the raw score order; equal scores share a rank. Build order
is the recommended sequence: the scores set the priority bands, while the
minimum prerequisite chain breaks the order so each early release proves
systems required by the higher-scoring games. Only Pinball and Rail Switch are
deliberate foundation bets ahead of the top-scoring concepts.

### Shared score contract

Game-specific formulas below are launch hypotheses, not permanent balance.
Unless a game explicitly says otherwise:

- score is a non-negative integer calculated by versioned simulation code;
- boards never compare different difficulty rules or incompatible versions;
- bonuses have caps, and repeatable zero-risk actions cannot generate points;
- completed runs rank ahead of failed runs, then score, then the game's stated
  tie-breaker, then earliest submission;
- creator popularity is never mixed into a player's skill score;
- a replay or authoritative room result must reproduce verified scores.

## Ranked slate

| Build | Opportunity | Game | Fun | Viral | Demo | Enjoyment | Weighted |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 7= | **Pinball After Dark** | 9 | 7 | 9 | 8 | 8.30 |
| 2 | 13= | **Rail Switch** | 8 | 7 | 9 | 9 | 8.15 |
| 3 | 2 | **Boss Foundry** | 9 | 10 | 9 | 9 | 9.25 |
| 4 | 3 | **Creature Forge Arena** | 9 | 9 | 10 | 9 | 9.20 |
| 5 | 1 | **Pocket Realm: Beaconfall** | 9 | 9 | 10 | 10 | 9.40 |
| 6 | 5 | **Ragdoll Relay** | 9 | 9 | 9 | 8 | 8.80 |
| 7 | 4 | **Dead Air Dispatch** | 9 | 9 | 9 | 9 | 9.00 |
| 8 | 6 | **Foldspace** | 8 | 8 | 10 | 8 | 8.40 |
| 9 | 7= | **Orbital Salvage** | 9 | 7 | 9 | 8 | 8.30 |
| 10 | 7= | **Backpack Alchemist** | 9 | 7 | 8 | 9 | 8.30 |
| 11 | 10= | **Evidence Board** | 8 | 8 | 8 | 9 | 8.20 |
| 12 | 10= | **Ghost Frequency** | 8 | 8 | 9 | 8 | 8.20 |
| 13 | 10= | **Vault Heist** | 8 | 8 | 8 | 9 | 8.20 |
| 14 | 13= | **Wildfire Watch** | 8 | 7 | 9 | 9 | 8.15 |
| 15 | 15 | **Last Light Foundry** | 8 | 7 | 8 | 9 | 7.95 |

Ratings are product hypotheses. After each public release, replace opinion with
observed completion rate, replay rate, challenge opens, and return play. Do not
collect demographic data merely because it might be interesting.

## The games

### 1. Pinball After Dark

**Fantasy:** keep a haunted city grid alive by routing the ball through its
districts.
**Core loop:** aim, nudge, complete target contracts, unlock table modes, and
stack risky multiballs.
**Win:** relight all four districts and clear the Blackout multiball.
**Loss:** drain three balls before the city is restored.
**Score:** table points + 100,000 per district + 500,000 for winning + 50,000
per remaining ball - 25,000 per tilt warning; tie-break by faster winning time.
**Depth:** table state changes shot value; players decide whether to bank a
district or risk a multiplier.
**Nonstandard hook:** a persistent table-state routing puzzle sits inside the
pinball physics rather than merely reskinning a conventional table.
**Recipient loop:** open a heat-map link, play the same daily contract order,
compare district splits, and rematch.
**Touch proof:** two 96px thumb zones control the flippers; upward swipes
launch and edge swipes nudge, with no multi-touch gesture required.
**Why first:** it is instantly legible, visually strong, and proves trustworthy
score receipts, deterministic replays, and daily boards on one polished game.

### 2. Rail Switch

**Fantasy:** dispatch an increasingly impossible midnight rail network.
**Core loop:** throw switches, reserve track blocks, route cargo, and decide
which delays are survivable.
**Win:** deliver every required train before the shift timer expires.
**Loss:** cause a collision, strand critical cargo, or exceed the delay budget.
**Score:** 10,000 per required delivery + optional cargo value + 50 per second
remaining + 100 per fuel unit - 20 per delay-second - 2,000 per override;
collision scores zero. Tie-break by fewer overrides.
**Depth:** train priorities, switch timing, shared track, and limited signal
overrides create planning and execution pressure.
**Nonstandard hook:** a real-time routing puzzle where delay is a budgeted
resource and every switch changes multiple future commitments.
**Recipient loop:** open a dispatch link, inherit the same seed and delay
budget, race the sender's ghost schedule, and compare delivery deltas.
**Touch proof:** tracks are selected with single taps and large held signal
buttons; a paused planning zoom handles dense junctions.
**Why second:** it proves daily challenges and replay validation with a compact,
touch-friendly deterministic simulation.

### 3. Boss Foundry

**Fantasy:** construct an arcade boss, prove it is fair by beating it, then
publish it for other players.
**Core loop:** assemble safe attack modules under a threat budget, arrange
telegraphed phases, test the fight, and refine it.
**Win:** a creator must defeat their boss once to publish it; challengers win by
clearing all phases within three lives.
**Loss:** an invalid or impossible pattern fails validation; challengers lose
all lives.
**Score:** 1,000,000 clear bonus + 2,000 per remaining life + 50 per second
remaining + style-chain points, multiplied by the validated threat tier and
capped at 3x. Tie-break by faster clear. Creator discovery uses a separate
quality signal based on unique completers and balanced clear rate.
**Depth:** patterns interact through timing, arena geometry, counters, and phase
transitions.
**Nonstandard hook:** players author an enemy's legible behavior, then must
personally prove it is beatable before anyone else sees it.
**Recipient loop:** open a phase-preview link, challenge the immutable boss,
compare clear score, then rematch or fork its data-only pattern privately.
**Touch proof:** boss construction uses tap-to-place timeline blocks; combat
uses one drag movement surface and one ability button.
**Why unusual:** it is constrained user-generated design, not arbitrary code.
It proves that creation can be viral and moderated without becoming an upload
free-for-all.

### 4. Creature Forge Arena

**Fantasy:** assemble a strange machine-creature, teach it a combat routine,
and take it through a tournament.
**Core loop:** earn parts, fit them within mass and power limits, program a
small priority deck, fight, and rebuild.
**Win:** defeat a five-opponent tournament bracket and its champion.
**Loss:** the creature core is destroyed or the build exceeds three rebuilds.
**Score:** 100,000 per win + 1,000 per remaining integrity percent + 500 per
distinct combo + 200 per unused power unit - 10,000 per rebuild; tie-break by
lower total installed mass.
**Depth:** body geometry, part synergies, power routing, and the priority deck
all matter.
**Nonstandard hook:** visible body geometry, resource routing, and a tiny
behavior program all affect the same fight.
**Recipient loop:** open a creature card, fight it with a same-tier build,
compare bracket score, and fork the data-only chassis after the match.
**Touch proof:** snap-grid assembly uses drag/rotate handles sized for thumbs;
priority cards reorder with a single vertical drag.
**Why unusual:** the interesting artifact is a functioning authored creature,
not a generated skin.

### 5. Pocket Realm: Beaconfall

This is the Minecraft-like game, but it is deliberately finite.

**Fantasy:** land on a collapsing voxel island, build a beacon, survive the
night, and extract with a piece of the world.
**Core loop:**

1. scout a seeded island and choose an extraction site;
2. mine a small resource graph rather than hundreds of decorative blocks;
3. craft tools and beacon modules;
4. shape terrain into defenses and traversal;
5. survive a night assault;
6. power the beacon and escape before the island falls away.

**Win:** activate the beacon, survive its charge cycle, and enter the portal
within a 20-minute expedition.
**Loss:** die, let the beacon core be destroyed, or miss the collapse timer.
**Score:** 10 times artifact value + 5,000 per optional objective + 50 per
beacon-integrity percent + 5 per second remaining + enemy threat value +
`min(10,000, damage absorbed by placed defenses + 20 × powered beacon
seconds)`; tie-break by fewer blocks placed. Raw block count never earns
points.
**Depth:** a compact set of blocks has multiple jobs: traversal, defense,
power, crafting, and beacon construction. Biomes change resource and enemy
rules. Recipes unlock strategic alternatives, not filler.
**Meta loop:** successful runs unlock new island modifiers, beacon blueprints,
and cosmetic block palettes without permanent stat inflation.
**Nonstandard hook:** construction is a tactical answer to a timed extraction
and defense problem, so terrain changes are judged by what they accomplish.
**Recipient loop:** open a postcard, tour the immutable extraction snapshot,
then attempt its fixed-loadout beacon charge against the owner's enemy seed
and compare integrity/time.
**Touch proof:** left thumb moves, right thumb drags camera, center reticle
mines/places with large contextual buttons, and inventory/crafting pauses the
solo simulation. A one-minute phone graybox is required before depth work.
**Multiplayer:** ship solo first; add two-player co-op only after the solo
economy and win rate are healthy.
**Technical boundary:** an isolated Three.js/WebGL cartridge with simulation
state outside scene objects, chunk budgets, DOM inventory/HUD, deterministic
world generation, save/resume, and a low-spec fallback.

The launch version is not "infinite Minecraft." It is a replayable
survival-builder whose construction serves a deadline and a victory.

### 6. Ragdoll Relay

**Fantasy:** throw, swing, and barely control a courier through absurd physical
obstacle courses.
**Core loop:** run a short stage, preserve momentum, recover from mistakes, and
hand the parcel to the next checkpoint.
**Win:** deliver the parcel through all relay gates before the cutoff.
**Loss:** break the parcel, fall out of bounds too often, or time out.
**Score:** `max(0, 200,000 - elapsed milliseconds / 10)` + 20,000 for an
intact parcel + authored style bonuses + 10,000 per optional gate - 15,000 per
reset; tie-break by fewer resets.
**Depth:** momentum, grip, body pose, and route selection interact.
**Nonstandard hook:** the parcel and body have separate physics, turning
recovery and handoff into the skill rather than mere ragdoll spectacle.
**Recipient loop:** open a wipeout or finish clip, race the same course against
the sender's ghost, compare splits, and rematch.
**Touch proof:** one virtual movement stick plus two large grip/release buttons;
the camera follows automatically and never requires a third simultaneous
gesture.

### 7. Dead Air Dispatch

**Fantasy:** two players operate a storm rescue from different information.
**Core loop:** one player reads a degrading radar/map; the other drives a
rescue rig using instruments and partial landmarks. They communicate through
limited pings and short coded messages, not open chat.
**Win:** locate all survivors and reach extraction before the storm closes.
**Loss:** the vehicle is disabled, the signal battery empties, or time expires.
**Score:** 50,000 per survivor + 500 per vehicle-integrity percent + 100 per
battery percent + 50 per second remaining - 250 per signal ping; tie-break by
shorter driven distance.
**Depth:** imperfect information, map drift, battery allocation, and route
tradeoffs create stories.
**Nonstandard hook:** each player owns a different incomplete truth, and the
communication budget is part of the resource game.
**Recipient loop:** open a team result, invite one partner into the same
mission/roles, compare rescue splits, and swap roles for a rematch.
**Touch proof:** dispatcher uses tap/zoom map tools; driver uses one steering
surface and large instrument controls. Each role must pass its own phone
graybox.
**Safety:** party codes and fixed communication tools first. No stranger
matchmaking, voice, or text chat.

### 8. Foldspace

**Fantasy:** rotate small impossible worlds so disconnected surfaces become
one traversable route.
**Core loop:** walk, rotate the diorama, align silhouettes, carry persistent
objects across perspective changes, and exploit topology.
**Terminal outcome:** bring the light shard to the exit, or reset the puzzle;
optional challenge mode ends unsuccessfully when its move budget is exceeded.
A chapter is won by clearing every world.
**Score:** 100,000 per cleared world + 10,000 per optional shard + 2,000 per
move under par + 50 per second under par - 5,000 per reset; tie-break by fewer
moves.
**Depth:** viewpoint, object persistence, light, and moving geometry layer over
carefully authored puzzles.
**Nonstandard hook:** perspective changes are explicit topology operations,
not camera tricks hiding a conventional grid.
**Recipient loop:** open a completion postcard, play the same puzzle against
the sender's move ghost, compare par delta, and rematch in challenge mode.
**Touch proof:** one-finger walk/selection and two-finger diorama rotation are
never simultaneous; large undo/reset controls remain outside WebGL.

### 9. Orbital Salvage

**Fantasy:** recover valuable wreckage by slinging a fragile tug through a
moving orbital junk field.
**Core loop:** plan burns, skim gravity wells, tether cargo, manage heat, and
return to the carrier.
**Win:** meet the contract value and dock before fuel or orbit decays.
**Loss:** collision, failed orbit, destroyed cargo, or exhausted fuel.
**Score:** 10 times docked salvage value + 100 per fuel unit + 500 per
hull-integrity percent + authored risk bonus - 1,000 per collision; tie-break
by less elapsed mission time.
**Depth:** gravity, tether mass, heat, and rotating hazards interact.
**Nonstandard hook:** every valuable pickup changes the tug's mass and
therefore rewrites the route home.
**Recipient loop:** open a trajectory link, attempt the same wreck contract
with the sender's path visible, compare fuel/hull, and rematch.
**Touch proof:** drag an aim vector, release to burn, and tap a large tether
control; planning pauses while the player aims.

### 10. Backpack Alchemist

**Fantasy:** pack a traveling laboratory whose spatial layout creates spells
during combat.
**Core loop:** draft ingredients, rotate and pack them, brew adjacency
reactions, fight, and choose which unstable result to keep.
**Win:** cross five regions and defeat the rival alchemist.
**Loss:** health reaches zero or three brews catastrophically fail.
**Score:** 50,000 per cleared region + 2,000 per distinct reaction + 500 per
unused slot + rare-discovery value + boss modifier - 10,000 per catastrophic
brew; tie-break by fewer combat turns.
**Depth:** packing, recipe discovery, heat, volatility, and combat timing
interact.
**Nonstandard hook:** spatial packing is a live chemistry circuit whose
reactions continue during combat rather than a static inventory bonus.
**Recipient loop:** open a backpack code, run the same daily ingredient seed,
compare reactions discovered, and remix the sender's data-only layout.
**Touch proof:** tap-to-pick, large rotate button, and snap-grid placement avoid
precision drag; combat actions use a single bottom command row.

### 11. Evidence Board

**Fantasy:** solve a compact daily mystery by connecting evidence, testimony,
timelines, and motives.
**Core loop:** inspect scenes, place claims on a board, challenge
contradictions, and commit to a reconstruction.
**Win:** identify the culprit, method, motive, and decisive evidence.
**Loss:** make three unsupported accusations or submit an incorrect final
theory.
**Score:** 250,000 for a correct theory + 25,000 per optional deduction +
5,000 per unused accusation + `max(0, 30,000 - elapsed seconds × 20)` - 20,000
per hint; tie-break by fewer evidence cards used.
**Depth:** every case is generated from a validated causal solution first;
surface details may vary, but the logic cannot be improvised by an LLM at play
time.
**Nonstandard hook:** procedural cases are compiled from a causal proof, so
generated flavor can never redefine the answer.
**Recipient loop:** open a spoiler-safe grid, solve the same case, reveal both
reasoning paths only after commitment, and compare evidence efficiency.
**Touch proof:** evidence uses tap-select/tap-place with an optional zoomed
card drawer; no freehand string manipulation is required.

### 12. Ghost Frequency

**Fantasy:** tune an analog instrument to identify and contain a haunting
before it identifies you.
**Core loop:** sweep frequencies, interpret signal shapes, triangulate rooms,
place wards, and decide when evidence is strong enough to attempt containment.
**Win:** correctly identify the entity and complete its containment pattern.
**Loss:** fear reaches maximum, three false identifications are made, or the
night timer ends.
**Score:** 200,000 for correct containment + 1,000 per calm percent + 5,000 per
unused ward + rare-signal value + 50 per second remaining - 25,000 per false
identification; tie-break by fewer frequency sweeps.
**Depth:** sound, visual scope traces, room topology, and riskier tuning bands
interact. The game remains fully playable without microphone permission.
**Nonstandard hook:** players reason across synchronized audio and visual
instrument traces while the act of observing increases risk.
**Recipient loop:** open an eerie spoiler-safe signal card, investigate the
same case, reveal entity and trace comparison after commitment, and rematch.
**Touch proof:** one large tuning dial, tap-to-place wards, and a room selector;
visual scope traces provide every audio clue without precision gestures.

### 13. Vault Heist

**Fantasy:** plan and execute a deterministic turn-based robbery where every
guard move is readable.
**Core loop:** scout, allocate a small crew, queue simultaneous actions,
resolve one turn, and adapt when noise changes patrols.
**Win:** secure the target and get every surviving crew member to extraction.
**Loss:** the crew is captured, the lockdown closes extraction, or the target
is destroyed.
**Score:** 10 times extracted loot value + 50,000 per surviving crew member +
20,000 per optional objective + 5,000 per unused tool - 2,000 per turn -
25,000 per alarm; tie-break by fewer turns.
**Depth:** visibility, noise, timing, crew abilities, and limited tools combine
into replayable solutions.
**Nonstandard hook:** simultaneous crew orders make every turn a compact
multi-agent plan whose consequences are completely readable.
**Recipient loop:** open a plan replay, attempt the same vault with the same
crew budget, compare alarms/turns, and reveal route differences.
**Touch proof:** tap a crew member, tap a destination/action, and confirm the
turn; preview overlays are zoomable and never depend on hover.

### 14. Wildfire Watch

**Fantasy:** coordinate a small landscape during a fast-changing fire season.
**Core loop:** read wind and fuel, deploy crews, choose burns and firebreaks,
protect towns, and accept that not everything can be saved.
**Win:** keep required communities safe until weather relief arrives.
**Loss:** evacuation routes fail or protected population loss exceeds the
scenario limit.
**Score:** 2,000 per protected resident + 20 per preserved habitat unit + 100
per unused response-credit - crew-risk penalties - unnecessary-suppression
cost; tie-break by lower total evacuation time.
**Depth:** wind, terrain, vegetation, resources, and public movement form a
legible systems puzzle rather than a realism claim.
**Nonstandard hook:** success rewards selective protection and safe tradeoffs,
not painting the entire map as extinguished.
**Recipient loop:** open an incident map, command the same wind/scenario seed,
compare protected areas and crew risk, and inspect the after-action delta.
**Touch proof:** tap regions and choose from large contextual actions; time can
pause for planning and the heat map has non-color encodings. Use a fictional
setting and clearly label the simulation as a game.

### 15. Last Light Foundry

**Fantasy:** keep a dying automated factory alive long enough to manufacture
one impossible machine.
**Core loop:** place compact production modules, route heat and power, fulfill
contracts, repair breakdowns, and redesign under space pressure.
**Win:** complete the final machine before the reactor's last fuel cycle.
**Loss:** permanent grid failure, missed critical contract, or fuel exhaustion.
**Score:** 10 times final output value + 100 per uptime percent + 50 per unused
material + 20,000 per optional contract - 100 per occupied tile - breakdown
penalties; tie-break by lower energy consumed.
**Depth:** power, heat, logistics, wear, and spatial packing interact across a
finite 25–35 minute campaign.
**Nonstandard hook:** the factory is a finite survival machine where heat and
wear force redesign rather than an endless throughput sandbox.
**Recipient loop:** open a blueprint time-lapse, run the same contract/failure
seed, compare footprint and uptime, and fork the data-only layout.
**Touch proof:** place and rotate on a snap grid with a paused build mode;
inspect power/heat layers using large tabs rather than hover tooltips.

## Artifact safety

Bosses, creatures, voxel snapshots, ghosts, and blueprints are a second
moderation surface even though they are not full game uploads. They follow one
data-only artifact contract:

- private or unlisted by default;
- no arbitrary code, URLs, markup, fonts, textures, or audio;
- constrained names/text, dimensions, entity counts, and file sizes;
- immutable creator, game-version, and source-run provenance;
- report, delist, export, and delete controls before any public gallery;
- community browsing only after the artifact type has type-specific abuse and
  rendering tests.

## Portfolio balance

The slate avoids becoming 15 reskinned arcade loops:

| Capability proven | First proof |
| --- | --- |
| Verified scores and replays | Pinball After Dark |
| Daily deterministic challenge | Rail Switch |
| Safe constrained UGC | Boss Foundry |
| Persistent creator artifact | Creature Forge Arena |
| 3D voxel world, save, and showcase | Pocket Realm: Beaconfall |
| Physics ghosts and clips | Ragdoll Relay |
| Private multiplayer rooms | Dead Air Dispatch |
| Simulation and trajectory replay | Orbital Salvage |
| Validated procedural logic | Evidence Board |
| Serializable automation blueprint | Last Light Foundry |
| Turn-based plan replay | Vault Heist |
| Audio-accessible atmospheric play | Ghost Frequency |
| Authored 3D puzzle content | Foldspace |
| Systems-simulation after-action report | Wildfire Watch |
| Deep inventory combinatorics | Backpack Alchemist |

## Research signal

This slate does not copy a current chart, and the charts do not validate the
numeric ratings above. They provide one useful signal only: genre breadth.
successful browser catalogs support rhythm, short social experiments,
decision simulations, horror puzzles, inventory roguelites, survival action,
customization, and multiplayer—not only classic arcade clones. Current
[itch.io top-rated HTML5 games](https://itch.io/games/top-rated/html5) and
[Newgrounds' all-time popular games](https://www.newgrounds.com/games/popular?genre=0&interval=all&sort=views)
both show that breadth. The opportunity is to combine that breadth with a
stricter "complete game" bar and first-class share artifacts.

## Kill rules

Stop or radically rescope a game before content production when:

- a graybox is not fun after three iteration loops;
- fewer than 60% of observed first-time players can state the goal after one
  minute;
- the win state depends on grinding rather than improvement;
- the share artifact reveals nothing interesting about how the player played;
- mobile input becomes a compromised second control scheme;
- a 3D title cannot hold its agreed frame-time and memory budgets on the
  low-spec test device;
- generated content cannot be validated for solvability or fairness.

An unfinished high-opportunity concept is less valuable than a smaller game
that people can finish, master, and share.
