// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'backpack-alchemist',
  version: '1.0.0',
  title: 'BACKPACK ALCHEMIST',
  summary: 'What touches, reacts. Pack accordingly.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Pack a reacting backpack that fights through six creatures to the Warden.',
  scoreLabel: 'SCORE',
  controls: ['TAP', 'ARROWS', '1-3', 'F', 'T'],
  genre: 'STRATEGY',
  players: '1',
  tags: ['deterministic', 'seeded', 'autobattler'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Abstract fantasy combat.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
