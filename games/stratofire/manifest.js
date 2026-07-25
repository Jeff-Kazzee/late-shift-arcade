// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'stratofire',
  version: '1.0.0',
  title: 'STRATOFIRE',
  summary: 'Forty kills before the sea takes you.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Complete the sortie: forty aircraft and gunboats down, one plane, one life.',
  scoreLabel: 'SCORE',
  controls: ['TURN + THRUST', 'ARROWS/WASD', 'SPACE', 'TOUCH BUTTONS'],
  genre: 'SHOOTER',
  players: '1',
  tags: ['deterministic', 'seeded', 'dogfight', 'momentum'],
  artwork: { accent: 'rose' },
  releaseStatus: 'published',
  contentNotes: ['Stylised aerial combat; no gore.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
