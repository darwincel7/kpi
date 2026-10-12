import { api } from '../api.js';
import { bindHold, guarded, holdMode } from '../protect.js';
import { isAdmin, state } from '../state.js';
import { HEART, confirmAction, el, html, raw, sheet, timeAgo, toast, watermarkStyle } from '../ui.js';

// Los administradores usan el reproductor normal. Los demás, uno sin
// controles nativos: sin pantalla completa, sin "imagen en imagen" y sin
// botón de descarga.
const ADMIN_VIDEO = raw(
  'playsinline controls controlslist="nodownload noremoteplayback noplaybackrate" disablepictureinpicture disableremoteplayback',
);
const GUARDED_VIDEO = raw('playsinline disablepictureinpicture disableremoteplayback');

function aspect(m) {
  if (!m?.width || !m?.height) return 4 / 5;
  // Entre 4:5 (vertical) y 16:9 (horizontal).
  return Math.min(16 / 9, Math.max(4 / 5, m.width / m.height));
}

function watermark() {
  if (!guarded() || !state.settings?.watermark) return '';
  return html`<div class="wm" style="${raw(watermarkStyle(state.me))}"></div>`;
}

function videoMarkup(m, { lazy }) {
  const src = m.poster ? m.src : `${m.src}#t=0.1`;
  const preload = m.poster && lazy ? raw(`poster="${m.poster}" preload="none"`) : m.poster ? raw(`poster="${m.poster}" preload="metadata"`) : raw('preload="metadata"');
  if (!guarded()) return html`<video src="${src}" ${preload} ${ADMIN_VIDEO}></video>`;
  return html`<video src="${src}" ${preload} ${GUARDED_VIDEO}></video>
    <div class="vbar"><i></i></div>
    <span class="vplay">${holdMode() ? '' : 'Reproducir'}</span>`;
}

function slide(m, i, { lazy = true } = {}) {
  if (m.kind === 'video') {
    return html`<div class="slide" data-video>${videoMarkup(m, { lazy })}${watermark()}</div>`;
  }
  return html`<div class="slide">
    <img src="${m.src}" alt="" ${lazy ? raw('loading="lazy"') : ''} decoding="async" draggable="false" />
    <div class="shield" data-i="${i}"></div>
    ${watermark()}
  </div>`;
}

function trackIndex(track) {
  return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
}

const currentVideo = (track) => track.children[trackIndex(track)]?.querySelector('video') || null;

// Barra de progreso y estado de los videos sin controles nativos.
function wireGuardedVideos(root) {
  root.querySelectorAll('.slide[data-video]').forEach((s) => {
    const v = s.querySelector('video');
    const bar = s.querySelector('.vbar i');
    if (!bar) return;
    v.addEventListener('timeupdate', () => {
      bar.style.width = `${v.duration ? (v.currentTime / v.duration) * 100 : 0}%`;
    });
    v.addEventListener('play', () => s.classList.add('playing'));
    v.addEventListener('pause', () => s.classList.remove('playing'));
    v.addEventListener('ended', () => s.classList.remove('playing'));
    if (!holdMode()) {
      v.addEventListener('click', () => (v.paused ? v.play().catch(() => {}) : v.pause()));
    }
  });
}

function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.append(a);
  a.click();
  a.remove();
}

