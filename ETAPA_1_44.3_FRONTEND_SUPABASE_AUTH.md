# Etapa 1.44.3 — Adaptador frontend Supabase Auth

## Implementado
- Adaptador tipado del frontend para login por correo, perfil POS, refresh, logout y recuperación mediante `/api/edge/auth/*`.
- `AuthContext` puede resolver perfil POS con `pos_mi_perfil_auth` cuando `VITE_AUTH_PROVIDER=supabase`.
- Restauración de sesión valida el token y vuelve a resolver el perfil antes de liberar la aplicación.
- Renovación automática de sesión usa el endpoint Edge cuando se activa el proveedor Supabase.
- Formulario de login cambia a correo electrónico y muestra recuperación de contraseña bajo el mismo flag.
- El modo anterior permanece predeterminado (`VITE_AUTH_PROVIDER=legacy`).

## Restricción crítica de activación
NO activar `VITE_AUTH_PROVIDER=supabase` en producción todavía. Los módulos comerciales continúan consumiendo endpoints NestJS y ese backend aún espera su propio JWT. Activar Supabase Auth antes de migrar autorización/API comercial puede provocar respuestas 401 y bloquear ventas/caja. Probar solo en entorno aislado con migraciones preview revisadas y usuarios vinculados.

## Configuración Edge
Variables server-side de Cloudflare Pages Functions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Variable de compilación frontend para entorno de prueba:
- `VITE_AUTH_PROVIDER=supabase`

Nunca usar `service_role` en variables `VITE_*` ni en el navegador.

## Pendientes
- Flujo de cambio de contraseña al regresar desde el enlace de recuperación.
- Validación de rol contra enum real y mapping de roles si el esquema difiere.
- Pruebas integrales con proyecto Supabase de staging y correo SMTP configurado.
- Migrar todos los endpoints comerciales a Edge/RPC antes de activar Supabase Auth en producción.
