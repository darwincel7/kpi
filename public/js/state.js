export const state = {
  me: null,
  settings: {},
  vapidKey: null,
  setupNeeded: false,
  registrationOpen: false,
  unread: 0,
  latestPostId: 0,
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
