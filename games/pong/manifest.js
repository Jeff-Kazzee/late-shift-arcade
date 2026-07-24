// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'pong',
  version: '1.0.0',
  title: 'PONG',
  summary: 'First to 7. Ball speeds up every rally.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo', 'local-multiplayer'],
  goal: 'Score seven points before your opponent.',
  scoreLabel: 'SCORE',
  controls: ['MOVE', 'DRAG'],
  genre: 'SPORT',
  players: '1–2',
  tags: ['versus', 'precision'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
