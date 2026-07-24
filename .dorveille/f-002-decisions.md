# F-002 decisions

Status: complete after REM and N3

## Scope

Deliver only F-002 from `tickets.md`: one validated, versioned catalog
manifest for the eight Legacy Rack games, a direct detail URL, and fail-closed
launch gates. F-003 run receipts and later platform infrastructure remain out
of scope.

## Test seams

- `defineCartridge(factory, manifest)` validates and freezes one manifest entry
  while preserving a fresh factory-backed cartridge instance per launch.
- `validateCatalog(entries)` rejects malformed entries and duplicate immutable
  `slug@version` identities.
- `activateCartridge(entry, context)` is the launch gate. Only validated,
  published entries can create or initialize a cartridge.
- Pure catalog URL helpers create and resolve `?game=<slug>&version=<version>`
  detail URLs without a router or server fallback.

## Decisions

1. Each catalog entry owns one deeply frozen, serializable `manifest` object
   and one private factory-backed `create()` capability. Cabinet cards and
   detail routes receive the same manifest reference.
2. The manifest schema is explicitly versioned at `schemaVersion: 1`; each game
   also declares an immutable semantic `version`.
3. Direct detail URLs use query parameters so `index.html` remains deployable
   from any static file server and GitHub Pages without rewrite rules.
4. `published` entries may launch. `suspended` entries remain resolvable for an
   explanatory detail screen but fail before a fresh cartridge is created.
5. Legacy score keys remain the existing game slugs, and cartridge factories
   remain unchanged.
6. The runner-up design, a separate runtime-binding map keyed by
   `slug@version`, is deferred because one entry already provides locality
   without exposing the factory inside serializable manifest data.
7. Manifest and artwork fields are strict allowlists of JSON-safe values.
   Published runtimes without an F-002 launcher (`first-party-3d` and
   `community-iframe`) fail closed before their factory runs.
8. Every fresh Legacy instance must retain the probed manifest identity
   (`id`, `title`, and `blurb`), preventing metadata/score drift after import.
9. Browser Back/Forward reconciles the canvas screen with the query route and
   disposes the previous screen before constructing the next one.
10. Version-specific score namespaces remain deferred to F-003's score adapter.
    F-002 preserves existing slug-keyed local scores exactly as required; the
    current catalog publishes one immutable `1.0.0` version per slug.

## Planned vertical slices

1. Red/green manifest validation, immutability, fresh instances, and
   invalid/suspended launch refusal.
2. Red/green canonical detail URL creation and exact object-identity
   resolution.
3. Adapt all eight registry entries and render cabinet/detail screens from
   `entry.manifest`.
4. Replay unit, syntax, diff, desktop, and touch checks, then REM and N3.

## REM findings

The authorship strip found strict-serialization, unsupported-runtime,
factory-identity, and browser-history gaps. Each was converted into a test or
browser proof and fixed. The nightmare pass identified future score
contamination if two incompatible versions share a slug; this is not reachable
in the one-version F-002 catalog and is handed to F-003 rather than changing
the Legacy Rack's local score keys in this block.

Follow-up detached review found accessor-backed and inherited required fields
could pass validation but disappear during immutable copying. Manifest records,
artwork, and text arrays now require strict own data properties; regressions
cover both cases.

## N3 replay

- `npm test`: 110/110 passed.
- Changed JavaScript syntax checks and `git diff --check`: passed.
- Desktop and emulated-touch direct detail, launch, and eject flows: passed.
- Browser Back returned a pushed detail route to the live cabinet.
- Final browser reload: eight entries, exact card/detail object identity,
  frozen manifest, and no console warnings or errors.
