# UCAPSA — Cierre controlado del aviso 1.4 para Google Play

**ACTUALIZACIÓN VERIFICADA DEL 25-10-2026:** El aviso `1.4-appstores-2026-10-25` **ya es la única versión `published` en Supabase**; `1.2` quedó `retired`. El documento HTML canónico 1.4 se fusionó mediante PR #561 en `main` (la disponibilidad HTTP pública no se ha comprobado aquí). Las tablas de versiones más abajo son un **diagnóstico histórico anterior a esta actualización**, no el estado vigente. Los formularios enviados a Play Console y App Store Connect requieren validación aparte. La publicación del aviso tampoco acredita consentimiento de familiares o pruebas de eliminación de cuentas.


**Corte de diagnóstico:** 25 de octubre de 2026. **Estado:** pendiente de revisión y publicación oficial. Esta guía **no** es un aviso vigente ni autoriza recopilar datos adicionales.

**Matriz cruzada de requisitos oficiales y estado real:** [Android, iOS, web y Supabase](./MATRIZ_PRIVACIDAD_IOS_ANDROID_WEB_2026-10-25.md).

## 1. Las tres versiones que no deben confundirse

| Superficie | Evidencia | Estado |
| --- | --- | --- |
| Base Supabase `public.privacy_notices` | `1.2-appstores-2026-09-27`, única `published` | Operativa en registro y pantalla `/privacy` |
| GitHub Pages: `docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md` | `1.3 App Stores` | Documento público del sitio; **no coincide** con Supabase |
| `docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md` | `1.4 App Stores — BORRADOR` | Contiene las nuevas finalidades operativas; **no está publicado** |

**Bloqueo de lanzamiento:** no enviar un AAB a Play Store mientras lo que acepta la cuenta en Supabase y lo que publica la URL pública describan versiones o finalidades diferentes. La mera coincidencia del número de versión tampoco constituye aprobación legal.

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

### Paquete verificable para el editor Superadmin (no publica ni modifica Supabase)

Desde el código vigente, antes de aprobar 1.4:

```bash
npm run check:privacy-1-4-packet
```

Este control extrae **solo** el aviso simplificado y los **18 apartados** integrales del borrador y revisa los 13 campos legales obligatorios. No incluye el anexo interno, no introduce servicios de correo o SMS y no crea ni actualiza registros de Supabase.

**Después** de que la persona responsable apruebe por escrito el texto completo y su fecha efectiva, preparar un JSON de revisión —con fecha real, sin inventarla—:

```bash
node scripts/prepare-privacy-notice-1-4.mjs --json --effective-date=AAAA-MM-DD > /tmp/ucapsa-aviso-1-4-para-superadmin.json
```

Sustituye `AAAA-MM-DD` por la fecha efectiva aprobada. El archivo contiene `fields_for_superadmin`, con nombres camelCase tal como los acepta `savePrivacyNoticeDraft`; es un **paquete para copiar y revisar**, no un endpoint ni una migración. En el editor de Superadmin captura los campos, **guarda en borrador**, compara cada valor en pantalla y **publica únicamente con aprobación**. No uses este JSON como si fuera evidencia de publicación.

La fecha insertada en el apartado 16 y el identificador de versión deben cotejarse con la aprobación firmada. Verificar especialmente el aviso simplificado, el domicilio y contacto ARCO y el flujo presencial de datos de terceros.

### Correspondencia de campos en el editor Superadmin

Para evitar divergencias, los campos de `public.privacy_notices` deben salir de la **misma versión aprobada del borrador**. No copiar el anexo de control interno al aviso integral.

| Campo del editor | Apartado del borrador propuesto |
| --- | --- |
| `responsible_name`, `responsible_address`, `contact_email` | Cabecera y apartados 1, 11 |
| `data_categories` | Apartado 3 |
| `sensitive_data_categories` | Apartado 4 |
| `purposes` | Apartado 5 |
| `consent_required_purposes` | Apartado 6, sujeto a revisión jurídica |
| `limitation_mechanisms` | Apartado 12 |
| `arco_procedure` | Apartado 11 |
| `change_notice_method` | Apartado 15 |
| `transfer_clause` | Apartados 9 y 13 |
| `simplified_notice` | Únicamente texto bajo `## Aviso simplificado` |
| `integral_notice` | Únicamente apartados 1–18 bajo `## Aviso integral`, **sin anexo interno** |

