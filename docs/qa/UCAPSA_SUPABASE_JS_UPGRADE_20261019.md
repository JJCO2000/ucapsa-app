# UCAPSA — actualización de Supabase JS

- Alcance: actualizar `@supabase/supabase-js` de 2.108.2 a 2.117.3 manteniendo la estructura actual de sesión y permisos.
- Fuentes de verdad: `profiles`, RLS, Auth de Supabase y flujos originales de UCAPSA.
- La comparación incluye el portal web integrado en `main` por el PR #402, el inicio por correo o teléfono asociado y las preinscripciones.
- No se modifican tablas, migraciones, funciones Edge ni datos en producción por esta actualización.
- Validaciones requeridas antes de fusionar: CI actual (`verify:release`), CodeQL, exportación Android e iOS, y controles de separación de roles.
- La publicación web y las pruebas manuales de inicio de sesión se verifican por separado.
