# Etapa 40 — Integración y contratos de flujo

- Se centralizó en una función de backend la construcción de alertas que antes dependía exclusivamente del navegador.
- Se añadieron pruebas unitarias del clasificador de alertas (niveles, ausencia de falsos positivos y claves válidas).
- Los canales de comunicación exponen estado sin secretos y pruebas manuales protegidas.
- La configuración de empresa ya dispone de lectura/escritura contra el tenant autenticado.
- Se añadieron contratos de administración de usuarios, validación multiempresa de sucursales y pruebas de protección del último ADMIN.
- Las alertas de stock/lotes guardan la sucursal y usan claves independientes para no colisionar entre locales con nombres iguales.

**Pendiente de aceptación integral:** ejecutar instalación en una base de prueba con todas las migraciones, probar concurrencia y validar flujos completos de caja/ventas/devoluciones con datos reales anonimizados.
