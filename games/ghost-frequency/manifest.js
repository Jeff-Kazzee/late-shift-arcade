// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'ghost-frequency',
  version: '1.0.0',
  title: 'GHOST FREQUENCY',
  summary: 'Something is broadcasting. Find it, name it, hold it.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Tune the band, identify the entity by its waveform, and hold the signal to contain it.',
  scoreLabel: 'SCORE',
  controls: ['DRAG', 'ARROWS', '1-4'],
  genre: 'TUNING',
  players: '1',
  tags: ['deterministic', 'seeded', 'sound-off-friendly'],
  artwork: { accent: 'rose' },
  releaseStatus: 'published',
  contentNotes: ['Mild spooky atmosphere. Fully playable with sound off.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
