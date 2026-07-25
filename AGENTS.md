# Late Shift Arcade — agent instructions

This project is built under the **dorveille** discipline. Before any work,
read `skills/dorveille/SKILL.md` and follow it for the whole session: state
chip on every response, obey the sleep-pressure table, keep `.dorveille/`
current. The session is not done until N3 runs.

At the end of every WAKE block, run REM and N3, then overwrite the handoff file
for the stream you are working in with current worktree truth and exactly one
next unblocked ticket. Stop before starting that ticket so a fresh session can
resume one block at a time.

Handoff files live in the repository at `docs/handoffs/<stream>.md`, one per
stream — the slugs are `contract`, `site`, `games`, and `platform`, matching
streams A–D in `EXECUTION-PLAN.md`. Do not date-stamp the filename — a handoff
is current truth that gets overwritten, not an archive.
Handoffs used to live in the machine's temp directory; two major documents
nearly vanished from there, and one session's state survived only because
`dev` happened to be pushed. Nothing load-bearing lives outside the repo.

## Branches and release

`dev` is where all work lands. Branch `feat/*` off `dev` and return through a
pull request. CI runs the suite on every pull request and every merge.

**`prod` is frozen and is not yours to move.** It holds the publicly deployed
site, and it advances only when Jeff explicitly decides to make a release live.
Do not merge, push, fast-forward, or open a pull request into `prod`, and do not
treat a green suite or a finished ticket as permission to. The site going public
is a product decision, not a build step.

## Dispatch rules

Paid for with eight lost agent-runs and a rack built at ten times its cost.
None of these are optional:

1. **Dispatch subagents synchronously.** Background runs die with the host
   process and leave nothing behind. If a run is lost, change the dispatch
   *mechanism* before dispatching again — never re-run the same wave.
2. **Build to the assigned tier.** `docs/PATH-TO-30.md` assigns every game a
   tier. Arcade Shorts is the default. Showcase verification — adversarial
   bot proofs, the full browser playtest matrix — is for headliners only;
   demanding it of library filler is the single biggest cost mistake this
   project has made.
3. **Batch Arcade Shorts.** One agent carries two or three small games per
   run; one agent per small game is the wrong granularity.
4. **Agents never edit shared files** (`games/registry.js`, `index.html`,
   charter docs). They ship a self-contained `games/<slug>/` folder; the
   orchestrator wires the entry.
5. **Agents commit and push before they are finished.** A pushed half-game
   beats an unpushed whole one.
6. **Deliverables land in the repository, never a temp or scratchpad path.**
7. **Parallel agents get isolated worktrees.** Two agents sharing one
   checkout swap HEAD under each other and cross-pollute branches — it
   happened the first time it was tried. One agent per worktree, always.

## Platform charter

Late Shift Arcade is a curated compendium of small, complete, AI-made browser
games. The deployed eight-game site remains supported as the **Legacy Rack**
while the platform grows around it. See `SPEC.md` for the product contract,
`GAME_ROADMAP.md` for the game and release bar, and `tickets.md` for the ordered
delivery slices.

Keep each WAKE block to one named ticket or game deliverable. Do not add lore,
mascots, or infrastructure outside that slice. A framework, Worker, database,
auth system, package dependency, or build step enters the repository only when
an approved ticket requires it. Do not touch anything outside this repository.

## Runtime and trust classes

Trust follows code provenance, not rendering technology. These classes have
different execution privileges even when they satisfy the same versioned game
contract:

| Class | Execution and trust | Contributor rules |
| --- | --- | --- |
| **Shell** | Trusted platform code on the platform origin | Own navigation, catalog presentation, lifecycle, shared input, score presentation, and every identity/storage capability boundary. Keep game-specific rules out of the shell. |
| **First-party 2D cartridges** | Trusted same-origin vanilla ES modules using the shell-owned canvas | Evolve the current cartridge interface only through a roadmap migration ticket that keeps all eight games runnable through a compatibility adapter. Each launch creates a fresh validated instance; cartridges own no host globals. The Legacy Rack stays zero-dependency and build-free. |
| **First-party 3D cartridges** | Trusted first-party games delivered as isolated builds | Keep Three.js/WebGL dependencies and build output outside the static shell dependency graph. Communicate through the versioned game contract and dispose runtime, listener, and GPU resources on exit. |
| **Community cartridges** | Reviewed but untrusted packages served from a separate origin inside a restrictive-CSP sandboxed iframe | Cross the platform seam only through capability-scoped messages in the versioned game contract. Community code never shares the platform origin or receives platform identity, session, credential, or storage privileges. Review permits publication; it does not elevate trust. |

## Shared game rules

- Keep canonical simulation state in plain, serializable, renderer-independent
  data. Pure rules advance it; Canvas, DOM, audio, Three.js, and WebGL objects
  are disposable projections. Keep network and storage adapters outside the
  simulation.
- Keep seeded randomness and saveable state outside render objects wherever
  practical.
- Support keyboard/pointer and touch for every playable game. Add controller
  support when it materially improves the game.
- Test pure game logic with `node --test`. N3 replay runs `npm test` plus the
  verification required by the active ticket.
- Every new public game must satisfy the canonical **complete-game** and
  **release-proof** contracts in `GAME_ROADMAP.md`; reference those sections
  rather than copying a competing checklist here.

## AI-made disclosure

“AI-made” means a disclosed material AI contribution to design, code, art,
audio, testing, or iteration; human editing is expected and raw prompts are
not required for publication.

## Legacy Rack preservation

The shell and current eight first-party 2D cartridges remain a supported
zero-dependency static site throughout later migrations. `index.html` must run
from a static file server as-is, with no build step. Preserve their current
cartridge lifecycle, local scores, keyboard/mouse/touch play, pure-logic tests,
and GitHub Pages rollback throughout every migration. Retiring that compatibility
contract requires an explicit charter and deprecation decision, not merely a
migration ticket.
