import { api } from '../api.js';
import { canUpload, state } from '../state.js';
import { avatar, el, html, icon } from '../ui.js';
import { postList } from './feed.js';

export async function profileView(main, [username]) {
  const own = username === state.me.username;
  main.replaceChildren(
    el(html`<div>
      <header class="topbar">
        ${own ? '' : html`<button class="icon-btn back" data-act="back" aria-label="Volver">${icon('back')}</button>`}
        <h1>@${username}</h1>
        ${own ? html`<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${icon('sliders')}</a>` : ''}
      </header>
      <div data-slot="head"><div class="spinner"></div></div>
      <div data-slot="grid"></div>
    </div>`),
  );
  main.querySelector('[data-act="back"]')?.addEventListener('click', () => history.back());
  const head = main.querySelector('[data-slot="head"]');

  let data;
  try {
    data = await api.get(`/api/users/${encodeURIComponent(username)}`);
  } catch (err) {
    head.replaceChildren(el(html`<div class="empty"><h3>No encontrado</h3><p>${err.message}</p></div>`));
    return;
  }
  if (!head.isConnected) return;
  const { user, stats } = data;
  const since = new Date(user.createdAt).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  head.replaceChildren(
    el(html`<div class="profile">
      ${avatar(user)}
      <h2>${user.username} ${user.role === 'admin' ? html`<span class="tag">${icon('shield', 'xs')} Admin</span>` : ''}</h2>
      <div class="muted">Desde ${since}</div>
      <div class="stats">
        <div><strong>${stats.posts}</strong>publicaciones</div>
        <div><strong>${stats.photos}</strong>fotos</div>
        <div><strong>${stats.videos}</strong>videos</div>
      </div>
    </div>`),
  );

  const list = postList(main.querySelector('[data-slot="grid"]'), {
    user: user.username,
    mode: 'grid',
    emptyNode: el(html`<div class="empty" style="padding-top:30px"><p>${own ? 'Aún no has publicado nada.' : 'Aún no ha publicado nada.'}</p>
      ${own && canUpload() ? html`<a class="btn primary" href="#/subir">${icon('plus', 'sm')} Subir</a>` : ''}</div>`),
  });
  return () => list.destroy();
}
