// Catalog metadata only. This file must stay importable without pulling in the
// game: the cabinet renders every card in the rack from manifests alone.
//
// Runtime note (DS-1a): `first-party-3d` validates against the schema but the
// shell's launch gate (shell/cartridge.js launchBlockReason) still hard-blocks
// it. Lifting that gate is shell work owned by the orchestrator (GDD §15.1).

export const manifest = {
  schemaVersion: 1,
  slug: 'deepshift',
  version: '0.1.0',
  title: 'DEEPSHIFT',
  summary: 'Voxel survival on the late shift. Mine by day, hold on through the night, bank your quota before dawn.',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-3d',
  trustLevel: 'trusted-first-party',
  modes: ['dawn-run (graybox)'],
  goal: 'Bank the fieldstone quota at the clan cache before dawn ends.',
  scoreLabel: 'SHIFT REPORT',
  controls: ['keyboard+mouse', 'touch'],
  genre: 'SURVIVAL-BUILDER',
  players: '1',
  tags: ['voxel', '3d', 'showcase'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['Fantasy combat.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
};
