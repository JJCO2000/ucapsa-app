# UCAPSA — arquitectura, reglas y fuentes oficiales (SSOT)

**Norma de trabajo vigente:** 20-oct-2026. Esta referencia gobierna futuros cambios; los informes fechados en `docs/audits/` son fotografías históricas, **no** la verdad operativa actual. Confirmar siempre código `main` y Supabase antes de concluir.

## 1. De lo general a lo particular

- **Arquitectura → módulos → listado → ficha → detalle/acción → pruebas**; no crear pantallas o tablas por comodidad.
- Inicio muestra estado y próxima decisión; Clases administra sesiones y asistencia; Perros muestra historial; Pagos muestra obligaciones reales; Administración gestiona casos excepcionales.
- Una **acción principal por pantalla**. Acciones poco frecuentes como revisión de una segunda vinculación deben quedar secundarias.
- Navegación web y móvil reutiliza servicios, validaciones y sesión; jamás una segunda base de datos para escritorio.

## 2. Fuente única por hecho de negocio

| Concepto | Fuente canónica | Regla de separación |
| --- | --- | --- |
| Identidad/credenciales | `auth.users` en Supabase Auth | Escribir `profiles.phone` NO habilita login por teléfono |
| Perfil y permisos operativos | `public.profiles.role` + RPC/RLS del servidor | La UI nunca concede permisos por sí sola; la vista previa de rol es solo presentación |
| Socio | `public.memberships` | El estado de membresía NO acredita deuda ni determina autorización de Comandos por sí solo |
| Perro titular y estado | `public.dogs` con `user_id` | No copiar perros a un nuevo registro por cambio de pantalla |
| Puppy/Comandos/nivel | `public.program_enrollments` + horario oficial | Un único horario de Comandos; niveles `principiante/medio/avanzado` no generan horarios separados |
| Asistencia y evidencia histórica | `public.program_attendances` y `public.program_attendance_historical_evidence` | Cantidades sin fecha histórica se conservan como evidencia, no como asistencias con fecha inventada |
| Saldo y pago | `public.payment_obligations` menos `public.payments` pagados/no anulados | Una membresía `pending` NO es, por sí sola, deuda acreditada |
| Preinscripción sin cuenta | `ucapsa_intake.*` | Provisional hasta vincular; no crear Auth ficticio, pagos o membresías oficiales prematuramente |
| Exámenes/resultados | Tablas y RPC oficiales de exámenes | Entrenador prepara/publica estructura según permisos; resultados oficiales siguen control de Administración |
| Menú publicado | `ucapsa_config.restaurant_publication` | Publicación no se infiere de categoría activa |
| Informe Excel | Datos de RPC/servicio oficial + descargador `training-report-download` | Un solo cómputo; canales específicos web/nativo solo transportan los mismos bytes |

## 3. Límites de permisos e historial

- **Cliente/Socio:** sus propios datos. **Entrenador:** roster y evaluaciones autorizadas. **Admin:** operación. **Superadmin:** administración de roles.
- El backend comprueba autenticación, autorización y propiedad; no confiar en inputs editables ni roles cacheados. Funciones `SECURITY DEFINER` exigen auditoría de permisos y `search_path`.
- Nunca eliminar físicamente asistencias, exámenes, pagos, cambios de rol o movimientos históricos para ocultar inconsistencias. Usar anulación/cancelación auditada cuando corresponda.
- No crear deudas, fechas, SMS ni datos artificiales para que cuadren números.

## 4. Flujo de vinculación aprobado

1. Administración registra tutor/contactos, perro, Puppy o Comandos, nivel, asistencias previas y opcionalmente **Socio autorizado**. Todo queda provisional sin crear Auth.
2. En la **primera** coincidencia de contacto el MVP vincula automáticamente sin OTP de preinscripción, mediante RPC transaccional. Esta decisión acepta un riesgo de identidad; jamás debe interpretarse como verificación real del titular.
3. Vinculaciones posteriores requieren revisión y autorización de Administración. No transferir silenciosamente expedientes a otra cuenta.
4. Al vincular, confirmar que datos canónicos, roles y cachés están actualizados, y que el historial quedó intacto.

## 5. Puertas obligatorias de calidad

- Antes de modificar: consultar código real, migraciones instaladas, funciones activas y recuentos de BD.
- Después: pruebas unitarias/contratos, PostgreSQL aislado para RPC/roles, `npm run verify:release`, CodeQL y export Android/iOS/web. **CI verde no equivale a prueba con persona real ni a publicación.**
- Verificar navegación, botones, fallos, reintentos y permisos con usuarios autorizados en dispositivos y navegador reales. No sembrar producción con usuarios ficticios para simular éxito.
- Desplegar cambios de BD antes del cliente que los consume; comprobar migraciones y tipos. Nunca integrar SQL no validado.
- No generar AAB, OTA, publicar en tiendas o contratar SMS por defecto.

## 6. Evidencia operativa y brechas abiertas (20-oct-2026)

- Supabase: **19 perfiles, 8 membresías (5 activas), 11 inscripciones y 7 asistencias oficiales**; cero preinscripciones provisionales. Sin huérfanos perro/perfil o inscripciones ajenas en consulta de integridad.
- Comandos: **un horario activo**. Pago: **0 obligaciones oficiales**; diferenciar estado comercial de deuda.
- Aviso de privacidad v`1.2-appstores-2026-09-27` **publicado técnicamente**; validación jurídica independiente.
- **Bloqueo real de login por teléfono:** hay 0 teléfonos en Supabase Auth, aunque el formulario acepte uno con contraseña. Véase [issue #415](https://github.com/JJCO2000/ucapsa-app/issues/415). El teléfono escrito para vincular una preinscripción NO resuelve Auth.
- **Bloqueo de aceptación end-to-end:** no existe expediente real provisional para comprobar dueño → cuenta → Puppy/Comandos/Socio → historial. Requiere uso operativo autorizado.
- Protección contra contraseñas filtradas: Supabase avisa que está deshabilitada; configuración pendiente en Auth. Avisos de funciones privilegiadas requieren seguimiento caso a caso, no revocación masiva que rompa flujos.

**Criterio para declarar “listo”:** controles automatizados verdes **y** operación verificada por rol/canal **y** sin bloqueos pendientes relevantes para la función anunciada. No llamar terminado a un módulo solo porque su SQL exista.
