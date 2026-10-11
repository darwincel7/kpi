import { api } from '../api.js';
import { enablePush, isIos, isStandalone, pushStatus } from '../push.js';
import { canUpload, on, state, storageGet, storageSet } from '../state.js';
import { el, html, toast } from '../ui.js';
import { postCard, postTile } from './post-card.js';

const loading = () => el('<div class="loading">Revelando…</div>');

// Lista paginada de publicaciones, como lista o cuadrícula. También la usa el perfil.
export function postList(container, { user, mode = 'list', emptyNode }) {
  let cursor = null;
  let busy = false;
  let done = false;
  let topId = 0;
  const holder = el(mode === 'grid' ? '<div class="grid"></div>' : '<div class="feed"></div>');
  const sentinel = el('<div></div>');
  sentinel.append(loading());
  container.replaceChildren(holder, sentinel);

  async function loadMore() {
    if (busy || done) return;
    busy = true;
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
        else if (mode === 'list' && holder.children.length) sentinel.append(el('<div class="end">— Fin del rollo —</div>'));
      }
    } catch (err) {
      sentinel.replaceChildren(el(html`<div class="empty"><p>${err.message}</p><button class="btn small">Reintentar</button></div>`));
      sentinel.querySelector('button').addEventListener('click', () => {
        sentinel.replaceChildren(loading());
        loadMore();
      });
    } finally {
      busy = false;
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
    node = el(html`<div class="banner"><span class="grow">Activa los avisos para saber cuándo alguien sube algo.</span>
      <button data-act="on">Activar</button><button data-act="x" aria-label="Cerrar">×</button></div>`);
  } else if (status === 'needs-install' && isIos() && !isStandalone()) {
    node = el(html`<div class="banner"><span class="grow">En iPhone, toca Compartir y luego «Agregar a inicio» para recibir avisos.</span>
      <button data-act="x" aria-label="Cerrar">×</button></div>`);
  } else return;
  slot.replaceChildren(node);
  node.querySelector('[data-act="x"]').addEventListener('click', () => {
    storageSet('pushBannerDismissed', '1');
    node.remove();
  });
  node.querySelector('[data-act="on"]')?.addEventListener('click', async () => {
    try {
      await enablePush();
      toast('Avisos activados');
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
      <header class="bar">
        <a href="#/" class="mark" data-act="top">mi nopor<i></i></a>
        <span class="grow"></span>
        <button class="txt-btn" data-act="mode"></button>
      </header>
      <div data-slot="banner"></div>
      <div data-slot="list"></div>
    </div>`),
  );
  const modeBtn = main.querySelector('[data-act="mode"]');
  const slot = main.querySelector('[data-slot="list"]');
  let list;
  let fresh;

  const empty = () =>
    el(html`<div class="empty">
      <h3>Todavía no hay nada.</h3>
      <p>${canUpload() ? 'Sube la primera foto o video. Los demás recibirán un aviso.' : 'Cuando alguien publique, te llegará un aviso.'}</p>
      ${canUpload() ? html`<a class="btn solid" href="#/subir">Subir</a>` : ''}
    </div>`);

  function load() {
    fresh?.remove();
    fresh = null;
    list?.destroy();
    modeBtn.textContent = mode === 'grid' ? 'Lista' : 'Cuadrícula';
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
    if (fresh || !list.topId || state.latestPostId <= list.topId) return;
    fresh = el('<button class="fresh">Hay algo nuevo ↑</button>');
    fresh.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      load();
    });
    main.append(fresh);
  });

  return () => {
    list?.destroy();
    offPosted();
    offUnread();
  };
}
