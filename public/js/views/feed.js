import { api } from '../api.js';
import { enablePush, isIos, isStandalone, pushStatus } from '../push.js';
import { pullToRefresh } from '../pull.js';
import { canUpload, feedTop, on, setFeedTop, state, storageGet, storageSet } from '../state.js';
import { el, html, toast } from '../ui.js';
import { postCard, postTile } from './post-card.js';

const loading = () => el('<div class="loading">Revelando…</div>');

// Lista paginada de publicaciones, como lista o cuadrícula. También la usa el perfil.
// `seen` es la última publicación que ya se vio: lo de otros que sea más
// nuevo se marca como «Nuevo», también en las páginas siguientes.
export function postList(container, { user, mode = 'list', emptyNode, onTop, seen = null }) {
  let cursor = null;
  let busy = false;
  let done = false;
  let topId = 0;
  let loaded = false;
  let boundary = seen;
  // Cambia cada vez que se actualiza, para descartar páginas que llegan tarde.
  let gen = 0;
  const holder = el(mode === 'grid' ? '<div class="grid"></div>' : '<div class="feed"></div>');
  const sentinel = el('<div></div>');
  sentinel.append(loading());
  container.replaceChildren(holder, sentinel);

  const isNew = (p) => boundary !== null && p.id > boundary && p.author.id !== state.me?.id;
  const item = (p) => (mode === 'grid' ? postTile(p, { isNew: isNew(p) }) : postCard(p, { isNew: isNew(p) }));
  const query = (before) => {
    const qs = new URLSearchParams();
    if (before) qs.set('before', before);
    if (user) qs.set('user', user);
    return api.get(`/api/posts?${qs}`);
  };

  function setTop(posts) {
    loaded = true;
    topId = posts[0]?.id || 0;
    onTop?.(topId);
  }

  function finish() {
    sentinel.replaceChildren();
    if (!holder.children.length && emptyNode) sentinel.append(emptyNode);
    else if (mode === 'list' && holder.children.length) sentinel.append(el('<div class="end">— Fin del rollo —</div>'));
  }

  async function loadMore() {
    if (busy || done) return;
    busy = true;
    const g = gen;
    try {
      const { posts, nextCursor } = await query(cursor);
      if (g !== gen) return;
      if (!cursor) setTop(posts);
      for (const p of posts) holder.append(item(p));
      cursor = nextCursor;
      done = !nextCursor;
      if (done) finish();
    } catch (err) {
      if (g !== gen) return;
      sentinel.replaceChildren(el(html`<div class="empty"><p>${err.message}</p><button class="btn small">Reintentar</button></div>`));
      sentinel.querySelector('button').addEventListener('click', () => {
        sentinel.replaceChildren(loading());
        loadMore();
      });
    } finally {
      busy = false;
    }
  }

  // Trae lo más reciente sin vaciar la pantalla. Devuelve cuántas
  // publicaciones de otros llegaron desde la última vez.
  async function refresh() {
    const before = topId;
    const known = loaded;
    const g = ++gen;
    const { posts, nextCursor } = await query(null);
    if (g !== gen) return 0;
    if (known) boundary = before;
    holder.replaceChildren(...posts.map(item));
    setTop(posts);
    cursor = nextCursor;
    done = !nextCursor;
    busy = false;
    if (done) finish();
    else {
      sentinel.replaceChildren(loading());
      io.unobserve(sentinel);
      io.observe(sentinel);
    }
    return posts.filter(isNew).length;
  }

  const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '1200px' });
  io.observe(sentinel);
  loadMore();
  return {
    refresh,
    destroy: () => {
      gen++;
      io.disconnect();
    },
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
        <button class="fresh" data-act="fresh" type="button" hidden></button>
        <span class="grow"></span>
        <button class="txt-btn" data-act="mode"></button>
      </header>
      <div class="pull" data-slot="pull">
        <div class="ptr" aria-hidden="true"><i></i><span></span></div>
        <div data-slot="banner"></div>
        <div data-slot="list"></div>
      </div>
    </div>`),
  );
  const modeBtn = main.querySelector('[data-act="mode"]');
  const freshBtn = main.querySelector('[data-act="fresh"]');
  const slot = main.querySelector('[data-slot="list"]');
  let list;
  let refreshing = false;
  // Si la actualización viene del botón de arriba, el botón muestra el progreso.
  let fromPill = false;

  const empty = () =>
    el(html`<div class="empty">
      <h3>Todavía no hay nada.</h3>
      <p>${canUpload() ? 'Sube la primera foto o video. Los demás recibirán un aviso.' : 'Cuando alguien publique, te llegará un aviso.'}</p>
      ${canUpload() ? html`<a class="btn solid" href="#/subir">Subir</a>` : ''}
    </div>`);

  function load() {
    list?.destroy();
    modeBtn.textContent = mode === 'grid' ? 'Lista' : 'Cuadrícula';
    list = postList(slot, { mode, emptyNode: empty(), onTop: setFeedTop, seen: feedTop() });
  }

  // Arriba se indica cuántas publicaciones nuevas hay sin ver.
  function paintFresh() {
    const n = state.newPosts;
    const busy = refreshing && fromPill;
    freshBtn.hidden = !n && !busy;
    freshBtn.disabled = busy;
    freshBtn.textContent = busy ? 'Revelando…' : n === 1 ? '1 nueva ↑' : `${n} nuevas ↑`;
  }

  async function refresh({ quiet = false, pill = false } = {}) {
    if (refreshing) return;
    refreshing = true;
    fromPill = pill;
    paintFresh();
    try {
      // La página trae hasta 12; si llegaron más, vale la cuenta del servidor.
      const pending = state.newPosts;
      const added = Math.max(await list.refresh(), pending);
      if (!quiet) toast(added ? (added === 1 ? '1 publicación nueva' : `${added} publicaciones nuevas`) : 'Ya estás al día');
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      refreshing = false;
      paintFresh();
    }
  }

  const toTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refresh({ pill: true });
  };

  modeBtn.addEventListener('click', () => {
    mode = mode === 'grid' ? 'list' : 'grid';
    storageSet('feedMode', mode);
    load();
  });
  main.querySelector('[data-act="top"]').addEventListener('click', (e) => {
    e.preventDefault();
    toTop();
  });
  freshBtn.addEventListener('click', toTop);

  load();
  paintFresh();
  pushBanner(main.querySelector('[data-slot="banner"]'));

  const offPull = pullToRefresh(main.querySelector('[data-slot="pull"]'), main.querySelector('.ptr'), () => refresh());
  const offHome = on('home-tap', toTop);
  const offUnread = on('unread', paintFresh);
  const offPosted = on('posted', () => {
    window.scrollTo({ top: 0 });
    refresh({ quiet: true });
  });

  return () => {
    list?.destroy();
    offPull();
    offHome();
    offUnread();
    offPosted();
  };
}
