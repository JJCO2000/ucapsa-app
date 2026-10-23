# UCAPSA — revisión del consentimiento de progreso familiar (MVP)

**Estado: PROPUESTA, NO PUBLICADA.** No sustituye el aviso vigente de Supabase `1.2-appstores-2026-09-27`. El PR #465 tampoco se debe fusionar ni desplegar antes de la revisión administrativa y legal.

## Qué cambia, de manera estrictamente opcional

- Administración puede registrar integrantes familiares por nombre y al menos correo o teléfono, como contacto provisional. Esto **no crea ni fusiona cuentas**.
- Si el titular y el familiar ya tienen cuentas distintas, Administración debe comprobar la relación y autorizar la invitación.
- **Cada cuenta acepta por separado** y puede retirar su aceptación. El servidor verifica ambos permisos y la versión del aviso vigente en cada consulta.
- Lo compartido es únicamente: nombre de la persona propietaria, nombre de su perro, programa, nivel y **cantidad** de asistencias. No se dan fotos privadas, expedientes médicos, notas, horarios privados, datos de contacto, QR, pagos, membresías ni funciones para editar perros o clases.
- Si cambia el aviso publicado, ambos deben **aceptar de nuevo** antes de reanudar el acceso.
- No requiere SMS, correo de confirmación, un plan de pago nuevo ni la funcionalidad descartada de foto pública.

## Reutilizar el borrador que ya existe

UCAPSA ya tiene `docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md`. Incluye preinscripciones y contacto previo. **No redactar un aviso completamente nuevo**: comparar ese borrador con el texto realmente publicado y añadir solamente la finalidad voluntaria de consulta del progreso familiar. Debe seguir sin publicarse hasta que Administración compruebe el contenido completo.

## Textos propuestos para revisión del Superadmin y del responsable de privacidad

### Aviso simplificado — añadir a las finalidades

> De forma voluntaria, puedes permitir la consulta del progreso familiar entre tu cuenta y otra cuenta familiar autorizada. Solo se compartirán los nombres de las personas propietarias y de sus perros, programas, niveles y número de asistencias. Ambas personas deben aceptar y cualquiera puede revocar el permiso desde Perfil → Mi familia.

### Aviso integral — sección adicional

> **Consulta opcional del progreso familiar.** UCAPSA permite que dos personas previamente registradas como integrantes familiares consulten de manera recíproca información limitada del progreso de sus perros, exclusivamente después de que Administración revise el vínculo y ambas personas manifiesten su aceptación desde sus propias cuentas. La información comprendida es el nombre de la persona propietaria, nombre del perro, programa, nivel y número de asistencias. Esta función no concede acceso para modificar información ni permite consultar fotografías privadas, datos de contacto, pagos, membresías, QR o notas operativas. El consentimiento es opcional, independiente de la creación de la cuenta y de las inscripciones, y puede **revocarse** desde Perfil → Mi familia. Al modificarse el aviso de privacidad, ambas personas deberán autorizar de nuevo la consulta del progreso familiar.

### Finalidades y consentimiento

- **Finalidad principal que ya existe**: Administración mantiene el expediente de preinscripción de la persona titular y los datos de contacto de integrantes indicados en ese expediente, sujetos al aviso correspondiente.
- **Finalidad adicional voluntaria**: la consulta del progreso familiar entre cuentas, con aceptación diferenciada de ambas personas; se excluye por defecto y no puede condicionar la inscripción en Puppy o Comandos.
- **Limitación y revocación**: Perfil → Mi familia → «Dejar de compartir». Administración puede revocar un vínculo incorrecto. Se conserva evidencia de la versión consentida y de la fecha, sin transferir propiedad de datos.
- Revisar la redacción existente de **categorías de datos**, **finalidades**, **mecanismos para limitar el uso**, **consentimiento adicional**, **aviso integral** y **aviso simplificado**; no basta con actualizar una sola sección.

## Comprobaciones antes de publicar

1. Revisar y aprobar el contenido con la persona responsable real del aviso, usando los datos de identidad/contacto ya publicados. No inventar responsables, domicilios, obligaciones ni proveedores.
2. Crear nueva versión desde **Superadmin → Avisos de privacidad**. Guardar como borrador, comprobar todos los campos, publicar solo la versión validada y verificar que se puede leer desde la pantalla pública.
3. Probar en un entorno controlado dos cuentas distintas, un tercero no relacionado y el cambio de cuenta: permitir, denegar, revocar, cambiar aviso, volver a aceptar y comparar lo que devuelve la base.
4. Confirmar que el proyecto no contiene una relación familiar antes de que se apruebe el aviso; no transferir ni publicar perros o membresías por coincidencia de contacto.
5. Si la función de consulta familiar no se publica en este MVP, **no** presentar esta finalidad adicional como ya activa ni cambiar los permisos reales. Mantenerla como propuesta de una versión posterior.

## Fuentes de referencia

- Diario Oficial de la Federación, **Ley Federal de Protección de Datos Personales en Posesión de los Particulares**, publicada el 20/03/2025: https://sidof.segob.gob.mx/notas/docFuente/5752569
- Supabase, **Row Level Security**: https://supabase.com/docs/guides/database/postgres/row-level-security

Este documento es un insumo técnico para revisión, no una aprobación legal automática.
