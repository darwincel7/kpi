import { api } from '../api.js';
import { isAdmin, state } from '../state.js';
import { avatar, confirmAction, el, html, icon, raw, sheet, timeAgo, toast, watermarkStyle } from '../ui.js';

const VIDEO_ATTRS = raw(
  'playsinline controls controlslist="nodownload noremoteplayback noplaybackrate" disablepictureinpicture disableremoteplayback',
);

function aspect(m) {
  if (!m?.width || !m?.height) return 1;
  // Entre 4:5 (vertical) y 16:9 (horizontal), como en las redes sociales.
  return Math.min(16 / 9, Math.max(4 / 5, m.width / m.height));
}

function watermark() {
  if (isAdmin() || !state.settings?.watermark || !state.me) return '';
  return html`<div class="wm" style="${raw(watermarkStyle(state.me.username))}"></div>`;
}

function slide(m, i, { eager = false } = {}) {
  if (m.kind === 'video') {
    const src = m.poster ? m.src : `${m.src}#t=0.1`;
    return html`<div class="slide">
      <video src="${src}" ${m.poster ? html`poster="${m.poster}" preload="none"` : raw('preload="metadata"')} ${VIDEO_ATTRS}></video>
      ${watermark()}
    </div>`;
  }
  return html`<div class="slide">
    <img src="${m.src}" alt="" ${eager ? '' : raw('loading="lazy"')} decoding="async" draggable="false" />
    <div class="shield" data-i="${i}"></div>
    ${watermark()}
  </div>`;
}

