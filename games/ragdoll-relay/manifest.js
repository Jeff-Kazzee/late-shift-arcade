// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'ragdoll-relay',
  version: '1.0.0',
  title: 'RAGDOLL RELAY',
  summary: 'Fling the courier. Mind the parcel.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Sling a floppy courier across the rooftops to the depot before the parcel breaks.',
  scoreLabel: 'SCORE',
  controls: ['DRAG TO FLING', 'ARROWS + SPACE', 'X RESETS'],
  genre: 'PHYSICS',
  players: '1',
  tags: ['deterministic', 'seeded', 'physics', 'ragdoll'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Cartoon ragdoll tumbling; no gore.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
