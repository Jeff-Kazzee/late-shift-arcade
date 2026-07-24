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

// Pixel Life's module and tests live on in games/pixel-life; it left the
// rack when GALAXY RAID took slot five (2026-07-23).
export const cartridges = Object.freeze(validateCatalog([
  defineCartridge(createPong, {
    genre: 'SPORT', players: '1–2', accent: 'amber',
    controls: ['MOVE', 'DRAG'], tags: ['versus', 'precision'],
  }),
  defineCartridge(createBreakout, {
    genre: 'ACTION', players: '1', accent: 'periwinkle',
    controls: ['MOVE', 'DRAG'], tags: ['power-ups', 'endless'],
  }),
  defineCartridge(createAirHockey, {
    genre: 'SPORT', players: '1', accent: 'rose',
    controls: ['MOVE', 'DRAG'], tags: ['physics', 'versus'],
  }),
  defineCartridge(createAsteroidDefender, {
    genre: 'TACTIC', players: '1', accent: 'amber',
    controls: ['AIM', 'TAP'], tags: ['chain-reaction', 'waves'],
  }),
  defineCartridge(createGalaxyRaid, {
    genre: 'SHOOTER', players: '1', accent: 'periwinkle',
    controls: ['MOVE', 'FIRE'], tags: ['formation', 'waves'],
  }),
  defineCartridge(createNeonSnake, {
    genre: 'PUZZLE', players: '1', accent: 'deep',
    controls: ['TURN', 'SWIPE'], tags: ['combo', 'survival'],
  }),
  defineCartridge(createLunarDescent, {
    genre: 'SKILL', players: '1', accent: 'amber',
    controls: ['ROTATE', 'THRUST'], tags: ['physics', 'precision'],
  }),
  defineCartridge(createMidnightRun, {
    genre: 'RACER', players: '1', accent: 'rose',
    controls: ['STEER', 'DRAG'], tags: ['speed', 'combo'],
  }),
]));
