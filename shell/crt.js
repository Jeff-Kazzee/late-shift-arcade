// CRT dressing: scanlines + vignette + faint flicker, drawn over the frame.
// Under prefers-reduced-motion the whole overlay is off.

export function createCrt({ reducedMotion = false } = {}) {
  let lines = null;

  function buildScanlines(w, h) {
    lines = document.createElement('canvas');
    lines.width = w;
    lines.height = h;
    const c = lines.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  }

  return {
    draw(ctx, w, h, timeMs) {
      if (reducedMotion) return;
      if (!lines || lines.width !== w || lines.height !== h) buildScanlines(w, h);
      ctx.drawImage(lines, 0, 0);

      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const flicker = 0.015 + 0.015 * Math.sin(timeMs / 120);
      ctx.fillStyle = `rgba(11,12,20,${flicker.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    },
  };
}
