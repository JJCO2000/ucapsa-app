# UCAPSA — Cierre controlado del aviso 1.4 para Google Play

**Corte de diagnóstico:** 25 de octubre de 2026. **Estado:** pendiente de revisión y publicación oficial. Esta guía **no** es un aviso vigente ni autoriza recopilar datos adicionales.

## 1. Las tres versiones que no deben confundirse

| Superficie | Evidencia | Estado |
| --- | --- | --- |
| Base Supabase `public.privacy_notices` | `1.2-appstores-2026-09-27`, única `published` | Operativa en registro y pantalla `/privacy` |
| GitHub Pages: `docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md` | `1.3 App Stores` | Documento público del sitio; **no coincide** con Supabase |
| `docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md` | `1.4 App Stores — BORRADOR` | Contiene las nuevas finalidades operativas; **no está publicado** |

**Bloqueo de lanzamiento:** no enviar un AAB a Play Store mientras lo que acepta la cuenta en Supabase y lo que publica la URL pública describan versiones o finalidades diferentes.

## 2. Alcance comprobado para el próximo aviso

- Datos de cuenta y perro, fotografía privada opcional, notificaciones, clases, asistencias, prácticas, niveles, exámenes, logros, membresías, obligaciones y pagos administrativos, analítica interna de continuidad.
- Preinscripción capturada por Administración o Entrenador **antes** de que la persona tenga cuenta, con nombre y contacto, perro/programa/horario/historial según corresponda.
- Familiares provisionales: nombre y al menos correo o celular, incluso cuando los proporcione otra persona. **No** se crea cuenta, no hay membresía familiar automática y su contacto **no** acredita identidad ni consentimiento de un tercero.
- Solicitudes voluntarias de información sobre entrenamiento y seguimiento operativo, sin inscripción ni deuda automáticas.
- **No publicadas:** fotografías privadas para rankings; acceso bilateral al progreso de otra cuenta (**PR #465 sin fusionar y migración no instalada**). Requieren revisión y consentimiento propios antes de habilitarse.
- La app no utiliza verificación de correo/SMS obligatoria para capturar preinscripciones. No añadir proveedores de correo o SMS por este aviso.

## 3. Revisión jurídica y operativa antes de marcar aprobado

1. La persona responsable confirma **razón social, domicilio y buzón ARCO**, ya utilizados en el aviso 1.3 y en los datos reales de Supabase. Verificar con sus documentos corporativos; no inferir validación jurídica por el hecho de figurar en GitHub.
2. Revisar el **texto integral y simplificado completo** del borrador 1.4 conforme a la LFPDPPP vigente, finalidades primarias, datos de terceros, prestación de servicios, proveedores, retención, derechos ARCO y cambios.
3. Administración define y verifica cómo facilita el aviso **antes de registrar** a un titular y a cada familiar cuyos datos incorpora, en especial cuando la captura parte de tarjetas físicas o terceros. No declarar como “consentimiento familiar” el simple ingreso de un número.
4. Comprobar que los textos describen los flujos reales del binario final, la cuenta y la eliminación, sin anunciar funciones que siguen apagadas. Si una finalidad fuera opcional y exigiera consentimiento separado, implementarlo antes de tratar esos datos.
5. La persona autorizada aprueba por escrito la versión definitiva y su fecha de entrada en vigor. No presumir que las cuentas que aceptaron 1.2 aceptaron automáticamente una nueva finalidad.

## 4. Publicación mediante la fuente oficial; no por SQL privilegiado

1. Reconciliar el documento público canónico y la propuesta 1.4 **tras** aprobación. Eliminar encabezados de “BORRADOR” solo en el texto que realmente se vaya a publicar; conservar historial de versiones anteriores.
2. En UCAPSA como **Superadmin**: Administración → Herramientas → Avisos de privacidad. Crear un borrador identificado (p. ej. `1.4-appstores-2026-XX-XX`) con campos comprobados `responsible_name`, `responsible_address`, `contact_email`, `data_categories`, `sensitive_data_categories`, `purposes`, `consent_required_purposes`, `limitation_mechanisms`, `arco_procedure`, `change_notice_method`, `transfer_clause`, `simplified_notice` e `integral_notice`.
3. Comprobar vista previa y contenido legal antes de **Publicar**. La RPC `admin_publish_privacy_notice` protege el cambio de único aviso publicado; no publicar desde SQL de servicio saltándose el control del Superadmin.
4. Verificar con una nueva consulta de solo lectura que hay **una** versión `published` y que `/privacy` y la pantalla de alta muestran su identificador. Confirmar que la versión previa figura `retired` y es recuperable como evidencia de consentimiento histórico.
5. Verificar en navegador sin iniciar sesión el texto HTML de la política en `https://jjco2000.github.io/ucapsa-app/privacidad/` y la eliminación en `https://jjco2000.github.io/ucapsa-app/eliminar-cuenta/`. El CI verifica la compilación del sitio; **eso no equivale** por sí solo a una prueba externa HTTP 200. Registrar capturas/URLs finales.
6. Una vez alineado el aviso, comprobar `docs/legal/GOOGLE_PLAY_DATA_SAFETY.md`, App content en Play Console, declaración de acceso y eliminación de cuenta. No enviar hasta que coincidan con la AAB exacta.

## 5. Reversión y evidencia

Si la publicación falla antes de entrar en vigor, **no** promocionar el nuevo aviso como vigente, mantener cerrada cualquier finalidad nueva y restaurar coherencia entre sitio y Supabase por el procedimiento administrativo auditado. No borrar historiales de aceptación o fingir consentimiento previo. Archivar commit, versión de aviso, fecha de aprobación, consulta de versión publicada, URLs externas y resultado de pruebas con cuentas de revisión.

## 6. Fuentes de contraste (oficiales)

- LFPDPPP, nueva ley publicada DOF 20-03-2025: https://sidof.segob.gob.mx/notas/docFuente/5752569
- Google Play, User Data: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play, Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play, App content and review: https://support.google.com/googleplay/android-developer/answer/9859455
- Requisitos target API 2026: https://developer.android.com/google/play/requirements/target-sdk

**Pendiente externo:** aprobación del responsable/legal y verificación de despliegue del aviso 1.4; un PR de GitHub aprobado NO reemplaza esos pasos.
