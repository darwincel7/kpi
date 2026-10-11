import { api } from './api.js';
import { state } from './state.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

// 'on' | 'off' | 'denied' | 'needs-install' | 'unsupported'
export async function pushStatus() {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await (await registration()).pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

async function subscribe() {
  const reg = await registration();
  const key = keyToBytes(state.vapidKey);
  let sub = await reg.pushManager.getSubscription();
  const current = sub?.options?.applicationServerKey;
  if (sub && current && !new Uint8Array(current).every((b, i) => b === key[i])) {
    // El servidor cambió de claves: hay que suscribirse de nuevo.
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.post('/api/push/subscribe', sub.toJSON());
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('No diste permiso para las notificaciones.');
  await subscribe();
}

export async function disablePush() {
  if (!pushSupported()) return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

// Al entrar, vuelve a asociar este dispositivo a la cuenta actual.
export async function syncPush() {
  try {
    if (pushSupported() && Notification.permission === 'granted' && state.vapidKey) await subscribe();
  } catch {
    /* sin push en este dispositivo */
  }
}
