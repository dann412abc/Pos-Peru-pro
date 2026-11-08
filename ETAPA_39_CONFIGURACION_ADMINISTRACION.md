# Etapa 39 — Configuración y administración

- Los datos fiscales y comerciales de la empresa activa se cargan desde el backend y pueden actualizarse con `PATCH /api/empresas/actual` (solo ADMIN).
- La pantalla conserva una copia offline y sincroniza los datos empresariales cuando el servidor está disponible.
- Se incorpora el campo Ubigeo de seis dígitos (validación de formato, no consulta del directorio oficial).
- Los secretos de correo, WhatsApp y cron permanecen exclusivamente en el backend; no se muestran ni se almacenan en el frontend.
- Gestión de usuarios desde Configuración: alta de usuarios ADMIN/CAJERO, asignación de sucursales, edición de nombre/rol, activación/desactivación y restablecimiento de contraseña.
- La API valida que las sucursales pertenezcan a la empresa autenticada, guarda contraseñas con bcrypt, no devuelve hashes ni UUID de Supabase y protege contra la desactivación del último administrador o la auto-desactivación del administrador conectado.
- Los usuarios se desactivan en lugar de eliminarse para conservar trazabilidad.

**Límite:** el RUC se valida por formato/prefijo y el Ubigeo por longitud; no se consulta el padrón ni los servicios oficiales de SUNAT/INEI. La configuración de un proveedor tributario real permanece pendiente.
