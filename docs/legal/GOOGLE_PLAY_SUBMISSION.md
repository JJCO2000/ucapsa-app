# Google Play — Checklist de publicación UCAPSA

**Revisión:** 22 de septiembre de 2026  
**Package:** `com.jjcc2000.ucapsaapp`

## Política y privacidad

- [x] Política de privacidad pública.
- [x] Política de privacidad accesible dentro de la app.
- [x] Identidad del responsable y correo de privacidad.
- [x] Política de conservación/eliminación.
- [x] Eliminación de cuenta dentro de la app.
- [x] Recurso web externo para solicitar eliminación sin volver a la app.
- [x] Data Safety documentado contra el código y proveedores.
- [x] Datos cifrados en tránsito.
- [x] Sin venta de datos ni publicidad/tracking con la implementación actual.

**Privacy Policy URL**  
https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy

**Account deletion URL**  
https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/account-deletion-request

## App content de Play Console

- **Data safety:** capturar según `docs/legal/GOOGLE_PLAY_DATA_SAFETY.md`.
- **Ads:** No. La app no integra SDK publicitario ni muestra anuncios.
- **Target audience:** 18 años o más. El registro de UCAPSA App no permite cuentas propias de menores.
- **Restrict access to minors:** recomendable activar la restricción de Google Play para coherencia con el producto 18+.
- **Content rating:** completar cuestionario IARC con el contenido real de UCAPSA.
- **App access:** la mayor parte de la funcionalidad requiere cuenta. Proporcionar a revisión una cuenta reutilizable y vigente con instrucciones suficientes para recorrer las funciones protegidas.
- **Financial features declaration:** debe completarse en Play Console aunque la respuesta sea “sin funciones financieras”. UCAPSA no funciona como banco, cartera, prestamista, exchange, corredor, transferencia P2P ni otro servicio financiero. El módulo de pagos es un registro auxiliar de servicios propios.
- **Health apps declaration:** no aplica con la implementación actual.
- **News apps declaration:** no aplica.
- **Government apps declaration:** no aplica.

## Android técnico

- [x] Expo SDK 57 / React Native 0.86.
- [x] Android `targetSdkVersion 36`, compatible con el requisito de Google Play vigente desde 31 de agosto de 2026 para apps nuevas y actualizaciones.
- [x] Sin permisos de ubicación.
- [x] Sin lectura de contactos.
- [x] Sin permisos de almacenamiento externo legado.
- [x] `RECORD_AUDIO` bloqueado.
- [x] Cámara limitada al flujo de escaneo QR y declarada con finalidad visible.
- [x] Notificaciones solicitadas sólo cuando el usuario decide activarlas.
- [x] Sin Advertising ID ni SDK publicitario detectado.
- [x] React Native 0.86 hereda soporte de tamaños de página Android de 16 KB; la compatibilidad final de todas las librerías nativas debe verificarse sobre el AAB/Play Console antes de producción.
- [ ] Verificar el AAB final contra el requisito de páginas de memoria de 16 KB. Google Play bloqueará actualizaciones incompatibles a partir del 1 de febrero de 2027.

## Pagos

Los cobros de UCAPSA corresponden a servicios físicos de adiestramiento/membresía. Google Play Billing no debe utilizarse para esos servicios físicos. Si en el futuro se venden contenidos, funciones o suscripciones digitales consumidas dentro de la app, volver a revisar la política de pagos antes de implementarlos.

## Requisitos que dependen de Play Console y no pueden cerrarse en código

- Crear/finalizar ficha de Play Store: nombre (máximo 30 caracteres), descripción breve (máximo 80), descripción completa (máximo 4000), icono, feature graphic, capturas y datos de contacto.
- Configurar Play App Signing y conservar de forma segura la clave de subida. Las apps nuevas se incorporan a Play App Signing al preparar la primera versión.
- Generar un AAB firmado para la versión de tienda; las apps nuevas de Google Play se publican como Android App Bundle.
- Completar IARC.
- Capturar Data Safety.
- Capturar Target audience / Content and audience.
- Capturar App access y credenciales de revisión.
- Confirmar Ads = No.
- Confirmar las demás declaraciones de App content que Play Console muestre para la cuenta.
- Si la cuenta de desarrollador de Google Play es una **cuenta personal creada después del 13 de noviembre de 2023**, Google puede exigir una prueba cerrada con al menos 12 testers durante 14 días continuos antes de solicitar acceso a producción. Debe verificarse en la propia cuenta de Play Console.
- Generar y subir un **Android App Bundle (AAB)** firmado de producción cuando se decida publicar. Este repositorio no debe generarlo automáticamente.

## Regla de cambio

Cualquier nueva recopilación de datos, permiso, SDK, funcionalidad financiera, publicidad, menores, pagos digitales o proveedor requiere revisar nuevamente:
1. Aviso de Privacidad.
2. Data Safety de Google Play.
3. App Privacy de Apple.
4. Permisos/manifiestos nativos.
5. Términos de Uso cuando afecte las reglas del servicio.
