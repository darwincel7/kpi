// Utilidades de interfaz: plantillas seguras, iconos, mensajes y hojas de acciones.

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

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  comment: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z"/>',
  layers: '<rect x="7" y="7" width="14" height="14" rx="2"/><path d="M3 17V5a2 2 0 0 1 2-2h12"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};

export function icon(name, cls = '') {
  const extra = name === 'play' ? ' play' : '';
  return raw(`<svg class="i ${cls}${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

export function avatar(user, size) {
  const style = size ? ` style="--size:${Number(size)}px"` : '';
  return html`<span class="avatar av-${Number(user?.color) % 8 || 0}"${raw(style)}>${(user?.username || '?')[0]}</span>`;
}

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
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

export function formatDuration(sec) {
  if (!sec && sec !== 0) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function toast(message, { error = false, ms = 2600 } = {}) {
  const t = el(html`<div class="toast${error ? ' error' : ''}">${message}</div>`);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// Hoja de acciones desde abajo. Devuelve el valor de la opción elegida o null.
export function sheet({ title, message, options }) {
  return new Promise((resolve) => {
    const node = el(html`
      <div class="sheet-backdrop">
        <div class="sheet" role="dialog">
          <div class="group">
            ${title || message ? html`<div class="title">${title ? html`<b>${title}</b>` : ''}${message || ''}</div>` : ''}
            ${options.map(
              (o, i) =>
                html`<button data-i="${i}" class="${o.danger ? 'danger' : ''}${(title || message) && i === 0 ? ' after-title' : ''}">
                  ${o.icon ? icon(o.icon, 'sm') : ''}${o.label}
                </button>`,
            )}
          </div>
          <div class="group"><button class="cancel" data-cancel>Cancelar</button></div>
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

// Marca de agua con el nombre de quien está viendo, para desanimar capturas.
const wmCache = new Map();
export function watermarkStyle(username) {
  if (!wmCache.has(username)) {
    const text = esc(`@${username} · mi nopor`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="160"><text x="10" y="90" transform="rotate(-24 130 80)" fill="rgba(255,255,255,0.2)" font-family="system-ui,sans-serif" font-size="15" font-weight="600">${text}</text></svg>`;
    const uri = encodeURIComponent(svg).replace(/'/g, '%27');
    wmCache.set(username, `background-image:url('data:image/svg+xml,${uri}')`);
  }
  return wmCache.get(username);
}

export function preventSaving(root) {
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.protect')) e.preventDefault();
  });
  root.addEventListener('dragstart', (e) => {
    if (e.target.closest('.protect')) e.preventDefault();
  });
}
