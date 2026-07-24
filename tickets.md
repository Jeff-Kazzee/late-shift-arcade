# Late Shift Arcade — platform and compendium tickets

Status: proposed execution backlog
Roadmap: [GAME_ROADMAP.md](GAME_ROADMAP.md)
Ticket rule: each ticket must end in a demoable user-visible capability, keep
tests green, and fit one focused implementation context.

## Target release

The completed system is a curated browser-game platform where:

- public games are playable without an account;
- optional email-code accounts save global scores and creator identity;
- every game has a versioned contract, win/loss state, score definition, and
  share artifact;
- users can submit games under a developer profile;
- submissions remain private until reviewed and approved;
- published community games run without access to platform identity, cookies,
  or arbitrary network APIs;
- moderators can suspend, delist, restore, and audit games and versions;
- users can export or delete their account data without emailing an operator;
- private multiplayer rooms work without open chat or stranger matchmaking;
- the existing eight games remain playable throughout the migration.

This is a best-faith hobby-project safety baseline, not a claim of universal
legal compliance. Data minimisation, clear notices, access/export, correction,
erasure, and portability are product requirements because those are among the
rights described by the
[European Data Protection Board](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).

## Architecture decision to ratify in F-001

Use complexity only when a feature pays for it:

| Surface | Proposed implementation | Reason |
| --- | --- | --- |
| Existing shell and 2D first-party games | Static HTML, CSS, vanilla ES modules, canvas | Preserve the current cheap, reliable rack |
| API and static production edge | Cloudflare Worker | One small deployment surface for auth callbacks and APIs |
| Accounts | WorkOS AuthKit hosted email-code flow | Avoid storing passwords or building auth recovery |
| Profiles, scores, catalog, submissions | Cloudflare D1 | Relational data, migrations, cheap idle footprint |
| Approved game packages and share media | Cloudflare R2 | Immutable version artifacts and generated postcards |
| Private rooms and live game state | SQLite-backed Durable Objects | One coordinator per room with hibernating WebSockets |
| First-party 3D cartridges | Isolated Three.js builds | Direct WebGL control without contaminating the static shell |
| Community cartridges | Separate origin + restrictive CSP + sandboxed iframe | Untrusted code never shares the platform origin |

