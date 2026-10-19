# UCAPSA — Auditoría contra solicitudes confirmadas (18-oct-2026)

**Fuente de control:** solicitudes del proyecto, código `main`, funciones/constraints de Supabase (solo lectura), PRs 349–353. **No se han realizado cambios en producción.**

## Reglas invariantes
1. Arquitectura primero: Administración → Clientes → Ficha → Acciones; Entrenador → Hoy/Mañana → Horario → Roster.
2. Una acción principal por pantalla, accesos directos sin duplicación.
3. SSOT en Auth/profiles, membresía, perro, programa, pago y evidencia de asistencia; no inventar pagos ni fechas.
4. Seguridad por roles verificada en servidor, historial reversible, regression tests y multiplataforma (Android/iOS/web).
5. Comandos = **un solo horario** con niveles `principiante`, `medio`, `avanzado`; no separar horarios por nivel.
6. Socio ≠ Comandos. La concesión de membresía no acredita pago de Comandos ni viceversa.

## Matriz (hecho significa comprobado en main o probado en PR; no equivale a producción)

| ID | Solicitud concreta | Estado comprobado y evidencia | Acciones/dependencia |
| --- | --- | --- | --- |
| 01 | Superadmin cambia Cliente/Socio/Entrenador/Admin/Superadmin, revoca permisos anteriores | `main` limitado a Cliente/Entrenador/Admin, miembro bloqueado en `src/app/admin/users.tsx`; **PR #353 DRAFT** incluye roles, concesión Socio `not_required`, conservación historial y PG aislado | Validar sesión por rol en Android/web y probar con clon esquema completo; no fusionar hasta ello |
| 02 | Entrenador muestra clases **hoy y mañana**, incluso horarios con 0 alumnos | `main` solo mañana; **PR #352 DRAFT** incorpora los 2 días con horarios/cancelaciones/versiones | E2E móvil tras CI |
| 03 | Roster para perros preinscritos sin Auth | `main` no los lista; **PR #351 DRAFT** agrega roster provisional y asistencias registradas por entrenador, con control de vigencia y origen | Clon real DB, permisos, rollback, pruebas en teléfono |
| 04 | Admin/Superadmin preregistra tutor, perro, Puppy/Comandos y recupera ficha después de registrar correo o teléfono verificado | **PR #351 DRAFT** implementado en staging y probado sintéticamente | Completar acceso pagado a Comandos sin requerir hacerse Socio; probar OTP real; completar reclamo tardío y UI |
| 05 | Puppy con tarjeta física ya pagada y asistencias previas, algunas sin fechas | **PR #351 DRAFT** ledger fecha real + saldo sin fecha, actor y fuente; tarjeta reconocida, sin pago duplicado | Revisión/corrección post-vínculo y vigencias desconocidas, exportación contable |
| 06 | Comandos niveles Básico/Intermedio/Avanzado, mismo horario, incorporación directa por Admin tras pago externo | **main** 3 niveles y 1 horario confirmado; `program_enrollments.access_mode` solo permite `card` y `membership` | **BLOQUEANTE**: autorización operacional de Comandos separada de membresía Socio, pagada/verificada por Admin; no crear tarjeta ficticia |
| 07 | Superadmin preinscribe individualmente e importa listas Excel; no duplicar personas/perros y vínculo excepcional seleccionado | **PR #351** alta individual, índices e idempotencia sintética; **PR #350** política teórica | Importación masiva aún NO creada. Resolución manual de contactos conflictivos aún NO creada |
| 08 | Trainer crea/edita ejercicios de examen en borrador, publicados versionados | `main` permite editar ejercicios durante creación de borrador; publicación implementada | Comprobar edición de **borradores guardados** y versionado: no asumir que editar el formulario nuevo es equivalente |
| 09 | Excel exámenes por ejercicio x perro, promedio al pie, seleccionando perros | **PR #349 DRAFT** ofrece comparativo Excel | Pruebas en teléfonos e integración con permisos, no fusionado |
| 10 | Restaurante visible arriba junto a Ranking a Socios, Clientes y visitantes | `main` tenía una tarjeta secundaria; **PR #352 DRAFT** posiciona icono arriba y elimina repetición | Validar visualmente web/móvil, botones |
| 11 | Admin activa/desactiva menú del domingo, publicación real visible en Socio/Cliente | `main` permite alternar categoría/item; en BD consultada 1 categoría activa, 0 artículos disponibles | Diseñar publicación global SSOT, no confundir categoría activa con menú publicado; menú dominguero |
| 12 | Push sábado para menú del **domingo**, solo si publicado y usuario con clase dominical | No implementado. Ya existe infraestructura de tokens/preferencias/cron para recordatorios | Reusar mismo pipeline, idempotencia, consentimiento, evitar avisos duplicados. No enviar si menú no publicado |
| 13 | Cuenta nueva con membresía otorgada NO recibe “Revisa tus pagos” sin deuda real | `main` tenía fallback `legacy_membership`; **PR #352 DRAFT** solo alerta por obligación real | Auditar contra casos de deuda documentada/otorgamientos |
| 14 | Iniciar sesión por celular **o** correo y añadir opcionalmente el segundo | `main` solo correo/contraseña. En pruebas BD previas 0 cuentas con teléfono confirmado | Configurar OTP SMS de Supabase y pruebas de titularidad/reciclaje; no fusionar Auth por simple coincidencia |
| 15 | Admin vincula de manera excepcional dos fichas que resultaron ser misma persona (desplegable) | No implementado | RPC restrictivo, doble confirmación de identidad y auditoría; NO fusionar dos cuentas Auth automáticamente |
| 16 | Guardia y Protección atención por orden de llegada, no reserva de horario | Decisión operativa confirmada | No desarrollar agenda de citas para este servicio |
| 17 | PayPal | Investigación/idea, no conectada a cobro | No crear cobros automáticos hasta reconciliar manuales/webhooks; no sustituye autorización de programas |
| 18 | Panel Admin/Entrenador web de escritorio | Mismo repo Expo multiplataforma; exportación web probada en PR #351 | Arquitectura responsiva específica para productividad desktop/permissions sin segundo backend |
| 19 | Pruebas de **todos** los botones cliente/admin/entrenador, cancelaciones y publicación | Quality gates existentes; tests PG parciales PR351, UX PR352, roles PR353 | Pruebas E2E reales Android/iOS/web con usuarios sintéticos, ruta por ruta y evidencia verificable |

## Orden de control e integración
1. **PR #352:** mejoras no destructivas de Inicio: cerrar CI, probar UX y accesibilidad, validar luego merge.
2. **PR #353:** roles y membresías: CI+PostgreSQL aislado, permisos negativos y regresión de pagos/roles, comparar BD real, nunca promover Superadmin con un botón ciego.
3. **PR #351:** completar autorización explícita de acceso a Comandos sin Socio ni tarjeta ficticia, corregir inscripción histórica, copiar el esquema completo para probar, confirmar integración múltiple/carrera.
4. **PR #349:** finalizar Excel cruzado y reutilizar permisos oficiales del reporte.
5. Restaurante/global publicación + notificación sábado; solo después de comprobar pipeline push y consentimientos.
6. Auth correo/teléfono + importación Excel y vinculación excepcional; no activar un proveedor SMS sin pruebas de verificación.
7. Pruebas manuales E2E, QA transversal, rollback y recién entonces publicación.

**No confundir quality gate SUCCESS con release listo.** Toda entrada en producción requiere autorización, seguridad/RLS, no regresión, plan de reversión y validación en las tres plataformas.
