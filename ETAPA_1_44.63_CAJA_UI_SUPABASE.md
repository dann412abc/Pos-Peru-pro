# Etapa 1.44.63 — Caja UI conectada a Supabase

La página `CierreCaja.tsx` ahora enruta apertura, movimientos y cierre a los helpers `supabaseCash` cuando `VITE_AUTH_PROVIDER=supabase`. La lectura de caja abierta utiliza el endpoint autenticado ya disponible para Compras y el resumen usa la RPC segura de resumen. El modo demo y la API heredada permanecen disponibles.

**No ejecutar SQL todavía.** Antes de instalar las migraciones preview se debe validar el esquema real de `caja`, `caja_movimiento`, `comprobante_pago`, permisos y relaciones en un entorno staging.

Pendiente explícito: RPC de lectura del historial de movimientos, para que el historial sobreviva a recargas; conciliación de devoluciones en el arqueo; prueba de integración real con Supabase y compilación frontend en un entorno con dependencias instaladas.
