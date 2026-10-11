import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

let server;
let instance;
let base;
let dataDir;

function client() {
  let cookie = '';
  async function call(method, url, { json, body, headers = {} } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: {
        'X-Requested-With': 'minopor',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  }
  return {
    call,
    async json(method, url, opts) {
      const res = await call(method, url, opts);
      return { status: res.status, data: await res.json().catch(() => null), res };
    },
  };
}

async function upload(c, buffer, name = 'foto.jpg') {
  const init = await c.json('POST', '/api/uploads', { json: { name, size: buffer.length } });
  assert.equal(init.status, 201, JSON.stringify(init.data));
  let offset = 0;
  while (offset < buffer.length) {
    const chunk = buffer.subarray(offset, offset + init.data.chunkSize);
    const r = await c.json('PUT', `/api/uploads/${init.data.id}?offset=${offset}`, {
      body: chunk,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    offset = r.data.received;
  }
  return init.data.id;
}

const admin = client();
const member = client();
let jpeg;
let inviteCode;
let postId;
let mediaItem;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minopor-test-'));
  instance = createApp(loadConfig({ dataDir, maxUploadMb: 50 }));
  server = instance.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  jpeg = await sharp({ create: { width: 3200, height: 2000, channels: 3, background: '#c0306a' } })
    .jpeg({ quality: 95 })
    .toBuffer();
});

after(() => {
  server?.close();
  instance?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('cuentas', () => {
  test('el primer usuario se convierte en administrador sin código', async () => {
    const s = await admin.json('GET', '/api/auth/state');
    assert.equal(s.data.setupNeeded, true);
    const r = await admin.json('POST', '/api/auth/register', { json: { username: 'Darwin', password: 'secreto1', accept: true } });
    assert.equal(r.status, 201);
    assert.equal(r.data.user.username, 'darwin');
    assert.equal(r.data.user.role, 'admin');
  });

  test('sin la cabecera anti-CSRF se rechaza', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'darwin', password: 'secreto1' }),
    });
    assert.equal(res.status, 403);
  });

  test('los demás necesitan el código de invitación', async () => {
    const overview = await admin.json('GET', '/api/admin');
    inviteCode = overview.data.settings.inviteCode;
    assert.match(inviteCode, /^[A-Z0-9]{8}$/);

    const bad = await member.json('POST', '/api/auth/register', {
      json: { username: 'luna', password: 'secreto2', inviteCode: 'NOPE', accept: true },
    });
    assert.equal(bad.status, 403);

    const noAccept = await member.json('POST', '/api/auth/register', {
      json: { username: 'luna', password: 'secreto2', inviteCode },
    });
    assert.equal(noAccept.status, 400);

    const ok = await member.json('POST', '/api/auth/register', {
      json: { username: 'luna', password: 'secreto2', inviteCode: inviteCode.toLowerCase(), accept: true },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.user.role, 'member');

    const dup = await client().json('POST', '/api/auth/register', {
      json: { username: 'LUNA', password: 'secreto3', inviteCode, accept: true },
    });
    assert.equal(dup.status, 409);
  });

  test('login con contraseña incorrecta falla', async () => {
    const r = await client().json('POST', '/api/auth/login', { json: { username: 'luna', password: 'mala' } });
    assert.equal(r.status, 401);
  });

  test('sin sesión no se ve nada', async () => {
    const r = await client().json('GET', '/api/posts');
    assert.equal(r.status, 401);
  });
});

