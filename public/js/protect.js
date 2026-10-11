// Protección contra capturas para quien no es administrador.
//
// Ninguna página web puede impedir del todo una captura o grabación de
// pantalla: el sistema operativo la hace por fuera del navegador. Lo que sí
// se puede hacer, y se hace aquí:
// - ocultar todo en cuanto la app pierde el foco o pasa a segundo plano
//   (miniatura del selector de apps, herramientas de recorte en computadora);
// - tapar la pantalla al detectar los atajos de captura de Windows y Mac;
// - mostrar el contenido borroso hasta que se mantiene presionado (ver
//   bindHold), así una captura casual sale borrosa;
// - impedir imprimir la página.
import { isAdmin, state } from './state.js';

export const guarded = () => !!state.me && !isAdmin();
export const holdMode = () => guarded() && !!state.settings?.holdToView;

let timer = 0;

function shield(ms) {
  if (!guarded()) return;
  document.body.classList.add('shielded');
  document.querySelectorAll('video').forEach((v) => v.pause());
  document.querySelectorAll('.revealed').forEach((n) => n.classList.remove('revealed'));
  clearTimeout(timer);
  if (ms) timer = setTimeout(unshield, ms);
}

function unshield() {
  if (document.hidden) return;
  clearTimeout(timer);
  document.body.classList.remove('shielded');
}

const CAPTURE_KEYS = (e) =>
  e.key === 'PrintScreen' ||
  (e.metaKey && e.shiftKey) || // Mac: Cmd+Shift+3/4/5 · Windows: Win+Shift+S
  (e.key === 'Meta' && e.shiftKey) ||
  (e.key === 'Shift' && e.metaKey) ||
  (e.ctrlKey && e.shiftKey && /^[sS]$/.test(e.key));

export function initProtection() {
  document.addEventListener('visibilitychange', () => (document.hidden ? shield() : unshield()));
  window.addEventListener('pagehide', () => shield());
  window.addEventListener('blur', () => shield());
  window.addEventListener('focus', () => setTimeout(unshield, 120));
  // Volver a tocar la app la descubre aunque el navegador no avise del foco.
  document.addEventListener('pointerdown', () => {
    if (document.body.classList.contains('shielded') && document.hasFocus()) unshield();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (CAPTURE_KEYS(e)) shield(3000);
    },
    true,
  );
  document.addEventListener(
    'keyup',
    (e) => {
      if (e.key !== 'PrintScreen' || !guarded()) return;
      shield(3000);
      // En Windows la tecla Imprimir Pantalla copia la imagen al portapapeles;
      // se intenta reemplazarla.
      navigator.clipboard?.writeText(' ').catch(() => {});
    },
    true,
  );

  window.addEventListener('beforeprint', () => shield());
  window.addEventListener('afterprint', () => unshield());
}

// Contenido borroso hasta que se mantiene presionado. Un toque corto no lo
// descubre (así se puede desplazar la página sin destellos).
export function bindHold(frame, { onReveal, onHide } = {}) {
  if (!holdMode()) return;
  frame.classList.add('veiled');
  frame.insertAdjacentHTML('beforeend', '<div class="veil-hint"><span>Mantén presionado</span></div>');
  let pending = 0;
  let shown = false;
  let start = null;

  const hide = () => {
    clearTimeout(pending);
    start = null;
    if (!shown) return;
    shown = false;
    frame.classList.remove('revealed');
    // El "clic" que llega al soltar no debe contar como un toque.
    frame.dataset.justHeld = '1';
    setTimeout(() => delete frame.dataset.justHeld, 400);
    onHide?.();
  };

  frame.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('[data-nav], button, a')) return;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(pending);
    pending = setTimeout(() => {
      shown = true;
      frame.classList.add('revealed');
      onReveal?.();
    }, 140);
  });
  frame.addEventListener('pointermove', (e) => {
    if (start && !shown && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) hide();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) frame.addEventListener(type, hide);
}
