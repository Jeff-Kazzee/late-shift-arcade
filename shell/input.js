// One input singleton owned by the shell. Keyboard + mouse + touch unified:
// pointer events cover both, coordinates are mapped into canvas logical
// space, and every active touch is tracked by pointerId so two-player
// split-screen play works. Games read it; they never attach listeners.

const ALIASES = {
  up: ['arrowup', 'w'],
  down: ['arrowdown', 's'],
  left: ['arrowleft', 'a'],
  right: ['arrowright', 'd'],
  action: ['space', 'enter'],
  pause: ['escape'],
  restart: ['r'],
  eject: ['q'],
};

// Keys the page must never scroll with while the cabinet is up.
const CAPTURED = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space']);

const norm = (key) => (key === ' ' ? 'space' : key.toLowerCase());
const expand = (name) => ALIASES[name] ?? [name];

export function createInput(canvas) {
  const held = new Set();
  const edges = new Set();
  const active = new Map(); // pointerId → {x, y} for every finger down
  // `moved` flips true on the first real pointer motion — games use it to
  // steer by hover on desktop without demanding a held button.
  const pointer = { x: 0, y: 0, down: false, justDown: false, justUp: false, moved: false };

  const toCanvas = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const onKeyDown = (e) => {
    const k = norm(e.key);
    if (CAPTURED.has(k)) e.preventDefault();
    if (!held.has(k)) edges.add(k);
    held.add(k);
  };
  const onKeyUp = (e) => held.delete(norm(e.key));
  const onPointerDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    const p = toCanvas(e);
    active.set(e.pointerId, p);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = true;
    pointer.justDown = true;
    pointer.moved = true;
  };
  const onPointerMove = (e) => {
    const p = toCanvas(e);
    if (active.has(e.pointerId)) active.set(e.pointerId, p);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.moved = true;
  };
  const onPointerUp = (e) => {
    const p = toCanvas(e);
    active.delete(e.pointerId);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = active.size > 0;
    pointer.justUp = true;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return {
    pointer,
    // Every finger currently down, in canvas coordinates.
    touches: () => Array.from(active.values()),
    // Semantic names ('up', 'action') or raw keys ('w', 'space') both work —
    // 2-player games read raw keys so W/S and the arrows stay distinct.
    down: (...names) => names.some((n) => expand(n).some((k) => held.has(k))),
    pressed: (...names) => names.some((n) => expand(n).some((k) => edges.has(k))),
    endFrame() {
      edges.clear();
      pointer.justDown = false;
      pointer.justUp = false;
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
