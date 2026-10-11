// Subidas en segundo plano: se puede seguir navegando mientras sube. Cada
// archivo se envía en partes y se reintenta solo si se corta la conexión.
import { api, ApiError } from './api.js';
import { emit } from './state.js';
import { el, formatBytes, html, icon, toast } from './ui.js';

let job = null;
let wakeLock = null;

export const isBusy = () => job && (job.status === 'uploading' || job.status === 'publishing');

window.addEventListener('beforeunload', (e) => {
  if (isBusy()) e.preventDefault();
});

export function startUpload(files, caption) {
  job = {
    items: files.map((file) => ({ file, uploadId: null, received: 0, chunkSize: 0 })),
    caption,
    status: 'uploading',
    loaded: 0,
    total: files.reduce((n, f) => n + f.size, 0),
    index: 0,
    error: null,
  };
  run();
}

function sendChunk(item, blob, offset) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/uploads/${item.uploadId}?offset=${offset}`);
    xhr.setRequestHeader('X-Requested-With', 'minopor');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      item.inflight = e.loaded;
      render();
    };
    xhr.onload = () => {
      item.inflight = 0;
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* sin cuerpo */
      }
      if (xhr.status === 200 || xhr.status === 409) resolve(data);
      else reject(new ApiError(xhr.status, data.error || 'Error al subir'));
    };
    xhr.onerror = xhr.ontimeout = () => {
      item.inflight = 0;
      reject(new ApiError(0, 'Se cortó la conexión'));
    };
    xhr.send(blob);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadItem(item) {
  if (!item.uploadId) {
    const r = await api.post('/api/uploads', { name: item.file.name, size: item.file.size, type: item.file.type });
    item.uploadId = r.id;
    item.chunkSize = r.chunkSize;
    item.received = r.received;
  }
  let attempt = 0;
  while (item.received < item.file.size) {
    const end = Math.min(item.received + item.chunkSize, item.file.size);
    try {
      const res = await sendChunk(item, item.file.slice(item.received, end), item.received);
      item.received = res.received;
      attempt = 0;
    } catch (err) {
      if (err.status === 404) {
        // La subida caducó en el servidor: empezar este archivo de nuevo.
        item.uploadId = null;
        item.received = 0;
        return uploadItem(item);
      }
      const retryable = err.status === 0 || err.status >= 500 || err.status === 429;
      if (!retryable || attempt >= 6) throw err;
      attempt++;
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    }
    render();
  }
}

async function run() {
  job.status = 'uploading';
  job.error = null;
  render();
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    /* no disponible */
  }
  try {
    for (const [i, item] of job.items.entries()) {
      job.index = i;
      await uploadItem(item);
    }
    job.status = 'publishing';
    render();
    const { post } = await api.post('/api/posts', { caption: job.caption, uploadIds: job.items.map((i) => i.uploadId) });
    job = null;
    render();
    toast('¡Publicado! Ya les avisamos a todos.');
    emit('posted', post);
  } catch (err) {
    if (!job) return;
    job.status = 'error';
    job.error = err.message;
    if (err.status === 400) job.items.forEach((item) => Object.assign(item, { uploadId: null, received: 0 }));
    render();
  } finally {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }
}

async function cancel() {
  if (!job) return;
  const ids = job.items.map((i) => i.uploadId).filter(Boolean);
  job = null;
  render();
  await Promise.all(ids.map((id) => api.del(`/api/uploads/${id}`).catch(() => {})));
}

let frame = 0;
function render() {
  if (!frame) frame = requestAnimationFrame(draw);
}

function draw() {
  frame = 0;
  const bar = document.getElementById('upload-bar');
  if (!job) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  bar.hidden = false;
  const loaded = job.items.reduce((n, i) => n + i.received + (i.inflight || 0), 0);
  const pct = job.total ? Math.min(100, Math.floor((loaded / job.total) * 100)) : 0;
  const n = job.items.length;
  let title;
  let sub;
  let action = html`<button class="icon-btn" data-act="cancel" aria-label="Cancelar">${icon('x', 'sm')}</button>`;
  if (job.status === 'uploading') {
    title = n > 1 ? `Subiendo ${job.index + 1} de ${n} · ${pct}%` : `Subiendo · ${pct}%`;
    sub = `${formatBytes(loaded)} de ${formatBytes(job.total)} · no cierres la app`;
  } else if (job.status === 'publishing') {
    title = 'Procesando…';
    sub = 'Preparando tu publicación';
    action = html`<div class="spinner inline"></div>`;
  } else {
    title = 'No se pudo subir';
    sub = job.error;
    action = html`<button class="btn small primary" data-act="retry">${icon('refresh', 'sm')} Reintentar</button>
      <button class="icon-btn" data-act="cancel" aria-label="Cancelar">${icon('x', 'sm')}</button>`;
  }
  bar.replaceChildren(
    el(html`<div>
      <div class="row"><div class="txt">${title}<small>${sub}</small></div>${action}</div>
      <div class="bar"><i style="width:${job.status === 'publishing' ? 100 : pct}%"></i></div>
    </div>`),
  );
  bar.querySelector('[data-act="cancel"]')?.addEventListener('click', cancel);
  bar.querySelector('[data-act="retry"]')?.addEventListener('click', run);
}
