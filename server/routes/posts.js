import fsp from 'node:fs/promises';
import { Router } from 'express';
import { HttpError, randomId, requireUser } from '../auth.js';
import { canUpload } from './uploads.js';

const PAGE_SIZE = 12;
const MAX_FILES = 20;
// Comentarios que se muestran debajo de cada publicación en el inicio.
const PREVIEW_COMMENTS = 2;

export function mediaJson(m, isAdmin) {
  const base = `/media/${m.id}`;
  return {
    id: m.id,
    kind: m.kind,
    width: m.width,
    height: m.height,
    duration: m.duration,
    src: `${base}/display`,
    thumb: m.has_thumb ? `${base}/thumb` : null,
    poster: m.has_poster ? `${base}/poster` : null,
    download: isAdmin ? `${base}/download` : null,
  };
}

function commentJson(c, user) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    author: { id: c.user_id, username: c.username, color: c.color },
    canDelete: user.role === 'admin' || c.user_id === user.id,
  };
}

function describe(media) {
  const photos = media.filter((m) => m.kind === 'image').length;
  const videos = media.length - photos;
  const parts = [];
  if (photos) parts.push(photos === 1 ? '1 foto' : `${photos} fotos`);
  if (videos) parts.push(videos === 1 ? '1 video' : `${videos} videos`);
  return parts.join(' y ');
}

