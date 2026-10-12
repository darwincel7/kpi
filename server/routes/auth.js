import { Router } from 'express';
import {
  HttpError,
  createSession,
  destroySession,
  hashPassword,
  rateLimit,
  requireUser,
  verifyPassword,
} from '../auth.js';

const USERNAME_RE = /^[a-z0-9._]{3,20}$/;
const USERNAME_ERROR = 'El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.';
const cleanUsername = (value) => String(value ?? '').trim().toLowerCase().replace(/^@/, '');
// Hash de relleno para que el tiempo de respuesta no revele si existe el usuario.
const DUMMY_HASH = await hashPassword('dummy-password');

export function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, color: u.color, createdAt: u.created_at };
}

export const isOwner = (settings, user) => String(user.id) === settings.get('owner_id');

export function authRoutes({ db, settings, push }) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: 20 });
  const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

  router.get('/state', (req, res) => {
    const setupNeeded = userCount() === 0;
    res.json({
      setupNeeded,
      registrationOpen: setupNeeded || settings.getBool('registration_open'),
      user: req.user ? { ...publicUser(req.user), isOwner: isOwner(settings, req.user) } : null,
      settings: req.user
        ? {
            uploadsAdminOnly: settings.getBool('uploads_admin_only'),
            watermark: settings.getBool('watermark'),
            holdToView: settings.getBool('hold_to_view'),
          }
        : null,
      vapidPublicKey: req.user ? push.publicKey : null,
    });
  });

  router.post('/register', limiter, async (req, res) => {
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password ?? '');
    const code = String(req.body?.inviteCode ?? '').trim().toUpperCase();

    if (!USERNAME_RE.test(username)) throw new HttpError(400, USERNAME_ERROR);
    if (password.length < 6 || password.length > 200) {
      throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres.');
    }
    if (req.body?.accept !== true) {
      throw new HttpError(400, 'Debes confirmar que eres mayor de edad y aceptar las reglas.');
    }

    const hash = await hashPassword(password);
    const color = Math.floor(Math.random() * 8);
    // Todo dentro de una transacción para que dos registros simultáneos no
    // puedan convertirse ambos en el primer administrador.
    const user = db.transaction(() => {
      const first = userCount() === 0;
      if (!first) {
        if (!settings.getBool('registration_open')) throw new HttpError(403, 'El registro está cerrado.');
        if (code !== settings.get('invite_code')) throw new HttpError(403, 'El código de invitación no es válido.');
      }
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
        throw new HttpError(409, 'Ese nombre de usuario ya está en uso.');
      }
      const info = db
        .prepare('INSERT INTO users (username, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(username, hash, first ? 'admin' : 'member', color, Date.now());
      if (first) settings.set('owner_id', info.lastInsertRowid);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }).immediate();

    createSession(db, res, req, user.id);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/login', limiter, async (req, res) => {
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password ?? '');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Usuario o contraseña incorrectos.');
    if (user.status !== 'active') throw new HttpError(403, 'Tu cuenta está bloqueada. Habla con un administrador.');
    createSession(db, res, req, user.id);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    destroySession(db, req, res);
    res.json({ ok: true });
  });

  // Cambiar el nombre de usuario. Todo lo publicado está ligado a la cuenta,
  // no al nombre, así que se actualiza solo en toda la app.
  router.post('/username', requireUser, limiter, (req, res) => {
    const username = cleanUsername(req.body?.username);
    if (!USERNAME_RE.test(username)) throw new HttpError(400, USERNAME_ERROR);
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
    if (taken) throw new HttpError(409, 'Ese nombre de usuario ya está en uso.');
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: { ...publicUser(user), isOwner: isOwner(settings, user) } });
  });

  router.post('/password', requireUser, limiter, async (req, res) => {
    const current = String(req.body?.current ?? '');
    const next = String(req.body?.next ?? '');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!(await verifyPassword(current, row.password_hash))) throw new HttpError(400, 'La contraseña actual no es correcta.');
    if (next.length < 6 || next.length > 200) throw new HttpError(400, 'La nueva contraseña debe tener al menos 6 caracteres.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user.id);
    res.json({ ok: true });
  });

  return router;
}
