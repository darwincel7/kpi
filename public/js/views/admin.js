import { api } from '../api.js';
import { state } from '../state.js';
import { confirmAction, el, formatBytes, html, sheet, timeAgo, toast } from '../ui.js';

const TOGGLES = [
  ['holdToView', 'Mantener presionado para ver', 'Las fotos y videos se ven borrosos hasta que se mantienen presionados. Una captura rápida sale borrosa.'],
  ['watermark', 'Marca de agua', 'Muestra sobre el contenido el usuario y el número de quien mira.'],
  ['registrationOpen', 'Registro abierto', 'Cualquiera con el enlace de invitación puede crear su cuenta.'],
  ['uploadsAdminOnly', 'Solo administradores publican', 'Los demás solo pueden ver, dar me gusta y comentar.'],
];

const inviteLink = (code) => `${location.origin}/#/registro/${code}`;

export async function adminView(main) {
  main.replaceChildren(
    el(html`<div>
      <header class="bar">
        <button class="txt-btn" data-act="back">← Volver</button>
        <span class="grow"></span>
      </header>
      <div class="page" data-slot="page"><div class="loading">Revelando…</div></div>
    </div>`),
  );
  main.querySelector('[data-act="back"]').addEventListener('click', () => history.back());
  const page = main.querySelector('[data-slot="page"]');
  const owner = !!state.me.isOwner;

  async function load() {
    let data;
    try {
      data = await api.get('/api/admin');
    } catch (err) {
      page.replaceChildren(el(html`<div class="empty"><p>${err.message}</p></div>`));
      return;
    }
    if (page.isConnected) render(data);
  }

  // Qué puede hacer quien mira con cada cuenta.
  function actionsFor(u) {
    if (u.id === state.me.id || u.isOwner) return [];
    if (u.role === 'admin' && !owner) return [];
    const opts = [];
    if (owner) {
      opts.push(u.role === 'admin' ? { label: 'Quitar administrador', value: 'member' } : { label: 'Hacer administrador', value: 'admin' });
    }
    opts.push(u.status === 'blocked' ? { label: 'Desbloquear', value: 'active' } : { label: 'Bloquear', value: 'blocked', danger: true });
    opts.push({ label: 'Eliminar cuenta y contenido', value: 'delete', danger: true });
    return opts;
  }

  function render({ settings, users, storage }) {
    const total = storage.bytes + storage.freeBytes;
    const pct = total ? Math.max(0.5, (storage.bytes / total) * 100) : 0;
    const link = inviteLink(settings.inviteCode);
    page.replaceChildren(
      el(html`<div>
        <section class="section">
          <header><span class="num">01</span><h3>Invitar</h3></header>
          <p>Manda este enlace. Solo tendrán que elegir un usuario y una contraseña.</p>
          <span class="code">${link}</span>
          <div class="btns">
            <button class="btn small solid" data-act="copy">Copiar</button>
            ${navigator.share ? html`<button class="btn small" data-act="share">Compartir</button>` : ''}
            <button class="btn small" data-act="regen">Enlace nuevo</button>
          </div>
          <p>Código: <span style="color:var(--paper);letter-spacing:.1em">${settings.inviteCode}</span></p>
        </section>

        <section class="section">
          <header><span class="num">02</span><h3>Protección</h3></header>
          ${TOGGLES.map(
            ([key, label, help]) => html`<label class="row">
              <span class="grow">${label}<small>${help}</small></span>
              <input type="checkbox" class="switch" data-setting="${key}" ${settings[key] ? 'checked' : ''} />
            </label>`,
          )}
        </section>

        <section class="section">
          <header><span class="num">03</span><h3>Personas</h3><span class="dim">${users.length}</span></header>
          ${owner ? '' : html`<p>Solo el dueño puede nombrar o quitar administradores.</p>`}
          ${users.map(
            (u) => html`<div class="row" data-user="${u.id}">
              <div class="grow">
                <a href="#/u/${u.username}">${u.username}</a>
                ${u.isOwner ? html` <span class="tag">Dueño</span>` : u.role === 'admin' ? html` <span class="tag">Admin</span>` : ''}
                ${u.status === 'blocked' ? html` <span class="tag red">Bloqueado</span>` : ''}
                <small>${u.postCount} publ. · ${u.lastSeenAt ? `visto hace ${timeAgo(u.lastSeenAt)}` : 'sin actividad'}</small>
              </div>
              ${u.id === state.me.id ? html`<span class="faint">tú</span>` : actionsFor(u).length ? html`<button class="txt-btn" data-act="user">···</button>` : ''}
            </div>`,
          )}
        </section>

        <section class="section">
          <header><span class="num">04</span><h3>Espacio</h3></header>
          <div class="meter"><i style="width:${pct}%"></i></div>
          <p>${formatBytes(storage.bytes)} en ${storage.files} archivos · quedan ${formatBytes(storage.freeBytes)}</p>
        </section>
      </div>`),
    );

    page.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Enlace copiado');
      } catch {
        toast('Mantén presionado el enlace para copiarlo');
      }
    });
    page.querySelector('[data-act="share"]')?.addEventListener('click', () =>
      navigator.share({ title: 'mi nopor', text: 'Te invito a mi nopor', url: link }).catch(() => {}),
    );
    page.querySelector('[data-act="regen"]').addEventListener('click', async () => {
      if (!(await confirmAction('¿Enlace nuevo?', 'El enlace anterior dejará de funcionar.', 'Crear enlace nuevo'))) return;
      await api.post('/api/admin/invite');
      toast('Enlace nuevo creado');
      load();
    });

    page.querySelectorAll('[data-setting]').forEach((input) =>
      input.addEventListener('change', async () => {
        try {
          const { settings: s } = await api.patch('/api/admin/settings', { [input.dataset.setting]: input.checked });
          Object.assign(state.settings, { uploadsAdminOnly: s.uploadsAdminOnly, watermark: s.watermark, holdToView: s.holdToView });
          toast('Guardado');
        } catch (err) {
          input.checked = !input.checked;
          toast(err.message, { error: true });
        }
      }),
    );

    page.querySelectorAll('[data-act="user"]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const u = users.find((x) => x.id === Number(btn.closest('[data-user]').dataset.user));
        const choice = await sheet({ title: u.username, options: actionsFor(u) });
        if (!choice) return;
        try {
          if (choice === 'delete') {
            if (!(await confirmAction(`¿Eliminar a ${u.username}?`, 'Se borran su cuenta y todo lo que publicó. No se puede deshacer.', 'Eliminar'))) return;
            await api.del(`/api/admin/users/${u.id}`);
            toast('Cuenta eliminada');
          } else if (choice === 'admin' || choice === 'member') {
            await api.patch(`/api/admin/users/${u.id}`, { role: choice });
            toast(choice === 'admin' ? 'Ahora es administrador' : 'Ya no es administrador');
          } else {
            await api.patch(`/api/admin/users/${u.id}`, { status: choice });
            toast(choice === 'blocked' ? 'Cuenta bloqueada' : 'Cuenta desbloqueada');
          }
          load();
        } catch (err) {
          toast(err.message, { error: true });
        }
      }),
    );
  }

  load();
}
