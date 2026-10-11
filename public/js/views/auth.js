import { api } from '../api.js';
import { state } from '../state.js';
import { el, html } from '../ui.js';

const brand = html`<div>
  <div class="mark">mi nopor<i></i></div>
  <p class="lede">Privado · Solo por invitación · +18</p>
</div>`;

function bindForm(form, submit) {
  const error = form.querySelector('.error');
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
        <div class="error"></div>
        <button class="btn solid block" type="submit">Entrar</button>
        <p class="foot">¿Te invitaron? <a href="#/registro">Crea tu cuenta</a></p>
      </form>
    </div>`),
  );
  const form = main.querySelector('form');
  bindForm(form, async ({ username, password }) => {
    const { user } = await api.post('/api/auth/login', { username, password });
    await onAuthed(user);
  });
}

export function registerView(main, [code], { onAuthed }) {
  const setup = state.setupNeeded;
  if (!state.registrationOpen) {
    main.replaceChildren(
      el(html`<div class="auth">${brand}
        <div><h2>El registro está cerrado.</h2>
        <p class="foot">Pídele a quien te invitó que lo abra. <a href="#/entrar">Ya tengo cuenta</a></p></div></div>`),
    );
    return;
  }
  const invite = (code || '').toUpperCase();
  main.replaceChildren(
    el(html`<div class="auth">
      ${brand}
      <form novalidate>
        <h2>${setup ? 'Primero, tu cuenta. Serás quien administra.' : 'Crea tu cuenta.'}</h2>
        <label class="field"><span>Usuario</span>
          <input class="input" name="username" placeholder="luna_23" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" required />
        </label>
        <label class="field"><span>Contraseña</span>
          <input class="input" name="password" type="password" placeholder="mínimo 6 caracteres" autocomplete="new-password" required />
        </label>
        ${setup || invite
          ? html`<input type="hidden" name="inviteCode" value="${invite}" />`
          : html`<label class="field"><span>Código de invitación</span>
              <input class="input" name="inviteCode" autocapitalize="characters" autocomplete="off" spellcheck="false" required />
            </label>`}
        <label class="check">
          <input type="checkbox" name="accept" value="1" />
          <span>Tengo 18 años o más. No voy a descargar, capturar, grabar ni compartir nada de lo que vea aquí, y solo subiré contenido de adultos que dieron su consentimiento.</span>
        </label>
        <div class="error"></div>
        <button class="btn solid block" type="submit">${setup ? 'Empezar' : 'Crear cuenta'}</button>
        ${setup ? '' : html`<p class="foot">¿Ya tienes cuenta? <a href="#/entrar">Entrar</a></p>`}
      </form>
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
}
