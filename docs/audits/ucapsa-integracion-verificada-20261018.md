# UCAPSA — Estado verificable de solicitudes e integración

Fecha de corte: **18-oct-2026 (Ciudad de México)**. Revisión de `main`, PRs, CI de GitHub, tablas y funciones de Supabase mediante consultas de solo lectura.

**Main validado:** `dcf840c25210ff31780f3bcef46b3b53e56bf8eb` = PR #356. CI push: UCAPSA quality gates SUCCESS, CodeQL SUCCESS, páginas legales SUCCESS. PR #350 también fusionado. **No implica despliegue de app ni migraciones de PRs borrador.**

## Arquitectura decidida
- **Identidad:** `auth.users` confirma email y/o móvil; `profiles` es identidad de la app. Enlaces por contacto verificado y único, nunca solo por nombre.
- **Rol operativo:** Cliente, Entrenador, Admin y Superadmin. UI derivada de `src/constants/roleCapabilities.ts`; autorizaciones reales en RPC/RLS. No guardar permisos comerciales como permisos administrativos.
- **Condición comercial:** membresía activa otorga beneficios de Socio; la presentación cliente se reconoce como `member` en el modelo legado. Puppy y Comandos son inscripciones POR PERRO con tarjeta, niveles, asistencia, evidencia de pago/reconocimiento administrativo independientes de Socio.
- **Vista temporal:** preview de UX de Superadmin si alguna vez se usa, sin alterar `auth.uid()`, `profiles.role` ni permisos reales. **No crear un selector duplicado de modos**.
- **Comandos:** exactamente un horario oficial compartido, niveles `principiante` / `medio` / `avanzado`.
- **Evidencia histórica:** fechas reales por separado del saldo sin fecha, nunca inventar fechas ni movimientos contables. No duplicar una misma asistencia al vincular.

## Matriz de solicitudes

| Solicitud comprobable | Estado actual | Prueba / referencia |
| --- | --- | --- |
| Restaurante en encabezado junto a Ranking | **MAIN** | PR #356; `src/screens/home/HomeExperienceScreen.tsx` |
| Alerta «Revisa tus pagos» solo por deuda verificable | **MAIN** | PR #356; `src/services/customer-value.service.ts` |
| Entrenador ve HOY/MAÑANA y horarios vacíos | **MAIN** | PR #356; `src/app/(tabs)/trainer-home.tsx` |
| Protocolo anti-duplicación de preinscritos documentado | **MAIN (pruebas/política, no altas)** | PR #350 |
| Tres niveles Comandos con horario único | **MAIN + DB** | 1 horario activo verificado en Supabase |
| Ranking, insignias y progresión de clientes | **MAIN (interfaces y quality gates)** | `client/competition-ranking`, `AchievementBadgeGrid`; no se afirma prueba manual exhaustiva |
| Staff/Entrenador: roster real, exámenes actuales y asistencia | **MAIN (funciones existentes)** | `trainer-classes`, `trainer-exams`; no equivale a prerregistro |
| Editar examen guardado sin alterar publicado | **PR #348 DRAFT** | No integrado ni desplegado |
| Excel por ejercicios x perros, promedio y filtros | **PR #349 DRAFT** | No integrado ni desplegado |
| Alta administrativa de perro antes de cuenta Auth | **PR #351 DRAFT** | Migraciones no aplicadas en producción |
| Vincular cuenta verificada + perro/nivel/tarjeta y saldo anterior | **PR #351 DRAFT** | CI PostgreSQL sintético ≠ producción |
| Puppy: tarjeta reconocida, historial por fechas y/o solo total | **PR #351 DRAFT** | Libro de evidencia histórico sin fechas inventadas |
| Entrenador ve/captura perros preinscritos | **PR #351 DRAFT** | No forma parte del roster actual de producción |
| Cambio de rol completo y otorgar Socio Superadmin | **PR #353 DRAFT / PR #345 DRAFT** | NO integrar aún: contradicciones con triggers reales; requiere arreglo independiente |
| Membresía no debe degradar a Entrenador | **PR #358 DRAFT** | Conservación mínima del rol operativo, prueba PostgreSQL sintética |
| Menú: publicar/ocultar global, visibilidad Cliente/Socio | **PR #354 DRAFT** | En DB producción no existe todavía `ucapsa_config.restaurant_publication` |
| Aviso de sábado por menú del domingo integrado con recordatorio | **PR #354 DRAFT** | Requiere deploy del Edge Function y publicación global, no enviado |
| Portal web para productividad Admin/Entrenador | **PR #346 DRAFT** | Exportar web ≠ portal de escritorio lanzado |
| Inicio por correo o teléfono con OTP y segundo opcional | **PENDIENTE** | Auth actual: correo/contraseña; no atribuir acceso por coincidencia de teléfono |
| Fusión excepcional manual auditada de fichas; importación Excel | **PENDIENTE** | Política anti-duplicado ≠ función fusionar/importar |
| Guardia y Protección sin horario de reserva | **DECISIÓN** | Mantener llegada libre, no crear agenda |
| PayPal | **PENDIENTE / IDEA** | No se debe crear cobro automático sin conciliación |
| Validar todos los botones Android, iOS y web con sesión real | **PENDIENTE E2E** | Quality gates exportan y comprueban código; no son prueba física completa |

## Conteos leídos de Supabase (sin escribir)
19 perfiles; 8 perros; 11 inscripciones: Comandos 2 activas/4 canceladas, Puppy 1 activa/3 canceladas/1 completada; 7 asistencias fechadas ordinarias; 5 membresías activas; 1 horario base activo Comandos. No incluyen asistencias antiguas aún no migradas por #351.

## Bloqueos priorizados
1. Corregir acoplamiento membresía→rol: el trigger `sync_membership_status_lifecycle` modifica `profiles.role` también para Entrenador; PR #358 corrige solo eso.
2. **NO desplegar PR #353** sin resolver también `enforce_membership_state_invariants`, que puede normalizar `not_required` a `pending` al activar; tampoco cancelar derechos comerciales por cambiar de rol operativo.
3. Separar Comandos pagado/verificado por Administración de la membresía Socio y de tarjeta ficticia; PR #351 no listo.
4. Validar migraciones en copia aislada completa del esquema real con RLS, triggers y regresión; no usar datos productivos para pruebas.
5. Resolver PRs #348/349 y #354 por dependencias, y confirmar interfaces en Android/iOS/web.
6. No marcar «todo integrado» hasta comprobar cada ruta, contador, auditoría de duplicados y permisos por servidor.

**Publicación:** ninguna actualización OTA/Play/App Store fue ejecutada durante esta auditoría. Los PRs DRAFT no son `main`, aunque su CI individual esté verde.
