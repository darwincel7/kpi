import { api } from '../api.js';
import { state } from '../state.js';
import { el, html } from '../ui.js';

const brand = html`<div class="brand">
  <div class="age">18+</div>
  <div><span class="logo">mi <b>nopor</b></span></div>
  <p>Privado. Solo por invitación.</p>
</div>`;

function bindForm(form, submit) {
  const error = form.querySelector('.form-error');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    button.disabled = true;
    try {
      await submit(Object.fromEntries(new FormData(form)));
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
    }
  });
}

export function loginView(main, _params, { onAuthed }) {
  main.replaceChildren(
    el(html`<div class="auth">
      ${brand}
      <form novalidate>
        <label class="field"><span>Usuario</span>
          <input class="input" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required />
        </label>
        <label class="field"><span>Contraseña</span>
          <input class="input" name="password" type="password" autocomplete="current-password" required />
        </label>
        <div class="form-error"></div>
        <button class="btn primary block" type="submit">Entrar</button>
      </form>
      <div class="switch-link">¿Te invitaron? <a href="#/registro">Crea tu cuenta</a></div>
      <div class="fine">Contenido para adultos. Prohibido descargar, grabar o compartir.</div>
    </div>`),
  );
  const form = main.querySelector('form');
  bindForm(form, async ({ username, password }) => {
    const { user } = await api.post('/api/auth/login', { username, password });
    await onAuthed(user);
  });
  form.querySelector('input').focus();
}

export function registerView(main, [code], { onAuthed }) {
  const setup = state.setupNeeded;
  if (!state.registrationOpen) {
    main.replaceChildren(
      el(html`<div class="auth">${brand}
        <div class="empty" style="padding:10px 0"><h3>Registro cerrado</h3><p>Pídele a un administrador que lo abra.</p>
        <a class="btn block" href="#/entrar">Ya tengo cuenta</a></div></div>`),
    );
    return;
  }
  const invite = (code || '').toUpperCase();
  main.replaceChildren(
    el(html`<div class="auth">
      ${brand}
      <h2>${setup ? 'Crea la cuenta de administrador' : 'Crea tu cuenta'}</h2>
      <form novalidate>
        <label class="field"><span>Nombre de usuario</span>
          <input class="input" name="username" placeholder="ej. luna_23" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" required />
        </label>
        <label class="field"><span>Contraseña</span>
          <input class="input" name="password" type="password" placeholder="Mínimo 6 caracteres" autocomplete="new-password" required />
        </label>
        ${setup || invite
          ? html`<input type="hidden" name="inviteCode" value="${invite}" />`
          : html`<label class="field"><span>Código de invitación</span>
              <input class="input" name="inviteCode" autocapitalize="characters" autocomplete="off" spellcheck="false" required />
            </label>`}
        <label class="check">
          <input type="checkbox" name="accept" value="1" />
          <span>Tengo 18 años o más. Me comprometo a no descargar, grabar ni compartir nada de lo que vea aquí, y a subir solo contenido de adultos que dieron su consentimiento.</span>
        </label>
        <div class="form-error"></div>
        <button class="btn primary block" type="submit">${setup ? 'Empezar' : 'Crear cuenta'}</button>
      </form>
      ${setup ? '' : html`<div class="switch-link">¿Ya tienes cuenta? <a href="#/entrar">Entrar</a></div>`}
    </div>`),
  );
  const form = main.querySelector('form');
  const username = form.querySelector('[name="username"]');
  username.addEventListener('input', () => {
    const clean = username.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (clean !== username.value) username.value = clean;
  });
  bindForm(form, async (data) => {
    const { user } = await api.post('/api/auth/register', {
      username: data.username,
      password: data.password,
      inviteCode: data.inviteCode,
      accept: data.accept === '1',
    });
    await onAuthed(user);
  });
  username.focus();
}
