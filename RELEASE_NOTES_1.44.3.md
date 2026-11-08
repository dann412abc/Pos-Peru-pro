# Mi Carrito POS v1.44.3

- Adaptador frontend para Supabase Auth.
- Login por correo, perfil POS vinculado, renovación, cierre de sesión y recuperación.
- Activación controlada mediante `VITE_AUTH_PROVIDER`; modo legacy sigue siendo el predeterminado.
- No activa la migración de autenticación en producción porque los módulos comerciales aún dependen de NestJS.
- No ejecuta migraciones ni cambia recursos remotos.