export function postRoutes({ db, settings, media, push }) {
  const router = Router();
  router.use(requireUser);

  const postSelect = `
    SELECT p.id, p.caption, p.created_at, p.user_id, u.username, u.color,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
      EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = @me) AS liked
    FROM posts p JOIN users u ON u.id = p.user_id
  `;

  function hydrate(rows, user) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const all = db
      .prepare(`SELECT * FROM media WHERE post_id IN (${ids.map(() => '?').join(',')}) ORDER BY position`)
      .all(...ids);
    const marks = ids.map(() => '?').join(',');
    // Los últimos comentarios de cada publicación, en orden de lectura.
    const recent = db
      .prepare(
        `SELECT * FROM (
           SELECT c.id, c.post_id, c.body, c.created_at, c.user_id, u.username, u.color,
             ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.id DESC) AS rn
           FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id IN (${marks})
         ) WHERE rn <= ${PREVIEW_COMMENTS} ORDER BY id`,
      )
      .all(...ids);
    const isAdmin = user.role === 'admin';
    return rows.map((r) => ({
      id: r.id,
      caption: r.caption,
      createdAt: r.created_at,
      author: { id: r.user_id, username: r.username, color: r.color },
      likeCount: r.like_count,
      commentCount: r.comment_count,
      liked: !!r.liked,
      canDelete: isAdmin || r.user_id === user.id,
      media: all.filter((m) => m.post_id === r.id).map((m) => mediaJson(m, isAdmin)),
      comments: recent.filter((c) => c.post_id === r.id).map((c) => commentJson(c, user)),
    }));
  }

  function loadPost(id, user) {
    const row = db.prepare(`${postSelect} WHERE p.id = @id`).get({ me: user.id, id });
    if (!row) throw new HttpError(404, 'Esta publicación ya no existe.');
    return hydrate([row], user)[0];
  }

  router.get('/', (req, res) => {
    const before = Number(req.query.before) || null;
    let userId = null;
    if (req.query.user) {
      const u = db.prepare('SELECT id FROM users WHERE username = ?').get(String(req.query.user));
      if (!u) throw new HttpError(404, 'Usuario no encontrado');
      userId = u.id;
    }
    const rows = db
      .prepare(
        `${postSelect}
         WHERE (@before IS NULL OR p.id < @before) AND (@userId IS NULL OR p.user_id = @userId)
         ORDER BY p.id DESC LIMIT @limit`,
      )
      .all({ me: req.user.id, before, userId, limit: PAGE_SIZE });
    const posts = hydrate(rows, req.user);
    res.json({ posts, nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].id : null });
  });

  router.get('/:id', (req, res) => {
    const post = loadPost(Number(req.params.id), req.user);
    const comments = db
      .prepare(
        `SELECT c.id, c.body, c.created_at, c.user_id, u.username, u.color
         FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id`,
      )
      .all(post.id)
      .map((c) => commentJson(c, req.user));
    res.json({ post, comments });
  });

  router.post('/', async (req, res) => {
    if (!canUpload(req.user, settings)) throw new HttpError(403, 'Solo los administradores pueden publicar.');
    const caption = String(req.body?.caption ?? '').trim().slice(0, 2000);
    const uploadIds = Array.isArray(req.body?.uploadIds) ? req.body.uploadIds.map(String) : [];
    if (!uploadIds.length) throw new HttpError(400, 'Elige al menos una foto o video.');
    if (uploadIds.length > MAX_FILES) throw new HttpError(400, `Máximo ${MAX_FILES} archivos por publicación.`);
    if (new Set(uploadIds).size !== uploadIds.length) throw new HttpError(400, 'Archivos repetidos');

    const uploads = uploadIds.map((id) => {
      const up = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(id, req.user.id);
      if (!up) throw new HttpError(400, 'Una de las subidas ya no existe. Vuelve a intentarlo.');
      if (up.received !== up.size || !up.kind) throw new HttpError(400, 'Una de las subidas no terminó.');
      return up;
    });

    // Se reclaman las subidas antes de procesarlas para que no se usen dos veces.
    const claim = db.prepare('DELETE FROM uploads WHERE id = ?');
    db.transaction(() => uploads.forEach((up) => claim.run(up.id)))();

    const items = [];
    try {
      for (const up of uploads) {
        const id = randomId(18);
        const meta = await media.ingest(id, media.tmpPath(up.id), up);
        items.push({ id, up, meta });
      }
    } catch (err) {
      await media.remove(items.map((i) => i.id));
      await Promise.all(uploads.map((up) => fsp.rm(media.tmpPath(up.id), { force: true })));
      throw err;
    }

    const now = Date.now();
    const postId = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO posts (user_id, caption, created_at) VALUES (?, ?, ?)')
        .run(req.user.id, caption, now);
      const insert = db.prepare(`
        INSERT INTO media (id, post_id, position, kind, ext, original_name, size, width, height, duration, has_display, has_thumb, has_poster)
        VALUES (@id, @post_id, @position, @kind, @ext, @original_name, @size, @width, @height, @duration, @has_display, @has_thumb, @has_poster)
      `);
      items.forEach(({ id, up, meta }, position) =>
        insert.run({
          id,
          post_id: lastInsertRowid,
          position,
          kind: up.kind,
          ext: up.ext,
          original_name: up.name,
          size: up.size,
          ...meta,
        }),
      );
      db.prepare(
        `INSERT INTO notifications (user_id, type, actor_id, post_id, created_at)
         SELECT id, 'post', ?, ?, ? FROM users WHERE id != ? AND status = 'active'`,
      ).run(req.user.id, lastInsertRowid, now, req.user.id);
      return Number(lastInsertRowid);
    })();

    const post = loadPost(postId, req.user);
    res.status(201).json({ post });

    const recipients = db
      .prepare("SELECT id FROM users WHERE id != ? AND status = 'active'")
      .all(req.user.id)
      .map((u) => u.id);
    push
      .send(recipients, {
        title: 'mi nopor',
        body: `@${req.user.username} subió ${describe(post.media)}`,
        url: `/#/p/${postId}`,
        tag: `post-${postId}`,
      })
      .catch(() => {});
  });

  router.delete('/:id', async (req, res) => {
    const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(Number(req.params.id));
    if (!post) throw new HttpError(404, 'Esta publicación ya no existe.');
    if (req.user.role !== 'admin' && post.user_id !== req.user.id) throw new HttpError(403, 'No puedes borrar esto.');
    const ids = db.prepare('SELECT id FROM media WHERE post_id = ?').all(post.id).map((m) => m.id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
    await media.remove(ids);
    res.json({ ok: true });
  });

  router.post('/:id/like', (req, res) => {
    const postId = Number(req.params.id);
    const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(postId);
    if (!post) throw new HttpError(404, 'Esta publicación ya no existe.');
    const liked = req.body?.liked !== false;
    if (liked) {
      db.prepare('INSERT OR IGNORE INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)').run(postId, req.user.id, Date.now());
    } else {
      db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
    }
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?').get(postId);
    res.json({ liked, likeCount: n });
  });

  router.post('/:id/comments', (req, res) => {
    const postId = Number(req.params.id);
    const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(postId);
    if (!post) throw new HttpError(404, 'Esta publicación ya no existe.');
    const body = String(req.body?.body ?? '').trim().slice(0, 1000);
    if (!body) throw new HttpError(400, 'Escribe un comentario.');
    const now = Date.now();
    const { lastInsertRowid } = db
      .prepare('INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(postId, req.user.id, body, now);
    if (post.user_id !== req.user.id) {
      db.prepare("INSERT INTO notifications (user_id, type, actor_id, post_id, created_at) VALUES (?, 'comment', ?, ?, ?)").run(
        post.user_id,
        req.user.id,
        postId,
        now,
      );
      push
        .send([post.user_id], {
          title: 'mi nopor',
          body: `@${req.user.username} comentó tu publicación`,
          url: `/#/p/${postId}`,
          tag: `comment-${postId}`,
        })
        .catch(() => {});
    }
    res.status(201).json({
      comment: commentJson(
        { id: Number(lastInsertRowid), body, created_at: now, user_id: req.user.id, username: req.user.username, color: req.user.color },
        req.user,
      ),
    });
  });

  return router;
}

export function commentRoutes({ db }) {
  const router = Router();
  router.delete('/:id', requireUser, (req, res) => {
    const c = db.prepare('SELECT id, user_id FROM comments WHERE id = ?').get(Number(req.params.id));
    if (!c) throw new HttpError(404, 'Comentario no encontrado');
    if (req.user.role !== 'admin' && c.user_id !== req.user.id) throw new HttpError(403, 'No puedes borrar esto.');
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
    res.json({ ok: true });
  });
  return router;
}
