// Shared cabinet typography. Renderers supply only their local defaults;
// font, palette, glow, and cleanup stay consistent across every cartridge.

export function createTextPainter(ctx, palette, defaults = {}) {
  return function drawText(str, x, y, options = {}) {
    const settings = { size: 14, color: palette.cream, align: 'center', bold: false, glow: 0, ...defaults, ...options };
    ctx.font = `${settings.bold ? 'bold ' : ''}${settings.size}px 'Courier New', monospace`;
    ctx.fillStyle = settings.color;
    ctx.textAlign = settings.align;
    if (settings.glow > 0) {
      ctx.shadowColor = settings.color;
      ctx.shadowBlur = settings.glow;
    }
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  };
}
