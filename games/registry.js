// The cabinet's catalog. Entries are immutable descriptions; every launch
// creates a fresh cartridge instance so one run cannot leak into the next.

import { defineCartridge, validateCatalog } from '../shell/cartridge.js';
import { createPong } from './pong/pong.js';
import { createBreakout } from './breakout/breakout.js';
import { createAirHockey } from './air-hockey/air-hockey.js';
import { createAsteroidDefender } from './asteroid-defender/asteroid-defender.js';
import { createGalaxyRaid } from './galaxy-raid/galaxy-raid.js';
import { createNeonSnake } from './neon-snake/neon-snake.js';
import { createLunarDescent } from './lunar-descent/lunar-descent.js';
import { createMidnightRun } from './midnight-run/midnight-run.js';

const legacyMetadata = (fields) => ({
  schemaVersion: 1,
  version: '1.0.0',
  creator: 'Late Shift Arcade',
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  scoreLabel: 'SCORE',
  releaseStatus: 'published',
  contentNotes: ['Abstract arcade action.'],
  madeWith: 'AI-assisted design, code, art, audio, and testing.',
  source: 'https://github.com/Jeff-Kazzee/late-shift-arcade',
  ...fields,
});

// Pixel Life's module and tests live on in games/pixel-life; it left the
// rack when GALAXY RAID took slot five (2026-07-23).
export const cartridges = Object.freeze(validateCatalog([
  defineCartridge(createPong, legacyMetadata({
    modes: ['solo', 'local-multiplayer'],
    goal: 'Score seven points before your opponent.',
    genre: 'SPORT', players: '1–2',
    controls: ['MOVE', 'DRAG'], artwork: { accent: 'amber' },
    tags: ['versus', 'precision'],
  })),
  defineCartridge(createBreakout, legacyMetadata({
    modes: ['solo'],
    goal: 'Clear five brick walls, then survive the endless levels.',
    genre: 'ACTION', players: '1',
    controls: ['MOVE', 'DRAG'], artwork: { accent: 'periwinkle' },
    tags: ['power-ups', 'endless'],
  })),
  defineCartridge(createAirHockey, legacyMetadata({
    modes: ['solo'],
    goal: 'Score seven goals before the CPU.',
    genre: 'SPORT', players: '1',
    controls: ['MOVE', 'DRAG'], artwork: { accent: 'rose' },
    tags: ['physics', 'versus'],
  })),
  defineCartridge(createAsteroidDefender, legacyMetadata({
    modes: ['solo'],
    goal: 'Defend at least one city block through escalating waves.',
    genre: 'TACTIC', players: '1',
    controls: ['AIM', 'TAP'], artwork: { accent: 'amber' },
    tags: ['chain-reaction', 'waves'],
  })),
  defineCartridge(createGalaxyRaid, legacyMetadata({
    modes: ['solo'],
    goal: 'Destroy each formation while preserving your three lives.',
    genre: 'SHOOTER', players: '1',
    controls: ['MOVE', 'FIRE'], artwork: { accent: 'periwinkle' },
    tags: ['formation', 'waves'],
  })),
  defineCartridge(createNeonSnake, legacyMetadata({
    modes: ['solo'],
    goal: 'Build food chains and survive the accelerating grid.',
    genre: 'PUZZLE', players: '1',
    controls: ['TURN', 'SWIPE'], artwork: { accent: 'deep' },
    tags: ['combo', 'survival'],
  })),
  defineCartridge(createLunarDescent, legacyMetadata({
    modes: ['solo'],
    goal: 'Land softly on each progressively narrower moon pad.',
    genre: 'SKILL', players: '1',
    controls: ['ROTATE', 'THRUST'], artwork: { accent: 'amber' },
    tags: ['physics', 'precision'],
  })),
  defineCartridge(createMidnightRun, legacyMetadata({
    modes: ['solo'],
    goal: 'Survive traffic across three lives while building near-miss combos.',
    genre: 'RACER', players: '1',
    controls: ['STEER', 'DRAG'], artwork: { accent: 'rose' },
    tags: ['speed', 'combo'],
  })),
]));
