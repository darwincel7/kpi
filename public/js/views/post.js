import { api } from '../api.js';
import { el, html } from '../ui.js';
import { postCard } from './post-card.js';

function back() {
  if (history.length > 1) history.back();
  else location.hash = '#/';
}

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
  // Aquí se muestran todos los comentarios, con el mismo diseño que en el inicio.
  slot.replaceChildren(postCard(data.post, { detail: true, comments: data.comments, onDeleted: () => (location.hash = '#/') }));
}
