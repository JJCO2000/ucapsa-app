# SQL / Supabase

Esta carpeta debe guardar el SQL real aplicado en Supabase.

No se deben guardar llaves privadas ni service_role.

## Debe incluirse aquí

- Tablas
- Enums
- Funciones RPC
- Triggers
- RLS
- Policies
- Índices importantes
- Datos seed mínimos, si aplica

## Estado actual

Pendiente pegar/exportar el SQL exacto aplicado en el proyecto de Supabase.

El frontend asume estas tablas principales:

- profiles
- memberships
- announcements
- events
- payments
- admin_audit_logs

Antes de producción, confirmar que RLS esté activo en tablas públicas y que admin/client/member estén protegidos desde la base de datos.
