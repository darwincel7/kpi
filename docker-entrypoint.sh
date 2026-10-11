#!/bin/sh
set -e

# Algunos servicios (como Railway) montan el volumen como root. Se le da la
# carpeta de datos al usuario "node" y la app corre sin privilegios.
if [ "$(id -u)" = "0" ]; then
  if [ "$(stat -c %U "$DATA_DIR")" != "node" ]; then
    chown -R node:node "$DATA_DIR"
  fi
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
