-- AYNI / POS Perú — conciliación de saldos de crédito por cliente.
-- SOLO LECTURA: no crea funciones, no cambia datos ni altera políticas RLS.
-- Ejecutar desde una sesión autenticada de la aplicación (rol authenticated,
-- con JWT del usuario POS). No usar service_role ni el rol postgres para
-- validar visibilidad RLS. La consulta respeta RLS de cliente y cuenta_cobrar.

WITH cuentas AS (
  SELECT
    cc.empresa_id,
    cc.cliente_id,
    COUNT(*) FILTER (WHERE COALESCE(cc.saldo_pendiente, 0) > 0) AS cuentas_con_saldo,
    COUNT(*) FILTER (WHERE COALESCE(cc.saldo_pendiente, 0) > 0
                     AND COALESCE(cc.estado, '') NOT IN ('ANULADA', 'PAGADA')) AS cuentas_activas_con_saldo,
    ROUND(COALESCE(SUM(GREATEST(COALESCE(cc.saldo_pendiente, 0), 0))
      FILTER (WHERE COALESCE(cc.estado, '') NOT IN ('ANULADA', 'PAGADA')), 0), 2) AS suma_saldos_cuentas,
    ROUND(COALESCE(SUM(GREATEST(COALESCE(cc.monto_revertido, 0), 0)), 0), 2) AS total_revertido_registrado,
    MAX(cc.updated_at) AS ultima_actualizacion_cuenta,
    STRING_AGG(DISTINCT COALESCE(cc.estado, '(SIN ESTADO)'), ', ' ORDER BY COALESCE(cc.estado, '(SIN ESTADO)')) AS estados_encontrados
  FROM public.cuenta_cobrar cc
  GROUP BY cc.empresa_id, cc.cliente_id
), base AS (
  SELECT
    cl.empresa_id,
    cl.id AS cliente_id,
    cl.tipo_doc,
    cl.numero,
    cl.nombre,
    ROUND(COALESCE(cl.saldo_credito, 0), 2) AS saldo_credito_cliente,
    COALESCE(c.cuentas_con_saldo, 0) AS cuentas_con_saldo,
    COALESCE(c.cuentas_activas_con_saldo, 0) AS cuentas_activas_con_saldo,
    COALESCE(c.suma_saldos_cuentas, 0)::numeric(14,2) AS suma_saldos_cuentas,
    COALESCE(c.total_revertido_registrado, 0)::numeric(14,2) AS total_revertido_registrado,
    c.ultima_actualizacion_cuenta,
    c.estados_encontrados,
    ROUND(COALESCE(cl.saldo_credito, 0) - COALESCE(c.suma_saldos_cuentas, 0), 2) AS diferencia
  FROM public.cliente cl
  LEFT JOIN cuentas c
    ON c.empresa_id = cl.empresa_id
   AND c.cliente_id = cl.id
)
SELECT
  empresa_id,
  cliente_id,
  tipo_doc,
  numero,
  nombre,
  saldo_credito_cliente,
  suma_saldos_cuentas,
  diferencia,
  cuentas_con_saldo,
  cuentas_activas_con_saldo,
  total_revertido_registrado,
  estados_encontrados,
  ultima_actualizacion_cuenta,
  CASE
    WHEN ABS(diferencia) <= 0.01 THEN 'CUADRADO'
    WHEN diferencia > 0 THEN 'SALDO_CLIENTE_MAYOR'
    ELSE 'CUENTAS_POR_COBRAR_MAYORES'
  END AS diagnostico
FROM base
WHERE ABS(diferencia) > 0.01
   OR saldo_credito_cliente < 0
   OR suma_saldos_cuentas < 0
ORDER BY ABS(diferencia) DESC, nombre, cliente_id;

-- Control independiente: si la consulta anterior no devuelve filas, eso solo
-- significa que no se detectaron diferencias visibles para este usuario.
-- No demuestra que RLS permita ver todas las sucursales o todos los clientes.
