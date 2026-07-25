---
project: late-shift-arcade
status: draft
product: curated browser arcade and creator submission platform
related_modules: [product, game-development]
related_changes: [process-reset]
verification: [process-reset-verification]
gates: [human-gates]
---
# Late Shift Arcade — platform product requirements

## Product promise

Players can discover and immediately play small, complete browser games.
Creators can submit games for transparent review and, when accepted, publication
in the arcade. Every game clearly credits its creator and discloses material AI
involvement.

The experience should feel like entering a strange, excellent late-night arcade:
fast to understand, easy to browse, and full of games with a real ending or
scorable run.

## Users and jobs

### Player

- Find something appealing in under a minute.
- Understand its goal and controls before launch.
- Play without installing anything or creating an account.
- Finish a run, see a result, replay, and share the game.

### Creator

- Understand the game contract and review bar.
- Submit a package, source link, or hosted build with attribution, license,
  content notes, and AI disclosure.
- See whether the submission is received, needs changes, accepted, rejected, or published.
- Retain credit and receive a stable game page when published.

### Curator/moderator

- Inspect metadata without executing the game.
- Review source/build provenance, rights, content, security, performance,
  accessibility, and play quality.
- Run untrusted code only in the review sandbox.
- Publish, suspend, or reject with an auditable reason.

## Product invariants

- The existing Legacy Rack remains playable during migration.
- A submitted game is never executed merely because it was uploaded.
- Community code never runs on the platform origin.
- Acceptance into review is not acceptance for publication.
- Every published game has a stable page, creator credit, controls, goal,
  content notes, version, runtime class, and AI-made disclosure.
- The arcade can ship without DEEPSHIFT, multiplayer, accounts, or 30 games.

## Release sequence

### Bet A — player arcade

Prove that the current rack is a compelling website:

- polished browse/search/filter experience;
- stable game detail pages;
- reliable launch/eject/restart;
- clear goal, controls, creator, and disclosure;
- mobile and desktop browser proof;
- feedback link visible after a run.

### Bet B — creator submission pilot

Prove the workflow before building a marketplace:

- public submission page and requirements;
- form accepts metadata plus a source/build link, not executable upload;
- moderation queue with received/needs-changes/accepted/rejected states;
- manual curator review and receipt;
- one invited external creator completes the path.

### Bet C — community cartridge publication

Prove safe execution:

- versioned community game contract;
- separate-origin hosting;
- restrictive CSP and sandboxed iframe;
- capability-scoped messaging;
- lifecycle, input, resize, pause, score, and error boundaries;
- security review and browser abuse tests;
- one accepted pilot game published with rollback and suspension controls.

### Later bets

Only after the first three are proven:

- player identity and cross-device scores;
- creator accounts and dashboards;
- ratings, comments, favorites, or social graphs;
- payments or revenue sharing;
- multiplayer services;
- a larger catalog growth target.

## MVP success

The submission-platform MVP is real when:

1. a player can browse, understand, launch, finish, and replay a game;
2. an external creator can submit without private coaching;
3. a curator can review without executing untrusted code on the platform origin;
4. an accepted game can be published, suspended, and rolled back;
5. each state change leaves a receipt;
6. five observed players can each find and start a game without Jeff explaining the interface.

## Explicitly outside the first MVP

- a commitment to 30 games;
- DEEPSHIFT's full future vision;
- automatic publication;
- arbitrary JavaScript uploads to the main origin;
- public creator analytics;
- payments, prizes, or revenue sharing;
- real-time multiplayer;
- universal accounts or global leaderboards.

## Product decisions still needed

- The appetite and selected outcome for the first bet.
- Whether the submission pilot uses a repository-backed form, a small hosted service, or another queue.
- Who may join the first creator pilot.
- The minimum quality bar for an Arcade Short versus a Showcase game.