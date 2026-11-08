# Recuperación persistente de intentos de venta — v1.44.55

## Objetivo
Evitar que una recarga o cierre de pestaña genere una clave nueva para un cobro cuyo resultado todavía sea incierto.

## Cambios
- La clave de idempotencia se conserva en `localStorage`, por ámbito de usuario y sucursal, y no solo en `sessionStorage`.
- Antes de llamar a la RPC se guarda un snapshot del payload exacto, su huella y su clave. No se guardan JWT ni tokens de sesión.
- Si existe un intento pendiente con una huella distinta, el POS bloquea el nuevo cobro y no sobrescribe la operación anterior.
- Un reintento del mismo carrito recupera la misma clave y el mismo payload; el servidor puede devolver el comprobante existente sin duplicarlo.
- El intento se limpia únicamente después de recibir una confirmación completa de comprobante.
- Si el almacenamiento local no está disponible, el flujo Supabase se bloquea antes de enviar la venta, porque no se puede garantizar recuperación segura.

## Límites conocidos
- Esta etapa conserva el intento y permite reintentar cuando el mismo contenido del carrito vuelve a estar disponible. Todavía no presenta una pantalla de recuperación automática que reconstruya el carrito y el ticket al abrir una sesión nueva.
- Una respuesta ambigua permanece bloqueada hasta que se pueda verificar/reintentar con la misma carga. No borrar manualmente el registro ni cambiar su clave.
- La clave y el snapshot se almacenan en el navegador del dispositivo; proteger el acceso al equipo y cerrar sesión al terminar el turno.
- La bandera `VITE_SUPABASE_SALES_ENABLED` sigue desactivada.

## Validación
- Suite Node de migraciones-preview y pruebas Supabase: 119; 117 aprobadas, 2 omitidas por requerir staging aislado, 0 fallidas.
- No se ejecutaron pruebas Vitest de frontend porque el ZIP no contiene `node_modules`.
- No se ejecutó build Vite/TypeScript completo.
- No se ejecutó SQL, conexión a Supabase ni despliegue Cloudflare.
