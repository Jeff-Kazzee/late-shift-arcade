// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'neon-tide',
  version: '1.0.0',
  title: 'NEON TIDE',
  summary: 'Ride the tide, drop both bosses, extract or go deeper.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Break the end-boss and extract — or ride into a harder loop for more.',
  scoreLabel: 'SCORE',
  controls: ['STICK + FIRE', 'ARROWS/WASD', 'SPACE', 'X EXTRACTS'],
  genre: 'SHOOTER',
  players: '1',
  tags: ['deterministic', 'seeded', 'shmup', 'loops'],
  artwork: { accent: 'periwinkle' },
  releaseStatus: 'published',
  contentNotes: ['Stylised neon spacecraft combat; no gore.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
