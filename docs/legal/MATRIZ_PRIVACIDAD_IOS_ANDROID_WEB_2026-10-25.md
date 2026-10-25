# UCAPSA — Matriz única de privacidad para Android, iOS y web

**ESTADO POSTERIOR A ESTA MATRIZ (25-10-2026):** Supabase registra `1.4-appstores-2026-10-25` como **única versión `published`** (1.2 `retired`); el documento web canónico pasó a 1.4 en PR #561. Las filas comparativas originales de 1.2 / 1.3 / borrador 1.4 se conservan como **línea base histórica**, no como estado actual. Aún falta verificar acceso HTTP al sitio después del despliegue y no se asume aprobación externa de Apple/Google.


**Fecha de comparación:** 25 de octubre de 2026. **Naturaleza:** verificación documental; no constituye aprobación jurídica, de Google Play ni de Apple. **No activa ningún tratamiento ni cambia la versión publicada.**

## 1. Fuente oficial y versiones reales

Una sola política de tratamiento debe cubrir la app Android, la app iOS y la experiencia web; los formularios de las tiendas sólo *declaran* sus categorías con clasificaciones propias. No deben modificarse los hechos para forzar que coincidan las etiquetas.

| Fuente | Referencia real | Estado comprobado |
| --- | --- | --- |
| Base, aceptación legal y pantalla `/privacy` | `public.privacy_notices`, única `published` | `1.2-appstores-2026-09-27` |
| Sitio público común de ambas tiendas | `docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md`, GitHub Pages `/privacidad/` | `1.3 App Stores`; **distinto** de Supabase |
| Texto para actualizar todas las superficies | `BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md` | Candidato `1.4`; **sin publicación ni aprobación formal** |
| Google Play | `GOOGLE_PLAY_DATA_SAFETY.md` | Declaración propuesta, no respuesta verificada en Play Console |
| Apple App Store | `APP_STORE_PRIVACY.md` | Declaración propuesta, no respuesta verificada en App Store Connect |
| Eliminación web | `/eliminar-cuenta/` + `ELIMINAR_CUENTA_UCAPSA_APP.md` | Página de solicitud por correo; no equivale a eliminación automática |

**Advertencia:** cambiar sólo el HTML o sólo Supabase mantendría una contradicción jurídica; no publicar el candidato 1.4 por este documento.

## 2. Comparación por tipo de dato (misma realidad, taxonomías diferentes)

| Tratamiento UCAPSA, según código/documentación | Google Play Data Safety | Apple App Privacy | Web / aviso único |
| --- | --- | --- | --- |
| Nombre de cliente, socio y titular preinscrito | Personal info / Name | Contact Info / Name | Identificación; finalidad operativa y captura previa a cuenta |
| Contactos de titulares y familiares provisionalmente inscritos | Personal info / Email Address, Phone Number | Contact Info / Email Address, Phone Number | Distinguir titular/familiar; **no presumir consentimiento, identidad ni acceso familiar** |
| Cuenta, identificador, autenticación | Personal info / User IDs | Identifiers / User ID | Explicar creación, acceso, recuperación y supresión |
| Token de push / identificadores técnicos | Device or other IDs | Identifiers / Device ID, según tratamiento real | Sólo notificaciones y operación, distinguir lo opcional |
| Historial administrativo de pagos y membresías | Financial info / Purchase history | Purchases / Purchase History | **No** implica capturar número de tarjeta, CVV o banca |
| Nombre, raza y otros datos de perros, clases y progresos | App activity / Other user-generated content, Other actions | User Content / Other User Content; Other Data | Contenido vinculado a cuenta, accesible según permisos |
| Foto **privada y opcional** de perro | Photos and videos / Photos | User Content / Photos or Videos | Indicar uso privado, almacenamiento y eliminación; **no afirmar publicación a rankings** |
| Exposición interna a Competencia/Constancia | App activity / App interactions | Usage Data / Product Interaction | Analítica interna; no concluir tracking/publicidad |
| Diagnósticos y fallos según Expo SDK | App info and performance / Crash logs | Diagnostics / Crash Data | Declaración conservadora; comprobar SDK exacto antes de envío |

