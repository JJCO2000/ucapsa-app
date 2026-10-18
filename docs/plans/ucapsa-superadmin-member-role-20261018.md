# UCAPSA — Plan de roles y membresías · 18-oct-2026

## Tres reglas innegociables
1. **General → particular:** Administración → Usuarios → ficha → acción. Revisar arquitectura, después servicios y finalmente vista.
2. **Una pantalla, un objetivo:** usar el único gestor de acceso existente; no crear menú, botón o tablero redundante.
3. **Una fuente de verdad (SSOT):** perfiles para el rol vigente, membresías para la condición comercial, pagos para hechos financieros, inscripciones para niveles y asistencia registrada para las clases. Nunca recalcular ni duplicar los datos oficiales en pantallas.

## Decisión aprobada · opción B
Superadmin podrá activar la membresía al convertir una cuenta a Socio mediante UNA transacción del servidor.

- Una sola identidad (Auth) y una sola membresía por usuario (restricción UNIQUE). Se reutiliza la existente cuando la hay.
- No se genera un pago, comprobante, saldo a favor, asistencia, folio inventado ni inscripción.
- Se conserva QR canónico generado en la BD; el número de socio, si falta, continúa pendiente de asignación.
- Reactivación desde pendiente/cancelada usa las reglas existentes de estado de cobro, sin declarar «pagada» una cuota que no consta.
- Si ya era activa, no se vuelven a escribir detalles ni evidencias comerciales.
- Cambiar entre Socio y Entrenador/Admin nunca borra ni altera historial; los permisos de rol se evalúan en el servidor.
- Cambiar a Cliente mientras siga activa una membresía queda bloqueado: cancelarla puede alterar obligaciones futuras y requiere el flujo explícito de membresías.
- Superadmin no es asignable desde esta RPC: tendrá un procedimiento propio con autenticación reforzada y protección del último Superadmin.
- Verificar revocación efectiva tras actualizar sesión y caché, especialmente en dispositivos desconectados.

## Alcance de este PR · SIN despliegue
1. Una migración SQL versionada para proteger al Entrenador del trigger comercial y ampliar el RPC existente.
2. El mismo selector de la ficha de Usuarios ofrece Socio. Ninguna pantalla nueva.
3. Una prueba estática de invariantes añadida a verify.
4. Sin modificar registros de producción, credenciales de Auth, pagos, obligaciones, clases o inscripciones.

## Aceptación bloqueante
- Como Superadmin: Cliente → Socio, Entrenador → Socio, Socio → Socio (idempotente), y Socio → Entrenador.
- Intentar el RPC con Admin, Entrenador o Cliente: denegado.
- Usuario inexistente, cuenta Superadmin existente o destino Superadmin: denegado, sin modificación parcial.
- Membresía activa: sin duplicados ni pagos añadidos; auditoría antes/después.
- Cambio de estado comercial de Entrenador: no pierde su rol.
- Socio → Cliente con membresía activa: bloqueado sin cancelar pagos ni obligaciones.
- Pruebas SQL con rollback y cuentas sintéticas en entorno aislado autorizado. No escribir fixtures en producción.
- TypeScript, verify:release, SQL smoke, CodeQL y exportaciones Android/iOS sin regresiones.
- Sesión activa y caché offline: cero autorizaciones de escritura basadas en roles antiguos.

## Plan de UCAPSA (sigue vigente)
1. Roles efectivos y vistas de Superadmin.
2. Clases **hoy** y **mañana** en Inicio Entrenador.
3. Roster completo para horarios oficiales, incluso sin inscritos; Comandos un único schedule.
4. Registro individual de clientes/perros y vinculación posterior verificable.
5. Edición de exámenes de entrenador en borrador sin modificar publicados.
6. Excel de exámenes con calificaciones y estadísticas canónicas.
7. Importación masiva XLSX con validación/deduplicación.
8. Expo Doctor, recordatorios Puppy, información competitiva sin dependencia de fotos.
9. Auditoría de seguridad y pruebas funcionales; publicación móvil solo por orden expresa.

## Despliegue y compatibilidad
Este PR es de revisión. No fusionar ni aplicar SQL hasta completar pruebas reales de transiciones, RLS y obligaciones. No OTA, EAS Build, AAB ni publicación automática.
