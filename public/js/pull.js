// Deslizar hacia abajo desde arriba para actualizar, como en las apps.
// Mueve la zona hacia abajo con el dedo; al soltar pasado el punto, llama a
// onRefresh y deja el indicador «revelando» hasta que termine.
const THRESHOLD = 70;
const HOLD = 56;
const MAX = 130;

const TEXT = {
  pull: 'Desliza para actualizar',
  ready: 'Suelta para actualizar',
  busy: 'Revelando…',
};

export function pullToRefresh(zone, indicator, onRefresh) {
  const label = indicator.querySelector('span');
  let start = null;
  let active = false;
  let busy = false;
  let dist = 0;

  const paint = (mode) => {
    zone.style.transform = dist ? `translateY(${dist}px)` : '';
    indicator.style.setProperty('--p', String(Math.min(1, dist / THRESHOLD)));
    indicator.dataset.mode = mode;
    label.textContent = TEXT[mode];
  };

  const settle = (to, mode) => {
    zone.classList.add('settling');
    dist = to;
    paint(mode);
    setTimeout(() => zone.classList.remove('settling'), 260);
  };

  const blocked = (target) => busy || window.scrollY > 0 || target.closest('.viewer, .sheet-bg, input, textarea');

  const onStart = (e) => {
    start = null;
    if (e.touches.length !== 1 || blocked(e.target)) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    active = false;
  };

  const onMove = (e) => {
    if (!start) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (!active) {
      // Un gesto de lado es para pasar fotos, y uno hacia arriba es para bajar en la página.
      if (Math.abs(dx) > Math.abs(dy) || dy < 0 || window.scrollY > 0) {
        if (Math.abs(dx) > 8 || dy < -8) start = null;
        return;
      }
      if (dy < 8) return;
      active = true;
    }
    if (e.cancelable) e.preventDefault();
    const was = dist >= THRESHOLD;
    // Cuesta más mientras más se jala.
    dist = Math.min(MAX, Math.max(0, dy - 8) * 0.5);
    if (!was && dist >= THRESHOLD) navigator.vibrate?.(8);
    paint(dist >= THRESHOLD ? 'ready' : 'pull');
  };

  const onEnd = async () => {
    if (!start) return;
    start = null;
    if (!active) return;
    active = false;
    if (dist < THRESHOLD) return settle(0, 'pull');
    busy = true;
    settle(HOLD, 'busy');
    try {
      await onRefresh();
    } finally {
      busy = false;
      settle(0, 'pull');
    }
  };

  paint('pull');
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
  return () => {
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
    zone.style.transform = '';
  };
}
