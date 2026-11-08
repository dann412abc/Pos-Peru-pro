-- AYNI / POS Perú — conciliación por cuenta: crédito, abonos y reversiones.
-- SOLO LECTURA. Ejecutar con JWT de usuario authenticated para evaluar RLS.
-- No usar service_role/postgres para validar visibilidad. No actualiza saldos.
-- La diferencia informativa NO se interpreta automáticamente como error:
-- las devoluciones pueden modificar el crédito original y el saldo vigente.

WITH abonos AS (
  SELECT
    cc.empresa_id,
    cc.cuenta_cobrar_id,
    COUNT(*) AS cantidad_abonos,
    ROUND(COALESCE(SUM(cc.monto), 0), 2) AS total_abonado,
    ROUND(COALESCE(SUM(cc.monto) FILTER (WHERE cc.metodo_pago = 'EFECTIVO'), 0), 2) AS abonado_efectivo,
    ROUND(COALESCE(SUM(cc.monto) FILTER (WHERE cc.metodo_pago = 'YAPE'), 0), 2) AS abonado_yape,
    ROUND(COALESCE(SUM(cc.monto) FILTER (WHERE cc.metodo_pago = 'PLIN'), 0), 2) AS abonado_plin,
    ROUND(COALESCE(SUM(cc.monto) FILTER (WHERE cc.metodo_pago = 'TARJETA'), 0), 2) AS abonado_tarjeta,
    ROUND(COALESCE(SUM(cc.monto) FILTER (WHERE cc.metodo_pago = 'TRANSFERENCIA'), 0), 2) AS abonado_transferencia,
    MAX(cc.created_at) AS ultimo_abono
  FROM public.cobro_cliente cc
  GROUP BY cc.empresa_id, cc.cuenta_cobrar_id
), detalle AS (
  SELECT
    cuenta.empresa_id,
    cuenta.sucursal_id,
    cuenta.id AS cuenta_cobrar_id,
    cuenta.comprobante_id,
    cuenta.cliente_id,
    cuenta.total_credito,
    cuenta.saldo_pendiente,
    cuenta.monto_revertido,
    cuenta.estado,
    cuenta.fecha_vencimiento,
    cuenta.created_at AS cuenta_creada,
    cuenta.updated_at AS cuenta_actualizada,
    COALESCE(ab.cantidad_abonos, 0) AS cantidad_abonos,
    COALESCE(ab.total_abonado, 0)::numeric(14,2) AS total_abonado,
    COALESCE(ab.abonado_efectivo, 0)::numeric(14,2) AS abonado_efectivo,
    COALESCE(ab.abonado_yape, 0)::numeric(14,2) AS abonado_yape,
    COALESCE(ab.abonado_plin, 0)::numeric(14,2) AS abonado_plin,
    COALESCE(ab.abonado_tarjeta, 0)::numeric(14,2) AS abonado_tarjeta,
    COALESCE(ab.abonado_transferencia, 0)::numeric(14,2) AS abonado_transferencia,
    ab.ultimo_abono,
    ROUND(COALESCE(cuenta.total_credito, 0) - COALESCE(ab.total_abonado, 0), 2) AS saldo_teorico_sin_ajuste_devolucion,
    ROUND(COALESCE(cuenta.total_credito, 0) - COALESCE(ab.total_abonado, 0)
      - COALESCE(cuenta.saldo_pendiente, 0), 2) AS diferencia_sin_ajuste_devolucion,
    ROUND(COALESCE(cuenta.monto_revertido, 0), 2) AS reversion_registrada
  FROM public.cuenta_cobrar cuenta
  LEFT JOIN abonos ab
    ON ab.empresa_id = cuenta.empresa_id
   AND ab.cuenta_cobrar_id = cuenta.id
)
SELECT *,
  CASE
    WHEN ABS(diferencia_sin_ajuste_devolucion - reversion_registrada) <= 0.01
      THEN 'COINCIDE_CON_REVERSION_REGISTRADA'
    WHEN ABS(diferencia_sin_ajuste_devolucion) <= 0.01
      THEN 'COINCIDE_SIN_AJUSTE'
    ELSE 'REQUIERE_REVISION_DOCUMENTAL'
  END AS resultado_preliminar
FROM detalle
WHERE estado IS DISTINCT FROM 'ANULADA'
  AND (
    ABS(diferencia_sin_ajuste_devolucion - reversion_registrada) > 0.01
    OR saldo_pendiente < 0
    OR total_credito < 0
    OR monto_revertido < 0
    OR (estado = 'PAGADA' AND COALESCE(saldo_pendiente, 0) > 0.01)
    OR (estado IN ('PENDIENTE', 'PARCIAL') AND COALESCE(saldo_pendiente, 0) <= 0)
  )
ORDER BY ABS(diferencia_sin_ajuste_devolucion - reversion_registrada) DESC,
         cuenta_actualizada DESC, cuenta_cobrar_id;

-- Interpretación: revisar cada resultado junto con el comprobante y la devolución.
-- Esta consulta no prueba por sí sola el origen de una diferencia ni autoriza
-- correcciones automáticas. Un resultado vacío solo cubre filas visibles por RLS.
