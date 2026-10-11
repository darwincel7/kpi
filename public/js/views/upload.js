import { canUpload, isAdmin } from '../state.js';
import { el, formatBytes, html, pad2, toast } from '../ui.js';
import { isBusy, startUpload } from '../uploader.js';

const MAX_FILES = 20;
const VIDEO_EXT = /\.(mov|mp4|m4v|webm)$/i;

export function uploadView(main) {
  const top = html`<header class="bar">
    <h1>Nueva publicación</h1>
    <a class="txt-btn" href="#/">Cerrar</a>
  </header>`;

  if (!canUpload()) {
    main.replaceChildren(
      el(html`<div>${top}<div class="empty"><h3>Por ahora solo publican los administradores.</h3>
        <p>Puedes ver, dar me gusta y comentar.</p></div></div>`),
    );
    return;
  }
  if (isBusy()) {
    main.replaceChildren(
      el(html`<div>${top}<div class="empty"><h3>Ya hay algo subiendo.</h3>
        <p>Espera a que termine para publicar otra cosa.</p><a class="btn" href="#/">Ver inicio</a></div></div>`),
    );
    return;
  }

  let files = [];
  const urls = new Map();
  main.replaceChildren(
    el(html`<div>
      ${top}
      <div class="compose">
        <input type="file" accept="image/*,video/*" multiple hidden />
        <button class="picker" data-act="pick">
          <strong>Elige fotos o videos</strong>
          <span>Calidad original · hasta ${MAX_FILES} por publicación</span>
        </button>
        <div class="previews" hidden></div>
        <label class="field"><span>Texto (opcional)</span>
          <textarea class="input" name="caption" maxlength="2000" placeholder="Escribe algo…"></textarea>
        </label>
        <ul class="notes">
          <li>Todos recibirán un aviso cuando publiques.</li>
          <li>${isAdmin() ? 'Nadie más que los administradores puede descargar el original.' : 'Nadie podrá descargarlo.'}</li>
        </ul>
        <button class="btn solid block" data-act="publish" disabled>Publicar</button>
      </div>
    </div>`),
  );

  const input = main.querySelector('input[type="file"]');
  const picker = main.querySelector('.picker');
  const previews = main.querySelector('.previews');
  const publish = main.querySelector('[data-act="publish"]');
  const isVideo = (f) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name);

  function addFiles(list) {
    const accepted = [...list].filter((f) => f.type.startsWith('image/') || isVideo(f) || /\.(heic|heif)$/i.test(f.name));
    if (accepted.length < list.length) toast('Algunos archivos no son fotos ni videos', { error: true });
    files = [...files, ...accepted].slice(0, MAX_FILES);
    if (files.length === MAX_FILES) toast(`Máximo ${MAX_FILES} archivos por publicación`);
    render();
  }

  function render() {
    picker.hidden = files.length > 0;
    previews.hidden = files.length === 0;
    publish.disabled = files.length === 0;
    publish.textContent = files.length > 1 ? `Publicar ${files.length}` : 'Publicar';
    previews.replaceChildren(
      ...files.map((f, i) => {
        if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
        const node = el(html`<div class="tile">
          ${isVideo(f) ? html`<video src="${urls.get(f)}#t=0.1" muted playsinline preload="metadata"></video>` : html`<img src="${urls.get(f)}" alt="" />`}
          <span class="num">${pad2(i + 1)}${isVideo(f) ? ' · video' : ''}</span>
          <span class="size">${formatBytes(f.size)}</span>
          <button class="remove" aria-label="Quitar">×</button>
        </div>`);
        node.querySelector('.remove').addEventListener('click', () => {
          URL.revokeObjectURL(urls.get(f));
          urls.delete(f);
          files.splice(i, 1);
          render();
        });
        return node;
      }),
      ...(files.length < MAX_FILES ? [el('<button class="add" aria-label="Agregar más">+</button>')] : []),
    );
    previews.querySelector('.add')?.addEventListener('click', () => input.click());
  }

  picker.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';
  });
  for (const type of ['dragenter', 'dragover']) {
    main.addEventListener(type, (e) => {
      e.preventDefault();
      picker.classList.add('drag');
    });
  }
  main.addEventListener('dragleave', () => picker.classList.remove('drag'));
  main.addEventListener('drop', (e) => {
    e.preventDefault();
    picker.classList.remove('drag');
    addFiles(e.dataTransfer.files);
  });

  publish.addEventListener('click', () => {
    if (!files.length) return;
    startUpload(files, main.querySelector('[name="caption"]').value.trim());
    location.hash = '#/';
  });

  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
