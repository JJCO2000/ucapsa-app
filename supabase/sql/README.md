# SQL / Supabase - UCAPSA

Esta carpeta conserva SQL historico y capturas de auditoria. No debe contener llaves privadas, service_role ni datos de clientes.

## Fuente de verdad operativa desde Paso 9

1. El esquema remoto de Supabase es la realidad de ejecucion.
2. `src/types/database.generated.ts` se genera directamente desde el proyecto remoto enlazado.
3. `supabase/sql/audit/` guarda copias fechadas de esos tipos y diagnosticos de CLI.
4. El codigo usa `createClient<Database>` para detectar drift entre frontend y base durante TypeScript.
5. Los cambios nuevos de base deben quedar en SQL/migraciones versionadas antes de considerarse cerrados.

## Importante sobre el historial anterior

Parte de los cambios de Mejora Cliente se aplicaron mediante SQL manual antes de formalizar este flujo. Por eso el historial local de migraciones no debe asumirse completo solo por existir esta carpeta. No usar `migration repair`, `db reset`, `db push` o `db pull` para intentar corregirlo sin una auditoria especifica.

## Captura segura

Ejecutar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\capture-supabase-source-of-truth.ps1
```

La captura actualiza tipos desde el remoto y guarda `migration list` y `db lint` como diagnosticos best-effort. Si esos dos comandos requieren una conexion de base que no este disponible, los tipos remotos siguen siendo el gate obligatorio para compilar la app.

## Cambios 4.x pendientes de aplicar al remoto

### 4.1 — Menú del restaurante

1. Ejecutar `supabase/sql/ucapsa-cambio-4-1-restaurant-menu.sql` en el SQL Editor del proyecto correcto.
2. Volver a ejecutar `scripts/capture-supabase-source-of-truth.ps1` para regenerar los tipos desde el remoto.
3. Verificar desde Admin > Restaurante que se pueda crear una categoría y un producto; no se insertan productos ficticios por SQL.

### Recordatorios de anuncios

No requieren tablas nuevas: reutilizan `notification_campaigns`, `notification_deliveries`, `notification_tokens` y `notification_preferences`.

1. Desplegar la Edge Function `supabase/functions/send-announcement-reminders`.
2. Configurarla con las mismas variables seguras de las funciones de notificaciones (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` y, si aplica, `EXPO_ACCESS_TOKEN`).
3. El programador/cron debe invocar `POST` con `{"action":"run_due"}` y el header `x-cron-secret`. Una ejecución cada 5–15 minutos es suficiente; la función bloquea cada campaña al pasarla de `draft` a `sending` antes de enviarla.
4. Desde Admin > Anuncios se pueden guardar hasta cinco anticipaciones entre 0 y 60 días y una hora local de Ciudad de México.

No guardar `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` ni `EXPO_ACCESS_TOKEN` en este repositorio.

## Sistemas que deben conservarse

- 3 QR oficiales permanentes: Puppy, Comandos y Socios; Socios registra visitas separadas de las asistencias de clase
- program sessions and real attendance rows
- versioned class schedules and cancellations
- payment obligations separated from payments
- `payment_settings` as the single banking source
- multiple dogs through `dogs` + `program_enrollments.dog_id`
- advanced dog profiles/documents disabled until explicitly activated
