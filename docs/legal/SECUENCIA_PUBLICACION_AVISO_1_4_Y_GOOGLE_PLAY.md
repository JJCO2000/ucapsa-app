# UCAPSA — secuencia controlada de privacidad 1.4 y Google Play

**Estado:** plan de ejecución; NO significa que el aviso 1.4 ya esté aprobado o vigente.  
**Revisión técnica:** 25 de octubre de 2026.  
**Responsable del contenido y autorización:** Universidad de Crianza y Adiestramiento S.A. de C.V. / Administración autorizada.

## 1. Estado anterior comprobado

- **Supabase:** `public.privacy_notices` conserva una única versión publicada, `1.2-appstores-2026-09-27`. El aviso integral actual en la base es de aproximadamente 11.4 mil caracteres.
- **Página legal pública:** `docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md` indica `1.3 App Stores`. Se publica como HTML mediante GitHub Pages en https://jjco2000.github.io/ucapsa-app/privacidad/.
- **Candidato NO vigente:** `docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md`. Contiene el simplificado y el integral, más un anexo de control interno separado por `---`; el anexo **no** forma parte del aviso.
- **Funciones activas:** Administración y Entrenador pueden preinscribir al titular, su perro y contactos familiares. Se pueden recoger datos antes de que exista una cuenta. El interesado puede pedir seguimiento de entrenamiento.
- **Funciones NO habilitadas:** consulta del progreso de otras cuentas familiares y fotografía privada del perro publicada en Ranking. No describirlas como tratamientos activos. PR #465 es código aún no integrado; no instalar su migración ni activar la bandera como parte de este cierre.
- **Cuentas:** la autenticación/aceptación de la versión publicada la registra Supabase. Publicar una nueva versión NO equivale a obtener su consentimiento de forma retroactiva de todas las personas.

## 2. Validación jurídica y operativa (pendiente de firma del responsable)

Revisar el candidato 1.4 según la **Ley Federal de Protección de Datos Personales en Posesión de los Particulares, texto vigente, última reforma DOF 14-11-2025**, artículos 7, 14, 15, 16 y 17. Base: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf.

- [ ] Confirmar denominación, domicilio y correo de privacidad; que el responsable del aviso coincida con la entidad operadora real y con Play Console.
- [ ] Revisar nombres, correo/teléfono, familiares registrados por terceros, perro, fotos privadas opcionales, clases, progreso, analítica interna y registros auxiliares de pagos.
- [ ] Validar bases de consentimiento, en particular si se tratan datos financieros o patrimoniales y si se aportan datos de otros familiares. No presumir autorización individual por tener contacto en una ficha.
- [ ] Confirmar cómo el personal entrega el simplificado/integral **antes o al recabar** datos en recepción, tarjeta física, teléfono y preinscripciones; llevar evidencia operativa cuando corresponda.
- [ ] Comprobar opciones de limitación, derechos ARCO, medios de revocación y notificación de cambios.
- [ ] Verificar la eliminación y conservación de datos propios y de encargados. La eliminación no puede reducirse a «desactivar» cuenta.
- [ ] Revisar que el texto del borrador no afirme que el progreso se comparte entre familiares ni que fotos reales estén públicas.
- [ ] Aprobar por la persona legalmente facultada la redacción FINAL y la fecha efectiva de 1.4. Ajustar la sección «Versión y vigencia»; nunca publicar con «pendiente de aprobación».

**Regla de seguridad:** no usar `execute_sql` ni scripts automáticos para saltarse `admin_save_privacy_notice` / `admin_publish_privacy_notice`. Usar el flujo Superadmin, con respaldo de la versión anterior y registro del actor.

## 3. Campos canónicos del aviso 1.4 en Supabase

El editor Superadmin exige estos campos **independientes**, además de `version`. Usar el texto final autorizado; no copiar el anexo de control interno al aviso integral.

| Campo del editor | Fuente propuesta del borrador 1.4 |
| --- | --- |
| Responsable | Cabecera y apartado 1 |
| Domicilio | Cabecera y apartado 1 |
| Contacto ARCO | Cabecera y apartado 11 |
| Datos tratados | Apartado 3 |
| Datos sensibles | Apartado 4 |
| Finalidades | Apartado 5 |
| Finalidades con consentimiento | Apartado 6, tras validación jurídica |
| Limitación | Apartado 12 |
| Derechos ARCO | Apartado 11 |
| Cambios al aviso | Apartado 15 |
| Transferencias | Apartados 9 y 13 |
| Simplificado | Texto bajo `## Aviso simplificado` |
| Integral | Solo `## Aviso integral`, apartados 1–18, sin anexo |

