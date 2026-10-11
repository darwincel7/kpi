import { api } from '../api.js';
import { enablePush, isIos, isStandalone, pushStatus } from '../push.js';
import { canUpload, on, state, storageGet, storageSet } from '../state.js';
import { el, html, icon, toast } from '../ui.js';
import { postCard, postTile } from './post-card.js';

// Lista paginada de publicaciones, como lista o cuadrícula. También la usa el perfil.
export function postList(container, { user, mode = 'list', emptyNode }) {
  let cursor = null;
  let loading = false;
  let done = false;
  let topId = 0;
  const holder = el(mode === 'grid' ? '<div class="grid"></div>' : '<div class="feed"></div>');
  const sentinel = el('<div><div class="spinner"></div></div>');
  container.replaceChildren(holder, sentinel);

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    try {
      const qs = new URLSearchParams();
      if (cursor) qs.set('before', cursor);
      if (user) qs.set('user', user);
      const { posts, nextCursor } = await api.get(`/api/posts?${qs}`);
      if (!cursor && posts[0]) topId = posts[0].id;
      for (const p of posts) holder.append(mode === 'grid' ? postTile(p) : postCard(p));
      cursor = nextCursor;
      done = !nextCursor;
      if (done) {
        sentinel.replaceChildren();
        if (!holder.children.length && emptyNode) sentinel.append(emptyNode);
        else if (mode === 'list' && holder.children.length) {
          sentinel.append(el(html`<div class="notice">${icon('lock', 'xs')} Contenido privado. Prohibido descargar, grabar o compartir.</div>`));
        }
      }
    } catch (err) {
      sentinel.replaceChildren(el(html`<div class="empty"><p>${err.message}</p><button class="btn small">Reintentar</button></div>`));
      sentinel.querySelector('button').addEventListener('click', () => {
        sentinel.replaceChildren(el('<div class="spinner"></div>'));
        loadMore();
      });
    } finally {
      loading = false;
    }
  }

  const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '1200px' });
  io.observe(sentinel);
  loadMore();
  return {
    get topId() {
      return topId;
    },
    destroy: () => io.disconnect(),
  };
}

async function pushBanner(slot) {
  if (storageGet('pushBannerDismissed') === '1') return;
  const status = await pushStatus();
  let node;
  if (status === 'off') {
    node = el(html`<div class="banner">${icon('bell')}<div class="txt"><b>Activa las notificaciones</b><span>Entérate cuando alguien suba algo.</span></div>
      <button class="btn small primary" data-act="on">Activar</button><button class="icon-btn" data-act="x" aria-label="Cerrar">${icon('x', 'sm')}</button></div>`);
  } else if (status === 'needs-install' && isIos() && !isStandalone()) {
    node = el(html`<div class="banner">${icon('phone')}<div class="txt"><b>Instala la app en tu iPhone</b><span>Toca ${icon('share', 'xs')} Compartir y luego «Agregar a inicio» para recibir avisos.</span></div>
      <button class="icon-btn" data-act="x" aria-label="Cerrar">${icon('x', 'sm')}</button></div>`);
  } else return;
  slot.replaceChildren(node);
  node.querySelector('[data-act="x"]').addEventListener('click', () => {
    storageSet('pushBannerDismissed', '1');
    node.remove();
  });
  node.querySelector('[data-act="on"]')?.addEventListener('click', async () => {
    try {
      await enablePush();
      toast('Notificaciones activadas');
      node.remove();
    } catch (err) {
      toast(err.message, { error: true });
    }
  });
}

export function feedView(main) {
  let mode = storageGet('feedMode', 'list');
  main.replaceChildren(
    el(html`<div>
      <header class="topbar">
        <a href="#/" class="logo" data-act="top">mi <b>nopor</b></a>
        <span class="spacer"></span>
        <button class="icon-btn" data-act="mode" aria-label="Cambiar vista"></button>
      </header>
      <div data-slot="banner"></div>
      <div data-slot="list"></div>
    </div>`),
  );
  const modeBtn = main.querySelector('[data-act="mode"]');
  const slot = main.querySelector('[data-slot="list"]');
  let list;
  let pill;

  const empty = () =>
    el(html`<div class="empty">
      <div class="big-ico">${icon('image')}</div>
      <h3>Todavía no hay nada</h3>
      <p>${canUpload() ? 'Sube la primera foto o video.' : 'Cuando alguien publique, te avisamos.'}</p>
      ${canUpload() ? html`<a class="btn primary" href="#/subir">${icon('plus', 'sm')} Subir</a>` : ''}
    </div>`);

  function load() {
    pill?.remove();
    pill = null;
    list?.destroy();
    modeBtn.replaceChildren(el(String(icon(mode === 'grid' ? 'list' : 'grid'))));
    list = postList(slot, { mode, emptyNode: empty() });
  }

  modeBtn.addEventListener('click', () => {
    mode = mode === 'grid' ? 'list' : 'grid';
    storageSet('feedMode', mode);
    load();
  });
  main.querySelector('[data-act="top"]').addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    load();
  });

  load();
  pushBanner(main.querySelector('[data-slot="banner"]'));

  const offPosted = on('posted', () => {
    window.scrollTo({ top: 0 });
    load();
  });
  const offUnread = on('unread', () => {
    if (pill || !list.topId || state.latestPostId <= list.topId) return;
    pill = el(html`<button class="new-pill">${icon('sparkle', 'sm')} Contenido nuevo</button>`);
    pill.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      load();
    });
    main.append(pill);
  });

  return () => {
    list?.destroy();
    offPosted();
    offUnread();
  };
}
