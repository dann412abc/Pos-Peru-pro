# Etapa 1.44.66 — Protección del módulo de devoluciones

Se identificó que la pantalla todavía invocaba rutas del backend antiguo. En modo Supabase Auth esas llamadas podían dejar el módulo dependiendo de una API que se está retirando.

La pantalla ahora bloquea el flujo antiguo cuando `VITE_AUTH_PROVIDER=supabase` y presenta un aviso. El modo anterior permanece intacto. Esta es una barrera de seguridad temporal, no una integración terminada.

Siguiente trabajo técnico: construir RPC SQL transaccionales para consultar comprobantes/disponibilidad y registrar devolución con idempotencia, reingreso de stock/lotes, reversión de crédito, reembolso y movimiento de caja. Después conectar Cloudflare Edge y habilitar la pantalla.
