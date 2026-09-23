# App Store Connect — App Privacy de UCAPSA

Este archivo documenta la declaración que debe mantenerse alineada con la versión de la app que se publique.

## URL

- **Privacy Policy URL:** https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy
- **Privacy Choices URL:** puede usarse la misma URL por ahora; la eliminación se inicia dentro de la app en Ajustes > Eliminar cuenta.

## ¿La app recopila datos?

**Sí.** La app y sus proveedores tecnológicos recopilan datos necesarios para crear cuentas y operar los servicios.

## Datos a declarar

| Categoría Apple | Tipo | Vinculado a la identidad | Tracking | Finalidad principal |
| --- | --- | --- | --- | --- |
| Contact Info | Name | Sí | No | App Functionality |
| Contact Info | Email Address | Sí | No | App Functionality |
| Contact Info | Phone Number | Sí | No | App Functionality |
| Identifiers | User ID | Sí | No | App Functionality |
| Identifiers | Device ID | Sí | No | App Functionality (notificaciones/dispositivo) |
| Purchases | Purchase History | Sí | No | App Functionality (registro administrativo de pagos/membresías) |
| User Content | Other User Content | Sí | No | App Functionality (datos básicos del perro y notas operativas cuando existan) |
| Other Data | Other Data Types | Sí | No | App Functionality (clases, asistencias, progreso, membresía, logros, QR y registros operativos) |
| Usage Data | Product Interaction | Sí | No | Analytics (exposición a superficies de Constancia/Competencia para análisis interno de continuidad) |
| Diagnostics | Crash Data | No | No | App Functionality, Analytics (declaración conservadora requerida por la guía de Expo al usar `expo-updates`) |

## No declarar con la implementación actual

- Payment Info / datos de tarjeta: **No**. La app no recibe número de tarjeta, CVV ni credenciales bancarias del usuario.
- Precise Location / Coarse Location: **No**.
- Contacts: **No**.
- Photos or Videos: **No**, mientras no se habilite carga de fotografía del perro.
- Audio Data: **No**.
- Health / Fitness de la persona usuaria: **No**.
- Sensitive Info de la persona usuaria: **No**.
- Browsing History / Search History: **No**.
- Advertising Data: **No**.
- Diagnostics distintos de **Crash Data**: **No** con la implementación auditada. Volver a revisar si se habilita EAS Observe, Crashlytics, Sentry u otro SDK de diagnóstico.
- Advertising Data: **No**.

## Uso para tracking

**No se utilizan datos para tracking entre apps/sitios ni para publicidad dirigida.**

## Terceros relevantes

- Supabase: autenticación, base de datos y Edge Functions.
- Expo: EAS Update e infraestructura de notificaciones. EAS Update puede procesar sistema operativo, project ID y un token aleatorio de instalación/actualización; Expo Push procesa el token push cuando el usuario activa notificaciones.
- Apple Push Notification service (iOS): entrega de notificaciones.
- Firebase Cloud Messaging (Android): entrega de notificaciones en Android.

Si se añade nueva analítica, publicidad, carga de fotos, ubicación, pagos con tarjeta o cualquier nuevo SDK que recopile datos, este archivo, el aviso publicado y App Store Connect deben actualizarse antes de distribuir esa versión. La analítica interna actual de continuidad ya está declarada como Product Interaction / Analytics.
