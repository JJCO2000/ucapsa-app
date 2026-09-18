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

## Cambios 4.x aplicados al remoto

### 4.1 — Menú del restaurante

- `supabase/sql/ucapsa-cambio-4-1-restaurant-menu.sql` ya fue aplicado al proyecto UCAPSA.
- El esquema remoto ya contiene `restaurant_menu_categories` y `restaurant_menu_items`.
- Los tipos TypeScript se pueden regenerar desde el remoto con `scripts/capture-supabase-source-of-truth.ps1` antes del merge final.
- El menú inicia vacío: no se insertan productos ni precios ficticios por SQL.

### 4.2 — Recordatorios automáticos de anuncios

- Edge Function: `supabase/functions/send-announcement-reminders` desplegada en el proyecto UCAPSA.
- Cron versionado en `supabase/sql/ucapsa-cambio-4-2-announcement-reminders-cron.sql`.
- `pg_cron` y `pg_net` están habilitados.
- El job `send-announcement-reminders-due` ejecuta `run_due` cada 5 minutos.
- El secreto compartido y la URL del proyecto se guardan en Supabase Vault; no se escriben valores secretos en GitHub.
- La Edge Function acepta el secreto legado `CRON_SECRET` si existe y, para el cron de base de datos, valida el secreto almacenado en Vault mediante `get_internal_cron_secret()`; esa función solo concede `execute` a `service_role`.
- La llamada cron fue probada contra la Edge Function y respondió HTTP 200.
- Desde Admin > Anuncios se pueden guardar hasta cinco anticipaciones entre 0 y 60 días y una hora local de Ciudad de México.

No guardar `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, secretos de Vault ni `EXPO_ACCESS_TOKEN` en este repositorio.

## Retiro del sistema histórico UCAPSA Points

- `supabase/sql/ucapsa-legacy-points-retirement.sql` detiene la generación automática y los ajustes manuales del ledger histórico sin borrar sus datos.
- Rango 1 queda como fuente canónica de Constancia, score, Rango, Ranking y Podio.

## Hardening de funciones internas

- `supabase/sql/ucapsa-security-definer-hardening.sql` revoca `EXECUTE` de `public`, `anon` y `authenticated` para helpers internos `SECURITY DEFINER` que no forman parte de la API cliente.
- `ucapsa_unlock_next_comandos_level(uuid)` conserva acceso explícito para `service_role` además del propietario de la función; el flujo normal sigue ejecutándose por trigger.
- Toda nueva función `SECURITY DEFINER` debe declarar explícitamente quién puede ejecutarla. No depender del privilegio `PUBLIC` por defecto.

## Sistemas que deben conservarse

- 3 QR oficiales permanentes: Puppy, Comandos y Socios; Socios registra visitas separadas de las asistencias de clase
- program sessions and real attendance rows
- versioned class schedules and cancellations
- payment obligations separated from payments
- `payment_settings` as the single banking source
- multiple dogs through `dogs` + `program_enrollments.dog_id`
- advanced dog profiles/documents disabled until explicitly activated
