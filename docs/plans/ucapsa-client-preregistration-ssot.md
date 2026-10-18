# UCAPSA — Preinscripción segura de personas y perros
Fecha: 18-10-2026. **Diseño para revisión: sin migraciones, no se han creado usuarios ni alterado datos de producción.**

## Tres principios permanentes
1. Arquitectura: Administración → Clientes → Preinscripciones → Ficha → Vincular.
2. Simplicidad: una acción principal en cada estado; no duplicar el gestor de Usuarios, perfiles o permisos.
3. SSOT: Auth identifica credenciales; profiles guarda un único rol vigente; dogs y perfiles efectivos son canónicos **después** de vincular. La bandeja temporal no concede rol, membresía, inscripción ni pago.

## Diagnóstico productivo (solo lectura)
- profiles.user_id y dogs.user_id referencian auth.users; dogs.user_id no admite nulos.
- 18 perfiles, 18 con email, **0 grupos de email normalizado repetido** (solo comprobación del campo profiles).
- 8 perros, 0 sin relación de perfil, 0 grupos de nombres normalizados repetidos por tutor.
- Existe índice UNIQUE para `dogs(user_id, lower(btrim(name))) WHERE is_active=true`. No impide un mismo nombre en distintos tutores. La existencia de ese índice no prueba identidad del animal; si hubiera dos perros con el mismo nombre bajo un mismo tutor requieren revisión del modelo.
- NO se consultaron ni mostraron datos personales de los registros.

## Modelo mínimo de preparación
- Entidades temporales: lote de importación, filas originales, persona provisional, perro provisional y bitácora.
- Cada provisional tiene UUID estable, `source_batch_id`, `source_row_number`, referencia documental, `status` (pending / linked / rejected), `linked_user_id` NULL hasta validación y `linked_dog_id` NULL hasta validación. Nombre/email/teléfono por separado y bajo acceso privado.
- Se debe verificar y cerrar el ciclo de vida del provisional cuando se vincule, sin copiar el expediente a una segunda ficha permanente.
- Canonical: una cuenta `auth.users.id` → una fila `profiles.user_id`; perros reales continúan en `dogs.id`. Los vínculos no deben crear nuevas identidades de Auth para filas importadas.
- No crear fichas oficiales de perros antes de poder relacionarlas de forma segura con una identidad válida; las visitas/inscripciones de un provisional necesitan diseño independiente antes de ofrecerse en UI.

## Flujo propuesto
1. Superadmin añade persona/perros manualmente o importa Excel → **previsualización**, sin persistir todavía en Auth/profiles/dogs.
2. Normalización de email (trim/lower), teléfono en formato coherente y nombres (sin inferir identidad), validación por fila y por lote.
3. Reconciliación: coincidencia fuerte con identificador propio validado o correo realmente verificado → revisión de vínculo; coincidencia débil (nombres/teléfonos/perro llamado igual) **NO** fusiona automáticamente.
4. Persistir importación con idempotency key de lote y clave de fila: reintentar la misma importación no genera registros adicionales. UNIQUE en BD protege concurrencia.
5. El cliente crea/verifica su cuenta Auth. Un RPC privilegiado con comprobación en servidor valida posesión de cuenta, autorización del usuario/administración y vincula el provisional; crea `dogs` reales **dentro de una transacción** sin duplicados.
6. Mantener trazabilidad: actor, origen, momento, ID provisional y canónico, motivo de vinculación, resultados y, si procede, reversión supervisada sin eliminación destructiva del historial.

## Seguridad y privilegios
- RLS activa en tablas de staging de esquema expuesto, sin lecturas directas de clientes. Grants mínimos y las operaciones complejas mediante RPC con comprobación explícita del actor.
- No usar service_role en móvil; no validar acceso solo en UI ni confiar en user_metadata como credencial de permisos.
- Nunca enlazar por correo no verificado. Supabase Auth identity linking (OAuth) **no** equivale a vincular ficha administrativa.
- Clientes no pueden reclamar fichas de otras personas. Admin/Entrenador no deben poder cambiar identidades reservadas para Superadmin.
- Enlaces de invitación expiran y son de un solo uso; no incluir datos sensibles en tokens/URLs/archivos descargados.
- No se eliminan perros ya vinculados, pagos, membresías, historial ni inscripciones por resolver duplicados.

## Pruebas obligatorias de aceptación (bloqueantes)
**Identidad / duplicados**
- 2 importaciones idénticas y 2 administradores importando a la vez → 1 provisional por misma clave de origen.
- Mismo nombre/apellido + diferente persona → no fusionar.
- Mismo email no verificado → no reclamar cuenta.
- Mismo email verificado con formato/case diferente → detectar y pedir vinculación apropiada.
- 2 perros con el mismo nombre entre tutores → 2 perros separados.
- Un perro con mismo nombre dentro del mismo tutor → revisión explícita, no renombrar automáticamente.
- Reintentar vínculo confirmado → misma cuenta/perros (operación idempotente).
- Fallo a mitad de transferencia → rollback completo sin duplicados ni relación parcialmente escrita.

**Integridad/seguridad**
- Comprobar permisos cliente/socio/entrenador/admin/superadmin para read/create/link/reject/export.
- Ceros cambios en históricos de membresía, pagos, exámenes, asistencia, ranking y Comandos.
- Tests RLS de permisos permitidos y prohibidos con pgTAP; tests de integración con usuarios **sintéticos** en entorno aislado.
- Verificaciones en CI de cada PR: estructura, UNIQUE/FK/RLS, concurrencia, idempotencia, permisos, regresión de operaciones.
- Dashboard de conteos **sin PII**: candidatos a duplicado, importados, vinculados, rechazados, conflictos, fallos de rollback.
- Revisión solo lectura periódica de anomalías; jamás limpiar/ajustar duplicados automáticamente.

## Despliegue y rollback
- PR1: esquema temporal versionado + índices/constraints/RLS + tests; **no datos reales**.
- PR2: importar, previsualizar y reconciliar Excel. Límites de tamaño y validación de origen.
- PR3: invitación y reclamación verificada; RPC transaccional + traza y protección anti-replay.
- PR4: pruebas E2E, casos negativos y regresión operativa.
- La promoción a producción queda prohibida si hay permisos indebidos, duplicados nuevos, pérdida de datos, migración irreversible o CI fallido.

## Referencias estudiadas
- Supabase user data: https://supabase.com/docs/guides/auth/managing-user-data
- Supabase identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase test db + pgTAP: https://supabase.com/docs/guides/local-development/testing/overview
- Supabase import data: https://supabase.com/docs/guides/database/import-data
- PostgreSQL constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- PostgreSQL ON CONFLICT: https://www.postgresql.org/docs/current/sql-insert.html
- Video tutorial avanzado Supabase RLS: https://www.youtube.com/watch?v=PdEutzhsrws
- Ejemplo pruebas DB en GitHub: https://github.com/usebasejump/basejump/tree/main/supabase/tests/database