export async function downloadMedia(media, index) {
  if (!isAdmin()) return;
  if (media.length === 1) return downloadUrl(media[0].download);
  const choice = await sheet({
    title: 'Descargar original',
    options: [
      { label: `Solo esta · ${index + 1} de ${media.length}`, value: 'one' },
      { label: `Todas · ${media.length}`, value: 'all' },
    ],
  });
  if (choice === 'one') downloadUrl(media[index].download);
  if (choice === 'all') {
    for (const m of media) {
      downloadUrl(m.download);
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

// Pausa cualquier otro video cuando empieza uno.
document.addEventListener(
  'play',
  (e) => {
    document.querySelectorAll('video').forEach((v) => v !== e.target && v.pause());
  },
  true,
);

const commentsLabel = (n) => (n ? `${n} ${n === 1 ? 'comentario' : 'comentarios'}` : 'Comentar');

// Comentarios debajo de la publicación: los últimos, el resto a un toque y
// un campo para comentar sin salir del inicio.
function commentsSection(post, { all = null, onCount }) {
  let list = all ?? post.comments ?? [];
  let complete = !!all;
  const node = el(html`<section class="talk">
    <button class="talk-more" type="button" hidden></button>
    <div class="talk-list"></div>
    <form class="talk-form" autocomplete="off">
      <input name="body" maxlength="1000" placeholder="Escribe un comentario…" enterkeyhint="send" />
      <button type="submit" disabled>Enviar</button>
    </form>
  </section>`);
  const more = node.querySelector('.talk-more');
  const box = node.querySelector('.talk-list');
  const form = node.querySelector('.talk-form');
  const input = form.elements.body;
  const send = form.querySelector('button');

  const row = (c) => {
    const r = el(html`<p class="c-row">
      <a class="c-who" href="#/u/${c.author.username}">${c.author.username}</a>
      <span class="c-text">${c.body}</span>
      <span class="c-meta">${timeAgo(c.createdAt)}${c.canDelete ? html` · <button type="button" class="c-del">Borrar</button>` : ''}</span>
    </p>`);
    r.querySelector('.c-del')?.addEventListener('click', async () => {
      if (!(await confirmAction('¿Borrar comentario?', '', 'Borrar'))) return;
      try {
        await api.del(`/api/comments/${c.id}`);
        list = list.filter((x) => x.id !== c.id);
        post.commentCount -= 1;
        render();
      } catch (err) {
        toast(err.message, { error: true });
      }
    });
    return r;
  };

  function render() {
    box.replaceChildren(...list.map(row));
    const hidden = post.commentCount - list.length;
    more.hidden = complete || hidden <= 0;
    more.textContent = post.commentCount === 1 ? 'Ver el comentario' : `Ver los ${post.commentCount} comentarios`;
    onCount(post.commentCount);
  }

  more.addEventListener('click', async () => {
    more.disabled = true;
    try {
      ({ comments: list } = await api.get(`/api/posts/${post.id}`));
      complete = true;
      render();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      more.disabled = false;
    }
  });

  input.addEventListener('input', () => {
    send.disabled = !input.value.trim();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    send.disabled = true;
    input.disabled = true;
    try {
      const { comment } = await api.post(`/api/posts/${post.id}/comments`, { body });
      list = [...list, comment];
      post.commentCount += 1;
      input.value = '';
      render();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      input.disabled = false;
      send.disabled = !input.value.trim();
    }
  });

  render();
  return { node, focus: () => input.focus() };
}

export function postCard(post, { detail = false, comments = null, onDeleted } = {}) {
  const n = post.media.length;
  const admin = isAdmin();
  const node = el(html`
    <article class="post" data-id="${post.id}">
      <header class="post-head">
        <a class="who" href="#/u/${post.author.username}">${post.author.username}</a>
        <span class="when">${timeAgo(post.createdAt)}</span>
        <span class="grow"></span>
        ${post.canDelete ? html`<button class="more" data-act="more" aria-label="Opciones">···</button>` : ''}
      </header>
      <div class="frame protect" style="aspect-ratio:${aspect(post.media[0])}">
        <div class="track">${post.media.map((m, i) => slide(m, i, { lazy: !(detail && i === 0) }))}</div>
        ${n > 1
          ? html`<button class="nav prev" data-nav="-1" aria-label="Anterior"></button>
              <button class="nav next" data-nav="1" aria-label="Siguiente"></button>`
          : ''}
      </div>
      ${n > 1 ? html`<div class="reel">${post.media.map((_, i) => html`<i class="${i === 0 ? 'on' : ''}"></i>`)}</div>` : ''}
      <div class="meta">
        <button data-act="like" class="${post.liked ? 'liked' : ''}" aria-label="Me gusta">${HEART} <span data-likes>${post.likeCount || ''}</span></button>
        <button data-act="talk" data-comments>${commentsLabel(post.commentCount)}</button>
        <span class="grow"></span>
        ${admin ? html`<button class="dl" data-act="download">Descargar ↓</button>` : html`<span class="nodl">No descargable</span>`}
      </div>
      ${post.caption ? html`<p class="caption">${post.caption}</p>` : ''}
    </article>
  `);

  const track = node.querySelector('.track');
  const frame = node.querySelector('.frame');
  const likeBtn = node.querySelector('[data-act="like"]');
  const countLabel = node.querySelector('[data-comments]');

  const talk = commentsSection(post, {
    all: comments,
    onCount: (n) => (countLabel.textContent = commentsLabel(n)),
  });
  node.append(talk.node);
  countLabel.addEventListener('click', () => talk.focus());

  if (guarded()) wireGuardedVideos(node);
  bindHold(frame, {
    onReveal: () => currentVideo(track)?.play().catch(() => {}),
    onHide: () => track.querySelectorAll('video').forEach((v) => v.pause()),
  });

  track.addEventListener(
    'scroll',
    () => {
      const i = trackIndex(track);
      node.querySelectorAll('.reel i').forEach((d, j) => d.classList.toggle('on', i === j));
      track.querySelectorAll('video').forEach((v, j) => j !== i && v.pause());
    },
    { passive: true },
  );

  async function setLiked(liked) {
    if (post.liked === liked) return;
    post.liked = liked;
    post.likeCount += liked ? 1 : -1;
    likeBtn.classList.toggle('liked', liked);
    node.querySelector('[data-likes]').textContent = post.likeCount || '';
    try {
      const r = await api.post(`/api/posts/${post.id}/like`, { liked });
      post.likeCount = r.likeCount;
      node.querySelector('[data-likes]').textContent = r.likeCount || '';
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  likeBtn.addEventListener('click', () => setLiked(!post.liked));

  // Un toque abre el visor; dos toques dan "me gusta".
  let lastTap = 0;
  let tapTimer;
  frame.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return track.scrollBy({ left: Number(nav.dataset.nav) * track.clientWidth, behavior: 'smooth' });
    const shieldEl = e.target.closest('.shield');
    if (!shieldEl || frame.dataset.justHeld) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      clearTimeout(tapTimer);
      lastTap = 0;
      setLiked(true);
      const burst = el(html`<div class="burst">${HEART}</div>`);
      frame.append(burst);
      setTimeout(() => burst.remove(), 900);
    } else {
      lastTap = now;
      tapTimer = setTimeout(() => openViewer(post.media, Number(shieldEl.dataset.i)), 300);
    }
  });

  node.querySelector('[data-act="download"]')?.addEventListener('click', () => downloadMedia(post.media, trackIndex(track)));

  node.querySelector('[data-act="more"]')?.addEventListener('click', async () => {
    const choice = await sheet({ options: [{ label: 'Eliminar publicación', value: 'delete', danger: true }] });
    if (choice !== 'delete') return;
    if (!(await confirmAction('¿Eliminar?', 'Se borra para todos, con sus fotos y videos.', 'Eliminar'))) return;
    try {
      await api.del(`/api/posts/${post.id}`);
      node.remove();
      toast('Publicación eliminada');
      onDeleted?.();
    } catch (err) {
      toast(err.message, { error: true });
    }
  });

  return node;
}

export function postTile(post) {
  const m = post.media[0];
  const kind = post.media.length > 1 ? `×${post.media.length}` : m?.kind === 'video' ? 'video' : '';
  return el(html`
    <a class="tile protect${holdMode() ? ' thumb-veil' : ''}" href="#/p/${post.id}">
      ${m?.thumb ? html`<img src="${m.thumb}" alt="" loading="lazy" draggable="false" />` : html`<span class="ph">${m?.kind === 'video' ? 'video' : 'foto'}</span>`}
      ${kind ? html`<span class="kind">${kind}</span>` : ''}
    </a>
  `);
}

export function openViewer(media, start = 0) {
  document.querySelectorAll('video').forEach((v) => v.pause());
  const n = media.length;
  const admin = isAdmin();
  const node = el(html`
    <div class="viewer protect" role="dialog">
      <div class="top">
        <button data-act="close">× Cerrar</button>
        <span class="grow"></span>
        ${n > 1 ? html`<span data-count>${start + 1} / ${n}</span>` : ''}
        ${admin ? html`<button data-act="download">Descargar ↓</button>` : ''}
      </div>
      <div class="track">${media.map((m, i) => slide(m, i, { lazy: false }))}</div>
      ${admin ? '' : html`<div class="bottom">Privado · No descargable</div>`}
    </div>
  `);
  const track = node.querySelector('.track');
  node.querySelectorAll('.shield').forEach((s) => s.removeAttribute('data-i'));
  document.body.append(node);
  document.body.style.overflow = 'hidden';
  track.scrollLeft = start * track.clientWidth;

  if (guarded()) wireGuardedVideos(node);
  bindHold(node, {
    onReveal: () => currentVideo(track)?.play().catch(() => {}),
    onHide: () => track.querySelectorAll('video').forEach((v) => v.pause()),
  });

  track.addEventListener(
    'scroll',
    () => {
      const i = trackIndex(track);
      const count = node.querySelector('[data-count]');
      if (count) count.textContent = `${i + 1} / ${n}`;
      track.querySelectorAll('video').forEach((v, j) => j !== i && v.pause());
    },
    { passive: true },
  );

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    node.remove();
    document.body.style.overflow = '';
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
  };
  // El botón "atrás" del teléfono cierra el visor en lugar de salir.
  const onPop = () => close();
  const onKey = (e) => {
    if (e.key === 'Escape') history.back();
    if (e.key === 'ArrowRight') track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
    if (e.key === 'ArrowLeft') track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
  };
  history.pushState({ viewer: true }, '');
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);
  node.querySelector('[data-act="close"]').addEventListener('click', () => history.back());
  node.querySelector('[data-act="download"]')?.addEventListener('click', () => downloadMedia(media, trackIndex(track)));
}
