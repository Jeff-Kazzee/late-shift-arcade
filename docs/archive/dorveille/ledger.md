# Sleep debt ledger

Open items first. Every caffeine override lands here:
`- [ ] <what was skipped> — <what it costs> (session, block)`
Paid items move below with how they were settled. Never silently dropped.

## Open

- [ ] `pinball-after-dark` standalone repo is temporary by the owner's word — it duplicates the shell and must be folded back rather than maintained as a fork.

## Settled

- [x] (s2026-07-24) Whole session ran outside the dorveille discipline — settled s2026-07-24 evening: the architecture ran from DAWN, and the miss is now mechanized — a SessionStart hook (`.claude/hooks/dorveille.mjs`) injects the DAWN directive, open debt, and hypnogram tail into context on every fresh start, resume, and post-compaction wake, per SKILL.md's own "mechanize failures, not theory" rule. (A PreCompact hook was tried and cut in review: its output never reaches the model.)
- [x] (s2026-07-24) No HQ trace — settled: receipt appended to `Brain/memory/2026-07-24.md` (19:02). No hq-level status note owns this project; the receipt is the trace.
- [x] (s2026-07-24) Eight background agent-runs lost to host process exits — settled: the mechanism changed and the change is now law, not memory. Synchronous-only dispatch is in `AGENTS.md` ("Dispatch rules"), and SKILL.md gained a pressure row: a lost run forces a mechanism change before any re-dispatch.
- [x] (s2026-07-24) Handoff file refreshed — carried forward: handoffs now live *in the repo* at `docs/handoffs/`, ending the temp-directory risk entirely.
