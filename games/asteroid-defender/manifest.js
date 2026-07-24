// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'asteroid-defender',
  version: '1.0.0',
  title: 'ASTEROID DEFENDER',
  summary: 'Six city blocks. Limited missiles. Chain blasts.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Defend at least one city block through escalating waves.',
  scoreLabel: 'SCORE',
  controls: ['AIM', 'TAP'],
  genre: 'TACTIC',
  players: '1',
  tags: ['chain-reaction', 'waves'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
