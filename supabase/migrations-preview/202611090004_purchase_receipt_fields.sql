-- PREVIEW ONLY — campos persistentes requeridos por la recepción atómica de compras.
-- Aplicar únicamente en staging después de revisar las migraciones 002 y 003.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.compra') IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_RECEIPT_PREREQUISITES_MISSING: falta public.compra';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='compra'
      AND indexname='uq_compra_empresa_idempotency'
  ) THEN
    RAISE EXCEPTION 'PURCHASE_IDEMPOTENCY_INDEX_MISSING: falta uq_compra_empresa_idempotency';
  END IF;
END
$guard$;

-- El formulario ya captura vencimiento para compras al crédito, pero el esquema
-- remoto no lo persistía. NULL significa contado o crédito histórico sin fecha.
ALTER TABLE public.compra
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS payload_hash varchar(32);

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ck_compra_fecha_vencimiento'
      AND conrelid='public.compra'::regclass
  ) THEN
    ALTER TABLE public.compra
      ADD CONSTRAINT ck_compra_fecha_vencimiento
      CHECK (
        (condicion_pago='CONTADO' AND fecha_vencimiento IS NULL)
        OR
        (condicion_pago='CREDITO' AND
          (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_documento))
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ck_compra_payload_hash'
      AND conrelid='public.compra'::regclass
  ) THEN
    ALTER TABLE public.compra
      ADD CONSTRAINT ck_compra_payload_hash
      CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{32}$');
  END IF;
END
$checks$;

COMMENT ON COLUMN public.compra.fecha_vencimiento IS
  'Fecha pactada de pago para compras al crédito; NULL en contado.';
COMMENT ON COLUMN public.compra.payload_hash IS
  'MD5 del JSONB normalizado recibido; permite detectar reutilización de clave idempotente con otro payload.';

COMMIT;
