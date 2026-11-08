# Mi Carrito POS 1.9.0

## Implementado en esta entrega
- Configuración base de Cloudflare Pages para el frontend Vite/React.
- Fallback de rutas SPA y cabeceras HTTP de seguridad.
- Proxy `/api/*` en Pages Functions con validación de `API_ORIGIN`, reenvío de autorización, método, query y cuerpo; sin caché.
- Tres pruebas automatizadas del proxy (configuración ausente, origen inválido y reenvío correcto).
- Guía de despliegue Cloudflare Pages.
- Documento de preparación SUNAT que deja explícito que la emisión real sigue deshabilitada.
- SQL de auditoría pre-migración estrictamente de solo lectura.
- Versión de paquete y aplicación actualizada a 1.9.0.

## No realizado / no afirmar como terminado
- No se ejecutaron migraciones ni cambios remotos en Supabase.
- No se conectó un OSE real ni se firmaron comprobantes.
- No se migró NestJS/Bull/Redis a Workers o Edge Functions.
- No se pudo validar build completo de frontend/backend en este entorno.

## Validación
- `node --test functions/api/proxy.test.js`: 3 pruebas aprobadas.
- El intento de build/test backend no pudo arrancar porque los ejecutables Jest/Nest no están instalados correctamente en `node_modules`.
- Instalar dependencias en un entorno Node limpio y completar pruebas de integración antes de desplegar.
