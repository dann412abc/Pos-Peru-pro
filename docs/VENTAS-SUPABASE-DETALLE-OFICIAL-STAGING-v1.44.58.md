# v1.44.58 — Validación de recuperación oficial en staging

## Objetivo
Cerrar el circuito de creación transaccional y recuperación del comprobante: una venta confirmada debe poder leerse con el mismo contexto JWT autenticado y el detalle recuperado debe coincidir internamente en cabecera, líneas y pagos.

## Cambios
- El harness de integración de staging invoca `pos_comprobante_detalle_auth(id)` inmediatamente después de crear una venta.
- Comprueba que el detalle pertenece a la empresa y sucursal del escenario.
- Exige líneas, cliente y pagos en el detalle oficial.
- Verifica que la suma de pagos recuperados coincide con el total oficial, con tolerancia de S/ 0.01.
- La lectura se ejecuta antes de cambiar al rol de aserción privilegiada.
- Se añade prueba estática que protege el contrato de solo lectura y los permisos de la RPC.

## Ejecución
Pruebas estáticas:

```bash
node --test supabase/migrations-preview/202611070040_sales_official_detail_staging_guard.test.mjs
```

Integración real (solo proyecto staging aislado, fixture preparado y autorización explícita):

```bash
POS_SALES_STAGING_CONFIRM=YES POS_SALES_FIXTURE=/ruta/fixture-staging.json node --test supabase/tests/sales-transaction-staging.integration.test.mjs
```

## Seguridad y límites
- No se ejecutaron migraciones ni consultas contra Supabase remoto.
- No se habilitaron cobros ni se desplegó Cloudflare.
- La prueba de integración permanece opt-in y requiere fixture explícito.
- Esta etapa valida también el detalle oficial en el flujo de staging; no equivale a certificación de producción.
