# Mi Carrito POS v1.44.62

## Ciclo transaccional de caja en Supabase + Cloudflare
- Añade RPC autenticadas para apertura, registro de movimiento y cierre de caja.
- La identidad se deriva de `auth.uid()` y se valida usuario activo, empresa, sucursal asignada y propietario de caja.
- La apertura usa el índice único existente para impedir dos cajas abiertas por usuario y sucursal.
- Los movimientos bloquean la fila de caja con `FOR UPDATE`; la caja debe estar abierta.
- Los egresos en efectivo se limitan al saldo disponible calculado en servidor.
- El cierre bloquea la caja, calcula esperado por medio, registra arqueo y diferencia y marca la caja cerrada en una operación SQL.
- Cloudflare valida formato y rango de importes, exige Bearer y enruta a RPC específicas.
- RPCs revocadas a PUBLIC/anon; EXECUTE concedido a authenticated.

## Límites conocidos
- La pantalla CierreCaja aún consume el API heredado para apertura/movimientos/cierre; esta versión añade los endpoints Edge y RPC, pero no conmuta todavía toda la interfaz.
- El arqueo conserva el efectivo contado como dato principal; la integración completa de arqueo y reembolsos por cada medio queda pendiente.
- No se ejecutaron migraciones, no se conectó a Supabase remoto ni se desplegó Cloudflare.
- Requiere revisión de esquema y pruebas integrales en staging antes de habilitar escrituras.
