# Release 1.44.78 — PWA Android + Cloudflare Pages

- Añadido manifest PWA e icono instalable.
- Añadido service worker para shell estático y recursos de frontend.
- Navegación API excluida del caché para no almacenar respuestas privadas ni datos comerciales.
- Añadido registro del service worker en contexto seguro.
- Actualizado index.html para retirar la pantalla que indicaba abrir desde Vite y preparar metadatos móviles.
- Guía Android: ANDROID_PWA_1.44.78.md.
- Requiere publicar por HTTPS en Cloudflare Pages; abrir index.html mediante `content://` o `file://` no es compatible.
