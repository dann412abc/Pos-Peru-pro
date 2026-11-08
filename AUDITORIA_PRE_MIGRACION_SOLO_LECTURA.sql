-- Mi Carrito POS v1.9.0
-- AUDITORÍA PREVIA: SOLO LECTURA. No crea, altera ni elimina objetos.
-- Ejecutar únicamente cuando el usuario autorice la revisión del esquema.
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- Detecta tablas de control de migraciones sin asumir un nombre específico.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
  and table_name ilike '%migration%'
order by table_name;
