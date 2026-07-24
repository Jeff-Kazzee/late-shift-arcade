// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'rail-switch',
  version: '1.0.0',
  title: 'RAIL SWITCH',
  summary: 'One shared line. Every switch is a promise.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Deliver every required train before the shift timer expires.',
  scoreLabel: 'SCORE',
  controls: ['TAP', 'HOLD'],
  genre: 'PUZZLE',
  players: '1',
  tags: ['deterministic', 'seeded'],
  artwork: { accent: 'cream' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
