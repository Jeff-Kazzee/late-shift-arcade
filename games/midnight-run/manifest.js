// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'midnight-run',
  version: '1.0.0',
  title: 'MIDNIGHT RUN',
  summary: 'Thread the traffic. Chase the neon.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Survive traffic across three lives while building near-miss combos.',
  scoreLabel: 'SCORE',
  controls: ['STEER', 'DRAG'],
  genre: 'RACER',
  players: '1',
  tags: ['speed', 'combo'],
  artwork: { accent: 'rose' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
