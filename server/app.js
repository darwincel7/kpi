import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { HttpError, csrfGuard, inviteCode, loadUser } from './auth.js';
import { createSettings, openDb } from './db.js';
import { createMediaStore } from './media.js';
import { createPush } from './push.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { mediaRoutes } from './routes/media.js';
import { commentRoutes, postRoutes } from './routes/posts.js';
import { notificationRoutes, pushRoutes, userRoutes } from './routes/social.js';
import { startUploadCleanup, uploadRoutes } from './routes/uploads.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(config) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = openDb(path.join(config.dataDir, 'minopor.db'));
  const settings = createSettings(db);
  settings.setDefault('invite_code', inviteCode());
  settings.setDefault('registration_open', '1');
  settings.setDefault('uploads_admin_only', '0');
  settings.setDefault('watermark', '1');

  const media = createMediaStore(config.dataDir);
  const push = createPush(db, settings, config.vapidSubject);
  const ctx = { db, settings, media, push, config };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    next();
  });
  app.use(loadUser(db));

  app.use('/api', csrfGuard, express.json({ limit: '64kb' }), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/uploads', uploadRoutes(ctx));
  app.use('/api/posts', postRoutes(ctx));
  app.use('/api/comments', commentRoutes(ctx));
  app.use('/api/notifications', notificationRoutes(ctx));
  app.use('/api/push', pushRoutes(ctx));
  app.use('/api/users', userRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', (req, res, next) => next(new HttpError(404, 'No encontrado')));
  app.use('/media', mediaRoutes(ctx));

  app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));
  app.use(
    express.static(publicDir, {
      setHeaders(res, file) {
        // Sin caché agresiva: así cada actualización llega enseguida.
        res.set('Cache-Control', file.includes(`${path.sep}icons${path.sep}`) ? 'public, max-age=604800' : 'no-cache');
      },
    }),
  );

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !err.expose && !(err instanceof HttpError) ? 'Error del servidor' : err.message });
  });

  const stopCleanup = startUploadCleanup(ctx);
  return {
    app,
    ctx,
    close() {
      stopCleanup();
      db.close();
    },
  };
}