El alcance resumido procede de los dos documentos de tienda existentes. **Las etiquetas son propuestas**, no se ha contrastado aquí el formulario enviado ni un binario aprobado por Apple/Google. Los proveedores Supabase, Expo, APNs y FCM exigen verificar el uso real de SDKs y relaciones de encargo antes de calificar datos como «no compartidos» para Play.

## 3. Requisitos verificados en fuentes oficiales

| Requisito | Google Play | Apple iOS | UCAPSA y acción |
| --- | --- | --- | --- |
| URL de aviso pública y accesible, además de acceso dentro de la app | Obligatorio | Obligatorio | Existe `/privacidad/` y pantalla `/privacy`; **reconciliar texto/versiones** |
| Declaración de datos (incluidos SDKs) | Data Safety | App Privacy | Documentos preparados; **confirmar formularios en consolas con el binario exacto** |
| Inicio de eliminación desde la app | Obligatorio si crea cuentas | Obligatorio si crea cuentas | Ajustes → Eliminar cuenta; handler nuevo en `main` **no desplegado** |
| Eliminación desde recurso web | URL externa obligatoria | URL de privacidad obligatoria; Privacy Choices opcional | `/eliminar-cuenta/` permite solicitar por correo, válido como vía de solicitud según Google |
| Suprimir datos vinculados al eliminar, salvo retención justificada | Obligatorio | Obligatorio | RPC/Storage/retención preparados, **no probado en backend real** |
| Datos recibidos de terceros/familiares | Informar y reflejar las categorías reales | Describir recogida, usos y autorizaciones | Borrador 1.4 cubre finalidad, pero **faltan constancias personales integradas en UI/RPC/DB** |

**Referencias oficiales consultadas el 25-10-2026**:
- Google User Data: https://support.google.com/googleplay/android-developer/answer/10144311
- Google account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Apple App Review 5.1.1: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/
- Apple App Privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- México, LFPDPPP consolidada: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf

## 4. Decisión técnica para el cierre real

**No están completos los objetivos en producción.** No confundir: `main` fusionado, CI verde, aviso publicado y tratamiento operativo son cuatro hechos diferentes.

### Aviso
1. Confirmar responsable, domicilio y canal ARCO del borrador 1.4 con documentación del responsable. Revisar la comunicación del aviso a titulares y familiares antes de capturar sus datos.
2. Integrar las constancias de cada persona en Admin/Entrenador/agregado tardío, RPC y triggers *en conjunto*, sin habilitar sólo el SQL. Evitar imponer verificación general de correo/SMS; no adjudicar consentimiento de tercero.
3. Aprobar versión efectiva de 1.4 por persona facultada. Publicar **desde el editor de Superadmin** y actualizar el HTML canónico con exactamente el mismo contenido. Conservar evidencia de avisos anteriores.
4. Ejecutar comprobación real de texto completo (no sólo número): `npm run check:play-privacy-live` con clave **pública**; comparar la URL pública y `public.privacy_notices`.
5. Actualizar formularios **Data Safety y App Privacy** en sus respectivas consolas según versión real de Android e iOS.

### Eliminación de cuenta
1. La pantalla Ajustes y la página pública permiten iniciar solicitud. La versión de producción de Edge continúa `delete-account` v2; no afirmar que ejecuta el código de `main`.
2. El nuevo handler depende de `account_deletion_has_blocking_references`, aún sin instalar; además existe el bloqueo por conservación. No desplegar el handler por separado.
3. Completar prueba de Auth + Storage + FK + auditoría con usuario sintético en entorno aislado antes de aplicar el SQL y Edge; no eliminar cuentas reales de prueba.
4. Registrar validaciones ejecutadas y las omitidas; **no sustituir resultados por suposiciones**. La cuenta de Superadmin se gestiona por proceso separado, no por el botón de cliente.

### Condición para envío a tiendas

**NO PUBLICAR / NO DECLARAR LISTO** mientras estén desalineados el aviso web y Supabase, o mientras la vía operativa de eliminación y la privacidad de preinscripción no estén verificadas. Las compilaciones de desarrollo y PRs no son publicaciones en tiendas.

Esta matriz compara las tres superficies, no crea un cuarto aviso ni sustituye el borrador legal; la fuente normativa que se publicará sigue siendo una sola versión aprobada de `privacy_notices` alineada con el HTML.
