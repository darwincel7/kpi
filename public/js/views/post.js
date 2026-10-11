import { api } from '../api.js';
import { confirmAction, el, html, timeAgo, toast } from '../ui.js';
import { postCard } from './post-card.js';

function back() {
  if (history.length > 1) history.back();
  else location.hash = '#/';
}

const commentsLabel = (n) => (n ? `${n} ${n === 1 ? 'comentario' : 'comentarios'}` : 'comentar');

export async function postView(main, [id]) {
  main.replaceChildren(
    el(html`<div>
      <header class="bar">
        <button class="txt-btn" data-act="back">← Volver</button>
        <span class="grow"></span>
      </header>
      <div data-slot="post"><div class="loading">Revelando…</div></div>
    </div>`),
  );
  main.querySelector('[data-act="back"]').addEventListener('click', back);
  const slot = main.querySelector('[data-slot="post"]');

  let data;
  try {
    data = await api.get(`/api/posts/${id}`);
  } catch (err) {
    if (!slot.isConnected) return;
    slot.replaceChildren(el(html`<div class="empty"><h3>Ya no está.</h3><p>${err.message}</p><a class="btn" href="#/">Ir al inicio</a></div>`));
    return;
  }
  if (!slot.isConnected) return;
  const { post, comments } = data;
  const card = postCard(post, { detail: true, onDeleted: () => (location.hash = '#/') });
  const list = el('<div class="comments"></div>');
  const box = el(html`<div class="reply">
    <form>
      <input class="input" name="body" placeholder="Escribe un comentario…" maxlength="1000" autocomplete="off" />
      <button type="submit">Enviar</button>
    </form>
  </div>`);

  const renderComment = (c) => {
    const node = el(html`<div class="comment">
      <div class="body">
        <div class="who"><a href="#/u/${c.author.username}">${c.author.username}</a><span>${timeAgo(c.createdAt)}</span></div>
        <span class="text">${c.body}</span>
      </div>
      ${c.canDelete ? html`<button aria-label="Borrar comentario">Borrar</button>` : ''}
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
    card.querySelector('[data-comments]').textContent = commentsLabel(post.commentCount);
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
