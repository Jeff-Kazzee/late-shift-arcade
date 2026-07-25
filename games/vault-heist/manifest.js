// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.

export const manifest = {
  schemaVersion: 1,
  slug: 'vault-heist',
  version: '1.0.0',
  title: 'VAULT HEIST',
  summary: 'Plan the whole crew. Nothing the guards do is a surprise.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: 'Secure the target and get every surviving crew member to extraction.',
  scoreLabel: 'TAKE',
  controls: ['TAP', 'PLAN'],
  genre: 'TACTIC',
  players: '1',
  tags: ['deterministic', 'seeded', 'turn-based'],
  artwork: { accent: 'deep' },
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
