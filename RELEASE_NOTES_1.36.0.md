# Mi Carrito POS 1.36.0

## Etapa 36 — Historial persistente de alertas
La bandeja de alertas ahora conserva alertas activas por administrador, permite marcarlas como leídas individualmente o en bloque y mantiene ese estado entre dispositivos. Las alertas resueltas se desactivan; si vuelven a aparecer, se presentan como nuevas.

Incluye una migración pendiente para crear `alerta_operativa`. No se ejecutó SQL, no se modificó Supabase remoto y no se desplegó Cloudflare.
