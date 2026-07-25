# Site stream — handoff

Current truth, overwritten at every block close. Branch: `dev`.

## Next block: W-001, the real website

Read `docs/W-001-SITE-BRIEF.md` first — it is the full brief: problem,
target, deliverables, hard constraints, and the verification list. Approved
2026-07-24 as the top priority of the whole project; it outranks more games.

Summary of the target: **DOM owns the site, canvas owns gameplay only.**
Real HTML pages for home / browse / detail built from F-002 manifests (which
load without game code — do not regress F-008), indexable, portrait-friendly,
accessible, zero dependencies, no build step, GitHub Pages subpath-safe.

## State

- Not started. `index.html` is still a canvas-only shell.
- W-002 (public routes, SEO, social cards) follows this block and folds into
  its URL decisions — read its ticket before locking the routing scheme.
