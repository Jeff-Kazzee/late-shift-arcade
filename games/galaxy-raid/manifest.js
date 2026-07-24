// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'galaxy-raid',
  version: '1.0.0',
  title: 'GALAXY RAID',
  summary: 'Formation divers. Two shots in the air.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Destroy each formation while preserving your three lives.',
  scoreLabel: 'SCORE',
  controls: ['MOVE', 'FIRE'],
  genre: 'SHOOTER',
  players: '1',
  tags: ['formation', 'waves'],
  artwork: { accent: 'periwinkle' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
