import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Router } from 'express';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError, randomId, requireUser } from '../auth.js';
import { sniffFile } from '../media.js';

// Los archivos se suben en partes. Así un video grande no choca con los
// límites de tamaño de los proxies y se puede reanudar si falla la conexión.
export const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_CHUNK = CHUNK_SIZE + 1024 * 1024;
const STALE_MS = 24 * 3600_000;

export function canUpload(user, settings) {
  return user.role === 'admin' || !settings.getBool('uploads_admin_only');
}

export function uploadRoutes({ db, settings, config, media }) {
  const router = Router();
  const maxBytes = config.maxUploadMb * 1024 * 1024;

  const getUpload = (req) => {
    const up = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!up) throw new HttpError(404, 'Subida no encontrada');
    return up;
  };

  router.post('/', requireUser, async (req, res) => {
    if (!canUpload(req.user, settings)) throw new HttpError(403, 'Solo los administradores pueden publicar.');
    const size = Number(req.body?.size);
    const name = String(req.body?.name ?? '').slice(0, 200);
    if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, 'Archivo vacío');
    if (size > maxBytes) throw new HttpError(413, `El archivo supera el máximo de ${config.maxUploadMb} MB.`);
    const { bavail, bsize } = await fsp.statfs(media.tmpDir);
    if (bavail * bsize < size * 2 + 200 * 1024 * 1024) {
      throw new HttpError(507, 'El servidor no tiene espacio suficiente. Avisa a un administrador.');
    }
    const id = randomId(18);
    await fsp.writeFile(media.tmpPath(id), '');
    db.prepare('INSERT INTO uploads (id, user_id, name, size, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      req.user.id,
      name,
      size,
      Date.now(),
    );
    res.status(201).json({ id, chunkSize: CHUNK_SIZE, received: 0 });
  });

  router.put('/:id', requireUser, async (req, res) => {
    const up = getUpload(req);
    const offset = Number(req.query.offset);
    if (offset !== up.received) return res.status(409).json({ error: 'Desfase en la subida', received: up.received });
    const limit = Math.min(MAX_CHUNK, up.size - up.received);
    let written = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        written += chunk.length;
        if (written > limit) cb(new HttpError(413, 'Parte demasiado grande'));
        else cb(null, chunk);
      },
    });
    const file = media.tmpPath(up.id);
    try {
      await pipeline(req, counter, fs.createWriteStream(file, { flags: 'r+', start: offset }));
    } catch (err) {
      // Descarta lo que se haya escrito de una parte incompleta.
      await fsp.truncate(file, up.received).catch(() => {});
      throw err.status ? err : new HttpError(400, 'La parte llegó incompleta');
    }
    const received = offset + written;
    await fsp.truncate(file, received);

    let { kind, ext } = up;
    if (offset === 0) {
      const type = await sniffFile(file);
      if (!type) {
        db.prepare('DELETE FROM uploads WHERE id = ?').run(up.id);
        await fsp.rm(file, { force: true });
        throw new HttpError(415, 'Solo se pueden subir fotos y videos.');
      }
      ({ kind, ext } = type);
    }
    db.prepare('UPDATE uploads SET received = ?, kind = ?, ext = ? WHERE id = ?').run(received, kind, ext, up.id);
    res.json({ received, done: received === up.size });
  });

  router.delete('/:id', requireUser, async (req, res) => {
    const up = getUpload(req);
    db.prepare('DELETE FROM uploads WHERE id = ?').run(up.id);
    await fsp.rm(media.tmpPath(up.id), { force: true });
    res.json({ ok: true });
  });

  return router;
}

export function startUploadCleanup({ db, media }) {
  const sweep = async () => {
    const stale = db.prepare('SELECT id FROM uploads WHERE created_at < ?').all(Date.now() - STALE_MS);
    for (const { id } of stale) {
      db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
      await fsp.rm(media.tmpPath(id), { force: true });
    }
  };
  const timer = setInterval(() => sweep().catch(() => {}), 3600_000);
  timer.unref();
  return () => clearInterval(timer);
}
