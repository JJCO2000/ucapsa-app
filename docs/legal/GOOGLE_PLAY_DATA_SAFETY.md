# Google Play — Data Safety de UCAPSA App

**Revisión:** 22 de septiembre de 2026  
**Aplicación:** UCAPSA  
**Package:** `com.jjcc2000.ucapsaapp`

Este archivo documenta la declaración que debe capturarse en **Play Console → App content → Data safety**. Debe mantenerse alineada con el binario que se publique y con el Aviso de Privacidad.

## Respuestas generales

- **¿La app recopila o comparte datos de usuario?** Sí.
- **¿Los datos se cifran en tránsito?** Sí. La aplicación utiliza conexiones HTTPS/TLS con Supabase y Expo; los servicios de push de Expo se conectan cifrados a APNs/FCM.
- **¿Los usuarios pueden solicitar eliminación de datos?** Sí.
- **Ruta dentro de la app:** Ajustes → Eliminar cuenta.
- **Recurso web externo:** https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/account-deletion-request
- **¿Se venden datos?** No.
- **¿Se comparten datos con terceros para publicidad o finalidades propias de esos terceros?** No con la implementación actual. Supabase, Expo, APNs y FCM actúan como proveedores/encargados necesarios para prestar el servicio.
- **Publicidad/marketing:** No.

## Tipos de datos a declarar

| Categoría Google Play | Tipo | Recopilado | Compartido | Obligatorio/opcional | Finalidades |
| --- | --- | --- | --- | --- | --- |
| Información personal | Nombre | Sí | No | Obligatorio al crear cuenta | Funcionalidad de la app; Gestión de cuentas |
| Información personal | Dirección de correo electrónico | Sí | No | Obligatorio | Funcionalidad de la app; Gestión de cuentas; Comunicaciones del desarrollador cuando corresponda |
| Información personal | Número de teléfono | Sí | No | Opcional | Funcionalidad de la app; Gestión de cuentas |
| Información personal | IDs de usuario | Sí | No | Obligatorio | Funcionalidad de la app; Gestión de cuentas; Prevención de fraudes, seguridad y cumplimiento |
| IDs de dispositivo o de otro tipo | IDs de dispositivo o de otro tipo | Sí | No | Opcional: se registran al activar notificaciones | Funcionalidad de la app; Comunicaciones del desarrollador |
| Información financiera | Historial de compras | Sí | No | Según exista una obligación/pago | Funcionalidad de la app; Analíticas internas |
| Actividad en aplicaciones | Interacciones con la aplicación | Sí | No | Se genera al usar superficies concretas de Competencia/Constancia | Analíticas |
| Actividad en aplicaciones | Otro contenido generado por el usuario | Sí | No | Opcional | Funcionalidad de la app; datos básicos del perro vinculados a la cuenta |
| Actividad en aplicaciones | Otras acciones | Sí | No | Según el uso | Funcionalidad de la app; Analíticas internas: clases, asistencias, prácticas, progreso, membresías, visitas y actividad operativa |
| Información y rendimiento de aplicaciones | Registros de fallos | Sí | No | Automático cuando la infraestructura integrada los procesa | Funcionalidad de la app; Analíticas |

## No declarar con la implementación actual

- Ubicación aproximada o precisa.
- Información de pago como números de tarjeta, CVV o credenciales bancarias del usuario.
- Puntuación crediticia u otra información financiera ajena al historial administrativo de pagos de UCAPSA.
- Contactos del dispositivo.
- Mensajes SMS/MMS, correos del dispositivo o mensajes de chat.
- Fotos o vídeos del usuario.
- Archivos o documentos del usuario.
- Audio o grabaciones de voz.
- Datos de salud o fitness de una persona.
- Calendario o agenda del dispositivo.
- Historial de navegación web.
- Historial de búsqueda.
- Identificadores de publicidad.
- Datos para publicidad o marketing.

## Notas de precisión

1. **Historial de compras no significa datos de tarjeta.** UCAPSA conserva registros administrativos de pagos/membresías, pero la app no procesa el instrumento de pago.
2. **Interacciones con la aplicación sí se recopilan.** `ucapsa_value_exposures` registra exposición a superficies de Constancia/Competencia y permite análisis interno de continuidad. No se utiliza para anuncios ni tracking entre apps.
3. **Notificaciones son opcionales.** Expo push token, plataforma, nombre/identificador técnico del dispositivo y versión de la app se registran únicamente al activar notificaciones.
4. **Crash Data.** UCAPSA integra `expo-updates`; la guía oficial de Expo para tiendas indica declarar Crash Data. Si en una versión futura se elimina `expo-updates` o cambia el proveedor, volver a revisar esta fila.
5. **Proveedores.** El tratamiento por Supabase, Expo, APNs y FCM no se marca como “compartido” mientras actúen únicamente como proveedores/encargados bajo las instrucciones de UCAPSA.
6. Si se añade un SDK de analítica, publicidad, ubicación, carga de fotos, pagos con tarjeta, Health Connect o cualquier nuevo tratamiento, actualizar este archivo, el Aviso de Privacidad y Play Console **antes** de distribuir esa versión.
