// The cabinet's cartridge rack, in SPEC order. Each game's build block
// replaces its placeholder with the real module import.

import { createPong } from './pong/pong.js';
import { createBreakout } from './breakout/breakout.js';
import { createAirHockey } from './air-hockey/air-hockey.js';
import { createAsteroidDefender } from './asteroid-defender/asteroid-defender.js';
import { createPixelLife } from './pixel-life/pixel-life.js';

export const cartridges = [
  createPong(),
  createBreakout(),
  createAirHockey(),
  createAsteroidDefender(),
  createPixelLife(),
];
