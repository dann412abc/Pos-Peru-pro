# Mi Carrito POS v1.44.11

## Endurecimiento de la API de Clientes y Proveedores
- La ruta `POST /api/edge/parties/mutate` ahora limita el cuerpo JSON serializado a 32 KB.
- Los fallos de conexión con Supabase se responden con HTTP 502 y un mensaje controlado, sin propagar una excepción de red no gestionada.
- Se agregaron pruebas automatizadas de autenticación Bearer, lista permitida de acciones, límite de tamaño y fallo de red.
- Se documentó el estado real de la migración Supabase + Cloudflare y los módulos que aún requieren NestJS.

## Validación realizada
- 4 pruebas Node.js: aprobadas.
- `node --check` en la función Edge y en el archivo de pruebas: aprobado.
- Transpilación TypeScript/JSX de Clientes, Compras y servicios Supabase: sin diagnósticos.
- No se ejecutó el build integral porque el ZIP no incluye `node_modules` y no se realizó instalación de dependencias.
- No se ejecutaron migraciones SQL, no se modificó Supabase remoto y no se desplegó Cloudflare.
