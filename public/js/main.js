import { api } from './api.js';
import { disablePush, syncPush } from './push.js';
import { canUpload, emit, feedTop, isAdmin, on, state } from './state.js';
import { initProtection } from './protect.js';
import { el, html, preventSaving } from './ui.js';
import { isBusy } from './uploader.js';
import { adminView } from './views/admin.js';
import { loginView, registerView } from './views/auth.js';
import { feedView } from './views/feed.js';
import { notificationsView } from './views/notifications.js';
import { postView } from './views/post.js';
import { profileView } from './views/profile.js';
import { settingsView } from './views/settings.js';
import { uploadView } from './views/upload.js';

const routes = [
  { re: /^\/$/, view: feedView, tab: 'home' },
  { re: /^\/p\/(\d+)$/, view: postView },
  { re: /^\/subir$/, view: uploadView, tab: 'create' },
  { re: /^\/avisos$/, view: notificationsView, tab: 'bell' },
  // Tu propio perfil tiene una dirección fija para que siga funcionando
  // aunque cambies de nombre de usuario.
  { re: /^\/yo$/, view: (main, _params, h) => profileView(main, [state.me.username], h), tab: 'me' },
  { re: /^\/u\/([a-z0-9._]+)$/, view: profileView, tab: 'me' },
  { re: /^\/ajustes$/, view: settingsView, tab: 'me' },
  { re: /^\/admin$/, view: adminView, tab: 'me', admin: true },
  { re: /^\/entrar$/, view: loginView, guest: true },
  { re: /^\/registro(?:\/([A-Za-z0-9]+))?$/, view: registerView, guest: true },
];

const main = document.getElementById('view');
const nav = document.getElementById('nav');
let cleanup = null;
let renderId = 0;

async function refreshState() {
  const s = await api.get('/api/auth/state');
  state.me = s.user;
  state.settings = s.settings || {};
  state.vapidKey = s.vapidPublicKey;
  state.setupNeeded = s.setupNeeded;
  state.registrationOpen = s.registrationOpen;
}

const helpers = {
  async onAuthed() {
    await refreshState();
    syncPush();
    pollUnread();
    location.hash = '#/';
  },
  onUserChanged(user) {
    state.me = { ...state.me, ...user };
    renderNav(routes.find((r) => r.re.test(currentPath()))?.tab);
  },
  async onLogout() {
    if (isBusy() && !confirm('Hay una subida en curso. ¿Salir de todos modos?')) return;
    await disablePush().catch(() => {});
    await api.post('/api/auth/logout').catch(() => {});
    state.me = null;
    await refreshState().catch(() => {});
    location.hash = '#/entrar';
  },
};

function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

function renderNav(active) {
  if (!state.me) {
    nav.hidden = true;
    document.body.classList.add('no-nav');
    return;
  }
  nav.hidden = false;
  document.body.classList.remove('no-nav');
  const tab = (name, href, label, extra = '') =>
    html`<a href="${href}" class="${name === active ? 'on' : ''}">${label}${extra}</a>`;
  const unread = state.unread ? html`<sup>${state.unread > 99 ? '99+' : state.unread}</sup>` : '';
  const fresh = state.newPosts && active !== 'home' ? html`<b class="dot" aria-label="Hay publicaciones nuevas"></b>` : '';
  nav.replaceChildren(
    el(html`<div class="tabs">
      ${tab('home', '#/', 'Inicio', fresh)}
      ${canUpload() ? tab('create', '#/subir', 'Subir') : ''}
      ${tab('bell', '#/avisos', 'Avisos', unread)}
      ${tab('me', '#/yo', 'Yo')}
    </div>`),
  );
}

async function render() {
  const path = currentPath();
  const route = routes.find((r) => r.re.test(path));
  if (!route) {
    location.replace('#/');
    return;
  }
  if (!state.me && !route.guest) {
    location.replace(state.setupNeeded ? '#/registro' : '#/entrar');
    return;
  }
  if (state.me && route.guest) {
    location.replace('#/');
    return;
  }
  if (route.admin && !isAdmin()) {
    location.replace('#/');
    return;
  }
  const params = path.match(route.re).slice(1);
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const id = ++renderId;
  renderNav(route.tab);
  window.scrollTo(0, 0);
  const result = await route.view(main, params, helpers);
  // Si mientras cargaba se cambió de pantalla, se descarta esta.
  if (id !== renderId) {
    if (typeof result === 'function') result();
    return;
  }
  cleanup = result;
}

let lastPoll = 0;
async function pollUnread() {
  if (!state.me || document.hidden) return;
  lastPoll = Date.now();
  try {
    const since = feedTop();
    const { count, latestPostId, newPosts } = await api.get(`/api/notifications/unread${since === null ? '' : `?since=${since}`}`);
    // Si el inicio se actualizó mientras tanto, esta cuenta ya no vale.
    const fresh = since !== null && since === feedTop() ? newPosts : state.newPosts;
    const changed = count !== state.unread || latestPostId !== state.latestPostId || fresh !== state.newPosts;
    state.unread = count;
    state.latestPostId = latestPostId;
    state.newPosts = fresh;
    if (changed) emit('unread');
  } catch {
    /* sin conexión: se intentará luego */
  }
}

on('unread', () => {
  const active = routes.find((r) => r.re.test(currentPath()))?.tab;
  renderNav(active);
  document.title = state.unread ? `(${state.unread}) mi nopor` : 'mi nopor';
  if (navigator.setAppBadge) (state.unread ? navigator.setAppBadge(state.unread) : navigator.clearAppBadge()).catch(() => {});
});

// Tocar «Inicio» estando en el inicio sube arriba y actualiza.
nav.addEventListener('click', (e) => {
  if (e.target.closest('a[href="#/"]') && currentPath() === '/') {
    e.preventDefault();
    emit('home-tap');
  }
});

async function boot() {
  preventSaving(document);
  initProtection();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'navigate') location.href = e.data.url;
    });
  }
  try {
    await refreshState();
  } catch (err) {
    main.replaceChildren(el(html`<div class="empty"><h3>Sin conexión.</h3><p>${err.message}</p><button class="btn">Reintentar</button></div>`));
    main.querySelector('button').addEventListener('click', () => location.reload());
    return;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('session-expired', async () => {
    if (!state.me) return;
    state.me = null;
    await refreshState().catch(() => {});
    if (currentPath() === '/entrar') render();
    else location.hash = '#/entrar';
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastPoll > 5000) pollUnread();
  });
  setInterval(pollUnread, 30_000);
  if (state.me) {
    syncPush();
    pollUnread();
  }
  render();
}

boot();
