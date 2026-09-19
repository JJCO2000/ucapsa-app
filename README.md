# UCAPSA App

Aplicación móvil MVP para UCAPSA.

## Objetivo

Centralizar comunicación oficial, calendario, socios, credencial digital con QR y administración básica de membresías/pagos manuales.

## Módulos actuales

### Cliente / socio

- Inicio
- Servicios
- Clases
- Pagos
- Perros
- Competencia / Ranking / Constancia
- Membresía y credencial QR
- Anuncios y calendario
- Perfil y ajustes de cuenta

### Administración

- Inicio
- Clientes
- Inscripciones y clases
- Horarios, cancelaciones y asistencias
- Pagos manuales y configuración bancaria
- Anuncios, eventos y notificaciones
- Membresías y visitas por QR
- Competencia UCAPSA: temporadas, ranking, constancia, ajustes, premios y exámenes
- Continuidad / evidencia de valor
- Bajas de cuenta
- Versionado y publicación del aviso de privacidad

## Tecnologías

- Expo
- React Native
- Expo Router
- TypeScript
- Supabase
- AsyncStorage
- React Native Calendars
- QRCode SVG

## Comandos

Instalar dependencias:

```bash
npm install
```

Iniciar desarrollo:

```bash
npx expo start
```

Revisar TypeScript:

```bash
npx tsc --noEmit
```

Revisar lint:

```bash
npx expo lint
```

## Variables de entorno

Crear un archivo `.env` usando `.env.example` como base:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

No subir `.env` ni llaves privadas al repositorio.

## Estado

La app continúa en desarrollo, pero la arquitectura crítica ya tiene guards de CI y migraciones versionadas para RLS, roles, historial, pagos, membresías, competencia, continuidad y bajas de cuenta.

Antes de considerar una salida a producción todavía deben resolverse o verificarse explícitamente:

- Publicar en la app una versión **real y jurídicamente aprobada** del aviso de privacidad. El sistema de versiones ya existe, pero producción no tiene una versión publicada.
- Activar en Supabase Auth la **protección contra contraseñas filtradas** y revisar que la política de contraseña del servidor esté alineada con la regla de cliente.
- Ejecutar la validación final por rol en dispositivos reales: visitante, cliente, socio, admin y super_admin.
- Validar assets finales de icono/splash y comportamiento Android/iOS.
- Generar builds o publicar en tiendas **sólo por instrucción explícita**; CI no debe disparar EAS Build/Update automáticamente.

La existencia de guards y CI verde no sustituye la revisión jurídica ni la validación operativa final.

## Decisiones MVP

- Pagos reales no están integrados todavía; los pagos se registran manualmente.
- La membresía no se cancela automáticamente por fecha o pago. Administración confirma cambios.
- El QR no debe contener datos personales.
- Admin Pagos y Admin Usuarios no se muestran como módulos principales hasta que tengan flujo real.
- La administración principal del MVP vive en Anuncios, Eventos y Socios.