Identificador final propuesto: `1.4-appstores-2026-10-25` **solo si esa es la versión aprobada**. No forzar una fecha efectiva sin confirmación.

## 4. Publicación consistente, por operación autorizada

1. Conservar copia exacta de versión 1.2 en Supabase y del documento público 1.3 como referencia de rollback.
2. Obtener aprobación jurídica y operativa del texto 1.4 y confirmar que ya puede comunicarse a personas con datos previamente recabados.
3. Preparar cambios del documento público canónico 1.4 en `docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md` y de declaraciones de tienda, manteniendo su URL HTML. Probar Pages (HTML compilado y URL pública desde navegador anónimo).
4. Desde cuenta Superadmin, crear/guardar borrador con los 13 campos requeridos, revisar vista previa y publicar **una sola vez**. Confirmar mediante consulta SQL de solo lectura: un único `status='published'`, versión exacta aprobada y contenido simplificado/integral idéntico al texto final.
5. Verificar en Android y web `/privacy`, alta con nueva versión, Ajustes, ARCO, recurso de eliminación y aviso externo. Registrar cualquier diferencia entre la publicación HTML y Supabase como **bloqueo** de Google Play.
6. Cuando corresponda, revisar si usuarios actuales necesitan un nuevo reconocimiento del aviso o aviso de cambio; no alterar `legal_accepted_at` ni simular aceptaciones.
7. Una vez consistentes ambas superficies y aprobada la revisión manual, capturar en Play Console las URL públicas y `Data safety` de acuerdo con `GOOGLE_PLAY_DATA_SAFETY.md` y con el **binario real**.
8. Si una comprobación falla, mantener el lanzamiento bloqueado, volver al texto/documento aprobado y usar los mecanismos administrativos de versión, sin reescribir aceptaciones pasadas.

## 5. Lista de lanzamiento Google Play, en orden

- [ ] Aviso 1.4 y página pública coherentes, ambos validados; `/privacy` y registro revisados.
- [ ] https://jjco2000.github.io/ucapsa-app/privacidad/ abre como HTML sin iniciar sesión, en navegador externo.
- [ ] https://jjco2000.github.io/ucapsa-app/eliminar-cuenta/ permite solicitar eliminación desde fuera de la app.
- [ ] Declaraciones `Data safety`, audiencia, anuncios, datos financieros, clasificación por contenido e instrucciones de acceso para revisión verificadas en Play Console.
- [ ] Verificar `targetSdkVersion >= 36` en el artefacto final (requisito desde 31-ago-2026 para nuevas entregas móviles).
- [ ] Pruebas físicas con roles de Cliente, Socio, Entrenador y Administración, QR, asistencias, exámenes, pagos solo lectura y eliminación.
- [ ] Evaluar los riesgos residuales `npm audit` de severidad alta; no confundir CI verde con cero vulnerabilidades.
- [ ] Cumplir, cuando sea aplicable a la cuenta, la prueba cerrada de 12 participantes continuos por 14 días y obtener acceso a Producción.
- [ ] Solo con autorización expresa para generar/firmar AAB: ejecutar workflow manual de AAB desde `main`; inspeccionar la versión, permisos, compatibilidad con páginas de 16 KB, Play App Signing y subir a la pista elegida en Play Console.

**No hay lanzamiento automático al fusionar PR.** Cada paso de publicación y aprobación debe tener su propio registro de resultado real.

## Referencias

- LFPDPPP vigente: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf
- Datos de Usuario de Google Play: https://support.google.com/googleplay/android-developer/answer/10144311?hl=es
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469?hl=es
- Eliminación: https://support.google.com/googleplay/android-developer/answer/13327111?hl=es
- Target API: https://support.google.com/googleplay/android-developer/answer/11926878?hl=es-mx
- Prueba cerrada (si aplica): https://support.google.com/googleplay/android-developer/answer/14151465?hl=es-419
