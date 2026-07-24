// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'air-hockey',
  version: '1.0.0',
  title: 'AIR HOCKEY',
  summary: 'Free mallet, real friction, first to 7.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Score seven goals before the CPU.',
  scoreLabel: 'SCORE',
  controls: ['MOVE', 'DRAG'],
  genre: 'SPORT',
  players: '1',
  tags: ['physics', 'versus'],
  artwork: { accent: 'rose' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