**Comprobación legal adicional:** el simplificado debe indicar opciones reales para limitar el uso o divulgación, además de responsable, datos, finalidades y acceso al integral, conforme a los artículos 15 y 16 de la **LFPDPPP para particulares** (texto consolidado vigente). La captura presencial debe facilitar el aviso en el momento correspondiente y los datos de familiares recibidos de terceros requieren revisar el artículo 17. Las finalidades que involucren información patrimonial/financiera deben ser evaluadas expresamente bajo los artículos 7 y 9; no presumir consentimiento por guardar un historial administrativo.

**Comprobación de Play:** el requisito de `targetSdkVersion 36` aplica a los nuevos envíos móviles desde 31-agosto-2026; revisar el AAB real, no solo `app.json`. Según el tipo y fecha de la cuenta personal Play, pueden exigirse 12 testers durante 14 días consecutivos antes de solicitar producción. Ver `GOOGLE_PLAY_SUBMISSION.md`. La firma, subir el AAB y su aprobación son tareas posteriores, no consecuencias de fusionar código.

### Comprobación técnica de la versión REAL antes de Play Console

Desde el repositorio actualizado y con Node.js 22:

```bash
npm ci
npm run test:play-privacy-preflight
npm run check:play-privacy-live
```

El último comando consulta **sin escribir** la única fila `published` de Supabase mediante su clave **pública** configurada en `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`; también consulta en HTTP(S) la **página HTML pública real** indicada en `src/constants/legal.ts`. Nunca proporcionar `service_role` ni claves secretas. Si faltan variables, no hay respuesta, la URL no sirve HTML con una versión comprobable, las versiones divergen, los textos omiten menciones mínimas al alcance de preinscripciones/familiares o el **aviso simplificado y los cuerpos de los 18 apartados integrales de Supabase no aparecen completos y en orden en el HTML**, **falla y bloquea el envío**. La comparación normaliza espacios y el marcado HTML habitual; no se limita a comprobar un número de versión ni unas palabras. El test de CI utiliza solo respuestas simuladas: no afirma que una URL externa esté disponible.

**Resultado esperado con el estado actual:** **fallo** por `1.2` en Supabase frente a `1.3` en la página web; el borrador `1.4` permanece sin aprobar. Si falla por conexión o autenticación también es bloqueo, no evidencia de concordancia. Tras aprobación y publicación coordinada, repetir comprobación y conservar la salida, la versión exacta, la fecha, el commit y las capturas del navegador.

La comprobación valida **correspondencia de versión, presencia de categorías mínimas y paridad sustancial del texto simplificado y de cada cuerpo integral entre Supabase y la página HTML pública**. No demuestra que la página no contenga contenido adicional no autorizado; por eso aún se compara manualmente el documento público aprobado. NO acredita la suficiencia jurídica, consentimientos, ni que el AAB de Google Play implemente exactamente las finalidades descritas. La revisión humana y el AAB real siguen siendo controles independientes.

## 5. Reversión y evidencia

Si la publicación falla antes de entrar en vigor, **no** promocionar el nuevo aviso como vigente, mantener cerrada cualquier finalidad nueva y restaurar coherencia entre sitio y Supabase por el procedimiento administrativo auditado. No borrar historiales de aceptación o fingir consentimiento previo. Archivar commit, versión de aviso, fecha de aprobación, consulta de versión publicada, URLs externas y resultado de pruebas con cuentas de revisión.

## 6. Fuentes de contraste (oficiales)

- LFPDPPP para particulares, texto vigente de la Cámara de Diputados, **última reforma DOF 14-11-2025** (artículos 7, 9, 15, 16 y 17): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf
- Expedición original DOF 20-03-2025 (histórico): https://sidof.segob.gob.mx/notas/docFuente/5752569
- Google Play, User Data: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play, Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play, App content and review: https://support.google.com/googleplay/android-developer/answer/9859455
- Requisitos target API 2026: https://developer.android.com/google/play/requirements/target-sdk

**Pendiente externo:** aprobación del responsable/legal y verificación de despliegue del aviso 1.4; un PR de GitHub aprobado NO reemplaza esos pasos.