As of 2026-07-24, official pricing pages put AuthKit below one million monthly
active users at $0, D1 includes a Workers Free tier, R2 includes a free tier,
and SQLite-backed Durable Objects are available on Workers Free. These are
reasons to trial the stack, not promises that pricing will remain unchanged:
[WorkOS pricing](https://workos.com/pricing),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/), and
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
WorkOS currently requires
[billing information to unlock production](https://workos.com/docs/authkit/environments)
even when AuthKit usage remains inside its free allowance, so P-002 must record
that operator decision rather than treating "free" as "no account commitment."

## Dependency spine

| Release train | Depends on | Demonstrates |
| --- | --- | --- |
| R0 — contract | current rack | The old site can evolve without breaking |
| R1 — player spine | R0 | Browse, finish, score, sign in, share, delete |
| R2 — creator spine | R1 | Submit, review, publish, attribute, remove |
| R3 — compendium waves | R1; R2 where noted | Fifteen deeper games in ranked build order |
| R4 — social play | R1 + first multiplayer title | Private rooms and asynchronous challenges |
| R5 — durable launch | R1–R4 | Production cutover, recovery, moderation operations |

## Definition of done for every ticket

- The named user journey works from its real entry point, not only a test
  harness.
- Pure rules remain separate from rendering and network adapters.
- Schema and game-contract changes are versioned and backward compatible during
  migration.
- Keyboard/pointer and touch paths are tested when the surface is playable.
- Loading, empty, error, retry, and offline states are deliberate.
- `npm test`, syntax checks, `git diff --check`, and relevant browser playtests
  pass.
- Canvas/WebGL work includes screenshot review; 3D work includes an agreed
  frame-time, memory, and low-spec-device check.
- Documentation states what data is stored and how to remove it.
- A ticket is not done with an unbounded TODO hidden in its acceptance path.

---

## R0 — change the contract without breaking the rack

### F-001 — Ratify the platform charter

**Outcome:** replace the repo's hard eight-game ceiling with the curated
compendium contract while explicitly preserving the Legacy Rack.

**Work**

- Rewrite `AGENTS.md` and `SPEC.md` around a shell, first-party cartridges,
  isolated 3D builds, and reviewed community cartridges.
- Record supported runtime types, trust levels, and the rule that simulation
  state stays outside render objects.
- Define "AI-made" as a disclosed material AI contribution to design, code,
  art, audio, testing, or iteration; human editing is expected and raw prompts
  are not required for publication.
- Record the complete-game and release-proof checklists from
  `GAME_ROADMAP.md`.
- Keep the current static site runnable during every later migration.

**Acceptance**

- [ ] A contributor can tell which rules apply to the shell, first-party 2D,
  first-party 3D, and community code.
- [ ] The old eight-game completion criteria still pass.

**Blocked by:** none.

### F-002 — Versioned catalog manifest

**Outcome:** the home screen renders first-party and future community entries
from one validated, versioned metadata shape.

**Work**

- Add fields for slug, immutable version, creator, runtime, trust level,
  modes, goal, score label, controls, artwork, release status, and content
  notes, plus a concise `made with` disclosure and optional source link.
- Adapt the current registry behind the new manifest without changing game
  behavior.
- Add catalog validation and malformed-entry tests.

**Acceptance**

- [ ] The same manifest powers the cabinet card and a direct game-detail URL.
- [ ] Invalid or suspended entries cannot be launched.

**Blocked by:** F-001.

### F-003 — Universal run receipt

**Outcome:** every game can report a start, finish, win/loss, score breakdown,
seed, duration, version, and optional replay reference through one protocol.

**Work**

- Define a serializable run receipt and lifecycle messages.
- Give guest runs stable local IDs without fingerprinting the player.
- Render a standard post-run screen with retry, share, and cabinet actions.
- Preserve existing local high scores through an adapter.

**Acceptance**

- [ ] Pong emits and displays a complete receipt after both a win and a loss.
- [ ] Duplicate finish messages cannot create duplicate runs.

**Blocked by:** F-002.

### F-004 — Shareable result links

**Outcome:** a player can share a compact result card and URL that opens the
correct game/version without exposing personal data.

**Work**

- Create checksum-protected guest result payloads with strict size limits;
  server signing arrives only after verified-run infrastructure exists.
- Render social-card metadata and a browser-downloadable image.
- Add copy-link and native share actions with a clipboard fallback.

**Acceptance**

- [ ] A guest Pong result opens on a second browser with its score, outcome, and
  game version intact.
- [ ] Guest payloads are always labeled unverified; a checksum detects corruption,
  not authorship or honest play.
- [ ] A corrupt payload is rejected rather than rendered or submitted.

**Blocked by:** F-003.

### F-005 — Legacy Rack migration, games 1–4

**Outcome:** Pong, Breakout, Air Hockey, and Asteroid Defender use the new
manifest and run-receipt protocol.

**Acceptance**

- [ ] Existing saves/high scores survive.
- [ ] Each game declares its win/loss and score breakdown.
- [ ] All four produce result cards on desktop and touch.

**Blocked by:** F-002, F-003, F-004.

### F-006 — Legacy Rack migration, games 5–8

**Outcome:** Galaxy Raid, Neon Snake, Lunar Descent, and Midnight Run use the
new manifest and run-receipt protocol.

**Acceptance**

- [ ] Existing saves/high scores survive.
- [ ] All eight cabinet games now use the new path; the compatibility adapter can
  be removed.
- [ ] Pixel Life remains source-preserved and explicitly unpublished.

**Blocked by:** F-005.

---

## R1 — player platform spine

### P-000 — Player privacy and adult-intended notice

**Outcome:** before an account is activated or nonessential measurement starts,
a visitor can read the exact data purposes, retention, providers, rights, and
adult-intended posture in plain language.

**Work**

- Publish privacy and data-control pages with effective versions.
- Let guest play remain account-free; store only a local acknowledgement of
  the adult-intended entrance notice, not a date of birth or identity document.
- Decide and document consent/opt-out behavior for nonessential product-health
  events before collecting them.

**Acceptance**

- [ ] A fresh browser sees the adult-intended notice before entering the public
  catalog and can leave without data submission.
- [ ] The notice links directly to export/delete instructions and names provider
  processing separately from application storage.

**Blocked by:** F-001.

### P-001 — Cloudflare preview environment

**Outcome:** a non-production Worker serves the unchanged static rack and a
health API without moving the public site.

**Work**

- Add environment-separated Worker configuration and secrets documentation.
- Serve static assets with cache/version headers and SPA-free route handling.
- Add a health endpoint and deployment receipt containing the Git commit.

**Acceptance**

- [ ] Preview boots all eight games, has no console regressions, and reports its
  exact commit.
- [ ] GitHub Pages remains the production rollback.

**Blocked by:** F-001.

### P-002 — Passwordless account vertical slice

**Outcome:** a visitor can sign in through hosted WorkOS AuthKit, choose a
public handle, accept the adult-intended account notice, and sign out.

**Work**

- Require the adult-intended acknowledgement before redirecting to hosted auth;
  never activate a platform profile/session until the current notice is
  accepted.
- Use email-code authentication; do not store passwords.
- Store only WorkOS subject ID, normalized unique handle, notice version and
  acceptance time, role, and timestamps in D1.
- Keep public game play available without an account.
- Add session rotation, CSRF/state validation, and generic auth errors.

**Acceptance**

- [ ] A new user completes sign-in and returns to the game they came from.
- [ ] A platform account cannot be activated without the current 18+
  self-attestation, even if a provider identity was partially created.
- [ ] No date of birth, government ID, address, or demographic profile is stored.

**Blocked by:** P-000, P-001.

### P-003 — Global leaderboard tracer bullet

**Outcome:** a signed-in Pong player can submit one run and appear on global,
weekly, and personal-best boards; guests retain local scores.

**Work**

- Add indexed D1 tables for game versions, runs, and leaderboard projections.
- Make writes idempotent on run ID.
- Show verified/unverified status and game version on entries.
- Add pagination and sane per-user/per-game limits.

**Acceptance**

- [ ] The board updates after a real completed match.
- [ ] Retrying a request cannot duplicate a score.
- [ ] Suspended users and game versions are omitted without deleting audit data.

**Blocked by:** P-002, F-003.

### P-004 — Server-seeded verified runs

**Outcome:** one deterministic game issues a server seed, records compact
inputs, replays the run server-side or in an isolated verifier, and marks
matching scores verified.

**Work**

- Version the simulation and replay format.
- Reject impossible duration, score, seed, or input sequences.
- Keep unverified community scores visibly separate instead of pretending
  arbitrary client code is trustworthy.

**Acceptance**

- [ ] A valid replay reproduces its result.
- [ ] A modified score, truncated input log, and old incompatible version all fail
  closed with understandable status.

**Blocked by:** P-003.

### P-003A — Legacy global boards, games 1–4

**Outcome:** Pong, Breakout, Air Hockey, and Asteroid Defender write and read
global, weekly, and personal-best boards through their migrated run receipts.

**Acceptance**

- [ ] Each real game UI submits one idempotent run and renders its board.
- [ ] Runs without a compatible verifier remain visibly unverified and never
  enter a verified-only view.

**Blocked by:** F-005, P-003.

### P-003B — Legacy global boards, games 5–8

**Outcome:** Galaxy Raid, Neon Snake, Lunar Descent, and Midnight Run complete
the Legacy Rack's global-score migration.

**Acceptance**

- [ ] Each real game UI submits one idempotent run and renders its board.
- [ ] Guest local scores, offline retry, version labels, and suspension filters
  behave consistently across all eight games.

**Blocked by:** F-006, P-003A.

### P-005 — Self-service account export and deletion

**Outcome:** a signed-in user can download and delete the profile and score data
introduced through P-003 without contacting an operator.

**Work**

- Export profile and runs in machine-readable JSON.
- Show a deletion preview covering profile, public handle, and leaderboard
  entries.
- Revoke sessions, delete WorkOS identity, remove D1 personal rows, and queue
  leaderboard projection removal.
- Make deletion resumable and idempotent.

**Acceptance**

- [ ] A test account can export, delete, fail to sign back in with the old session,
  and no longer appear on public boards.
- [ ] Partial provider failure produces a retryable deletion job and operator
  alert, not a false success.
- [ ] Every later ticket that stores account-owned data must add its own export and
  deletion adapter plus a black-box test; private moderator notes, security
  evidence, and another person's data are never included in a user export.

**Blocked by:** P-002, P-003.

### P-006 — Minimal product-health events

**Outcome:** the operator can answer whether games boot, finish, replay, and
share without building a demographic dossier.

**Work**

- Define a short allowlist: page view, boot result, run start/end, share
  action, challenge open, and client error class.
- Use random daily-rotating guest session IDs and delete raw events after 30
  days; application tables never store raw IP, full user agent, free text, or
  cross-site identifiers. Document and minimize provider/edge logs separately.
- Add per-game completion, replay, challenge-open, and failure-rate views.
- Document purpose and retention for every field.

**Acceptance**

- [ ] A game-health view can identify a broken game version.
- [ ] The event endpoint rejects unknown fields and oversized payloads.
- [ ] An expiry test removes events older than 30 days, and the notice's opt-out or
  consent choice is honored by a live browser session.

**Blocked by:** P-000, P-001, F-003.

### P-007 — Abuse and rate-limit baseline

**Outcome:** the existing auth and score endpoints resist cheap automation
through reusable controls that later write endpoints must integrate and prove.

**Work**

- Apply endpoint-specific rate limits and payload ceilings.
- Add Cloudflare Turnstile to suspicious/high-cost write paths, not ordinary
  play.
- Normalize handles and block impersonation/control characters.
- Add security headers, origin checks, structured audit events, and secret
  rotation instructions.
- Publish the reusable rate-limit/Turnstile adapter and require every later
  submission, report, artifact, and share ticket to add a live integration
  test for its own endpoint.

**Acceptance**

- [ ] Automated tests cover replay, CSRF, oversized bodies, malformed origins, and
  rate-limit behavior.
- [ ] Ordinary guest play has no challenge widget.

**Blocked by:** P-002, P-003.

### P-008 — Compendium browsing

**Outcome:** guests can browse, search, and filter public games without losing
the arcade's visual identity.

**Work**

- Add game detail, creator, genre, mode, newest, and search-result views.
- Use catalog metadata rather than bespoke page markup.
- Make public routes indexable.

**Acceptance**

- [ ] Keyboard and touch can search by title, filter genre/mode, clear filters, and
  open every Legacy Rack detail page.
- [ ] Empty and zero-result states lead back to playable games.

**Blocked by:** F-002.

### P-008A — Favorites and recently played

**Outcome:** guests keep a local library and signed-in players can synchronize
favorites and recent games across devices.

**Acceptance**

- [ ] Favorite, unfavorite, recent-play ordering, guest-to-account merge, and
  offline retry work through their real UI.
- [ ] Export and deletion include the synchronized library.

**Blocked by:** P-002, P-005, P-008.

### P-009 — Daily Shift and cross-game achievements

**Outcome:** the site offers one rotating, deterministic three-game set and a
small achievement cabinet without inventing a manipulative grind.

**Work**

- Publish the daily seed and exact game versions.
- Award achievements from run receipts through idempotent rules.
- Limit achievements to mastery or exploration; no daily-login punishment.

**Acceptance**

- [ ] A guest can complete a local Daily Shift; a signed-in player can save it.
- [ ] Historical shifts remain replayable but cannot overwrite the dated board.
- [ ] Export and deletion cover achievements and saved Daily Shift history.

**Blocked by:** F-006, P-003B.

### P-010 — Post-run enjoyment signal

**Outcome:** after finishing a game, a signed-in player can leave one reversible
"recommend" or "not for me" signal per game version without comments or a
public identity trail.

**Acceptance**

- [ ] Changing a reaction updates the aggregate exactly once and never changes a
  skill score.
- [ ] Catalog recommendation counts have a minimum-sample threshold and basic
  abuse limits; export/delete covers the private reaction row.

**Blocked by:** P-003, P-005, P-008.

### P-011 — Player-created artifact lifecycle

**Outcome:** data-only bosses, creatures, voxel snapshots, ghosts, and
blueprints can be saved unlisted, shared by immutable link, reported, delisted,
exported, and deleted through one bounded artifact contract.

**Work**

- Constrain text, dimensions, entity counts, binary media, provenance, and
  supported artifact types; no executable content is accepted.
- Default new artifacts to private/unlisted and require an explicit publish
  action for any future gallery.
- Store generated media separately from authoritative data and retain the
  creator/game/version/run provenance.

**Acceptance**

- [ ] A signed-in user saves, shares, reports, delists, exports, and deletes a test
  artifact through the real UI.
- [ ] Oversized data, disallowed text, executable fields, and suspended-source
  versions fail closed.

**Blocked by:** P-005, P-007, C-007A.

---

## R2 — creator, submission, and moderation spine

### C-000 — Creator submission and license terms

**Outcome:** before a package can be submitted, a creator can read and accept
the exact hosting license, content rules, review process, version immutability,
attribution, delisting, and takedown behavior.

**Acceptance**

- [ ] A submission cannot be created without the current terms version and an
  affirmative declaration that the submitter has the necessary rights.
- [ ] The terms state that creators retain copyright and grant a non-exclusive
  license to host, display, cache, test, and promote the submitted version.

**Blocked by:** F-001, P-000.

### C-001 — Developer profiles and attribution

**Outcome:** an account can opt into a developer profile with bio, links, and
an attributed catalog of published games.

**Work**

- Separate private email identity from public handle and developer profile.
- Sanitize text and restrict links to reviewed HTTP(S) URLs.
- Support multiple credited developers with explicit roles.

**Acceptance**

- [ ] A user creates and edits a developer profile, sees an honest empty catalog,
  and cannot inject markup or an unreviewed link scheme.
- [ ] Changing a handle does not break the immutable profile URL.
- [ ] Export/delete includes the profile and safely pseudonymizes later public
  attribution through an adapter contract.

**Blocked by:** P-002, P-008.

### C-002 — Submission intake

**Outcome:** a developer can submit a Git repository URL or ZIP package, see
requirements before upload, and track a private review status.

**Work**

- Collect title, version, runtime type, goal, score contract, controls,
  content notes, source/package, license declaration, AI contribution summary,
  and co-creator credits.
- Store ZIPs in a private R2 quarantine bucket with strict type/size limits.
- Run Turnstile and rate limits on package submission.
- Require a new declaration for every version.

**Acceptance**

- [ ] A valid small sample reaches `submitted`; bad types, traversal paths,
  duplicate versions, and oversize archives are rejected.
- [ ] Nothing submitted is publicly executable or downloadable.

**Blocked by:** C-000, C-001, P-007.

### C-003 — Community cartridge security contract

**Outcome:** a documented sample game runs inside a platform-controlled
bootstrap on a separate origin with no platform cookies, identity, navigation,
form submission, download, or arbitrary network access, and can be killed when
it becomes unresponsive.

**Work**

- Define a minimal `postMessage` protocol for nonce handshake, ready, heartbeat,
  pause, input mode, run receipt, resize, and exit.
- Apply a restrictive CSP and iframe sandbox without `allow-same-origin`.
- Serve an allowlisted static asset graph from a platform bootstrap; submitted
  code never controls the top-level document or response headers.
- Deny external fetch/XHR, WebSocket, EventSource, beacon, image, media, font,
  style, form, navigation, redirect, popup, and download egress by default.
- Treat the sandbox's opaque `null` origin as expected; authenticate the launch
  with `event.source`, a per-launch nonce, schema, frequency, and size limits.
- Add boot timeout, heartbeat timeout, message-rate ceiling, shell-owned eject,
  and recovery from runtime/resource failure.

**Acceptance**

- [ ] The sample game boots and finishes through the platform shell.
- [ ] A hostile browser fixture proves the egress paths above, parent/storage
  access, nonce spoofing, message flood, boot hang, and runtime failure are
  blocked or safely ejected.
- [ ] Manual approval never changes submitted code from untrusted to trusted.

**Blocked by:** F-003, P-001.

### A-001 — Moderator access lifecycle

**Outcome:** the first moderator can be granted, stepped up, audited, revoked,
and recovered without any client-controlled role mutation.

**Work**

- Provide a server-only grant/revoke path separated by environment.
- Require recent MFA/step-up for approval, suspension, restore, role change,
  and destructive data actions.
- Add immutable privilege audit and a documented break-glass recovery path.

**Acceptance**

- [ ] A client/API attempt to self-promote fails closed and is audited.
- [ ] Grant, step-up, destructive action, revoke, and break-glass recovery are
  exercised in a non-production environment.

**Blocked by:** P-002, P-007.

### C-004 — Package inspection and moderator review

**Outcome:** a moderator sees a reproducible report and can approve, request
changes, or reject a submission.

**Work**

- Normalize archives and reject executable/server files, path traversal,
  source maps with secrets, remote URLs, oversized assets, and undeclared
  entry points.
- Show file inventory, hashes, permissions requested, screenshots, automated
  smoke result, and score-trust classification.
- Keep moderator notes private; send creators structured public reasons.

**Acceptance**

- [ ] A deliberately malicious fixture is quarantined with specific findings.
- [ ] Approval requires a named moderator, checklist version, and immutable package
  hash.

**Blocked by:** A-001, C-002, C-003.

### C-005 — Moderation, report, and appeal policy

**Outcome:** before publication, players and creators can understand what can
be reported, how moderation decisions work, and how to request review.

**Work**

- Write concise community-game, acceptable-content, report, appeal, ownership
  dispute, emergency suspension, and creator-delisting pages.
- State which public decision records can be exported and which private
  moderator/security evidence is excluded.

**Acceptance**

- [ ] Every policy has an effective date and a plain-language summary.
- [ ] A report and creator appeal can reference the exact decision and policy
  version without exposing private notes.

**Blocked by:** C-000, P-005.

### C-006 — Approve and publish one community game

**Outcome:** an approved sample moves from quarantine to an immutable public
version, appears under its developer, launches in the sandbox, and can be
delisted.

**Work**

- Copy the reviewed hash to a public R2 release prefix.
- Publish catalog metadata transactionally only after the artifact is ready.
- Label score trust and requested capabilities on the detail page.
- Provide release and rollback receipts.

**Acceptance**

- [ ] The full submit → review → approve → discover → play → result journey works.
- [ ] Delisting removes new launches immediately while preserving the audit trail.

**Blocked by:** C-004, C-005.

### C-007 — Immutable versions and rollback

**Outcome:** a creator can submit an update without replacing old code, promote
an approved version, and roll back a broken active version.

**Work**

- Make versions immutable and let catalog aliases point to one active version.
- Preserve old replay viewing only when its version remains safe.
- Add version rows to creator export and deletion/delist previews.

**Acceptance**

- [ ] A broken v2 rolls back to v1 without changing either artifact.
- [ ] Submit-update, approve, promote, and rollback each produce an immutable
  release receipt through the real UI.

**Blocked by:** C-006.

### C-007A — Reports, takedown, restore, and appeal

**Outcome:** a player can report a published game, a creator can request
delisting or appeal, and a stepped-up moderator can suspend or restore it with
an auditable reason.

**Acceptance**

- [ ] Report, triage, emergency suspend, creator delist, appeal, ownership dispute,
  restore, and notification each have a black-box test.
- [ ] Suspended versions stop new launches and scores while safe historical records
  remain auditable; artifact and room tickets add their own enforcement when
  those capabilities exist.
- [ ] A decision receipt records actor, reason category, policy version, time,
  affected versions, and notification status.

**Blocked by:** A-001, C-005, C-007.

### C-008 — Creator documentation and starter cartridge

**Outcome:** a developer can fork a tiny sample, implement a goal and score,
test it locally in the real sandbox, and submit it without private guidance.

**Work**

- Publish the manifest schema, protocol, size limits, security limits,
  accessibility checklist, score-trust rules, and review rubric.
- Include pure-logic tests, touch input, win/loss, a result receipt, and local
  sandbox preview in the sample.

**Acceptance**

- [ ] A clean-machine walkthrough produces an accepted test submission.
- [ ] The starter contains no production secret or origin assumption.

**Blocked by:** C-003, C-006.

---

## R3 — game build tickets

All game releases use the standard game contract in `GAME_ROADMAP.md`. A
release ticket includes goal onboarding, win/loss, score breakdown, local and
signed-in high scores, share artifact, pure simulation tests, browser
screenshots, touch play, pause/resume, audio controls, and reduced-motion
behavior. A graybox ticket may omit production art, but never the complete
session loop.

### G-001 — Pinball After Dark: complete graybox

**Build priority:** 1.

**Outcome:** a player can launch, aim, nudge, light four districts, clear the
Blackout multiball, or drain three balls on a deterministic graybox table.

**Acceptance**

- [ ] Physics, flippers, targets, tilt, contracts, win/loss, and score breakdown
  are testable outside rendering.
- [ ] A 10-minute playtest yields at least two strategic shot choices.

**Blocked by:** F-003.

### G-002 — Pinball After Dark: presentation release

**Build priority:** 1.

**Outcome:** production table art, sound, onboarding, touch controls, local
score, and result screen ship as the first polished new game.

**Acceptance**

- [ ] Desktop and touch can both make aimed shots and controlled nudges.
- [ ] Art, audio, reduced motion, pause, restart, and three complete-run browser
  paths pass without needing accounts or APIs.

**Blocked by:** G-001, P-008.

### G-002A — Pinball After Dark: competitive release

**Build priority:** 1 completion gate.

**Outcome:** daily contract ordering, replay verification, global board,
challenge link, and heat-map result card connect the polished table to the
platform spine.

**Acceptance**

- [ ] A verified run reproduces score and table state; tampered input fails closed.
- [ ] A second browser opens the challenge, plays the same daily rules, compares
  district splits, and rematches.

**Blocked by:** G-002, P-004, P-009.

### G-003 — Rail Switch: complete shift graybox

**Build priority:** 2.

**Outcome:** one authored shift delivers the complete switch, signal, delivery,
delay-budget, collision, win/loss, local score, and touch loop.

**Acceptance**

- [ ] Pure simulation tests reproduce routing, timing, collision, delay, and score.
- [ ] A first-time touch player can finish or fail a shift and explain why.

**Blocked by:** F-003, P-008.

### G-003A — Rail Switch: Daily Dispatch release

**Build priority:** 2 completion gate.

**Outcome:** two more authored shifts, validated seeded Daily Dispatch, replay,
verified board, and challenge comparison complete the public release.

**Acceptance**

- [ ] Every published seed is validated as solvable.
- [ ] The replay explains collisions and failed delivery budgets, and a second
  browser can challenge the same schedule.

**Blocked by:** G-003, P-004, P-009.

### G-004 — Boss Foundry: builder and validator

**Build priority:** 3.

**Outcome:** a player constructs a boss from constrained attack modules,
passes automated fairness checks, defeats it once, and saves a private
immutable challenge.

**Acceptance**

- [ ] Threat budgets, telegraph minimums, collision rules, and impossible pattern
  rejection are deterministic and tested.
- [ ] No arbitrary script, asset, text, or external URL enters a boss definition.

**Blocked by:** F-003, C-001.

### G-005 — Boss Foundry: community challenge release

**Build priority:** 3 completion gate.

**Outcome:** validated bosses can be published, challenged, scored, reported,
and shown on creator profiles.

**Acceptance**

- [ ] Creator score rewards fair engagement rather than maximizing player deaths.
- [ ] A suspended boss stops new challenges without affecting the base game.

**Blocked by:** G-004, C-007A, P-011.

### G-006 — Creature Forge Arena: tournament release

**Build priority:** 4.

**Outcome:** players assemble creatures under mass/power limits, configure a
priority deck, and complete a three-fight local graybox tournament.

**Acceptance**

- [ ] Geometry, power routing, parts, AI priorities, and combat are serialized
  simulation data.
- [ ] Two materially different builds can win the three-fight bracket.

**Blocked by:** F-003, C-001.

### G-006A — Creature Forge Arena: shared bouts

**Build priority:** 4 completion gate.

**Outcome:** production presentation, a five-fight tournament, and validated
build sharing let a recipient fight a same-tier creature, compare results, and
let the creator delist the artifact.

**Acceptance**

- [ ] Imported builds are data-only, budget-validated, unlisted by default, and
  tied to their creator/game version.
- [ ] Share, bout, report, delist, export, and delete work end to end.

**Blocked by:** G-006, P-011.

### G-007 — First-party 3D cartridge boundary

**Outcome:** one minimal Three.js scene launches from the compendium, uses the
universal input/run protocol, disposes all GPU resources on exit, and has a
low-spec fallback.

**Work**

- Isolate build output from the dependency-free shell.
- Define camera, coordinate, asset, chunk/scene budget, save, diagnostics, and
  WebGL context-loss conventions.
- Keep simulation state outside Three.js objects and text-heavy UI in DOM.

**Acceptance**

- [ ] Repeated launch/eject cycles do not grow canvas, listener, or GPU resource
  counts.
- [ ] Mobile resize, pause, visibility change, and context recovery are verified.

**Blocked by:** F-001, F-003, P-001.

### G-008 — Pocket Realm: Beaconfall vertical slice

**Build priority:** 5.

**Outcome:** on one small seeded island, a player can mine, place blocks, craft
one beacon from one resource/recipe, survive one enemy type during a short
charge, and extract or lose within five minutes.

**Acceptance**

- [ ] The complete loop uses no placeholder command to skip mining, crafting,
  assault, or extraction.
- [ ] World generation, inventory, recipe, beacon state, enemy, and score are
  deterministic simulation modules.
- [ ] The one-minute touch graybox proves move/look/mine/place/craft before the
  ticket expands beyond one resource and one enemy.

**Blocked by:** F-003, G-007.

### G-008A — Pocket Realm: save and browser lifecycle

**Build priority:** 5 foundation.

**Outcome:** the five-minute expedition can save, resume, pause, survive tab
visibility changes, recover WebGL context, and reject incompatible saves.

**Acceptance**

- [ ] Save/resume at mining, crafting, assault, and extraction boundaries
  reproduces inventory, world, RNG, beacon, enemy, and score state.
- [ ] Corrupt and old-version saves fail safely without damaging other local data.

**Blocked by:** G-008.

### G-009 — Pocket Realm: strategy layer

**Build priority:** 5 depth.

**Outcome:** a second resource path, defensive and traversal block roles, one
optional objective, and one unlock modifier create at least three viable ways
to finish a 12-minute expedition.

**Acceptance**

- [ ] Every block type serves traversal, defense, power, crafting, or beacon
  construction; decorative palette variants do not masquerade as mechanics.
- [ ] Playtests show at least three viable build/extraction strategies.

**Blocked by:** G-008A.

### G-009A — Pocket Realm: biome campaign pack

**Build priority:** 5 depth.

**Outcome:** two additional biomes reuse the proven systems with distinct
resource/enemy rules and form a finite 20-minute campaign.

**Acceptance**

- [ ] All three biomes remain solvable across validated seed samples.
- [ ] The new biomes change strategic choices rather than only visuals and health
  values.

**Blocked by:** G-009.

### G-009B — Pocket Realm: performance release gate

**Build priority:** 5 completion gate.

**Outcome:** chunk, entity, memory, draw-call, save-size, and loading budgets
hold under worst-case approved worlds with a documented low-spec fallback.

**Acceptance**

- [ ] Automated stress fixtures and representative phone/desktop captures stay
  within the ratified budgets.
- [ ] Context loss, memory pressure, long frames, and fallback mode do not corrupt
  the expedition or score.

**Blocked by:** G-009A.

### G-010 — Pocket Realm: build showcase

**Build priority:** 5 completion gate.

**Outcome:** a completed expedition produces a build postcard, short
flythrough, seed link, and immutable tour/challenge snapshot on the creator's
profile.

**Acceptance**

- [ ] Shared snapshots have strict block/entity/asset limits and no executable
  content.
- [ ] Deleting a private snapshot removes its media and profile link.

**Blocked by:** G-009B, P-011.

### G-011 — Ragdoll Relay: local course release

**Build priority:** 6.

**Outcome:** two short physics courses ship with parcel integrity, route
choices, recovery controls, local score, and a finish/wipeout result.

**Acceptance**

- [ ] Touch controls preserve momentum control rather than becoming auto-play.
- [ ] Parcel/body physics, checkpoints, resets, style events, and score remain
  deterministic outside rendering.

**Blocked by:** F-003, G-007.

### G-011A — Ragdoll Relay: ghost-race release

**Build priority:** 6 completion gate.

**Outcome:** three more courses, compact asynchronous ghosts, challenge links,
and bounded wipeout clips complete the public release.

**Acceptance**

- [ ] A second browser races the same version against the sender's ghost and
  compares checkpoint splits.
- [ ] Ghosts and clips are size-limited, reportable artifacts with version checks.

**Blocked by:** G-011, P-011.

### M-001 — Private room and fixed-signal service

**Outcome:** two invited players join a short-lived room by code, reconnect,
exchange bounded game-state messages, use fixed pings, and leave cleanly.

**Work**

- Use one SQLite-backed Durable Object per room with hibernating WebSockets.
- Store no open chat history because there is no open chat.
- Add host controls, expiry, block/report, presence limits, and protocol
  versioning.
- Bind every game room to an active immutable game version and reject creation
  or reconnect after that version is suspended.

**Acceptance**

- [ ] Unknown clients cannot enumerate or join rooms.
- [ ] Disconnect/reconnect and room expiry work without orphaned active sessions.

**Blocked by:** P-002, P-007, P-001.

### G-012 — Dead Air Dispatch: one-mission co-op graybox

**Build priority:** 7.

**Outcome:** two invited players complete one five-minute rescue mission using
asymmetric map and vehicle views plus fixed communication tools.

**Acceptance**

- [ ] Both roles are individually playable on touch and desktop.
- [ ] There is no stranger matchmaking, voice, text chat, or free-text room name.

**Blocked by:** F-003, M-001.

### G-012A — Dead Air Dispatch: mission pack release

**Build priority:** 7 completion gate.

**Outcome:** two more missions, role-swap rematch, synchronized replay, team
result card, and challenge invite complete the public release.

**Acceptance**

- [ ] Synchronized replay reconstructs both views and fixed signals.
- [ ] A result link invites one partner into the same mission, then compares
  survivor/time splits after the rematch.

**Blocked by:** G-012, P-011.

### G-013 — Orbital Salvage: one-contract graybox

**Build priority:** 9.

**Outcome:** one authored contract ships the complete gravity planning, tether,
heat, fuel, docking, win/loss, and local-score loop.

**Acceptance**

- [ ] Physics is stable under fixed time steps and long-frame recovery.
- [ ] The trajectory preview helps plan but does not solve dynamic hazards.

**Blocked by:** F-003.

### G-013A — Orbital Salvage: seeded contract release

**Build priority:** 9 completion gate.

**Outcome:** two more authored contracts, a validated seeded contract,
trajectory replay, verified board, and recipient challenge complete release.

**Acceptance**

- [ ] A second browser attempts the same wreck against the sender's trajectory
  and compares fuel/hull without accepting an incompatible physics version.
- [ ] Seed samples meet contract value without one mandatory trajectory.

**Blocked by:** G-013, P-004, P-009.

### G-014 — Evidence Board: authored-case graybox

**Build priority:** 11.

**Outcome:** one authored case ships the complete inspect, link, contradict,
accuse, win/loss, local-score, and touch loop.

**Acceptance**

- [ ] The authored case has exactly one supported culprit/method/motive theory.
- [ ] A first-time player can distinguish unsupported accusation from final theory.

**Blocked by:** F-003.

### G-014A — Evidence Board: validated daily-case release

**Build priority:** 11 completion gate.

**Outcome:** a starter chapter, solution-first case compiler, validated daily
cases, spoiler-safe share, and comparison complete the public release.

**Acceptance**

- [ ] Generation begins from a causal solution and rejects ambiguity, missing
  evidence, and multiple valid culprits.
- [ ] No live LLM output decides correctness, and a second browser reveals
  reasoning comparison only after committing its own theory.

**Blocked by:** G-014, P-009.

### G-015 — Last Light Foundry: one-contract graybox

**Build priority:** 15.

**Outcome:** one ten-minute contract ships power, heat, logistics, wear,
breakdown, redesign, explicit final-machine victory, and local score.

**Acceptance**

- [ ] Power, heat, logistics, wear, contracts, and score are pure serializable rules.
- [ ] At least two materially different layouts can win the contract.

**Blocked by:** F-003.

### G-015A — Last Light Foundry: campaign release

**Build priority:** 15 completion gate.

**Outcome:** four more contracts, campaign progression, save/resume, data-only
blueprint, time-lapse replay, and recipient comparison complete release.

**Acceptance**

- [ ] Saved factories and blueprints are size-limited and replayable only at
  their compatible simulation version.
- [ ] A recipient runs the same contract/failure seed, compares footprint and
  uptime, and can report or delete the shared blueprint.

**Blocked by:** G-015, P-011.

### G-016 — Vault Heist: one-vault graybox

**Build priority:** 13.

**Outcome:** one authored vault ships simultaneous orders, readable patrols,
noise, alarms, crew extraction, win/loss, and local score.

**Acceptance**

- [ ] Previewed guard behavior and resolved behavior match exactly.
- [ ] At least two crew/loadout plans can extract the target.

**Blocked by:** F-003.

### G-016A — Vault Heist: campaign and Daily Vault release

**Build priority:** 13 completion gate.

**Outcome:** an authored campaign, validated Daily Vault, plan replay,
verified board, and recipient challenge complete release.

**Acceptance**

- [ ] Daily seeds are solvable without one mandatory crew/loadout.
- [ ] A second browser attempts the same vault budget, compares alarms/turns,
  and reveals route differences after completion.

**Blocked by:** G-016, P-004, P-009.

### G-017 — Ghost Frequency: one-case graybox

**Build priority:** 12.

**Outcome:** one atmospheric case ships tuning, triangulation, entity
identification, containment, win/loss, local score, and equivalent audio/visual
clues.

**Acceptance**

- [ ] Visual equivalents exist for every audio clue.
- [ ] Microphone access is neither requested nor required.

**Blocked by:** F-003.

### G-017A — Ghost Frequency: case-set release

**Build priority:** 12 completion gate.

**Outcome:** four more cases, a validated daily case, spoiler-safe signal card,
verified board, and post-commit comparison complete release.

**Acceptance**

- [ ] Every case can be solved with audio muted and with visuals unchanged.
- [ ] A recipient cannot see the entity answer until submitting their own
  containment attempt for the same case.

**Blocked by:** G-017, P-009.

### G-018 — Foldspace: topology graybox

**Build priority:** 8.

**Outcome:** three graybox puzzles ship deterministic topology changes,
complete/reset outcomes, move pars, optional shard, local score, and touch.

**Acceptance**

- [ ] Camera movement never changes rules implicitly; perspective transitions have
  explicit simulation results.
- [ ] Touch and keyboard can both select the intended surface reliably.

**Blocked by:** F-003, G-007.

### G-018A — Foldspace: authored chapter release

**Build priority:** 8 completion gate.

**Outcome:** nine more authored puzzles, chapter progression, challenge move
budgets, solution ghosts, and completion postcards complete release.

**Acceptance**

- [ ] Every puzzle has a validated solution and intentional par; camera-only
  changes never alter topology.
- [ ] A recipient plays the same puzzle against the sender's move ghost and
  compares par delta.

**Blocked by:** G-018, P-011.

### G-019 — Wildfire Watch: one-scenario graybox

**Build priority:** 14.

**Outcome:** one fictional scenario ships wind, fuel, crew deployment,
evacuation, explicit success/failure, local score, and a basic after-action map.

**Acceptance**

- [ ] The game is labeled as fictional systems entertainment, not operational fire
  advice.
- [ ] Scoring cannot be improved by risking population for spectacle.

**Blocked by:** F-003.

### G-019A — Wildfire Watch: scenario-set release

**Build priority:** 14 completion gate.

**Outcome:** four more scenarios, validated wind seeds, detailed after-action
replay, verified board, and recipient comparison complete release.

**Acceptance**

- [ ] Scenarios teach materially different tradeoffs without presenting the
  game as operational advice.
- [ ] A recipient commands the same seed and compares protected areas, crew
  risk, and evacuation time.

**Blocked by:** G-019, P-004.

### G-020 — Backpack Alchemist: one-region graybox

**Build priority:** 10.

**Outcome:** one region ships ingredient drafting, packing, adjacency reactions,
volatility, combat, a mini-boss victory, loss, and local score.

**Acceptance**

- [ ] Seeded drafts reproduce exactly at a version.
- [ ] Recipe discovery offers combinatorial alternatives without requiring a
  wiki to finish the region.

**Blocked by:** F-003.

### G-020A — Backpack Alchemist: journey release

**Build priority:** 10 completion gate.

**Outcome:** four more regions, rival final boss, progression, daily ingredient
seed, validated build code, and recipient remix complete release.

**Acceptance**

- [ ] The first complete journey is winnable through multiple reaction families
  without external recipe knowledge.
- [ ] Build codes are data-only, versioned, bounded, reportable, exportable, and
  deletable through the artifact contract.

**Blocked by:** G-020, P-009, P-011.

### G-021 — Pocket Realm: invited two-player co-op

**Build priority:** post-slate extension.

**Outcome:** two invited players can join an expedition, share world state,
revive once, build the beacon, extract, and receive a team result.

**Acceptance**

- [ ] The room authoritatively orders inventory and block changes.
- [ ] Reconnect, simultaneous placement, duplicate pickup, grief limits, and host
  departure are tested.
- [ ] Solo balance and saves remain unchanged.

**Blocked by:** G-010, M-001.

---

## R4 — launch and operations

### O-000 — Full export and deletion integration gate

**Outcome:** one account can export and delete every account-owned data type
added after P-005, with public attribution and audit behavior explained before
confirmation.

**Acceptance**

- [ ] The export covers library, reactions, achievements, saved Daily Shifts,
  developer profile, submission status, disclosed moderation decisions, game
  versions, artifacts, and room history that is actually retained; it excludes
  other people and private moderator/security evidence.
- [ ] Deletion revokes sessions, removes personal scores/reactions/artifacts,
  delists owned content when required, pseudonymizes retained public credits,
  queues provider cleanup, and reports partial failure honestly.
- [ ] A post-delete search across WorkOS, D1, R2 indexes, and public projections
  matches the documented retention result.

**Blocked by:** C-007A, P-008A, P-009, P-010, P-011, M-001.

### O-001 — Moderator operations view

**Outcome:** an authorized moderator can see review queues, reports,
suspensions, appeals, deletion jobs, and failed game versions in one compact
view.

**Acceptance**

- [ ] Every mutation requires a reason and produces an audit receipt.
- [ ] Moderator permission is enforced by the API, not hidden UI.

**Blocked by:** A-001, C-007A, O-000, P-006.

### O-002 — Backup and restore drill

**Outcome:** D1 records, R2 manifests, and configuration can be restored into a
fresh non-production environment.

**Acceptance**

- [ ] A documented drill restores a profile, score, game version, and moderation
  record and verifies hashes.

**Blocked by:** C-007A, O-000.

### O-002A — Orphan and expiry cleanup drill

**Outcome:** abandoned drafts, expired rooms, superseded generated media, and
completed deletion jobs are found with dry-run evidence and safely cleaned.

**Acceptance**

- [ ] Dry-run and applied output identify every target by immutable ID and reason.
- [ ] Cleanup never deletes an active published version, live room, retained audit
  receipt, or media referenced by an authoritative artifact.

**Blocked by:** C-007A, M-001, O-002.

### O-003 — Budget and failure guardrails

**Outcome:** free-tier exhaustion or provider failure degrades safely instead
of corrupting runs or creating surprise spend.

**Work**

- Add usage dashboards, budget alerts where supported, storage quotas, and
  per-feature kill switches.
- Define behavior for D1 write exhaustion, R2 failure, AuthKit outage, and
  Durable Object limits.
- Keep guest local play available when accounts or APIs are down.

**Acceptance**

- [ ] Failure drills show read-only boards, queued/retryable receipts, and clear
  status without losing completed local runs.

**Blocked by:** P-003, C-006, M-001.

### O-004 — Production cutover with rollback

**Outcome:** the public domain moves from GitHub Pages to the Cloudflare
platform with the old static deployment retained as a tested rollback.

**Work**

- Verify cache headers, redirects, canonical URLs, auth callbacks, CSP,
  sandbox origin, monitoring, and deployment receipts.
- Roll out to a small operator-only path before changing the public route.
- Document one-command rollback and data-write freeze behavior.

**Acceptance**

- [ ] The exact production commit passes desktop/mobile game smoke tests, account
  flow, leaderboard, submission sandbox, export/delete, and private-room
  checks.
- [ ] A rollback drill returns the Legacy Rack without exposing private APIs or
  accepting incompatible writes.

**Blocked by:** O-001, O-002A, O-003, P-008, C-008.

### O-005 — Full compendium release gate

**Outcome:** the fifteen-game slate is a discoverable, measurable, moderated
collection rather than fifteen disconnected URLs.

**Acceptance**

- [ ] Every game has a public goal, win/loss, score definition, controls, version,
  creator, content note, share artifact, and health view.
- [ ] Broken or unsafe versions can be stopped without redeploying the shell.
- [ ] All games pass their release proof on desktop and representative touch
  hardware.
- [ ] The catalog clearly labels solo, local multiplayer, asynchronous challenge,
  and invited online modes.

**Blocked by:** G-002A, G-003A, G-005, G-006A, G-010, G-011A, G-012A,
G-013A, G-014A, G-015A, G-016A, G-017A, G-018A, G-019A, G-020A, O-004.

---

## Explicit non-goals for this backlog

- Open chat, direct messages, comments, forums, public room names, and stranger
  matchmaking.
- Advertising, payments, creator payouts, tokens, loot boxes, or subscriptions.
- Demographic profiling, ad attribution, session replay surveillance, or
  cross-site tracking.
- Publishing arbitrary user code on the platform origin.
- Claiming that self-attestation is reliable age verification.
- An infinite voxel world before Pocket Realm's finite extraction loop is fun.
- AI-generated daily content whose solvability or safety cannot be validated.
- Rewriting all current games or adopting a framework before a vertical slice
  proves the need.

## First executable work order

Start with **F-001**, then **F-002**, then **F-003**. Do not start game content,
auth, or Cloudflare migration in parallel with those contract changes. The
first public proof is **G-002 Pinball After Dark**, but it should be built on
the same receipt, replay, score, and compendium spine that community games will
later use.
