import { api } from '../api.js';
import { state } from '../state.js';
import { avatar, confirmAction, el, formatBytes, html, icon, sheet, timeAgo, toast } from '../ui.js';

const TOGGLES = [
  ['registrationOpen', 'Registro abierto', 'Cualquiera con el enlace de invitación puede crear su cuenta.'],
  ['uploadsAdminOnly', 'Solo administradores publican', 'Los demás solo pueden ver, dar me gusta y comentar.'],
  ['watermark', 'Marca de agua', 'Muestra el usuario de quien mira sobre las fotos y videos.'],
];

const inviteLink = (code) => `${location.origin}/#/registro/${code}`;

export async function adminView(main) {
  main.replaceChildren(
    el(html`<div>
      <header class="topbar">
        <button class="icon-btn back" data-act="back" aria-label="Volver">${icon('back')}</button>
        <h1>Administración</h1>
      </header>
      <div class="page" data-slot="page"><div class="spinner"></div></div>
    </div>`),
  );
  main.querySelector('[data-act="back"]').addEventListener('click', () => history.back());
  const page = main.querySelector('[data-slot="page"]');

  async function load() {
    let data;
    try {
      data = await api.get('/api/admin');
    } catch (err) {
      page.replaceChildren(el(html`<div class="empty"><p>${err.message}</p></div>`));
      return;
    }
    render(data);
  }

  function render({ settings, users, storage }) {
    const total = storage.bytes + storage.freeBytes;
    const pct = total ? Math.max(1, Math.round((storage.bytes / total) * 100)) : 0;
    page.replaceChildren(
      el(html`<div>
        <div class="card">
          <h3>Invitar personas</h3>
          <p>Envía este enlace. Solo tendrán que elegir un usuario y una contraseña.</p>
          <div class="copy-row">
            <input class="input" readonly value="${inviteLink(settings.inviteCode)}" aria-label="Enlace de invitación" />
            <button class="btn small primary" data-act="copy">${icon('copy', 'sm')}</button>
          </div>
          <div class="btn-row">
            ${navigator.share ? html`<button class="btn small" data-act="share">${icon('share', 'sm')} Compartir</button>` : ''}
            <button class="btn small" data-act="regen">${icon('refresh', 'sm')} Nuevo enlace</button>
          </div>
          <p style="margin:12px 0 0">Código: <b style="color:var(--text);letter-spacing:.08em">${settings.inviteCode}</b></p>
        </div>

        <div class="card">
          <h3>Ajustes</h3>
          ${TOGGLES.map(
            ([key, label, help]) => html`<label class="row">
              <span class="grow">${label}<small>${help}</small></span>
              <input type="checkbox" class="toggle" data-setting="${key}" ${settings[key] ? 'checked' : ''} />
            </label>`,
          )}
        </div>

        <div class="card">
          <h3>Almacenamiento</h3>
          <div class="meter"><i style="width:${pct}%"></i></div>
          <p style="margin:0">${formatBytes(storage.bytes)} en ${storage.files} archivos · ${formatBytes(storage.freeBytes)} libres</p>
        </div>

        <div class="card">
          <h3>Usuarios (${users.length})</h3>
          ${users.map(
            (u) => html`<div class="row" data-user="${u.id}">
              ${avatar(u, 40)}
              <div class="grow">
                <a href="#/u/${u.username}"><b>${u.username}</b></a>
                ${u.role === 'admin' ? html`<span class="tag">Admin</span>` : ''}
                ${u.status === 'blocked' ? html`<span class="tag red">Bloqueado</span>` : ''}
                <small>${u.postCount} publicaciones · ${u.lastSeenAt ? `activo hace ${timeAgo(u.lastSeenAt)}` : 'sin actividad'}</small>
              </div>
              ${u.id === state.me.id ? html`<span class="tag grey">Tú</span>` : html`<button class="icon-btn" data-act="user" aria-label="Opciones">${icon('more')}</button>`}
            </div>`,
          )}
        </div>
      </div>`),
    );

    const link = inviteLink(settings.inviteCode);
    page.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Enlace copiado');
      } catch {
        page.querySelector('.copy-row input').select();
        toast('Mantén presionado para copiar');
      }
    });
    page.querySelector('[data-act="share"]')?.addEventListener('click', () =>
      navigator.share({ title: 'mi nopor', text: 'Te invito a mi nopor', url: link }).catch(() => {}),
    );
    page.querySelector('[data-act="regen"]').addEventListener('click', async () => {
      if (!(await confirmAction('¿Crear un enlace nuevo?', 'El enlace anterior dejará de funcionar.', 'Crear enlace nuevo'))) return;
      await api.post('/api/admin/invite');
      toast('Enlace nuevo creado');
      load();
    });

    page.querySelectorAll('[data-setting]').forEach((input) =>
      input.addEventListener('change', async () => {
        try {
          const { settings: s } = await api.patch('/api/admin/settings', { [input.dataset.setting]: input.checked });
          Object.assign(state.settings, { uploadsAdminOnly: s.uploadsAdminOnly, watermark: s.watermark });
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
        const choice = await sheet({
          title: `@${u.username}`,
          options: [
            u.role === 'admin'
              ? { label: 'Quitar administrador', value: 'member', icon: 'user' }
              : { label: 'Hacer administrador', value: 'admin', icon: 'shield' },
            u.status === 'blocked'
              ? { label: 'Desbloquear', value: 'active', icon: 'check' }
              : { label: 'Bloquear', value: 'blocked', icon: 'lock', danger: true },
            { label: 'Eliminar cuenta y su contenido', value: 'delete', icon: 'trash', danger: true },
          ],
        });
        if (!choice) return;
        try {
          if (choice === 'delete') {
            if (!(await confirmAction(`¿Eliminar a @${u.username}?`, 'Se borrarán su cuenta y todo lo que publicó. No se puede deshacer.', 'Eliminar'))) return;
            await api.del(`/api/admin/users/${u.id}`);
            toast('Cuenta eliminada');
          } else if (choice === 'admin' || choice === 'member') {
            await api.patch(`/api/admin/users/${u.id}`, { role: choice });
            toast(choice === 'admin' ? 'Ahora es administrador' : 'Ya no es administrador');
          } else {
            await api.patch(`/api/admin/users/${u.id}`, { status: choice });
            toast(choice === 'blocked' ? 'Usuario bloqueado' : 'Usuario desbloqueado');
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