describe('subidas y publicaciones', () => {
  test('rechaza archivos que no son fotos ni videos', async () => {
    const fake = Buffer.from('<html><script>alert(1)</script></html>');
    const init = await admin.json('POST', '/api/uploads', { json: { name: 'x.jpg', size: fake.length } });
    const r = await admin.json('PUT', `/api/uploads/${init.data.id}?offset=0`, {
      body: fake,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    assert.equal(r.status, 415);
  });

  test('un desfase en la parte devuelve lo recibido para reanudar', async () => {
    const init = await admin.json('POST', '/api/uploads', { json: { name: 'a.jpg', size: jpeg.length } });
    const r = await admin.json('PUT', `/api/uploads/${init.data.id}?offset=100`, {
      body: jpeg.subarray(100, 200),
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.data.received, 0);
  });

  test('rechaza archivos más grandes que el máximo', async () => {
    const r = await admin.json('POST', '/api/uploads', { json: { name: 'big.mp4', size: 51 * 1024 * 1024 } });
    assert.equal(r.status, 413);
  });

  test('publica una foto, genera versiones y avisa a los demás', async () => {
    const id = await upload(admin, jpeg);
    const r = await admin.json('POST', '/api/posts', { json: { caption: 'Hola <b>mundo</b>', uploadIds: [id] } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    postId = r.data.post.id;
    mediaItem = r.data.post.media[0];
    assert.equal(mediaItem.kind, 'image');
    assert.equal(mediaItem.width, 2560);
    assert.equal(mediaItem.height, 1600);
    assert.ok(mediaItem.thumb);
    assert.ok(mediaItem.download, 'el admin recibe enlace de descarga');

    const again = await admin.json('POST', '/api/posts', { json: { uploadIds: [id] } });
    assert.equal(again.status, 400, 'una subida no se puede usar dos veces');

    const unread = await member.json('GET', '/api/notifications/unread');
    assert.equal(unread.data.count, 1);
    const list = await member.json('GET', '/api/notifications');
    assert.equal(list.data.notifications[0].type, 'post');
    assert.equal(list.data.notifications[0].photos, 1);
  });

  test('los miembros ven el contenido pero no reciben enlace de descarga', async () => {
    const feed = await member.json('GET', '/api/posts');
    assert.equal(feed.data.posts.length, 1);
    assert.equal(feed.data.posts[0].caption, 'Hola <b>mundo</b>');
    assert.equal(feed.data.posts[0].media[0].download, null);
    assert.equal(feed.data.posts[0].canDelete, false);
  });
});

describe('protección contra descargas', () => {
  test('un miembro puede ver la imagen incrustada', async () => {
    const res = await member.call('GET', mediaItem.src, { headers: { 'Sec-Fetch-Dest': 'image' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/webp');
    assert.match(res.headers.get('content-disposition'), /^inline/);
  });

  test('abrir el archivo directamente en una pestaña se bloquea para miembros', async () => {
    const res = await member.call('GET', mediaItem.src, { headers: { 'Sec-Fetch-Dest': 'document' } });
    assert.equal(res.status, 403);
    const viaFetch = await member.call('GET', mediaItem.src, { headers: { 'Sec-Fetch-Dest': 'empty' } });
    assert.equal(viaFetch.status, 403);
  });

  test('un miembro no puede descargar el original', async () => {
    const res = await member.call('GET', `/media/${mediaItem.id}/download`);
    assert.equal(res.status, 403);
  });

  test('un administrador descarga el original intacto', async () => {
    const res = await admin.call('GET', mediaItem.download, { headers: { 'Sec-Fetch-Dest': 'document' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="foto\.jpg"/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.equals(jpeg), 'el archivo descargado es idéntico al subido');
  });

  test('sin sesión no se entrega ningún archivo', async () => {
    const res = await client().call('GET', mediaItem.src, { headers: { 'Sec-Fetch-Dest': 'image' } });
    assert.equal(res.status, 401);
  });
});

describe('interacción', () => {
  test('me gusta y comentarios', async () => {
    const like = await member.json('POST', `/api/posts/${postId}/like`, { json: { liked: true } });
    assert.deepEqual(like.data, { liked: true, likeCount: 1 });
    const c = await member.json('POST', `/api/posts/${postId}/comments`, { json: { body: '🔥' } });
    assert.equal(c.status, 201);
    const detail = await admin.json('GET', `/api/posts/${postId}`);
    assert.equal(detail.data.comments.length, 1);
    assert.equal(detail.data.post.likeCount, 1);
    const n = await admin.json('GET', '/api/notifications');
    assert.equal(n.data.notifications[0].type, 'comment');
  });
});

describe('administración', () => {
  test('modo "solo administradores publican"', async () => {
    await admin.json('PATCH', '/api/admin/settings', { json: { uploadsAdminOnly: true } });
    const r = await member.json('POST', '/api/uploads', { json: { name: 'a.jpg', size: 10 } });
    assert.equal(r.status, 403);
    const nonAdmin = await member.json('PATCH', '/api/admin/settings', { json: { uploadsAdminOnly: false } });
    assert.equal(nonAdmin.status, 403);
    await admin.json('PATCH', '/api/admin/settings', { json: { uploadsAdminOnly: false } });
  });

  test('cerrar el registro y cambiar el enlace de invitación', async () => {
    const regen = await admin.json('POST', '/api/admin/invite');
    assert.notEqual(regen.data.settings.inviteCode, inviteCode);
    const old = await client().json('POST', '/api/auth/register', {
      json: { username: 'sol', password: 'secreto4', inviteCode, accept: true },
    });
    assert.equal(old.status, 403);
    await admin.json('PATCH', '/api/admin/settings', { json: { registrationOpen: false } });
    const closed = await client().json('POST', '/api/auth/register', {
      json: { username: 'sol', password: 'secreto4', inviteCode: regen.data.settings.inviteCode, accept: true },
    });
    assert.equal(closed.status, 403);
  });

  test('bloquear a un usuario cierra su sesión', async () => {
    const overview = await admin.json('GET', '/api/admin');
    const luna = overview.data.users.find((u) => u.username === 'luna');
    await admin.json('PATCH', `/api/admin/users/${luna.id}`, { json: { status: 'blocked' } });
    const r = await member.json('GET', '/api/posts');
    assert.equal(r.status, 401);
    const login = await member.json('POST', '/api/auth/login', { json: { username: 'luna', password: 'secreto2' } });
    assert.equal(login.status, 403);
  });

  test('borrar una publicación elimina sus archivos', async () => {
    const dir = path.join(dataDir, 'media', mediaItem.id);
    assert.ok(fs.existsSync(dir));
    const r = await admin.json('DELETE', `/api/posts/${postId}`);
    assert.equal(r.status, 200);
    assert.ok(!fs.existsSync(dir));
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('videos', { skip: !hasFfmpeg && 'ffmpeg no está instalado' }, () => {
  test('sube un video en varias partes y genera portada', async () => {
    const file = path.join(dataDir, 'clip.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=3', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', file]);
    const video = fs.readFileSync(file);
    const id = await upload(admin, video, 'clip.mp4');
    const r = await admin.json('POST', '/api/posts', { json: { uploadIds: [id] } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const m = r.data.post.media[0];
    assert.equal(m.kind, 'video');
    assert.equal(m.width, 720);
    assert.equal(m.height, 1280);
    assert.ok(m.duration > 2.5);
    assert.ok(m.poster && m.thumb);

    const ranged = await admin.call('GET', m.src, { headers: { Range: 'bytes=0-99', 'Sec-Fetch-Dest': 'video' } });
    assert.equal(ranged.status, 206, 'admite saltar a cualquier punto del video');
    assert.equal(ranged.headers.get('content-type'), 'video/mp4');
  });
});
