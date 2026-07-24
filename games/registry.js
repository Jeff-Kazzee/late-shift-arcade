// The cabinet's cartridge rack, in SPEC order. Each game's build block
// replaces its placeholder with the real module import.

import { createPong } from './pong/pong.js';
import { createBreakout } from './breakout/breakout.js';
import { createAirHockey } from './air-hockey/air-hockey.js';
import { createAsteroidDefender } from './asteroid-defender/asteroid-defender.js';
import { createGalaxyRaid } from './galaxy-raid/galaxy-raid.js';

// Pixel Life's module and tests live on in games/pixel-life; it left the
// rack when GALAXY RAID took slot five (2026-07-23).
export const cartridges = [
  createPong(),
  createBreakout(),
  createAirHockey(),
  createAsteroidDefender(),
  createGalaxyRaid(),
];
