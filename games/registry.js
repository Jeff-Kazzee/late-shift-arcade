// The rack: which games are installed, and nothing else about them.
//
// One line per game — its manifest (data, imported statically because cards
// need it immediately) and a lazy loader for its code (fetched only when a
// player launches). Nothing here knows what a game contains, so adding a game
// is dropping a folder in and naming it, and removing one is deleting both.
//
// That one line is the irreducible cost: native ES modules cannot enumerate a
// directory on a static host, and this site ships without a build step, so
// something has to name the folders. Everything else a game owns — metadata,
// code, tests, art — lives inside the folder and never touches shared code.

import { defineCatalogEntry, lazyModule, validateCatalog } from '../shell/cartridge.js';
import { manifest as pong } from './pong/manifest.js';
import { manifest as breakout } from './breakout/manifest.js';
import { manifest as airHockey } from './air-hockey/manifest.js';
import { manifest as asteroidDefender } from './asteroid-defender/manifest.js';
import { manifest as galaxyRaid } from './galaxy-raid/manifest.js';
import { manifest as neonSnake } from './neon-snake/manifest.js';
import { manifest as lunarDescent } from './lunar-descent/manifest.js';
import { manifest as midnightRun } from './midnight-run/manifest.js';
import { manifest as orbitalSalvage } from './orbital-salvage/manifest.js';

// Pixel Life's module and tests live on in games/pixel-life; it left the
// rack when GALAXY RAID took slot five (2026-07-23). An unlisted folder is
// an unpublished game — which is why the rack is named, not scanned.
export const cartridges = validateCatalog([
  defineCatalogEntry(pong, lazyModule('./pong/pong.js', import.meta.url)),
  defineCatalogEntry(breakout, lazyModule('./breakout/breakout.js', import.meta.url)),
  defineCatalogEntry(airHockey, lazyModule('./air-hockey/air-hockey.js', import.meta.url)),
  defineCatalogEntry(
    asteroidDefender,
    lazyModule('./asteroid-defender/asteroid-defender.js', import.meta.url),
  ),
  defineCatalogEntry(galaxyRaid, lazyModule('./galaxy-raid/galaxy-raid.js', import.meta.url)),
  defineCatalogEntry(neonSnake, lazyModule('./neon-snake/neon-snake.js', import.meta.url)),
  defineCatalogEntry(lunarDescent, lazyModule('./lunar-descent/lunar-descent.js', import.meta.url)),
  defineCatalogEntry(midnightRun, lazyModule('./midnight-run/midnight-run.js', import.meta.url)),
  defineCatalogEntry(
    orbitalSalvage,
    lazyModule('./orbital-salvage/orbital-salvage.js', import.meta.url),
  ),
]);
