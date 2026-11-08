# Mi Carrito POS 1.44.71

## Diagnóstico real de esquema para devoluciones

- Incorpora `supabase/diagnosticos/20261107_devoluciones_esquema_solo_lectura.sql`.
- Consulta tablas y columnas, tipos, nulabilidad, defaults, precisión decimal, constraints, claves foráneas, índices y políticas RLS.
- Es un SELECT de catálogo: no modifica el esquema ni los datos.
- Permite contrastar el esquema real del proyecto Supabase antes de construir el RPC de commit.
- No activa el registro de devoluciones.

