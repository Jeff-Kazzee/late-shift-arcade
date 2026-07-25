// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'foldspace',
  version: '1.0.0',
  title: 'FOLDSPACE',
  summary: 'Fold the level until the shard meets the gate.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Crease nine paper worlds so every stranded shard lands on its gate.',
  scoreLabel: 'SCORE',
  controls: ['TAP', 'ARROWS', 'SPACE', 'X'],
  genre: 'PUZZLE',
  players: '1',
  tags: ['deterministic', 'authored', 'puzzle'],
  artwork: { accent: 'deep' },
  releaseStatus: 'published',
  contentNotes: [],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
