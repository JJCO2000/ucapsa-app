# UCAPSA Cambio 3.2 — Base real de notificaciones

Este patch agrega la base de notificaciones reales sin enviar pushes todavía.

## Qué incluye

- `src/services/notifications.service.ts`
- `src/hooks/useNotifications.ts`
- `src/components/domain/NotificationSettingsCard.tsx`
- Integración en `src/app/(tabs)/profile.tsx`
- Tipos nuevos en `src/types/app.types.ts`
- Limpieza del token guardado al cerrar sesión en `src/hooks/useSession.tsx`
- `expo-notifications` en `package.json`
- Plugin `expo-notifications` en `app.json`

## Qué NO incluye todavía

- Envío de anuncios desde admin.
- Historial de campañas.
- Recordatorios automáticos.
- Cancelaciones automáticas.
- Supabase Cron.

Eso corresponde a 3.3, 3.4 y 3.5.

## Orden correcto para aplicar

1. Ejecuta el SQL separado en Supabase SQL Editor:
   `ucapsa-cambio-3-2-notificaciones.sql`

2. En la raíz del proyecto instala la dependencia compatible con Expo:

```bash
npx expo install expo-notifications expo-constants
```

3. Copia los archivos del ZIP encima del proyecto respetando carpetas.

4. Corre validación:

```bash
npx tsc --noEmit
npx expo config --type public
```

5. Para probar push real, usa development build o APK de EAS. Expo Go no es suficiente para push reales en Android moderno.

## Flujo esperado en la app

Perfil > Notificaciones UCAPSA

- El usuario ve la tarjeta.
- Presiona “Activar notificaciones”.
- Android/iOS pide permiso.
- La app obtiene ExpoPushToken.
- Supabase guarda el token en `notification_tokens`.
- Supabase guarda preferencias en `notification_preferences`.
- Al cerrar sesión, se intenta desactivar el token almacenado del dispositivo actual.

## Punto de control

Después de activar notificaciones en un celular real, revisa en Supabase:

```sql
select * from public.notification_preferences order by updated_at desc;
select user_id, platform, is_active, last_registered_at, disabled_at from public.notification_tokens order by updated_at desc;
```
