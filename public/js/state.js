export const state = {
  me: null,
  settings: {},
  vapidKey: null,
  setupNeeded: false,
  registrationOpen: false,
  unread: 0,
  latestPostId: 0,
  // Publicaciones de otros que llegaron después de la última que viste en el inicio.
  newPosts: 0,
};

export const isAdmin = () => state.me?.role === 'admin';
export const canUpload = () => isAdmin() || !state.settings?.uploadsAdminOnly;

// Pequeño bus de eventos entre vistas (nueva publicación, avisos, etc.).
const bus = new EventTarget();
export const on = (type, fn) => {
  const handler = (e) => fn(e.detail);
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
};
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export function storageGet(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado */
  }
}

// La publicación más nueva que ya se vio en el inicio, guardada por persona
// en este teléfono para avisar de lo nuevo aunque se cierre la app. Es null
// si todavía no se ha abierto el inicio.
export function feedTop() {
  const v = storageGet(`feedTop:${state.me?.id}`, null);
  return v === null ? null : Number(v) || 0;
}

export function setFeedTop(id) {
  const seen = feedTop();
  if (!state.me || (seen !== null && id <= seen)) return;
  storageSet(`feedTop:${state.me.id}`, String(id));
  if (state.newPosts) {
    state.newPosts = 0;
    emit('unread');
  }
}
