import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextPainter } from '../shell/canvas-text.js';

test('text painter merges local defaults, applies overrides, and clears glow', () => {
  const calls = [];
  const ctx = {
    font: '', fillStyle: '', textAlign: '', shadowColor: '', shadowBlur: 0,
    fillText(...args) { calls.push(args); },
  };
  const text = createTextPainter(ctx, { cream: '#fff' }, { size: 16, align: 'left' });
  text('SHIFT', 12, 34, { color: '#fc0', bold: true, glow: 8 });

  assert.equal(ctx.font, `bold 16px 'Courier New', monospace`);
  assert.equal(ctx.fillStyle, '#fc0');
  assert.equal(ctx.textAlign, 'left');
  assert.equal(ctx.shadowColor, '#fc0');
  assert.equal(ctx.shadowBlur, 0);
  assert.deepEqual(calls, [['SHIFT', 12, 34]]);
});
