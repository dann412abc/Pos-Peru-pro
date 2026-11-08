# Mi Carrito POS 1.44.76 — Auditoría de caja y preparación sin VPS

## Alcance

- Añade diagnóstico de solo lectura de la estructura real de caja, cobros y devoluciones.
- Mantiene diferida cualquier migración de conciliación de reembolsos hasta contrastar el esquema Supabase real.
- Unifica metadatos de versión en frontend, backend y lockfiles en `1.44.76`.
- Corrige el manifiesto JSON del backend para que pueda parsearse.
- Documenta la arquitectura objetivo Cloudflare + Supabase sin VPS y las brechas que todavía impiden declarar la migración completa.
- Corrige la sintaxis del diagnóstico SQL de solo lectura y añade una prueba de regresión.

## Verificación disponible

- 156 pruebas estáticas SQL/migración aprobadas y 2 pruebas de staging omitidas por requerir entorno de prueba y autorización.
- 66 pruebas de contrato de Cloudflare Pages Functions aprobadas.
- 3 pruebas del proxy heredado aprobadas.
- No se completaron la instalación completa de dependencias, compilación Vite/NestJS ni suites Vitest/Jest en este entorno.

## Limitaciones conocidas

Esta entrega todavía no es la versión final completa sin VPS. Persisten endpoints y trabajos que dependen del backend NestJS/Redis, el registro final de ventas Supabase permanece bloqueado hasta instalar y validar la RPC transaccional, y el registro final de devoluciones requiere completar su migración. No habilitar emisión tributaria real: el OSE continúa simulado.

## Seguridad

Se ejecutaron consultas de catálogo y diagnóstico en Supabase real en modo de solo lectura. No se ejecutaron migraciones ni se modificaron datos, esquema, permisos, Auth o historial de migraciones. No configurar `API_ORIGIN` ni `POS_API_ORIGIN` en un entorno destinado a operar sin VPS.
