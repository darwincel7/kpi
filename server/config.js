import path from 'node:path';

function parseTrustProxy(value) {
  if (value === undefined || value === '') return 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

export function loadConfig(overrides = {}) {
  const env = process.env;
  const config = {
    port: Number(env.PORT) || 3000,
    dataDir: path.resolve(env.DATA_DIR || './data'),
    // Tamaño máximo por archivo. Los videos en buena calidad pesan mucho.
    maxUploadMb: Number(env.MAX_UPLOAD_MB) || 4096,
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
    vapidSubject: env.VAPID_SUBJECT || '',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    ...overrides,
  };
  if (!config.vapidSubject) {
    config.vapidSubject = config.publicUrl.startsWith('https://')
      ? config.publicUrl
      : 'mailto:admin@example.com';
  }
  return config;
}
