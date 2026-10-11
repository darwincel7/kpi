import fsp from 'node:fs/promises';
import { Router } from 'express';
import { HttpError, inviteCode, requireAdmin } from '../auth.js';
import { isOwner, publicUser } from './auth.js';

const BOOL_SETTINGS = {
  registrationOpen: 'registration_open',
  uploadsAdminOnly: 'uploads_admin_only',
  watermark: 'watermark',
  holdToView: 'hold_to_view',
};

export function adminRoutes({ db, settings, media }) {
  const router = Router();
  router.use(requireAdmin);

  const currentSettings = () => ({
    inviteCode: settings.get('invite_code'),
    ...Object.fromEntries(Object.entries(BOOL_SETTINGS).map(([k, key]) => [k, settings.getBool(key)])),
  });

  router.get('/', async (req, res) => {
    const users = db
      .prepare(
        `SELECT u.*, (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS post_count
         FROM users u ORDER BY u.role = 'admin' DESC, u.created_at`,
      )
      .all()
      .map((u) => ({
        ...publicUser(u),
        isOwner: isOwner(settings, u),
        status: u.status,
        lastSeenAt: u.last_seen_at,
        postCount: u.post_count,
      }));
    const storage = db.prepare('SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM media').get();
    const { bavail, bsize } = await fsp.statfs(media.mediaDir);
    res.json({
      settings: currentSettings(),
      users,
      storage: { files: storage.files, bytes: storage.bytes, freeBytes: bavail * bsize },
    });
  });

  router.patch('/settings', (req, res) => {
    for (const [k, key] of Object.entries(BOOL_SETTINGS)) {
      if (typeof req.body?.[k] === 'boolean') settings.set(key, req.body[k] ? '1' : '0');
    }
    res.json({ settings: currentSettings() });
  });

  router.post('/invite', (req, res) => {
    settings.set('invite_code', inviteCode());
    res.json({ settings: currentSettings() });
  });

  const target = (req) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
    if (!user) throw new HttpError(404, 'Usuario no encontrado');
    if (user.id === req.user.id) throw new HttpError(400, 'No puedes cambiar tu propia cuenta desde aquí.');
    if (isOwner(settings, user)) throw new HttpError(403, 'La cuenta del dueño no se puede modificar.');
    // Un administrador que no es el dueño solo puede gestionar a los miembros.
    if (user.role === 'admin' && !isOwner(settings, req.user)) {
      throw new HttpError(403, 'Solo el dueño puede gestionar a otros administradores.');
    }
    return user;
  };

  router.patch('/users/:id', (req, res) => {
    const user = target(req);
    const { role, status } = req.body ?? {};
    if (role !== undefined) {
      if (!isOwner(settings, req.user)) throw new HttpError(403, 'Solo el dueño puede nombrar o quitar administradores.');
      if (role !== 'admin' && role !== 'member') throw new HttpError(400, 'Rol no válido');
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
    }
    if (status !== undefined) {
      if (status !== 'active' && status !== 'blocked') throw new HttpError(400, 'Estado no válido');
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, user.id);
      if (status === 'blocked') {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(user.id);
      }
    }
    res.json({ ok: true });
  });

  // Borra la cuenta y todo lo que haya publicado.
  router.delete('/users/:id', async (req, res) => {
    const user = target(req);
    const ids = db
      .prepare('SELECT m.id FROM media m JOIN posts p ON p.id = m.post_id WHERE p.user_id = ?')
      .all(user.id)
      .map((m) => m.id);
    const uploads = db.prepare('SELECT id FROM uploads WHERE user_id = ?').all(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    await media.remove(ids);
    await Promise.all(uploads.map((u) => fsp.rm(media.tmpPath(u.id), { force: true })));
    res.json({ ok: true });
  });

  return router;
}
