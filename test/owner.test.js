import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

let server;
let instance;
let base;
let dataDir;

function client() {
  let cookie = '';
  return async (method, url, json) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        'X-Requested-With': 'minopor',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minopor-owner-'));
  instance = createApp(loadConfig({ dataDir }));
  server = instance.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  instance?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('solo el dueño nombra administradores y nadie puede tocar su cuenta', async () => {
  const owner = client();
  const ana = client();
  const beto = client();

  const reg = await owner('POST', '/api/auth/register', { username: 'darwin', password: 'secreto1', accept: true });
  const ownerId = reg.data.user.id;
  const { data: overview } = await owner('GET', '/api/admin');
  const inviteCode = overview.settings.inviteCode;
  assert.equal(overview.settings.holdToView, true, 'la protección "mantener para ver" viene activada');

  const a = await ana('POST', '/api/auth/register', { username: 'ana', password: 'secreto2', inviteCode, accept: true });
  const b = await beto('POST', '/api/auth/register', { username: 'beto', password: 'secreto3', inviteCode, accept: true });
  assert.equal(a.data.user.role, 'member', 'los demás entran como miembros');

  const state = await owner('GET', '/api/auth/state');
  assert.equal(state.data.user.isOwner, true);
  assert.equal((await ana('GET', '/api/auth/state')).data.user.isOwner, false);

  assert.equal((await owner('PATCH', `/api/admin/users/${a.data.user.id}`, { role: 'admin' })).status, 200);

  // Ana ya es admin, pero no es la dueña.
  assert.equal((await ana('PATCH', `/api/admin/users/${b.data.user.id}`, { role: 'admin' })).status, 403);
  assert.equal((await ana('PATCH', `/api/admin/users/${ownerId}`, { status: 'blocked' })).status, 403);
  assert.equal((await ana('DELETE', `/api/admin/users/${ownerId}`)).status, 403);
  assert.equal((await ana('PATCH', `/api/admin/users/${ownerId}`, { role: 'member' })).status, 403);

  // Sí puede gestionar a un miembro normal.
  assert.equal((await ana('PATCH', `/api/admin/users/${b.data.user.id}`, { status: 'blocked' })).status, 200);

  // El dueño le quita el rol de administradora.
  assert.equal((await owner('PATCH', `/api/admin/users/${a.data.user.id}`, { role: 'member' })).status, 200);
  assert.equal((await ana('GET', '/api/admin')).status, 403);
});

test('cada quien puede cambiar su nombre de usuario', async () => {
  const owner = client();
  assert.equal((await owner('POST', '/api/auth/login', { username: 'darwin', password: 'secreto1' })).status, 200);

  assert.equal((await owner('POST', '/api/auth/username', { username: 'a!' })).status, 400, 'nombre no válido');
  assert.equal((await owner('POST', '/api/auth/username', { username: 'ANA' })).status, 409, 'nombre ocupado');

  const r = await owner('POST', '/api/auth/username', { username: '@Darwin.Mejia' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.username, 'darwin.mejia');
  assert.equal(r.data.user.isOwner, true, 'sigue siendo el dueño');
  assert.equal((await owner('GET', '/api/users/darwin.mejia')).status, 200);
  assert.equal((await owner('GET', '/api/users/darwin')).status, 404);

  assert.equal((await client()('POST', '/api/auth/login', { username: 'darwin.mejia', password: 'secreto1' })).status, 200);
  assert.equal((await client()('POST', '/api/auth/login', { username: 'darwin', password: 'secreto1' })).status, 401);
});
