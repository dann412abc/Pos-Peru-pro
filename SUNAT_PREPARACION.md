# Preparación para SUNAT / OSE — no habilitada para emisión real

Estado de v1.9.0: **preparación técnica; emisión real deshabilitada**.

El proyecto ya contiene un generador UBL 2.1, tipos de documento, referencias, cola de envío y una interfaz OSE, pero el adaptador disponible es MOCK. La existencia de XML generado no demuestra conformidad tributaria ni autorización de emisión.

## Requisitos pendientes antes de activar producción

- Seleccionar proveedor OSE/PSE y formalizar credenciales/contrato.
- Implementar firma digital real con certificado vigente y custodia de clave privada fuera del repositorio.
- Validar XML contra los XSD/UBL y reglas de negocio vigentes de SUNAT.
- Validar catálogos, series, correlativos, impuestos, descuentos, anticipos y redondeos con casos de Perú.
- Implementar y probar envío, consulta de ticket, CDR aceptado/rechazado, reintentos idempotentes y contingencia.
- Completar comunicación de baja y resumen diario cuando corresponda; no sustituirlos por anulaciones internas.
- Persistir XML firmado, CDR y trazabilidad en almacenamiento durable con control de acceso y retención.
- Probar boleta, factura, notas de crédito y débito con el proveedor en homologación/sandbox.
- Obtener revisión contable/tributaria antes de emitir comprobantes reales.

## Reglas de seguridad

- Mantener `OSE_MOCK=true` mientras no se haya completado la homologación.
- No introducir certificados, contraseñas, tokens ni claves privadas en el frontend, Git o ZIP.
- No marcar una venta como tributariamente aceptada hasta guardar una respuesta verificable del proveedor/CDR.
- Separar el estado comercial de la venta del estado de envío tributario.
- La operación sin conexión no autoriza a inventar correlativos ni CDR.

## Estado que debe mostrarse al operador

`Pendiente de envío`, `En proceso`, `Aceptado`, `Rechazado` o `Error de comunicación`, con acceso a detalle y reintento controlado. Un comprobante MOCK debe identificarse explícitamente como demostración y nunca presentarse como comprobante electrónico válido.
