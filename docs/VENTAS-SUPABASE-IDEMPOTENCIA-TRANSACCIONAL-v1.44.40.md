# Idempotencia transaccional — v1.44.40

## Qué se incorpora
Se agrega `public.pos_venta_idempotencia_resolver_interna(integer,text,text)`, helper privado para que la futura RPC principal pueda:
1. validar empresa, clave y hash SHA-256;
2. serializar temporalmente operaciones con la misma empresa+clave mediante `pg_advisory_xact_lock`;
3. consultar y bloquear el comprobante existente;
4. devolver el comprobante previo si la huella coincide;
5. rechazar la reutilización de una clave con contenido diferente.

## Límite crítico
Este helper **no reserva ni consume** una clave si no existe comprobante. La garantía final contra carreras sigue siendo el índice único `uq_comprobante_empresa_idempotency` en `public.comprobante` y el tratamiento específico de `unique_violation` dentro de la misma RPC/transacción que realiza el INSERT.

Por ello, el helper debe invocarse internamente desde `pos_venta_crear_auth` y dentro de la misma transacción que inserta el comprobante. No debe llamarse como RPC independiente esperando que el bloqueo sobreviva a la respuesta HTTP.

## Seguridad
- `SECURITY DEFINER`, `search_path` fijo.
- Sin permisos para `PUBLIC`, `anon` ni `authenticated`.
- Diseñado para invocación desde la RPC propietaria, que resolverá `empresa_id` desde `auth.uid()` y no desde el payload.

## No incluido
No crea comprobantes, no modifica stock, pagos, caja ni correlativos. No habilita Cobrar. No ejecutar esta migración todavía.
