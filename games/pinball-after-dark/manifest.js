// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'pinball-after-dark',
  version: '1.0.0',
  title: 'PINBALL AFTER DARK',
  summary: 'Relight four districts. Clear the Blackout.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Relight all four districts and clear the Blackout multiball.',
  scoreLabel: 'SCORE',
  controls: ['FLIP', 'NUDGE'],
  genre: 'PINBALL',
  players: '1',
  tags: ['physics', 'risk-reward'],
  artwork: { accent: 'periwinkle' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
