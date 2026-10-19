# UCAPSA — Preinscripción: ficha operativa (bloque de continuación)
Fecha: 2026-10-19. Rama: `fix/preregistration-records-20261019`.

## Base verificada
- Código base: `main` 5a2513cb9bcede499d4937fd2cf1d473c0463190.
- Producción al iniciar el bloque: 0 personas/perros/programas/evidencias de preinscripción; 11 inscripciones oficiales.
- La membresía oficial `public.memberships` requiere `auth.users.id`. No asignar membresía fingida ni acceso ilimitado al crear una ficha sin cuenta.
- Comandos: 1 horario compartido; 6 asistencias para evaluación. Puppy: 4 requeridas.
- La progresión y el reporte de administración deben respetar el total canónico.

## Cambios hechos solo en rama
1. Las vistas Cliente, detalle de clase y Asistencias leen `enrollment.attendances_count`, incluso con historial sin fecha.
2. Para Comandos no se edita ni sobrescribe un número de referencia Puppy; se preserva metadato heredado.
3. RPC proyectado `admin_get_preregistered_directory` (solo Admin/Superadmin; contactos protegidos).
4. Ficha buscable y detalle por perro/programa: datos del tutor, nivel, referencia Puppy, asistencias históricas y asistencia del entrenador.
5. Edición del histórico usa RPC existente; migración revisa `admin_save_preregistered_program_history` para no borrar asistencias fuente `staff_roster` y rechazar fechas duplicadas.
6. Feature flag nueva `EXPO_PUBLIC_UCAPSA_PREREGISTRATION_DIRECTORY_ENABLED` apagada por defecto mientras no exista el RPC de consulta.

## Validación
- 16/16 comprobaciones estáticas de contratos, permisos, referencia física, asistencia canónica y protección de historial en código fuente revisado.
- **No se ejecutó** TypeScript de punta a punta, PostgreSQL aislado, pruebas interactivas ni CI para este bloque.
- **No** se aplicó la migración nueva, no se fusionó la rama, no se activó directorio, no se generó AAB ni hubo lanzamiento a Play.
- La protección de rollback de funciones preexistentes debe conservarse y actualizarse antes de aplicar la nueva migración.

## Pendientes
- Validar SQL nuevo en PostgreSQL real o réplica y compatibilidad de RLS, colisiones de fechas y conteos.
- Regenerar tipos Supabase oficiales tras instalar RPC.
- Fusión condicionada a quality gate y CodeQL existentes.
- La ficha provisional todavía no permite editar el nombre/contacto del tutor ni asignar membresía oficial sin cuenta. Requiere flujo autorizado para identidad y vinculación, no crear Auth ficticio.
- Los reportes de entrenamiento aún requieren sumar asistencia provisional sin cuenta; no mezclar estadística oficial con estimados.
- Distribución a dispositivos se maneja por separado y exige autorización expresa; no generar artefactos nativos de pago.
