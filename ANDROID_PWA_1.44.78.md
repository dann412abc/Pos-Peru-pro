# Abrir Mi Carrito POS desde Android — versión 1.44.78

## Importante
No abras `frontend/index.html` desde el administrador de archivos del teléfono. Android lo entrega como `content://...`; Vite/React necesita una dirección HTTP/HTTPS para resolver módulos, rutas y recursos.

## Publicar y abrir
1. Publica esta versión en Cloudflare Pages siguiendo `CLOUDFLARE_PAGES_1.44.77.md`.
2. Espera a que el deployment termine correctamente.
3. En Android abre Brave o Chrome y entra a `https://TU-PROYECTO.pages.dev/`.
4. Inicia sesión o usa el modo Preview de demostración configurado para pruebas.
5. En el menú del navegador selecciona **Instalar aplicación** o **Agregar a pantalla de inicio**.
6. Abre Mi Carrito POS desde el nuevo icono.

## Requisitos
- HTTPS activo (Cloudflare Pages lo proporciona).
- Publicar el proyecto con Pages Functions; no subir únicamente `frontend/dist` si se necesitan las rutas `/api/*`.
- La primera apertura requiere internet. El service worker puede conservar la carcasa estática para abrir la interfaz tras una visita previa, pero las funciones API y datos Supabase requieren conexión.
- El service worker excluye `/api/` para no guardar respuestas de autenticación ni datos comerciales.
- No utilizar modo demo con información real ni credenciales de demostración en producción.

## Si aparece una pantalla en blanco
- Comprueba que la URL empieza por `https://` y termina en `/`, no `content://`.
- Abre la URL en Chrome/Brave actualizado.
- En Cloudflare Pages revisa que el deployment esté en estado Success.
- Comprueba `/api/health` si la función está desplegada.
