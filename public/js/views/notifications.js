import { api } from '../api.js';
import { holdMode } from '../protect.js';
import { emit, state } from '../state.js';
import { el, html, timeAgo } from '../ui.js';

function describe(n) {
  if (n.type === 'comment') return 'comentó tu publicación.';
  const parts = [];
  if (n.photos) parts.push(n.photos === 1 ? 'una foto' : `${n.photos} fotos`);
  if (n.videos) parts.push(n.videos === 1 ? 'un video' : `${n.videos} videos`);
  return `subió ${parts.join(' y ') || 'algo nuevo'}.`;
}

export async function notificationsView(main) {
  main.replaceChildren(
    el(html`<div>
      <header class="bar"><h1>Avisos</h1></header>
      <div data-slot="list"><div class="loading">Revelando…</div></div>
    </div>`),
  );
  const slot = main.querySelector('[data-slot="list"]');
  try {
    const { notifications } = await api.get('/api/notifications');
    if (!slot.isConnected) return;
    if (!notifications.length) {
      slot.replaceChildren(
        el(html`<div class="empty"><h3>Nada por ahora.</h3>
          <p>Aquí aparece cuando alguien sube algo o comenta lo tuyo.</p></div>`),
      );
    } else {
      const veil = holdMode() ? ' thumb-veil' : '';
      slot.replaceChildren(
        ...notifications.map((n) =>
          el(html`<a class="notif${n.read ? '' : ' unread'}" href="#/p/${n.postId}">
            <span class="when">${timeAgo(n.createdAt)}</span>
            <span class="txt"><b>${n.actor?.username || 'alguien'}</b>${describe(n)}</span>
            ${n.thumb ? html`<span class="thumb protect${veil}"><img src="${n.thumb}" alt="" draggable="false" /></span>` : ''}
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
