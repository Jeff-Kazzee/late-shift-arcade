// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'graveyard-shift',
  version: '1.0.0',
  title: 'GRAVEYARD SHIFT',
  summary: 'Ninety seconds to dawn. The ground disagrees.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Hold the cemetery lot until dawn — every kill streak multiplies.',
  scoreLabel: 'SCORE',
  controls: ['TWIN STICKS', 'WASD + MOUSE', 'SPACE'],
  genre: 'SHOOTER',
  players: '1',
  tags: ['deterministic', 'seeded', 'twin-stick', 'arena'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Cartoon night-things; no gore.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
