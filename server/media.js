import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

sharp.cache(false);

// Lado más largo de la versión que se ve en la app. Suficiente para pantallas
// retina sin perder calidad; el original se guarda intacto para los admins.
const DISPLAY_MAX = 2560;
const THUMB_MAX = 640;

export const MIME = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  avif: 'image/avif',
  mp4: 'video/mp4',
  // Los .mov de iPhone se reproducen en Chrome si se anuncian como mp4.
  mov: 'video/mp4',
  webm: 'video/webm',
};

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

// Detecta el tipo real del archivo por sus primeros bytes, sin fiarse de lo
// que diga el navegador.
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  const ascii = (start, end) => buf.toString('latin1', start, end);
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', ext: 'jpg' };
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return { kind: 'image', ext: 'png' };
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { kind: 'image', ext: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { kind: 'image', ext: 'webp' };
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', ext: 'avif' };
    if (HEIF_BRANDS.has(brand)) return { kind: 'image', ext: 'heic' };
    if (brand.startsWith('qt')) return { kind: 'video', ext: 'mov' };
    return { kind: 'video', ext: 'mp4' };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'video', ext: 'webm' };
  return null;
}

export async function sniffFile(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(32);
    const { bytesRead } = await fh.read(buf, 0, 32, 0);
    return sniff(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

const hasFfmpeg = (() => {
  try {
    return spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0 &&
      spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
})();

export function createMediaStore(dataDir) {
  const mediaDir = path.join(dataDir, 'media');
  const tmpDir = path.join(dataDir, 'tmp');
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const dirFor = (id) => path.join(mediaDir, id);

  const store = {
    mediaDir,
    tmpDir,
    hasFfmpeg,
    tmpPath: (uploadId) => path.join(tmpDir, `${uploadId}.part`),

    filePath(media, variant) {
      const dir = dirFor(media.id);
      switch (variant) {
        case 'original':
          return path.join(dir, `original.${media.ext}`);
        case 'display':
          if (media.kind === 'video' || !media.has_display) return path.join(dir, `original.${media.ext}`);
          return path.join(dir, media.ext === 'gif' ? 'original.gif' : 'display.webp');
        case 'thumb':
          return media.has_thumb ? path.join(dir, 'thumb.webp') : null;
        case 'poster':
          return media.has_poster ? path.join(dir, 'poster.jpg') : null;
        default:
          return null;
      }
    },

    mimeFor(media, variant) {
      if (variant === 'thumb') return 'image/webp';
      if (variant === 'poster') return 'image/jpeg';
      if (variant === 'display' && media.kind === 'image' && media.has_display && media.ext !== 'gif') return 'image/webp';
      return MIME[media.ext] || 'application/octet-stream';
    },

    // Mueve el archivo subido a su carpeta y genera las versiones para la app.
    async ingest(id, tmpFile, { kind, ext }) {
      const dir = dirFor(id);
      await fsp.mkdir(dir, { recursive: true });
      const original = path.join(dir, `original.${ext}`);
      await fsp.rename(tmpFile, original);
      const meta = { width: null, height: null, duration: null, has_display: 0, has_thumb: 0, has_poster: 0 };
      try {
        if (kind === 'image') await processImage(original, dir, ext, meta);
        else await processVideo(original, dir, meta);
      } catch (err) {
        console.warn(`[media] No se pudo procesar ${id}: ${err.message}`);
      }
      return meta;
    },

    async remove(ids) {
      await Promise.all(ids.map((id) => fsp.rm(dirFor(id), { recursive: true, force: true })));
    },
  };
  return store;
}

async function processImage(original, dir, ext, meta) {
  const input = () => sharp(original, { failOn: 'none', animated: ext === 'gif' }).rotate();
  if (ext === 'gif') {
    const info = await sharp(original).metadata();
    meta.width = info.width;
    meta.height = info.pageHeight || info.height;
    meta.has_display = 1;
  } else {
    // .rotate() aplica la orientación EXIF; al recodificar también se quitan
    // los metadatos (como la ubicación GPS) de la versión que ven todos.
    const info = await input()
      .resize({ width: DISPLAY_MAX, height: DISPLAY_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, smartSubsample: true })
      .toFile(path.join(dir, 'display.webp'));
    meta.width = info.width;
    meta.height = info.height;
    meta.has_display = 1;
  }
  await sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(dir, 'thumb.webp'));
  meta.has_thumb = 1;
}

async function processVideo(original, dir, meta) {
  if (!hasFfmpeg) return;
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_tags=rotate:stream_side_data=rotation:format=duration', '-of', 'json', original],
    { timeout: 30_000 },
  );
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  if (!stream) throw new Error('El archivo no tiene video');
  let rotation = Number(stream.tags?.rotate || 0);
  for (const side of stream.side_data_list || []) if (side.rotation !== undefined) rotation = Number(side.rotation);
  const quarterTurn = Math.abs(rotation) % 180 === 90;
  meta.width = quarterTurn ? stream.height : stream.width;
  meta.height = quarterTurn ? stream.width : stream.height;
  meta.duration = Number(probe.format?.duration) || null;

  const at = meta.duration ? Math.min(1, meta.duration / 3) : 0;
  const poster = path.join(dir, 'poster.jpg');
  await run(
    'ffmpeg',
    ['-v', 'error', '-y', '-ss', String(at), '-i', original, '-frames:v', '1', '-vf', "scale='min(1920,iw)':-2", '-q:v', '3', poster],
    { timeout: 60_000 },
  );
  meta.has_poster = 1;
  await sharp(poster)
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(dir, 'thumb.webp'));
  meta.has_thumb = 1;
}
