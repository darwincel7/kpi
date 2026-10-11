import { canUpload } from '../state.js';
import { el, formatBytes, html, icon, toast } from '../ui.js';
import { isBusy, startUpload } from '../uploader.js';

const MAX_FILES = 20;

export function uploadView(main) {
  const top = html`<header class="topbar">
    <a class="icon-btn back" href="#/" aria-label="Cerrar">${icon('x')}</a>
    <h1>Nueva publicación</h1>
  </header>`;

  if (!canUpload()) {
    main.replaceChildren(
      el(html`<div>${top}<div class="empty"><div class="big-ico">${icon('lock')}</div><h3>Solo administradores</h3>
        <p>Por ahora solo los administradores pueden publicar.</p></div></div>`),
    );
    return;
  }
  if (isBusy()) {
    main.replaceChildren(
      el(html`<div>${top}<div class="empty"><div class="big-ico">${icon('upload')}</div><h3>Ya hay una subida en curso</h3>
        <p>Espera a que termine para publicar otra cosa.</p><a class="btn" href="#/">Ver inicio</a></div></div>`),
    );
    return;
  }

  let files = [];
  const urls = new Map();
  main.replaceChildren(
    el(html`<div>
      ${top}
      <div class="composer">
        <input type="file" accept="image/*,video/*" multiple hidden />
        <button class="picker" data-act="pick">
          <span class="big">${icon('plus')}</span>
          <strong>Elegir fotos y videos</strong>
          <span>Se suben en su calidad original</span>
        </button>
        <div class="previews" hidden></div>
        <label class="field"><span>Descripción</span>
          <textarea class="input" name="caption" maxlength="2000" placeholder="Escribe algo… (opcional)"></textarea>
        </label>
        <div class="hint">${icon('bell', 'sm')}<span>Cuando publiques, todos recibirán una notificación.</span></div>
        <div class="hint">${icon('lock', 'sm')}<span>Los demás podrán verlo pero no descargarlo. Solo los administradores pueden descargar los originales.</span></div>
        <button class="btn primary block" data-act="publish" disabled>Publicar</button>
      </div>
    </div>`),
  );

  const input = main.querySelector('input[type="file"]');
  const picker = main.querySelector('.picker');
  const previews = main.querySelector('.previews');
  const publish = main.querySelector('[data-act="publish"]');

  function addFiles(list) {
    const accepted = [...list].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/') || /\.(heic|heif|mov|mp4|m4v|webm)$/i.test(f.name));
    if (accepted.length < list.length) toast('Algunos archivos no son fotos ni videos', { error: true });
    files = [...files, ...accepted].slice(0, MAX_FILES);
    if (files.length === MAX_FILES) toast(`Máximo ${MAX_FILES} archivos por publicación`);
    render();
  }

  function render() {
    picker.hidden = files.length > 0;
    previews.hidden = files.length === 0;
    publish.disabled = files.length === 0;
    publish.textContent = files.length > 1 ? `Publicar ${files.length} archivos` : 'Publicar';
    previews.replaceChildren(
      ...files.map((f, i) => {
        if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
        const isVideo = f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name);
        const node = el(html`<div class="tile">
          ${isVideo ? html`<video src="${urls.get(f)}#t=0.1" muted playsinline preload="metadata"></video><span class="kind">${icon('play', 'sm')}</span>` : html`<img src="${urls.get(f)}" alt="" />`}
          <span class="pill size">${formatBytes(f.size)}</span>
          <button class="remove" aria-label="Quitar">${icon('x', 'xs')}</button>
        </div>`);
        node.querySelector('.remove').addEventListener('click', () => {
          URL.revokeObjectURL(urls.get(f));
          urls.delete(f);
          files.splice(i, 1);
          render();
        });
        return node;
      }),
      ...(files.length < MAX_FILES ? [el(html`<button class="add" aria-label="Agregar más">${icon('plus')}</button>`)] : []),
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
