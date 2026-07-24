// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'breakout',
  version: '1.0.0',
  title: 'BREAKOUT',
  summary: 'Bricks, power-ups, 5 levels then endless.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Clear five brick walls, then survive the endless levels.',
  scoreLabel: 'SCORE',
  controls: ['MOVE', 'DRAG'],
  genre: 'ACTION',
  players: '1',
  tags: ['power-ups', 'endless'],
  artwork: { accent: 'periwinkle' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
