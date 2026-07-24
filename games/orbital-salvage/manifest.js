// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'orbital-salvage',
  version: '1.0.0',
  title: 'ORBITAL SALVAGE',
  summary: 'Every wreck you tether rewrites the route home.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Tether 400 credits of wreckage and dock before fuel, hull, or orbit gives out.',
  scoreLabel: 'SCORE',
  controls: ['DRAG-BURN', 'TETHER'],
  genre: 'PHYSICS',
  players: '1',
  tags: ['physics', 'planning'],
  artwork: { accent: 'periwinkle' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
