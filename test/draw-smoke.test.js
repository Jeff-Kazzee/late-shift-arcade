// Smoke guard: a cartridge whose update/draw throws would kill the frame
// loop on real hardware. Run every cartridge against permissive stubs so
// outright crashes fail here instead of on someone's phone at 3am.

import test from 'node:test';
import assert from 'node:assert/strict';
import { cartridges } from '../games/registry.js';
import { activateCartridge } from '../shell/cartridge.js';
import { palette } from '../shell/palette.js';

// A 2D-context stand-in where every property is callable and chainable.
function makeStubCtx() {
  const handler = {
    get(t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf' || prop === 'toString') {
        return () => 0;
      }
      return makeStubCtx();
    },
    set: () => true,
    apply: () => makeStubCtx(),
  };
  return new Proxy(function stub() {}, handler);
}

const inputStub = {
  down: () => false,
  pressed: () => false,
  touches: () => [],
  pointer: { x: 0, y: 0, down: false, justDown: false, justUp: false, moved: false },
};

test('every catalog entry survives fresh launch → update ×3 → draw → destroy on stubs', async () => {
  assert.equal(cartridges.length, 8);
  for (const entry of cartridges) {
    // Also the proof that every registry line resolves: a mistyped loader
    // path or a module missing its default export fails here, not on launch.
    const loaded = await entry.load();
    const gameCtx = {
      width: 640,
      height: 480,
      palette,
      highScore: 0,
      endGame() {},
      shake() {},
      sfx: { play() {} },
    };
    const cart = activateCartridge(loaded, gameCtx);
    for (let i = 0; i < 3; i += 1) cart.update(1 / 60, inputStub);
    cart.draw(makeStubCtx());
    cart.destroy();
  }
});