function trackIndex(track) {
  return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
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
  if (media.length === 1) return downloadUrl(media[0].download);
  const choice = await sheet({
    title: 'Descargar en calidad original',
    options: [
      { label: `Solo esta (${index + 1} de ${media.length})`, value: 'one', icon: 'download' },
      { label: `Todas (${media.length})`, value: 'all', icon: 'layers' },
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

export function postCard(post, { detail = false, onDeleted } = {}) {
  const n = post.media.length;
  const node = el(html`
    <article class="post" data-id="${post.id}">
      <header class="post-head">
        <a href="#/u/${post.author.username}">${avatar(post.author)}</a>
        <div class="who">
          <a class="name" href="#/u/${post.author.username}">${post.author.username}</a>
          <span class="time">${timeAgo(post.createdAt)}</span>
        </div>
        ${post.canDelete ? html`<button class="icon-btn" data-act="more" aria-label="Opciones">${icon('more')}</button>` : ''}
      </header>
      <div class="frame protect" style="aspect-ratio:${aspect(post.media[0])}">
        <div class="track">${post.media.map((m, i) => slide(m, i, { eager: detail && i === 0 }))}</div>
        ${isAdmin() ? '' : html`<span class="pill lock">${icon('lock', 'xs')} No descargable</span>`}
        ${n > 1
          ? html`<span class="pill counter">1/${n}</span>
              <button class="nav prev" data-nav="-1" aria-label="Anterior">${icon('back', 'sm')}</button>
              <button class="nav next" data-nav="1" aria-label="Siguiente">${icon('back', 'sm')}</button>`
          : ''}
      </div>
      ${n > 1 ? html`<div class="dots">${post.media.map((_, i) => html`<i class="${i === 0 ? 'on' : ''}"></i>`)}</div>` : ''}
      <div class="actions">
        <button class="icon-btn like${post.liked ? ' on' : ''}" data-act="like" aria-label="Me gusta">${icon('heart')}</button>
        <span class="count" data-likes>${post.likeCount || ''}</span>
        <a class="icon-btn" href="#/p/${post.id}" aria-label="Comentarios">${icon('comment')}</a>
        <span class="count" data-comments>${post.commentCount || ''}</span>
        <span class="spacer"></span>
        ${isAdmin() ? html`<button class="dl-btn" data-act="download">${icon('download', 'sm')} Descargar</button>` : ''}
      </div>
      ${post.caption ? html`<p class="caption"><b>${post.author.username}</b>${post.caption}</p>` : ''}
      ${post.commentCount && !detail
        ? html`<a class="comments-link" href="#/p/${post.id}">${post.commentCount === 1 ? 'Ver 1 comentario' : `Ver los ${post.commentCount} comentarios`}</a>`
        : ''}
    </article>
  `);

  const track = node.querySelector('.track');
  const frame = node.querySelector('.frame');
  const likeBtn = node.querySelector('[data-act="like"]');

  track.addEventListener(
    'scroll',
    () => {
      const i = trackIndex(track);
      node.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', i === j));
      const counter = node.querySelector('.counter');
      if (counter) counter.textContent = `${i + 1}/${n}`;
      track.querySelectorAll('video').forEach((v, j) => {
        if (j !== i) v.pause();
      });
    },
    { passive: true },
  );

  async function setLiked(liked) {
    if (post.liked === liked) return;
    post.liked = liked;
    post.likeCount += liked ? 1 : -1;
    likeBtn.classList.toggle('on', liked);
    likeBtn.classList.remove('pop');
    void likeBtn.offsetWidth;
    if (liked) likeBtn.classList.add('pop');
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

  // Un toque abre a pantalla completa; dos toques dan "me gusta".
  let lastTap = 0;
  let tapTimer;
  frame.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return track.scrollBy({ left: Number(nav.dataset.nav) * track.clientWidth, behavior: 'smooth' });
    const shield = e.target.closest('.shield');
    if (!shield) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      clearTimeout(tapTimer);
      lastTap = 0;
      setLiked(true);
      const burst = el(html`<div class="heart-burst">${icon('heart')}</div>`);
      frame.append(burst);
      setTimeout(() => burst.remove(), 850);
    } else {
      lastTap = now;
      tapTimer = setTimeout(() => openLightbox(post.media, Number(shield.dataset.i)), 300);
    }
  });

  node.querySelector('[data-act="download"]')?.addEventListener('click', () => downloadMedia(post.media, trackIndex(track)));

  node.querySelector('[data-act="more"]')?.addEventListener('click', async () => {
    const choice = await sheet({ options: [{ label: 'Eliminar publicación', value: 'delete', danger: true, icon: 'trash' }] });
    if (choice !== 'delete') return;
    if (!(await confirmAction('¿Eliminar publicación?', 'Se borrarán las fotos y videos para todos.', 'Eliminar'))) return;
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
  const kindIcon = post.media.length > 1 ? icon('layers', 'sm') : m?.kind === 'video' ? icon('play', 'sm') : '';
  return el(html`
    <a class="tile protect" href="#/p/${post.id}">
      ${m?.thumb ? html`<img src="${m.thumb}" alt="" loading="lazy" draggable="false" />` : html`<span class="ph">${icon(m?.kind === 'video' ? 'play' : 'image')}</span>`}
      ${kindIcon ? html`<span class="kind">${kindIcon}</span>` : ''}
    </a>
  `);
}

export function openLightbox(media, start = 0) {
  document.querySelectorAll('video').forEach((v) => v.pause());
  const n = media.length;
  const node = el(html`
    <div class="lightbox protect" role="dialog">
      <div class="lb-top">
        <button class="icon-btn" data-act="close" aria-label="Cerrar">${icon('x')}</button>
        ${n > 1 ? html`<span class="pill counter" style="position:static">${start + 1}/${n}</span>` : ''}
        <span class="spacer"></span>
        ${isAdmin() ? html`<button class="dl-btn" data-act="download">${icon('download', 'sm')} Original</button>` : ''}
      </div>
      <div class="track">
        ${media.map((m) =>
          m.kind === 'video'
            ? html`<div class="slide"><video src="${m.src}" ${m.poster ? html`poster="${m.poster}"` : ''} preload="metadata" ${VIDEO_ATTRS}></video>${watermark()}</div>`
            : html`<div class="slide"><img src="${m.src}" alt="" draggable="false" /><div class="shield" style="cursor:default"></div>${watermark()}</div>`,
        )}
      </div>
      ${isAdmin() ? '' : html`<div class="lb-bottom"><span class="pill">${icon('lock', 'xs')} Contenido privado · No descargable</span></div>`}
    </div>
  `);
  const track = node.querySelector('.track');
  document.body.append(node);
  document.body.style.overflow = 'hidden';
  track.scrollLeft = start * track.clientWidth;

  track.addEventListener(
    'scroll',
    () => {
      const i = trackIndex(track);
      const counter = node.querySelector('.counter');
      if (counter) counter.textContent = `${i + 1}/${n}`;
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
  history.pushState({ lightbox: true }, '');
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);
  node.querySelector('[data-act="close"]').addEventListener('click', () => history.back());
  node.querySelector('[data-act="download"]')?.addEventListener('click', () => downloadMedia(media, trackIndex(track)));
}
