// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'lunar-descent',
  version: '1.0.0',
  title: 'LUNAR DESCENT',
  summary: 'Spend fuel. Trust your instruments. Touch down softly.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Land softly on each progressively narrower moon pad.',
  scoreLabel: 'SCORE',
  controls: ['ROTATE', 'THRUST'],
  genre: 'SKILL',
  players: '1',
  tags: ['physics', 'precision'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
