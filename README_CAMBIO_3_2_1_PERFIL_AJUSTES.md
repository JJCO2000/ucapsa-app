# Cambio 3.2.1 — Perfil limpio, panel de ajustes y flicker de carga

## Que cambia

- Perfil deja de cargar Notificaciones UCAPSA directamente.
- Perfil agrega engrane en la tarjeta superior para abrir el panel separado.
- Nuevo panel `src/app/account-settings.tsx`:
  - Notificaciones UCAPSA.
  - Mis datos.
  - Solicitar eliminacion de cuenta para clientes/socios.
  - Cerrar sesion.
  - Estadisticas administrativas para admin.
- Root layout muestra una pantalla de carga antes de montar rutas mientras se resuelve sesion/perfil.
- `useSession` evita renderizar con usuario cargado pero rol/perfil pendiente durante cambios de sesion.
- `LoadingScreen` queda con estilo UCAPSA para evitar el flash visual generico.

## Por que

Perfil ya se estaba saturando. Notificaciones, cuenta, eliminacion y estadisticas no deben competir con el contenido principal de Perfil.

## Validacion

```powershell
npx tsc --noEmit
npx expo start -c
```

Revisar:

1. Iniciar app desde frio.
2. Confirmar que no aparece el formato default raro antes de socio/admin.
3. Entrar a Perfil.
4. Tocar engrane.
5. Confirmar que abre Ajustes de cuenta.
6. Cliente/socio: ver Notificaciones, Mis datos, Solicitar eliminacion, Cerrar sesion.
7. Admin: ver Estadisticas, Notificaciones, Mis datos, Cerrar sesion.
