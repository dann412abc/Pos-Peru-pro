# Mi Carrito POS v1.44.2

- Añadidos endpoints Cloudflare Edge para login con contraseña Supabase, renovación de sesión, logout y recuperación.
- Respuestas de recuperación no permiten enumerar correos registrados.
- Validación de formato de entrada y pruebas Vitest añadidas.
- La autenticación activa del frontend sigue en NestJS; no activar en producción hasta completar la integración de AuthContext y el vínculo manual de identidades.
- Sin cambios en Supabase remoto, sin migraciones ejecutadas y sin despliegue.
