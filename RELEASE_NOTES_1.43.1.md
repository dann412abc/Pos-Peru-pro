# Mi Carrito POS 1.43.1 — Correcciones de auditoría

- Validación RUC con dígito verificador módulo 11 en frontend y backend.
- Limpieza transaccional de la configuración de empresa en IndexedDB para evitar registros antiguos.
- Corrección del doble descuento de notas de crédito vinculadas a devoluciones en el estado de resultados.
- Corrección del filtro de documentos usados en rentabilidad por producto.
- Se corrigió el envío por correo: ruta backend correcta, cola offline por ID de servidor y revisión manual de fallos ambiguos.
- Los envíos de email/WhatsApp se bloquean si el comprobante solo tiene aceptación simulada; el correo también espera un PDF completo.
- Health endpoint responde 503/degraded sin filtrar mensajes internos de PostgreSQL.
- Lockfiles actualizados al registro oficial npm.
- Informe exhaustivo: `AUDITORIA_CORRECCIONES_1.43.1.md`.

No se ejecutaron migraciones, no se modificó Supabase y no se desplegó Cloudflare. El build completo y las suites de pruebas requieren una instalación limpia de dependencias que no pudo completarse en este entorno.
