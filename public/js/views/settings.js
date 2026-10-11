import { api } from '../api.js';
import { disablePush, enablePush, isIos, isStandalone, pushStatus } from '../push.js';
import { isAdmin, state } from '../state.js';
import { el, html, icon, toast } from '../ui.js';

const STATUS_TEXT = {
  on: 'Activadas en este dispositivo',
  off: 'Desactivadas en este dispositivo',
  denied: 'Bloqueadas. Permítelas en los ajustes del navegador.',
  'needs-install': 'En iPhone primero instala la app (abajo).',
  unsupported: 'Este navegador no permite notificaciones.',
};

export function settingsView(main, _params, { onLogout }) {
  const ios = isIos();
  main.replaceChildren(
    el(html`<div>
      <header class="topbar">
        <button class="icon-btn back" data-act="back" aria-label="Volver">${icon('back')}</button>
        <h1>Ajustes</h1>
      </header>
      <div class="page">
        <div class="card">
          <div class="row">
            ${icon('bell')}
            <div class="grow">Notificaciones<small data-slot="push-status">…</small></div>
            <input type="checkbox" class="toggle" data-act="push" aria-label="Notificaciones" disabled />
          </div>
        </div>

        ${isStandalone()
          ? ''
          : html`<div class="card">
              <h3>Instalar la app</h3>
              <p>${ios
                ? html`En Safari toca ${icon('share', 'xs')} <b>Compartir</b> y luego <b>Agregar a inicio</b>. Ábrela desde el ícono para recibir notificaciones.`
                : html`En el menú del navegador (⋮) elige <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.`}</p>
            </div>`}

        <div class="card">
          <h3>Cambiar contraseña</h3>
          <form data-slot="password" novalidate>
            <label class="field"><span>Contraseña actual</span><input class="input" type="password" name="current" autocomplete="current-password" /></label>
            <label class="field"><span>Nueva contraseña</span><input class="input" type="password" name="next" autocomplete="new-password" placeholder="Mínimo 6 caracteres" /></label>
            <div class="form-error"></div>
            <button class="btn small" type="submit">${icon('key', 'sm')} Guardar</button>
          </form>
        </div>

        <div class="card">
          ${isAdmin() ? html`<a class="row row-link" href="#/admin">${icon('shield')}<span class="grow">Panel de administración<small>Invitaciones, usuarios y ajustes</small></span></a>` : ''}
          <button class="row row-link" data-act="logout">${icon('logout')}<span class="grow">Cerrar sesión<small>@${state.me.username}</small></span></button>
        </div>

        <div class="notice">${icon('lock', 'xs')} mi nopor · privado y solo por invitación</div>
      </div>
    </div>`),
  );

  main.querySelector('[data-act="back"]').addEventListener('click', () => history.back());

  const toggle = main.querySelector('[data-act="push"]');
  const statusText = main.querySelector('[data-slot="push-status"]');
  async function refreshPush() {
    const status = await pushStatus().catch(() => 'unsupported');
    statusText.textContent = STATUS_TEXT[status];
    toggle.checked = status === 'on';
    toggle.disabled = status !== 'on' && status !== 'off';
  }
  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    try {
      if (toggle.checked) {
        await enablePush();
        toast('Notificaciones activadas');
      } else {
        await disablePush();
      }
    } catch (err) {
      toast(err.message, { error: true });
    }
    refreshPush();
  });
  refreshPush();

  const form = main.querySelector('[data-slot="password"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = form.querySelector('.form-error');
    error.textContent = '';
    try {
      await api.post('/api/auth/password', Object.fromEntries(new FormData(form)));
      form.reset();
      toast('Contraseña actualizada');
    } catch (err) {
      error.textContent = err.message;
    }
  });

  main.querySelector('[data-act="logout"]').addEventListener('click', onLogout);
}
