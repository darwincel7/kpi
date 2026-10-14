// Botón de un toque para activar o desactivar los avisos en este teléfono.
// Si el teléfono todavía no los permite, explica qué hacer.
import { disablePush, enablePush, pushStatus } from './push.js';
import { el, sheet, toast } from './ui.js';

const LABEL = {
  on: 'Avisos activados',
  off: 'Avisos desactivados',
  denied: 'Avisos bloqueados',
  'needs-install': 'Activar avisos',
  unsupported: 'Sin avisos',
};

const HELP = {
  denied: {
    title: 'Avisos bloqueados',
    message: 'Los bloqueaste en este navegador. Entra a sus ajustes, busca Notificaciones y permite «mi nopor». Después vuelve y toca este botón.',
  },
  'needs-install': {
    title: 'Primero instala la app',
    message: 'En iPhone los avisos solo funcionan con la app instalada: en Safari toca Compartir, luego «Agregar a inicio», y ábrela desde el ícono.',
  },
  unsupported: {
    title: 'Este navegador no permite avisos',
    message: 'Abre mi nopor en Chrome (Android) o instálala desde Safari (iPhone).',
  },
};

export function pushToggle() {
  const btn = el('<button class="push-toggle" type="button"></button>');
  let status = null;

  const paint = () => {
    btn.textContent = LABEL[status] ?? 'Avisos';
    btn.classList.toggle('on', status === 'on');
    btn.setAttribute('aria-pressed', String(status === 'on'));
  };
  const refresh = async () => {
    status = await pushStatus().catch(() => 'unsupported');
    paint();
  };

  btn.addEventListener('click', async () => {
    if (!status || btn.disabled) return;
    if (HELP[status]) {
      await sheet({ ...HELP[status], options: [], cancelLabel: 'Entendido' });
      return refresh();
    }
    btn.disabled = true;
    try {
      if (status === 'on') {
        await disablePush();
        toast('Avisos desactivados en este teléfono');
      } else {
        await enablePush();
        toast('Avisos activados');
      }
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      await refresh();
    }
  });

  paint();
  refresh();
  return btn;
}
