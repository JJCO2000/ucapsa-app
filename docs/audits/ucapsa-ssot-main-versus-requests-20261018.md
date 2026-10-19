# UCAPSA — Conciliación de solicitudes, código y producción (18 octubre 2026)

Fuentes: conversación del proyecto (solicitudes hasta octubre), GitHub `main` SHA `dcf840c25210ff31780f3bcef46b3b53e56bf8eb`, PR #349–#357, esquema y recuentos Supabase **en lectura**, migraciones instaladas y `roleCapabilities.ts`. No confundir **CI aprobado** con **función publicada en producción**.

## Modelo de control: no duplicar fuentes de verdad

1. **Identidad**: `auth.users` y `profiles.user_id` identifican la cuenta.
2. **Permisos operativos**: `profiles.role` es efectivo y las capacidades de UI derivan exclusivamente de `getRoleCapabilities(role)`; toda mutación crítica exige además permisos/RLS/RPC del servidor.
3. **Condiciones comerciales independientes**: `memberships` acredita Socio, mientras `program_enrollments` y sus tarjetas/autorizaciones acreditan Puppy y Comandos, por perro y nivel; la confirmación de pago externo no debe crear movimiento financiero ficticio.
4. **Vista previa de Superadmin**: solo presentación; no cambia el rol real, RLS, JWT ni autorización.
5. **Trazabilidad**: contar asistencias ordinarias y evidencia histórica diferenciando fechas reales, saldo sin fecha, actor y fuente.

**Situación actual:** `profiles.role` todavía incluye `member`; la base contiene triggers de membresía que actualizan `profiles.role` y `current_payment_status`. No se han separado por completo las reglas del backend: PR #353 debe migrarlos y probar casos históricos antes de entrar en producción. El módulo `access-projection.domain.ts` introduce una proyección **de solo lectura**, sin tabla ni fuente duplicadas, y no habilita una vista temporal todavía.

## Hechos contrastados en producción (consulta sin escrituras)

| Indicador | Resultado |
| --- | ---: |
| Perfiles Auth y profiles | 19 y 19 |
| Perros | 8 |
| Membresías | 8 |
| Inscripciones de programas | 11 |
| Asistencias ordinarias | 7 |
| Horarios activos de Comandos | **1** |
| Inscripciones activas de Comandos | 2 |
| Contactos Auth con teléfono confirmado | **0** |
| Nombres duplicados de perro por cuenta | 0 (comprobación exacta) |
| `ucapsa_intake.people` en producción | No existe |
| `program_attendance_historical_evidence` en producción | No existe |
| `ucapsa_config.restaurant_publication` en producción | No existe |

Un Entrenador y un Superadmin tienen membresía Socio activa; su rol operativo sigue distinto de `member`. Los contadores no equivalen a asistencia histórica total ni demuestran que no existan duplicados por identidad/contactos.

## Conciliación por solicitudes

| Solicitud | Estado validado | Bloqueo/próximo paso |
| --- | --- | --- |
| Arquitectura SSOT y pruebas anti-duplicados | **MAIN** PR #350 | Solo documentación y controles; no nuevas altas |
| Home Cliente/Socio/Visitante con restaurante arriba | **MAIN** PR #356 | Verificación visual en dispositivos; menú sujeto a disponibilidad |
| Quitar aviso de pago falso al otorgar membresía | **MAIN** PR #356 | Verificar casos con obligación contable real |
| Entrenador ve hoy/mañana, horarios aun vacíos | **MAIN** PR #356 | Validación manual y cancelaciones |
| Comandos 1 horario y 3 niveles | **MAIN y BD** | Conservar siempre mismo schedule_id para Básico/Intermedio/Avanzado |
| Superadmin cambiar Cliente/Socio/Entrenador/Admin/Superadmin | **DRAFT** PR #353 | Triggers de membresía deben separarse de roles; E2E contra esquema completo y bloqueo de rol privilegio |
| Vista temporal Superadmin sin cambiar permisos | **No implementada** | Después del modelo roles/comercial; solo UI sin suplantación de sesión |
| Admin/Superadmin preregistra tutor y perro por contacto | **DRAFT** PR #351 | Esquema aún no instalado; OTP y contactos compartidos |
| Alta Puppy tarjeta pagada, fechas conocidas y saldos sin fecha | **DRAFT** PR #351 | Historial auditable, validar migración con triggers reales y recuentos visibles |
| Alta Comandos por Admin tras pago externo, sin Socio | **Incompleta** PR #351 | Distinguir autorización pagada de membresía: modo `membership` heredado no es prueba independiente |
| Roster Entrenador con perros preinscritos | **DRAFT** PR #351 | Probar usuarios sin Auth y asistencia antes/después de vincular |
| Fusión automática por correo/teléfono verificado; fusión manual excepcional | **Parcial en DRAFT** PR #351 | Revisión de cuentas compartidas, OTP; función manual aún no implementada |
| Registro individual y carga masiva Excel de tutor/perro | **Parcial** | Alta individual en PR #351; importación masiva NO terminada |
| Login por número o correo, segundo contacto opcional | **No implementado** | 0 teléfonos verificados; evaluar OTP real y protección de identidad |
| Entrenador crea/edita ejercicios borrador y publica versión | **PARCIAL MAIN** | Existen herramientas; validar edición persistida y restricción posterior a publicar |
| Excel de exámenes cruzado perro × ejercicio y promedio | **DRAFT** PR #349 | No disponible en main; validar selección de perros y dato oficial |
| Reportes clase y asistencia cuantitativa | **MAIN parcial** | Reportes existentes; validar reglas de ausentes, histórico y exportación |
| Restaurante publicación global y control Admin | **DRAFT** PR #354 | SSOT `restaurant_publication` aún sin desplegar |
| Notificación del sábado para menú del domingo | **DRAFT** PR #354 | Probar una sola notificación + navegación y consentimiento; desplegar Edge Function después de DB |
| Paypal | **Pendiente** | No activar cobros sin conciliación y webhook idempotente |
| Guardia y protección cita según llegada | **No construir reservas** | Decisión del usuario, mantener atención sin agenda |
| Versión escritorio para Administración y Entrenador | **Parcial** | Expo web compila en PR #351; faltan flujos de desktop e integración real |
| Pruebas de todos los botones, roles y tres plataformas | **Pendiente** | Tests de código/SQL parciales, no hay E2E manual completo Android/iOS/web |

## Orden de integración recomendado

1. Cerrar PR #353 **solo tras** separar los triggers históricos de membresía (sin borrar inscripciones actuales), reconciliar pagos, RLS y cambio de roles; no aplicar en producción antes de ensayar un rollback.
2. Cerrar PR #351 con autorización de programa independiente de Socio; revisar contadores (`attendances_count` canónico incluye evidencia histórica, no solo `program_attendances.length`), contacto verificado y transferencias.
3. Cerrar PR #349 Excel con fuente oficial y configuración para seleccionar perros y ejercicios.
4. PR #354 publicación dominical y notificación del sábado: desplegar BD antes que Edge Function; verificar preferencias, ausencia de duplicados, menú público y enlaces.
5. Login celular, importación Excel y fusión manual excepcional, más pruebas reales en web/Android/iOS.
6. Verificación final de los flujos y permisos contra datos de prueba de esquema completo antes de release.

**Restricciones de despliegue:** no crear cobros, asistencias, fechas, membresías ni inscripciones artificiales; no cambiar roles con un selector de vista; no cambiar `main` ni producción sin CI vigente y pruebas de integración compatibles. Toda excepción requiere bitácora, revisión de impacto y recuperación.
