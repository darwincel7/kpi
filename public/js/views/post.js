import { api } from '../api.js';
import { avatar, confirmAction, el, html, icon, timeAgo, toast } from '../ui.js';
import { postCard } from './post-card.js';

function back() {
  if (history.length > 1) history.back();
  else location.hash = '#/';
}

export async function postView(main, [id]) {
  main.replaceChildren(
    el(html`<div>
      <header class="topbar">
        <button class="icon-btn back" data-act="back" aria-label="Volver">${icon('back')}</button>
        <h1>Publicación</h1>
      </header>
      <div data-slot="post"><div class="spinner"></div></div>
    </div>`),
  );
  main.querySelector('[data-act="back"]').addEventListener('click', back);
  const slot = main.querySelector('[data-slot="post"]');

  let data;
  try {
    data = await api.get(`/api/posts/${id}`);
  } catch (err) {
    if (!slot.isConnected) return;
    slot.replaceChildren(el(html`<div class="empty"><h3>No disponible</h3><p>${err.message}</p><a class="btn" href="#/">Ir al inicio</a></div>`));
    return;
  }
  if (!slot.isConnected) return;
  const { post, comments } = data;
  const card = postCard(post, { detail: true, onDeleted: () => (location.hash = '#/') });
  const list = el('<div class="comments"></div>');
  const box = el(html`<div class="comment-box">
    <form>
      <input class="input" name="body" placeholder="Escribe un comentario…" maxlength="1000" autocomplete="off" />
      <button class="icon-btn" type="submit" aria-label="Enviar">${icon('send')}</button>
    </form>
  </div>`);

  const renderComment = (c) => {
    const node = el(html`<div class="comment">
      <a href="#/u/${c.author.username}">${avatar(c.author, 32)}</a>
      <div class="body"><a href="#/u/${c.author.username}"><b>${c.author.username}</b></a><span class="text">${c.body}</span>
        <div class="muted">${timeAgo(c.createdAt)}</div></div>
      ${c.canDelete ? html`<button class="icon-btn" aria-label="Borrar comentario">${icon('trash', 'sm')}</button>` : ''}
    </div>`);
    node.querySelector('button')?.addEventListener('click', async () => {
      if (!(await confirmAction('¿Borrar comentario?', '', 'Borrar'))) return;
      try {
        await api.del(`/api/comments/${c.id}`);
        node.remove();
        setCount(-1);
      } catch (err) {
        toast(err.message, { error: true });
      }
    });
    return node;
  };

  const setCount = (delta) => {
    post.commentCount += delta;
    card.querySelector('[data-comments]').textContent = post.commentCount || '';
  };

  comments.forEach((c) => list.append(renderComment(c)));
  slot.replaceChildren(card, list);
  main.append(box);

  const form = box.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.elements.body;
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true;
    try {
      const { comment } = await api.post(`/api/posts/${post.id}/comments`, { body });
      list.append(renderComment(comment));
      setCount(1);
      input.value = '';
      list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}
