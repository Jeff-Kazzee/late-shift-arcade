// Lifecycle boundary for cabinet screens. Disposal is best-effort so cleanup
// failures never hide the original frame fault or kill the animation loop.

export function disposeScreen(screen, onError = () => {}) {
  if (!screen || typeof screen.destroy !== 'function') return false;
  try {
    screen.destroy();
  } catch (error) {
    onError(error);
  }
  return true;
}
