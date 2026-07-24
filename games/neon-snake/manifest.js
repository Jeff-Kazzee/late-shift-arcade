// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'neon-snake',
  version: '1.0.0',
  title: 'NEON SNAKE',
  summary: 'Swipe turns. Chain meals. Don’t touch the grid.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Build food chains and survive the accelerating grid.',
  scoreLabel: 'SCORE',
  controls: ['TURN', 'SWIPE'],
  genre: 'PUZZLE',
  players: '1',
  tags: ['combo', 'survival'],
  artwork: { accent: 'deep' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
