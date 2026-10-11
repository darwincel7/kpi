import { Router } from 'express';
import { HttpError, requireUser } from '../auth.js';
import { publicUser } from './auth.js';

// Solo se aceptan los servicios de notificaciones de los navegadores, para que
// el servidor no envíe peticiones a direcciones arbitrarias.
const PUSH_SERVICE_RE = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)\//i;

export function notificationRoutes({ db }) {
  const router = Router();
  router.use(requireUser);

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT n.id, n.type, n.post_id, n.created_at, n.read_at, u.username, u.color,
           (SELECT COUNT(*) FROM media m WHERE m.post_id = n.post_id AND kind = 'image') AS photos,
           (SELECT COUNT(*) FROM media m WHERE m.post_id = n.post_id AND kind = 'video') AS videos,
           (SELECT id FROM media m WHERE m.post_id = n.post_id AND has_thumb = 1 ORDER BY position LIMIT 1) AS thumb_id
         FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 60`,
      )
      .all(req.user.id);
    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        postId: n.post_id,
        createdAt: n.created_at,
        read: !!n.read_at,
        actor: n.username ? { username: n.username, color: n.color } : null,
        photos: n.photos,
        videos: n.videos,
        thumb: n.thumb_id ? `/media/${n.thumb_id}/thumb` : null,
      })),
    });
  });

  router.get('/unread', (req, res) => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id);
    const latest = db.prepare('SELECT MAX(id) AS id FROM posts').get().id || 0;
    res.json({ count: n, latestPostId: latest });
  });

  router.post('/read', (req, res) => {
    db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(Date.now(), req.user.id);
    res.json({ ok: true });
  });

  return router;
}

export function pushRoutes({ push }) {
  const router = Router();
  router.use(requireUser);

  router.post('/subscribe', (req, res) => {
    const sub = req.body;
    const valid =
      sub &&
      typeof sub.endpoint === 'string' &&
      PUSH_SERVICE_RE.test(sub.endpoint) &&
      typeof sub.keys?.p256dh === 'string' &&
      typeof sub.keys?.auth === 'string';
    if (!valid) throw new HttpError(400, 'Suscripción no válida');
    push.save(req.user.id, sub);
    res.json({ ok: true });
  });

  router.post('/unsubscribe', (req, res) => {
    if (typeof req.body?.endpoint === 'string') push.remove(req.body.endpoint);
    res.json({ ok: true });
  });

  return router;
}

export function userRoutes({ db }) {
  const router = Router();
  router.get('/:username', requireUser, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
    if (!user) throw new HttpError(404, 'Usuario no encontrado');
    const stats = db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS posts,
           COALESCE(SUM(m.kind = 'image'), 0) AS photos,
           COALESCE(SUM(m.kind = 'video'), 0) AS videos
         FROM posts p LEFT JOIN media m ON m.post_id = p.id WHERE p.user_id = ?`,
      )
      .get(user.id);
    res.json({ user: publicUser(user), stats });
  });
  return router;
}
