import { api } from '../api.js';
import { canUpload, state } from '../state.js';
import { el, html } from '../ui.js';
import { postList } from './feed.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function profileView(main, [username]) {
  const own = username === state.me.username;
  main.replaceChildren(
    el(html`<div>
      <header class="bar">
        ${own ? html`<span class="grow"></span>` : html`<button class="txt-btn" data-act="back">← Volver</button><span class="grow"></span>`}
        ${own ? html`<a class="txt-btn" href="#/ajustes">Ajustes</a>` : ''}
      </header>
      <div data-slot="head"><div class="loading">Revelando…</div></div>
      <div data-slot="grid"></div>
    </div>`),
  );
  main.querySelector('[data-act="back"]')?.addEventListener('click', () => history.back());
  const head = main.querySelector('[data-slot="head"]');

  let data;
  try {
    data = await api.get(`/api/users/${encodeURIComponent(username)}`);
  } catch (err) {
    if (!head.isConnected) return;
    head.replaceChildren(el(html`<div class="empty"><h3>No existe.</h3><p>${err.message}</p></div>`));
    return;
  }
  if (!head.isConnected) return;
  const { user, stats } = data;
  const since = new Date(user.createdAt).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  head.replaceChildren(
    el(html`<div class="profile">
      <h2>${user.username}</h2>
      <div class="facts">
        ${user.role === 'admin' ? html`<span class="tag">Admin</span>` : ''}
        <span>desde ${since}</span>
        <span><b>${stats.posts}</b> ${stats.posts === 1 ? 'publicación' : 'publicaciones'}</span>
        <span>${plural(stats.photos, 'foto', 'fotos')} · ${plural(stats.videos, 'video', 'videos')}</span>
      </div>
    </div>`),
  );

  const list = postList(main.querySelector('[data-slot="grid"]'), {
    user: user.username,
    mode: 'grid',
    emptyNode: el(html`<div class="empty" style="padding-top:30px"><p>${own ? 'Aún no has publicado nada.' : 'Aún no ha publicado nada.'}</p>
      ${own && canUpload() ? html`<a class="btn solid" href="#/subir">Subir</a>` : ''}</div>`),
  });
  return () => list.destroy();
}
