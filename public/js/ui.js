// Utilidades de interfaz: plantillas seguras, mensajes y hojas de opciones.

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

// Plantilla que escapa todo lo que se interpola, salvo lo marcado con raw().
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += renderValue(values[i]);
  });
  return new Raw(out);
}

export function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = String(markup).trim();
  return t.content.firstElementChild;
}

// Corazón como texto (sin la versión emoji en iPhone).
export const HEART = '♥︎';

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d
    .toLocaleDateString('es', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: '2-digit' }) })
    .replace('.', '');
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export const pad2 = (n) => String(n).padStart(2, '0');

export function toast(message, { error = false, ms = 2600 } = {}) {
  const t = el(html`<div class="toast${error ? ' error' : ''}">${message}</div>`);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// Hoja de opciones desde abajo. Devuelve el valor de la opción elegida o null.
export function sheet({ title, message, options }) {
  return new Promise((resolve) => {
    const node = el(html`
      <div class="sheet-bg">
        <div class="sheet" role="dialog">
          ${title || message ? html`<div class="head">${title ? html`<b>${title}</b>` : ''}${message ? html`<span>${message}</span>` : ''}</div>` : ''}
          ${options.map((o, i) => html`<button data-i="${i}" class="${o.danger ? 'danger' : ''}">${o.label}</button>`)}
          <button class="cancel" data-cancel>Cancelar</button>
        </div>
      </div>
    `);
    const close = (value) => {
      node.remove();
      resolve(value);
    };
    node.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn?.dataset.i !== undefined) return close(options[Number(btn.dataset.i)].value);
      if (btn?.hasAttribute('data-cancel') || e.target === node) close(null);
    });
    document.body.append(node);
  });
}

export async function confirmAction(title, message, label) {
  return (await sheet({ title, message, options: [{ label, value: true, danger: true }] })) === true;
}

// Marca de agua con el usuario, su número y la fecha: si alguien fotografía
// la pantalla, se sabe de qué cuenta salió.
const wmCache = new Map();
export function watermarkStyle(user) {
  const key = `${user.id}:${user.username}`;
  if (!wmCache.has(key)) {
    const d = new Date();
    const stamp = `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
    const text = esc(`@${user.username} · ${String(user.id).padStart(4, '0')} · ${stamp}`);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150">` +
      `<text x="8" y="84" transform="rotate(-18 120 75)" fill="rgba(236,230,220,0.2)" ` +
      `font-family="ui-monospace,Menlo,monospace" font-size="12" letter-spacing="1">${text}</text></svg>`;
    const uri = encodeURIComponent(svg).replace(/'/g, '%27');
    wmCache.set(key, `background-image:url('data:image/svg+xml,${uri}')`);
  }
  return wmCache.get(key);
}

export function preventSaving(root) {
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.protect')) e.preventDefault();
  });
  root.addEventListener('dragstart', (e) => {
    if (e.target.closest('.protect')) e.preventDefault();
  });
}
