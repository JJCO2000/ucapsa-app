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

## Vinculación automática aprobada: correo o teléfono

La meta es **cero fusiones manuales en casos inequívocos**. Vincular registros provisionales a una cuenta Auth verificada es distinto de fusionar 2 cuentas de Auth ya existentes; esta última operación queda fuera de alcance y nunca es automática.

### Algoritmo server-side
1. Auth identifica un `user_id` canónico. La base consulta la verificación real de Auth, no `profiles.email` ni `user_metadata` enviados por el cliente.
2. Normalizar el correo según política establecida (trim, dominio case-insensitive y política explícita del local-part). Para teléfonos usar E.164, país y validación de número; no cortar arbitrariamente a 10 dígitos.
3. Buscar las personas provisionales no vinculadas que coincidan con **correo verificado O teléfono confirmado por OTP**; descartar candidatos ambiguos por duplicados entre perfiles, personas provisionales, cuentas Auth o contactos compartidos.
4. Si ambos contactos están disponibles y apuntan a personas provisionales diferentes, **bloquear** y auditar conflicto. Si un contacto coincide, pero el otro está registrado en una identidad distinta/verificada o contradice la ficha, **bloquear**; no resolver por nombre.
5. Si hay **exactamente una persona provisional** compatible y libre, enlazar su expediente y todos sus perros asociados a `auth.uid()` en **una sola transacción**, usando claves de vinculación únicas; no crear usuario Auth adicional ni crear un segundo perfil.
6. Reintentos concurrentes con la misma identidad regresan la misma vinculación; si la persona ya está vinculada a otro `user_id`, no sobrescribirla. Registro de actor/motivo/contacto verificado y sin registrar tokens/OTP.
7. Si no hay coincidencia, crear el usuario normalmente sin expediente histórico. Si existe conflicto, encolar revisión excepcional sin exposición de datos privados.

### Matriz de decisión
| Señal | Acción |
| --- | --- |
| Un solo correo confirmado coincide, ningún otro contacto contradice y no hay vínculos | Automático |
| Un solo teléfono confirmado mediante OTP coincide, no se comparte, no hay correo contradictorio y no hay vínculos | Automático |
| Correo y teléfono confirmados coinciden con la misma persona provisional | Automático |
| Varios provisionales con mismo correo/teléfono | Consolidación de importación por clave de fuente solo cuando es inequívoca; de otro modo excepción |
| Correo coincide con A y teléfono con B | Bloquear; nunca elegir al azar |
| Solo nombre, perro del mismo nombre o teléfono sin OTP | No vincular automáticamente |
| Dos cuentas Auth canónicas existentes | **Nunca fusionar automáticamente** |
| Usuario o provisional ya vinculado a otro | Bloquear, auditar |
| El número pasó a otro titular | Verificación reforzada/segundo factor; nunca asumir propiedad histórica |

**Privacidad:** antes de enlazar, el cliente no puede leer el expediente provisional completo. La correspondencia debe ocurrir por servidor y su respuesta no debe exponer si existe una persona concreta.

### Pruebas automáticas adicionales
- Correo único verificado, teléfono único con OTP y dos contactos coincidentes: 3 enlaces deterministas.
- Teléfono compartido, correo no verificado, contactos contradictorios, usuario ya vinculado, dos candidatos con mismo correo: 0 enlaces indebidos.
- Mismo cliente con 3 filas Excel de 3 perros: 1 ficha provisional de persona y 3 perros, no 3 personas.
- Cambio de correo/teléfono o revocación de verificación y reintento posterior: no reclamar datos de otra cuenta.
- Concurrencia: transacción + índices únicos y auditoría sin cambios parciales. Testing pgTAP de ramas autorizadas y denegadas.
- Comparar números agregados antes y después de cualquier despliegue (nunca modificar datos reales en una prueba).

## Flujo propuesto
1. Superadmin añade persona/perros manualmente o importa Excel → **previsualización**, sin persistir todavía en Auth/profiles/dogs.
2. Normalización de email (trim/lower), teléfono en formato coherente y nombres (sin inferir identidad), validación por fila y por lote.
3. Reconciliación automática: correo verificado o teléfono confirmado por OTP cuando la coincidencia sea única, sin contradicciones ni vínculos existentes; si hay múltiples coincidencias, se eleva únicamente el caso excepcional.
4. Persistir importación con idempotency key de lote y clave de fila: reintentar la misma importación no genera registros adicionales. UNIQUE en BD protege concurrencia.
5. El cliente crea/verifica su cuenta Auth. Un RPC servidor identifica automáticamente una persona provisional de forma inequívoca usando correo verificado o teléfono con OTP; la vincula y crea `dogs` reales **dentro de una transacción** con autorización y restricciones únicas. No hay botón de fusión manual para el caso normal.
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

- Supabase Phone Auth (riesgo de reciclaje de números): https://supabase.com/docs/guides/auth/passwords
- OWASP Email Verification: https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
