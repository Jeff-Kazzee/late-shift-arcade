import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../shell/input.js';

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  listenerCount() {
    return Array.from(this.listeners.values()).reduce((count, handlers) => count + handlers.size, 0);
  }
}

function pointer(pointerId, clientX, clientY) {
  return { pointerId, clientX, clientY };
}

function setup(t) {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const previousWindow = globalThis.window;
  const windowTarget = new FakeTarget();
  const canvas = new FakeTarget();
  canvas.width = 640;
  canvas.height = 480;
  canvas.setPointerCapture = () => {};
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 320, height: 240 });
  globalThis.window = windowTarget;

  const input = createInput(canvas);
  t.after(() => {
    input.detach();
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  });
  return { canvas, input, windowTarget };
}

test('rebase fences an active pointer while preserving held keyboard input', (t) => {
  const { canvas, input, windowTarget } = setup(t);
  windowTarget.emit('keydown', { key: 'ArrowLeft', preventDefault() {} });
  canvas.emit('pointerdown', pointer(1, 110, 70));
  assert.equal(input.down('left'), true);
  assert.equal(input.pointer.down, true);
  assert.deepEqual(input.touches(), [{ x: 200, y: 100 }]);

  input.rebase();

  assert.equal(input.down('left'), true, 'keyboard holds survive a screen change');
  assert.equal(input.pressed('left'), false, 'one-shot keyboard edges are cleared');
  assert.deepEqual(input.touches(), [], 'the selecting pointer is hidden from the next screen');
  assert.deepEqual(input.pointer, {
    x: 200,
    y: 100,
    down: false,
    justDown: false,
    justUp: false,
    moved: false,
  });
});

test('quarantined moves and lifts cannot steer or release the next screen', (t) => {
  const { canvas, input } = setup(t);
  canvas.emit('pointerdown', pointer(1, 110, 70));
  input.rebase();

  canvas.emit('pointerdown', pointer(2, 210, 120));
  input.endFrame();
  const livePointer = { ...input.pointer };
  canvas.emit('pointermove', pointer(1, 300, 200));
  canvas.emit('pointerup', pointer(1, 300, 200));

  assert.deepEqual(input.pointer, livePointer, 'the old pointer cannot steer or emit a release');
  assert.deepEqual(input.touches(), [{ x: 400, y: 200 }]);

  canvas.emit('pointerup', pointer(2, 210, 120));
  assert.equal(input.pointer.down, false);
  assert.equal(input.pointer.justUp, true, 'a post-transition pointer still releases normally');
});

test('a pointer whose capture throws is still tracked', (t) => {
  const { canvas, input } = setup(t);
  // The browser throws this when the pointer is gone by the time the handler
  // runs — synthetic pointer events hit it every time.
  canvas.setPointerCapture = () => {
    throw Object.assign(new Error("No active pointer with the given id is found."), {
      name: 'NotFoundError',
    });
  };

  canvas.emit('pointerdown', pointer(1, 110, 70));

  assert.deepEqual(input.touches(), [{ x: 200, y: 100 }], 'the finger still reaches the game');
  assert.equal(input.pointer.down, true);
  assert.equal(input.pointer.justDown, true);
  assert.equal(input.pointer.x, 200);
  assert.equal(input.pointer.y, 100);
});

test('detach removes every fake window and canvas listener', (t) => {
  const { canvas, input, windowTarget } = setup(t);
  assert.equal(windowTarget.listenerCount(), 2);
  assert.equal(canvas.listenerCount(), 4);

  input.detach();
  assert.equal(windowTarget.listenerCount(), 0);
  assert.equal(canvas.listenerCount(), 0);
});