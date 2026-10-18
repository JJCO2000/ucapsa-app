# UCAPSA Web — fundamento multiplataforma (fase 1)

Estado: **propuesta en rama, NO desplegada**. Ningún cambio a `main` ni a Supabase de producción.

## Propósito y alineación

La plataforma de navegador complementa la aplicación móvil y permite trabajar desde computadora sin trasladar registros entre dispositivos.

Fuentes estratégicas suministradas por UCAPSA:
- Análisis interno (EFI): presencia digital básica y oferta de servicios integrados.
- Análisis externo (Porter): necesidad de comunicar el valor y la confianza de forma comprobable.
- PESTELG priorizado: la presencia web oficial se identifica como oportunidad tecnológica.

**Límite de esta fase:** habilitar navegación web sensible al rol y comprobar compilación; **no** cambiar el contenido comercial, las reglas de negocio ni la jerarquía de permisos.

## Arquitectura

- Aplicación móvil: conserva `src/app/(tabs)/_layout.tsx`.
- Navegador: `src/app/(tabs)/_layout.tsx` utiliza `Slot` sólo en web para evitar duplicar la barra de pestañas móvil. No existen layouts `.web.tsx` dentro del árbol de rutas.
- Contenedor web: `WebAppShell.web.tsx` muestra menú lateral en pantallas amplias y menú horizontal en pantallas estrechas.
- Contenedor nativo: `WebAppShell.tsx` no altera ninguna pantalla.
- Sesiones: mismo proveedor Supabase Auth y mismas políticas RLS existentes, con persistencia de sesión adecuada al navegador.
- Los menús reflejan las capacidades actuales. **No representan una concesión de permisos** y no reemplazan validación del servidor.
- La cuenta y los registros siguen teniendo una única fuente de verdad: el proyecto Supabase actual.

## Fase 2 — sesión verificada y Excel en navegador (en rama)

- Se utiliza la misma sesión Supabase Auth y el rol canónico del perfil. En web, un perfil obsoleto/almacenado en caché **no** concede acceso a pantallas administrativas: se exige una consulta válida al servidor y se presenta una pantalla de verificación con reintento.
- El login, la recuperación y la actualización de contraseña muestran errores legibles dentro de la página, en vez de depender de `Alert.alert` móvil.
- La recuperación móvil conserva `ucapsaapp://auth/update-password`. La recuperación desde navegador utiliza `<origen actual>/auth/update-password` en tiempo de ejecución: deben añadirse **sólo** los orígenes autorizados al allowlist de Supabase Auth, sin configurar comodines indiscriminados en producción.
- La generación del libro Excel sigue en `training-report-export.service.ts` como fuente única (hojas **Resumen, Por programa, Detalle y Asistencias registradas**). Sólo la entrega se separa por plataforma: `training-report-download.ts` mantiene el archivo temporal y `expo-sharing` para Android/iOS; `training-report-download.web.ts` crea un Blob local y permite descargar sin enviar el reporte a servidores externos.
- El administrador tiene un acceso directo a **Reportes** en la barra lateral; el cierre de sesión desde escritorio limpia la sesión local con el servicio de autenticación existente.
- Sin migraciones, cambios de permisos SQL ni cuentas de prueba reales en producción.

### Pruebas operativas que siguen pendientes

| Escenario | Criterio de aceptación |
| --- | --- |
| Admin/Superadmin inicia sesión web | Perfil recuperado del servidor antes de habilitar menús administrativos |
| Cliente abre URL de admin o llama RPC administrativa | Acceso denegado por RLS/RPC; no solo ocultación en interfaz |
| Entrenador abre pagos, roles o exámenes oficiales | No se otorgan privilegios administrativos |
| Sesión expirada o conexión caída | Ningún perfil administrativo en caché desbloquea la web |
| Restablecimiento de contraseña web | Correo redirige al dominio permitido, enlace válido, contraseña guardada sin login previo ajeno |
| Reporte Excel desde navegador | Descarga local válida, cuatro hojas, recuentos coinciden con servicios canónicos |
| Reporte Excel desde Android/iOS | Se conserva apertura/compartición nativa y cifras originales |
| Inicio de sesión y cierre en PC compartida | Sesiones separadas; no quedan datos personales visibles tras cerrar |
| Diseño responsive | Chrome/Edge PC y pantalla estrecha sin accesos duplicados |
| Acceso desde `ucapsa.mx` | Enlace del proveedor al subdominio con TLS y redirecciones permitidas |

**Compilar en CI no valida estos escenarios con usuarios reales.** No levantar el bloqueo de publicación hasta comprobarlos con cuentas de prueba no productivas.

## Puerta de calidad obligatoria

Antes de cualquier merge o publicación:

1. `npm ci` y `npm run verify:release` completos, sin errores.
2. Exports Android, iOS y Web completos en CI. La exportación Android genera source maps sólo para CI y `scripts/check-web-excluded-from-android-bundle.mjs` verifica que ningún módulo `.web.*` propio de UCAPSA forme parte de la gráfica nativa.
3. Pruebas interactivas en Chrome y Edge: sesión, navegación y acceso a formularios.
4. Pruebas negativas por rol: cliente no puede abrir/ejecutar operaciones de administrador; entrenador no puede gestionar pagos o roles.
5. Pruebas de registro y consulta cruzada: cambio desde navegador visible correctamente en móvil, sin duplicados.
6. Recuperación de contraseña web y redirecciones permitidas en Supabase Auth verificadas.
7. Descarga de Excel y carga de archivos con APIs del navegador (no depender de `expo-sharing`).
8. Revisión de protección de datos, expiración de sesión y MFA para personal administrativo.
9. Aprobación operativa de administración, verificación de regreso atrás y validación estratégica.
10. Coordinar con el proveedor del sitio `ucapsa.mx` el futuro acceso al subdominio sin concederle permisos sobre Supabase.

## Decisión sobre separación de aplicaciones

- Para este MVP mantenemos un solo proyecto Expo: estar en el repositorio no equivale a estar en el AAB.
- Evitamos mover el frontend móvil a un monorepo prematuramente porque cambiaría rutas, scripts de verificación, dependencias y configuración EAS.
- Cuando la interfaz de escritorio requiera un stack web propio o mantenerla conjuntamente afecte al mantenimiento móvil, se evaluará **apps/web** + paquetes compartidos, con plan de migración y regresión.
- Hallazgo real de CI: Expo Router incluyó `src/app/(tabs)/_layout.web.tsx` en el mapa de módulos Android incluso cuando compilaba correctamente. Se retiró ese archivo de `src/app` y se cambió a selección de `Slot` por plataforma desde un layout universal. Algunas dependencias externas incluyen módulos `.web` internos; la puerta de control audita explícitamente el código propio de UCAPSA y registra el resto por separado.
- Ningún código/asset web debe publicarse en producción como parte de un AAB por accidente. La prueba del bundle Hermes es necesaria, pero todavía no reemplaza una inspección final del AAB generado.

## Pendientes posteriores

- Pantallas de escritorio específicas para listados/tablas: clientes, clases, pagos y reportes.
- Formularios de registro y vinculación de cuentas bajo control de Superadmin.
- Experiencia web de socios/clientes (perros, calendario, membresía y reportes personales).
- Espacio de entrenador y pruebas integrales de exámenes/estadísticas.
- DNS, TLS, URL de retorno de Auth y publicación solamente tras autorización explícita.

**No declarar la web terminada por el hecho de que CI esté en verde.**
