import test from 'node:test';
import assert from 'node:assert/strict';
import { disposeScreen } from '../shell/screen.js';

test('screen disposal runs cleanup and reports cleanup faults without throwing', () => {
  let calls = 0;
  assert.equal(disposeScreen({ destroy() { calls += 1; } }), true);
  assert.equal(calls, 1);

  const boom = new Error('cleanup failed');
  let reported = null;
  assert.doesNotThrow(() => disposeScreen({ destroy() { throw boom; } }, (error) => { reported = error; }));
  assert.equal(reported, boom);
  assert.equal(disposeScreen({}), false);
});
