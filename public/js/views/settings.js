import { api } from '../api.js';
import { disablePush, enablePush, isIos, isStandalone, pushStatus } from '../push.js';
import { isAdmin, state } from '../state.js';
import { el, html, toast } from '../ui.js';

const STATUS_TEXT = {
  on: 'Activados en este dispositivo.',
  off: 'Desactivados en este dispositivo.',
  denied: 'Bloqueados. Permítelos en los ajustes del navegador.',
  'needs-install': 'En iPhone, primero instala la app (abajo).',
  unsupported: 'Este navegador no permite avisos.',
};

export function settingsView(main, _params, { onLogout }) {
  const ios = isIos();
  main.replaceChildren(
    el(html`<div>
      <header class="bar">
        <button class="txt-btn" data-act="back">← Volver</button>
        <span class="grow"></span>
      </header>
      <div class="page">
        <section class="section">
          <header><span class="num">01</span><h3>Avisos</h3></header>
          <label class="row">
            <span class="grow">Avisos en este teléfono<small data-slot="push-status">…</small></span>
            <input type="checkbox" class="switch" data-act="push" aria-label="Avisos" disabled />
          </label>
        </section>

        ${isStandalone()
          ? ''
          : html`<section class="section">
              <header><span class="num">02</span><h3>Instalar</h3></header>
              <p>${ios
                ? 'En Safari toca Compartir y luego «Agregar a inicio». Ábrela desde el ícono para recibir avisos.'
                : 'En el menú del navegador (⋮) elige «Instalar app» o «Agregar a pantalla de inicio».'}</p>
            </section>`}

        <section class="section">
          <header><span class="num">${isStandalone() ? '02' : '03'}</span><h3>Contraseña</h3></header>
          <form data-slot="password" novalidate>
            <label class="field"><span>Actual</span><input class="input" type="password" name="current" autocomplete="current-password" /></label>
            <label class="field"><span>Nueva</span><input class="input" type="password" name="next" autocomplete="new-password" placeholder="mínimo 6 caracteres" /></label>
            <div class="error"></div>
            <button class="btn small" type="submit">Guardar</button>
          </form>
          <div style="height:18px"></div>
        </section>

        <section class="section">
          ${isAdmin() ? html`<a class="row row-link" href="#/admin"><span class="grow">Administración<small>Invitaciones, personas y protección</small></span>→</a>` : ''}
          <button class="row row-link" data-act="logout"><span class="grow">Cerrar sesión<small>${state.me.username}</small></span>→</button>
        </section>

        <div class="end">mi nopor · privado</div>
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
        toast('Avisos activados');
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
    const error = form.querySelector('.error');
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
