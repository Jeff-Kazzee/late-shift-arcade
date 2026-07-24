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
import { createOrbitalSalvage } from './orbital-salvage/orbital-salvage.js';

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
    slug: 'pong', title: 'PONG',
    summary: 'First to 7. Ball speeds up every rally.',
    modes: ['solo', 'local-multiplayer'],
    goal: 'Score seven points before your opponent.',
    genre: 'SPORT', players: '1–2',
    controls: ['MOVE', 'DRAG'], artwork: { accent: 'amber' },
    tags: ['versus', 'precision'],
  })),
  defineCartridge(createBreakout, legacyMetadata({
    slug: 'breakout', title: 'BREAKOUT',
    summary: 'Bricks, power-ups, 5 levels then endless.',
    modes: ['solo'],
    goal: 'Clear five brick walls, then survive the endless levels.',
    genre: 'ACTION', players: '1',
    controls: ['MOVE', 'DRAG'], artwork: { accent: 'periwinkle' },
    tags: ['power-ups', 'endless'],
  })),
  defineCartridge(createAirHockey, legacyMetadata({
    slug: 'air-hockey', title: 'AIR HOCKEY',
    summary: 'Free mallet, real friction, first to 7.',
    modes: ['solo'],
    goal: 'Score seven goals before the CPU.',
    genre: 'SPORT', players: '1',
    controls: ['MOVE', 'DRAG'], artwork: { accent: 'rose' },
    tags: ['physics', 'versus'],
  })),
  defineCartridge(createAsteroidDefender, legacyMetadata({
    slug: 'asteroid-defender', title: 'ASTEROID DEFENDER',
    summary: 'Six city blocks. Limited missiles. Chain blasts.',
    modes: ['solo'],
    goal: 'Defend at least one city block through escalating waves.',
    genre: 'TACTIC', players: '1',
    controls: ['AIM', 'TAP'], artwork: { accent: 'amber' },
    tags: ['chain-reaction', 'waves'],
  })),
  defineCartridge(createGalaxyRaid, legacyMetadata({
    slug: 'galaxy-raid', title: 'GALAXY RAID',
    summary: 'Formation divers. Two shots in the air.',
    modes: ['solo'],
    goal: 'Destroy each formation while preserving your three lives.',
    genre: 'SHOOTER', players: '1',
    controls: ['MOVE', 'FIRE'], artwork: { accent: 'periwinkle' },
    tags: ['formation', 'waves'],
  })),
  defineCartridge(createNeonSnake, legacyMetadata({
    slug: 'neon-snake', title: 'NEON SNAKE',
    summary: 'Swipe turns. Chain meals. Don’t touch the grid.',
    modes: ['solo'],
    goal: 'Build food chains and survive the accelerating grid.',
    genre: 'PUZZLE', players: '1',
    controls: ['TURN', 'SWIPE'], artwork: { accent: 'deep' },
    tags: ['combo', 'survival'],
  })),
  defineCartridge(createLunarDescent, legacyMetadata({
    slug: 'lunar-descent', title: 'LUNAR DESCENT',
    summary: 'Spend fuel. Trust your instruments. Touch down softly.',
    modes: ['solo'],
    goal: 'Land softly on each progressively narrower moon pad.',
    genre: 'SKILL', players: '1',
    controls: ['ROTATE', 'THRUST'], artwork: { accent: 'amber' },
    tags: ['physics', 'precision'],
  })),
  defineCartridge(createMidnightRun, legacyMetadata({
    slug: 'midnight-run', title: 'MIDNIGHT RUN',
    summary: 'Thread the traffic. Chase the neon.',
    modes: ['solo'],
    goal: 'Survive traffic across three lives while building near-miss combos.',
    genre: 'RACER', players: '1',
    controls: ['STEER', 'DRAG'], artwork: { accent: 'rose' },
    tags: ['speed', 'combo'],
  })),
  defineCartridge(createOrbitalSalvage, legacyMetadata({
    slug: 'orbital-salvage', title: 'ORBITAL SALVAGE',
    summary: 'Every wreck you tether rewrites the route home.',
    modes: ['solo'],
    goal: 'Tether 400 credits of wreckage and dock before fuel, hull, or orbit gives out.',
    genre: 'PHYSICS', players: '1',
    controls: ['DRAG-BURN', 'TETHER'], artwork: { accent: 'periwinkle' },
    tags: ['physics', 'planning'],
  })),
]));
