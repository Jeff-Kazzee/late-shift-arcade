// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'evidence-board',
  version: '1.0.0',
  title: 'EVIDENCE BOARD',
  summary: 'Twelve leads. One theory holds.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Pin culprit, method, and motive before the trail goes cold.',
  scoreLabel: 'SCORE',
  controls: ['TAP', 'ARROWS', '1-3', 'X'],
  genre: 'DEDUCTION',
  players: '1',
  tags: ['deterministic', 'seeded', 'deduction'],
  artwork: { accent: 'periwinkle' },
  releaseStatus: 'published',
  contentNotes: ['Fictional noir theft investigation.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
