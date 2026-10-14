import { api } from '../api.js';
import { isIos, isStandalone } from '../push.js';
import { pushToggle } from '../push-toggle.js';
import { isAdmin, state } from '../state.js';
import { el, html, toast } from '../ui.js';

export function settingsView(main, _params, { onLogout, onUserChanged }) {
  const ios = isIos();
  main.replaceChildren(
    el(html`<div>
      <header class="bar">
        <button class="txt-btn" data-act="back">← Volver</button>
        <span class="grow"></span>
      </header>
      <div class="page">
        <section class="section">
          <header><span class="num">01</span><h3>Usuario</h3></header>
          <form data-slot="username" novalidate>
            <label class="field"><span>Nombre de usuario</span>
              <input class="input" name="username" value="${state.me.username}" maxlength="20" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" />
            </label>
            <div class="error"></div>
            <button class="btn small" type="submit">Cambiar</button>
          </form>
          <div style="height:18px"></div>
        </section>

        <section class="section">
          <header><span class="num">02</span><h3>Avisos</h3></header>
          <div class="row">
            <span class="grow">Avisos en este teléfono<small>Toca el botón para activarlos o desactivarlos.</small></span>
            <span data-slot="push"></span>
          </div>
        </section>

        ${isStandalone()
          ? ''
          : html`<section class="section">
              <header><span class="num">03</span><h3>Instalar</h3></header>
              <p>${ios
                ? 'En Safari toca Compartir y luego «Agregar a inicio». Ábrela desde el ícono para recibir avisos.'
                : 'En el menú del navegador (⋮) elige «Instalar app» o «Agregar a pantalla de inicio».'}</p>
            </section>`}

        <section class="section">
          <header><span class="num">${isStandalone() ? '03' : '04'}</span><h3>Contraseña</h3></header>
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
          <button class="row row-link" data-act="logout"><span class="grow">Cerrar sesión<small data-slot="me">${state.me.username}</small></span>→</button>
        </section>

        <div class="end">mi nopor · privado</div>
      </div>
    </div>`),
  );

  main.querySelector('[data-act="back"]').addEventListener('click', () => history.back());

  main.querySelector('[data-slot="push"]').replaceWith(pushToggle());

  const nameForm = main.querySelector('[data-slot="username"]');
  const nameInput = nameForm.elements.username;
  nameInput.addEventListener('input', () => {
    const clean = nameInput.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (clean !== nameInput.value) nameInput.value = clean;
  });
  nameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = nameForm.querySelector('.error');
    error.textContent = '';
    if (nameInput.value === state.me.username) return;
    try {
      const { user } = await api.post('/api/auth/username', { username: nameInput.value });
      onUserChanged(user);
      main.querySelector('[data-slot="me"]').textContent = user.username;
      toast(`Listo. Ahora entras como ${user.username}`);
    } catch (err) {
      error.textContent = err.message;
    }
  });

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
