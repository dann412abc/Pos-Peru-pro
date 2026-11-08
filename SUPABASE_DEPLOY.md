# Despliegue con Supabase y Cloudflare

Esta guía describe el runtime Node actual: Supabase administra PostgreSQL y NestJS + Redis/Bull se ejecutan en contenedores en un servidor persistente. Desde v1.9.0 se recomienda publicar el frontend por Cloudflare Pages (ver `CLOUDFLARE_PAGES.md`) y exponer la API por Cloudflare Tunnel en un subdominio separado. El navegador se comunica con `/api` mediante Pages Functions; las credenciales de base de datos nunca se incluyen en el frontend.

## Requisitos

- Proyecto Supabase creado.
- Un servidor con Docker Engine y Docker Compose plugin para ejecutar NestJS y Redis.
- Dominio en Cloudflare y un túnel activo.

## Obtener conexión de Supabase

1. En el panel Supabase abre **Connect** y copia host, puerto, base de datos y usuario del endpoint PostgreSQL.
2. Usa la conexión directa para un servidor persistente con conectividad IPv6; si el servidor solo tiene IPv4, elige **Session pooler**. No uses el pooler en modo transacción con el backend NestJS/TypeORM.
3. Conserva SSL habilitado. Las migraciones usan estas mismas variables y necesitan poder ejecutar operaciones DDL.
4. Antes de migrar una base existente, crea un respaldo y revisa que sea posible restaurarlo.

La disponibilidad IPv6/IPv4 depende del endpoint y de la configuración del proyecto; consulta [métodos de conexión de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Configuración y arranque

1. Copia `.env.supabase.example` como `.env` en el servidor.
2. Completa `APP_ORIGIN`, `TUNNEL_TOKEN` y los campos `DB_*` con los datos del panel. Cambia ambos secretos JWT por cadenas aleatorias distintas de al menos 32 caracteres. No subas `.env` a Git ni lo compartas.
3. En el túnel de Cloudflare crea una ruta pública para el subdominio de API hacia `http://backend:3000`. El frontend se publica separadamente en Cloudflare Pages.
4. Desde la carpeta del proyecto, construye e inicia servicios:

```bash
docker compose --env-file .env -f docker-compose.supabase.yml up -d --build redis backend frontend cloudflared
```

5. Tras confirmar respaldo y conectividad, ejecuta las migraciones una vez:

```bash
docker compose --env-file .env -f docker-compose.supabase.yml --profile ops run --rm migrate
```

6. Comprueba `https://tu-dominio/api/health`; debe responder con `"baseDeDatos":"ok"`. Prueba inicio de sesión, permisos y creación de una venta con datos de prueba antes de usarlo en operación.

No ejecutes `seed` en producción: crea usuarios y datos demo. La emisión OSE/SUNAT sigue en modo mock hasta configurar credenciales reales y validar el flujo con el proveedor.

## Límites de esta arquitectura

- Supabase administra PostgreSQL, pero no ejecuta esta API NestJS ni Redis. Hace falta un servidor/servicio para esos contenedores. La interfaz se publica en Cloudflare Pages siguiendo `CLOUDFLARE_PAGES.md`.
- Archivos XML/CDR quedan en el volumen `fedata` del servidor, no en Supabase Storage. Debe respaldarse fuera del servidor; luego se puede migrar a almacenamiento de objetos.
- Planifica exportaciones/restauraciones de la base según el plan Supabase y la importancia de los datos.
