import { api } from '../api.js';
import { emit, state } from '../state.js';
import { avatar, el, html, icon, timeAgo } from '../ui.js';

function describe(n) {
  if (n.type === 'comment') return 'comentó tu publicación';
  const parts = [];
  if (n.photos) parts.push(n.photos === 1 ? '1 foto' : `${n.photos} fotos`);
  if (n.videos) parts.push(n.videos === 1 ? '1 video' : `${n.videos} videos`);
  return `subió ${parts.join(' y ') || 'contenido nuevo'}`;
}

export async function notificationsView(main) {
  main.replaceChildren(
    el(html`<div>
      <header class="topbar"><h1>Avisos</h1></header>
      <div data-slot="list"><div class="spinner"></div></div>
    </div>`),
  );
  const slot = main.querySelector('[data-slot="list"]');
  try {
    const { notifications } = await api.get('/api/notifications');
    if (!notifications.length) {
      slot.replaceChildren(
        el(html`<div class="empty"><div class="big-ico">${icon('bell')}</div><h3>Sin avisos</h3>
          <p>Aquí verás cuando alguien suba contenido o comente lo tuyo.</p></div>`),
      );
    } else {
      slot.replaceChildren(
        ...notifications.map((n) =>
          el(html`<a class="notif${n.read ? '' : ' unread'}" href="#/p/${n.postId}">
            ${avatar(n.actor, 42)}
            <div class="txt"><b>${n.actor?.username || 'alguien'}</b> ${describe(n)}
              <div class="muted">${timeAgo(n.createdAt)}</div></div>
            <span class="thumb protect">${n.thumb ? html`<img src="${n.thumb}" alt="" draggable="false" />` : icon(n.type === 'comment' ? 'comment' : 'image', 'sm')}</span>
          </a>`),
        ),
      );
    }
    if (notifications.some((n) => !n.read)) {
      await api.post('/api/notifications/read');
      state.unread = 0;
      emit('unread');
    }
  } catch (err) {
    slot.replaceChildren(el(html`<div class="empty"><p>${err.message}</p></div>`));
  }
}
