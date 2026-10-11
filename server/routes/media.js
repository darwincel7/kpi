import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { HttpError } from '../auth.js';

const VARIANTS = new Set(['display', 'thumb', 'poster']);
// Destinos con los que el navegador pide una imagen o video incrustado.
const EMBED_DESTS = new Set(['image', 'video', 'audio']);

const blockedPage = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Contenido protegido</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0c;color:#f4f4f6;font:16px system-ui;text-align:center">
<div><div style="font-size:40px">🔒</div><p>Este contenido es privado y no se puede descargar.</p>
<a href="/" style="color:#ff4f81">Volver a mi nopor</a></div></body>`;

export function mediaRoutes({ db, media }) {
  const router = Router();
  const find = db.prepare('SELECT * FROM media WHERE id = ?');

  router.get('/:id/:variant', (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar');
    const { variant } = req.params;
    const isAdmin = req.user.role === 'admin';
    const m = find.get(req.params.id);
    if (!m) throw new HttpError(404, 'No encontrado');

    let file;
    let disposition = 'inline';
    if (variant === 'download') {
      if (!isAdmin) throw new HttpError(403, 'Solo los administradores pueden descargar.');
      file = media.filePath(m, 'original');
      const base = path.parse(m.original_name || '').name.replace(/[^\w.\- ]+/g, '').trim() || `minopor-${m.id}`;
      disposition = `attachment; filename="${base}.${m.ext}"`;
    } else if (VARIANTS.has(variant)) {
      // Si alguien abre el archivo directamente en una pestaña (para guardarlo),
      // el navegador lo marca como "document" y no se entrega.
      const dest = req.get('sec-fetch-dest');
      if (!isAdmin && dest && !EMBED_DESTS.has(dest)) {
        return res.status(403).set('Cache-Control', 'no-store').type('html').send(blockedPage);
      }
      file = media.filePath(m, variant);
    } else {
      throw new HttpError(404, 'No encontrado');
    }
    if (!file || !fs.existsSync(file)) throw new HttpError(404, 'No encontrado');

    res.sendFile(
      file,
      {
        headers: {
          'Content-Type': variant === 'download' ? 'application/octet-stream' : media.mimeFor(m, variant),
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=86400',
          // Sin esto el navegador reutilizaría la copia en caché al abrir el
          // archivo en una pestaña y se saltaría el bloqueo de arriba.
          Vary: 'Sec-Fetch-Dest',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
        dotfiles: 'deny',
      },
      (err) => {
        if (err && !res.headersSent) next(err);
      },
    );
  });

  return router;
}
