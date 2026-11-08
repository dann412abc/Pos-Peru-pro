# Auditoría exhaustiva previa a producción — Mi Carrito POS 1.43.1

**Alcance:** revisión estática del ZIP 1.43.0 y correcciones de defectos identificados. No se conectó a Supabase, no se ejecutaron migraciones y no se desplegó Cloudflare.

## Correcciones aplicadas en 1.43.1

1. **RUC peruano:** frontend y backend validan ahora longitud, prefijo permitido y dígito verificador módulo 11. Se actualizaron pruebas y datos demostrativos para usar ejemplos con checksum correcto. Esta validación estructural no sustituye la consulta de vigencia/estado del RUC en SUNAT.
2. **Configuración local de empresa:** IndexedDB conserva una sola configuración activa. La escritura limpia la clave anterior y guarda la nueva dentro de una transacción, evitando que un cambio de RUC o de empresa deje datos antiguos que luego aparezcan como configuración vigente.
3. **Estado de resultados y devoluciones:** se excluye del estado de resultados la nota de crédito que ya está vinculada a una devolución registrada, porque el importe de esa devolución ya se descuenta de las líneas de la venta original. Esto evita duplicar el descuento.
4. **Rentabilidad por producto:** el cálculo se limita a boletas y facturas de venta; las devoluciones se descuentan usando sus líneas registradas y las notas no se contabilizan como ventas positivas.
5. **Health endpoint:** cuando PostgreSQL falla responde HTTP 503 y estado `degraded`, sin exponer el mensaje interno del driver, host o detalles de conexión.
6. **Envío de comprobantes:** el endpoint de correo del frontend usaba una ruta incompatible con el backend y podía encolar errores 404 como si fueran fallos de conexión. Se corrigió la ruta a `/api/fe/comprobantes/:id/enviar-email`, se procesa la cola offline por ID de servidor y los errores de entrega inciertos pasan a revisión manual para evitar duplicados. Email/WhatsApp backend ahora exigen aceptación real; el correo también exige un generador PDF no provisional.
7. **Instalación de dependencias:** los `package-lock.json` apuntan al registro oficial `registry.npmjs.org` en lugar del espejo `registry.npmmirror.com`.

## Resultados verificables en este entorno

- ZIP original 1.43.0: integridad comprobada antes de editar.
- Pruebas automatizadas del proxy de Cloudflare Pages: **3/3 aprobadas** con `node --test`.
- Análisis sintáctico TypeScript/TSX: **230 archivos, 0 diagnósticos sintácticos** mediante `transpileModule`.
- Fixtures del dígito verificador RUC: **7 válidos y 4 inválidos, 0 fallos** en comprobación aislada.
- La secuencia de migraciones contiene **23 archivos**. No existe el archivo `1710000000019`; no se encontraron referencias a ese identificador en el código ni dependencia explícita de esa migración. El salto debe contrastarse con el historial real de cada base de datos antes de migrar.
- `npm ci` no pudo completarse: el modo offline no tenía paquetes en caché y el intento contra el registro oficial agotó el tiempo de ejecución. Por ello no se pudo ejecutar el build completo ni las suites Jest/Vitest.

## Bloqueadores que siguen abiertos (no afirmar producción lista)

### 1. Supabase Auth y RLS

- El login actual sigue usando `usuario.password_hash` + bcrypt y JWT propios del backend. `supabase_auth_user_id` es un vínculo opcional; no equivale a validar sesiones de Supabase Auth.
- No se encontraron `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` ni políticas RLS en las migraciones incluidas. La separación multiempresa/sucursal se aplica actualmente en guards y consultas del backend.
- Antes de producción hay que decidir si se mantiene el backend como única frontera de acceso o si se implementa RLS real con un rol de base de datos restringido y contexto de tenant por petición. No exponer tablas directamente a clientes `anon`/`authenticated` mientras no exista esa política.

### 2. SUNAT y comprobantes

- `FeModule` registra `MockNubefactAdapter`; no existe un adaptador OSE/PSE real en este ZIP. `OSE_MOCK=false` se rechaza expresamente.
- La firma digital es simulada. No emitir legalmente boletas/facturas desde esta versión.
- El generador PDF registrado es `StubPdfService`: genera una hoja informativa mínima, no una representación impresa completa del comprobante. Debe sustituirse antes de adjuntar PDFs reales a clientes.
- La validación del RUC comprueba formato y checksum, no consulta el padrón SUNAT.

### 3. Infraestructura

- Cloudflare Pages sirve el frontend y el Worker ejecuta el cron, pero el Worker llama a una API NestJS externa.
- NestJS usa Bull/Redis y guarda XML FE en `FE_XML_DIR`. Se necesita backend Node persistente, Redis y almacenamiento persistente/respaldado para XML/CDR. Cloudflare Pages por sí solo no ejecuta estos servicios.
- Configurar `CORS_ORIGIN` con el dominio de Pages, `API_ORIGIN` en Pages y `POS_API_ORIGIN` + `CRON_SECRET` en el Worker. Mantener secretos fuera del frontend.

### 4. Migraciones y validación real

- No ejecutar el lote de migraciones directamente en producción. Comparar primero la tabla `migrations` de la base existente con los 23 archivos, confirmar la ausencia o historia de la 0019 y probar la cadena completa en staging restaurado desde un respaldo.
- Revisar los `down()` antes de usarlos: algunas migraciones bloquean la reversión si hay datos, otras eliminan tablas. No usar `migration:revert` como mecanismo de reparación de producción.
- Siguen pendientes `npm ci`, `npm run build`, Jest, Vitest, pruebas contra PostgreSQL real, pruebas de flujos concurrentes, E2E PC/Android, backup/restore y prueba de desconexión de red.

## Dictamen

**1.43.1 es un parche de corrección y una candidata para continuar la estabilización; no es una liberación de producción.** No se ha probado contra tu base Supabase ni contra SUNAT real. Las migraciones permanecen intactas y sin ejecutar.
