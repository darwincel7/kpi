# mi nopor

Red social privada para compartir fotos y videos entre pocas personas. Contenido para adultos (+18), solo por invitación.

## Qué hace

- **Subir fotos y videos en calidad original.** Hasta 4 GB por archivo. Se suben por partes: si se corta el internet, se reanudan solas, y se puede seguir usando la app mientras sube.
- **Avisa a todos** cuando alguien publica: notificación en el teléfono y contador en la campana de la app.
- **No descargable.** Cada foto y video lleva el letrero «🔒 No descargable». Los miembros solo pueden verlo; **los administradores pueden descargar el archivo original**, sin recomprimir.
- **Registro en segundos.** El administrador comparte un enlace de invitación y la persona solo elige un usuario y una contraseña.
- Me gusta (también con doble toque), comentarios, perfiles, vista de lista o de cuadrícula y visor a pantalla completa.
- **Panel de administración:** enlace de invitación (se puede cambiar), cerrar el registro, que solo los admins publiquen, marca de agua, usuarios (hacer admin, bloquear, eliminar) y espacio usado.
- Se instala en el teléfono como una app.

## Roles

- **Dueño:** la primera cuenta que se crea. Es el único que puede nombrar o quitar administradores, y nadie puede bloquear, borrar ni cambiar su cuenta.
- **Administradores:** solo los que nombre el dueño. Ven el botón «Descargar» (el original, sin recomprimir) y el panel de administración.
- **Miembros:** todos los demás. Pueden ver, dar me gusta y comentar, pero no descargar.

## Protección del contenido: qué hace y qué no

Para quien no es administrador, la app:

- **Mantener presionado para ver** (se puede apagar en el panel): las fotos y videos se ven borrosos hasta que se mantienen presionados, así una captura casual sale borrosa. Los videos solo se reproducen mientras se mantiene presionado.
- **Oculta todo** en cuanto la app pierde el foco o pasa a segundo plano. Así la vista previa del selector de apps y muchas herramientas de recorte en computadora no captan nada.
- **Tapa la pantalla** al detectar los atajos de captura de Windows y Mac (Imprimir Pantalla, Win+Shift+S, Cmd+Shift+3/4/5) y bloquea imprimir la página.
- **Marca de agua en movimiento** con el usuario, su número de cuenta y la fecha. Si alguien fotografía la pantalla, se sabe de qué cuenta salió.
- Muestra el letrero «No descargable» y bloquea «Guardar imagen», arrastrar, el reproductor nativo (sin pantalla completa, sin imagen en imagen, sin botón de descarga) y abrir el archivo directamente en otra pestaña.
- De las fotos nunca entrega el original, sino una versión de 2560 px, nítida y sin ubicación GPS.
- Nada es público: sin iniciar sesión no se ve ni se descarga nada.

**Importante:** ninguna página web puede impedir del todo una captura o grabación de pantalla en el teléfono. La hace el sistema operativo, por fuera del navegador, y no avisa a la página. Estas medidas la dificultan y desaniman, y la marca de agua permite saber quién filtró algo. Para bloquearlas de verdad hace falta una app nativa: en Android, una app instalable con la protección del sistema (`FLAG_SECURE`) hace que capturas y grabaciones salgan en negro. En iPhone, ni las apps nativas pueden impedir una captura; solo pueden detectarla y ocultar el contenido mientras se graba.

## Publicarla en internet

Necesita **HTTPS** (para las notificaciones y para instalarla en el teléfono) y un **disco que no se borre** (ahí se guardan las fotos y videos).

Antes de elegir proveedor, **revisa que sus términos de uso permitan contenido para adultos**. Algunos lo prohíben y pueden cerrar la cuenta.

### Opción A: Railway (la más fácil)

1. Entra en [railway.com](https://railway.com) con tu cuenta de GitHub y crea un proyecto: **New Project → Deploy from GitHub repo →** elige este repositorio. Railway detecta el `Dockerfile` solo.
2. En el servicio, agrega un **Volume** montado en `/data`. Sin esto, se borra todo en cada actualización.
3. En **Settings → Networking**, pulsa **Generate Domain** para obtener tu dirección `https://…up.railway.app`. También puedes conectar tu propio dominio.
4. Abre la dirección y **crea enseguida tu cuenta**: la primera persona que entra queda como administrador.

El espacio del volumen depende de tu plan de Railway. Si van a subir muchos videos, revisa el tamaño o usa la opción B.

### Opción B: servidor propio (VPS), con más espacio para videos

En un servidor Linux con Docker (por ejemplo Hetzner, DigitalOcean o Contabo):

```bash
git clone https://github.com/darwincel7/kpi.git mi-nopor && cd mi-nopor
echo "DOMAIN=tudominio.com" > .env      # el dominio debe apuntar a la IP del servidor
docker compose up -d --build
```

Caddy consigue el certificado HTTPS automáticamente. Para actualizar: `git pull && docker compose up -d --build`.

## Primeros pasos

1. **Crea la cuenta de administrador** apenas publiques la app (la primera cuenta es la del admin).
2. Ve a **Perfil → Ajustes → Panel de administración**, copia el **enlace de invitación** y envíalo por WhatsApp a quien quieras invitar.
3. **Instálala en el teléfono:**
   - **iPhone:** abre la app en Safari, toca *Compartir* y luego *Agregar a inicio*. En iPhone las notificaciones solo funcionan con la app instalada (iOS 16.4 o más nuevo).
   - **Android:** en Chrome, menú ⋮ → *Instalar app*.
4. **Activa las notificaciones** cuando la app lo pida (o en *Ajustes*).
5. Cuando ya estén todos dentro, puedes **cerrar el registro** desde el panel.

## Copias de seguridad

Todo se guarda en la carpeta de datos (`/data` en Docker): la base de datos `minopor.db` y la carpeta `media/` con los originales. Haz copias de esa carpeta de vez en cuando.

## Variables de entorno (opcionales)

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto del servidor | `3000` |
| `DATA_DIR` | Carpeta de datos | `./data` (`/data` en Docker) |
| `MAX_UPLOAD_MB` | Tamaño máximo por archivo, en MB | `4096` |
| `PUBLIC_URL` | Dirección pública, por ejemplo `https://tudominio.com` | — |
| `TRUST_PROXY` | Cuántos proxies hay delante (Railway, Caddy) | `1` |

## Desarrollo

Requiere Node.js 20.9 o más nuevo. `ffmpeg` es opcional y sirve para generar las portadas de los videos.

```bash
npm install
npm run dev     # http://localhost:3000
npm test
```

- `server/`: API con Express y SQLite. Maneja cuentas, subidas por partes, entrega protegida de archivos y notificaciones push.
- `public/`: la app, en JavaScript sin paso de compilación.
- `test/`: pruebas de la API (registro, invitaciones, permisos de descarga, subidas).
