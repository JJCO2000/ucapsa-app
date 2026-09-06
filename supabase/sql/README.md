# SQL / Supabase - UCAPSA

Esta carpeta conserva SQL historico y capturas de auditoria. No debe contener llaves privadas, service_role ni datos de clientes.

## Fuente de verdad operativa desde Paso 9

1. El esquema remoto de Supabase es la realidad de ejecucion.
2. `src/types/database.generated.ts` se genera directamente desde el proyecto remoto enlazado.
3. `supabase/sql/audit/` conserva capturas fechadas de tipos y metadatos remotos de esquema sin datos de clientes.
4. El codigo usa `createClient<Database>` para detectar drift entre frontend y base durante TypeScript.
5. Los cambios nuevos de base deben quedar en SQL/migraciones versionadas antes de considerarse cerrados.
6. Docker Desktop **no es requisito del proyecto**. Si existe, el script puede generar adicionalmente un `db dump`; si no existe, continua con tipos, migraciones y lint. La auditoria remota de tablas, RLS, politicas, funciones, triggers, indices y constraints se guarda como manifiesto separado.

## Importante sobre el historial anterior

Parte de los cambios de Mejora Cliente se aplicaron mediante SQL manual antes de formalizar este flujo. Por eso el historial local de migraciones no debe asumirse completo solo por existir esta carpeta. No usar `migration repair`, `db reset`, `db push` o `db pull` para intentar corregirlo sin una auditoria especifica.

## Captura segura local

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\capture-supabase-source-of-truth.ps1
```

Siempre actualiza los tipos remotos. Si Docker esta disponible y activo, tambien intenta un dump del esquema `public`; de lo contrario lo omite sin bloquear el flujo. `migration list` y `db lint` son diagnosticos best-effort. No se exportan datos de clientes.

## Sistemas que deben conservarse

- 3 QR oficiales permanentes: Puppy, Comandos y Socios; Socios registra visitas separadas de las asistencias de clase
- program sessions and real attendance rows
- versioned class schedules and cancellations
- payment obligations separated from payments
- `payment_settings` as the single banking source
- multiple dogs through `dogs` + `program_enrollments.dog_id`
- advanced dog profiles/documents disabled until explicitly activated
