import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app, ctx, close } = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`mi nopor escuchando en http://localhost:${config.port}`);
  console.log(`Datos en ${config.dataDir}`);
  if (!ctx.media.hasFfmpeg) console.log('Aviso: ffmpeg no está instalado; los videos no tendrán portada.');
});
// Las subidas de partes grandes en redes lentas pueden tardar.
server.requestTimeout = 15 * 60_000;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
