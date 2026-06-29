# UCAPSA App

Aplicación móvil MVP para UCAPSA.

## Objetivo

Centralizar comunicación oficial, calendario, socios, credencial digital con QR y administración básica de membresías/pagos manuales.

## Módulos actuales

- Inicio
- Anuncios
- Calendario
- Mi UCAPSA
- Perfil
- Admin de anuncios
- Admin de eventos
- Admin de socios
- Registro manual de pagos

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

MVP en desarrollo. Antes de producción se debe validar:

- RLS/policies de Supabase
- Flujos por rol: visitante, cliente, socio, admin y super_admin
- Assets reales de icono/splash
- Política de privacidad
- Eliminación de cuenta
- Build Android/iOS

## Decisiones MVP

- Pagos reales no están integrados todavía; los pagos se registran manualmente.
- La membresía no se cancela automáticamente por fecha o pago. Administración confirma cambios.
- El QR no debe contener datos personales.
- Admin Pagos y Admin Usuarios no se muestran como módulos principales hasta que tengan flujo real.
- La administración principal del MVP vive en Anuncios, Eventos y Socios.
