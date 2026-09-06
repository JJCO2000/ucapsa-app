# SQL / Supabase - UCAPSA

Esta carpeta conserva SQL historico y capturas de auditoria. No debe contener llaves privadas, service_role ni datos de clientes.

## Fuente de verdad operativa desde Paso 9

1. El esquema remoto de Supabase es la realidad de ejecucion.
2. `src/types/database.generated.ts` se genera directamente desde el proyecto remoto enlazado.
3. `supabase/sql/audit/` guarda copias fechadas de los tipos **y un dump completo del esquema `public` sin datos**, incluyendo funciones, políticas, triggers e índices.
4. El código usa `createClient<Database>` para detectar drift entre frontend y base durante TypeScript.
5. Los cambios nuevos de base deben quedar en SQL/migraciones versionadas antes de considerarse cerrados.
6. Una captura sólo cuenta como válida cuando `source_of_truth_STEP9_*.txt` contiene SHA256 tanto de tipos como del dump remoto.

## Importante sobre el historial anterior

Parte de los cambios de Mejora Cliente se aplicaron mediante SQL manual antes de formalizar este flujo. Por eso el historial local de migraciones no debe asumirse completo solo por existir esta carpeta. No usar `migration repair`, `db reset`, `db push` o `db pull` para intentar corregirlo sin una auditoria especifica.

## Captura segura

Ejecutar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\capture-supabase-source-of-truth.ps1
```

La captura actualiza tipos desde el remoto y genera `remote_public_schema_STEP9_*.sql` mediante `supabase db dump --linked --schema public`; ese dump es obligatorio porque conserva la definición real de RPC, RLS, triggers e índices. Después guarda `migration list` y `db lint` como diagnósticos best-effort. No se exportan datos de clientes.

## Sistemas que deben conservarse

- 3 QR oficiales permanentes: Puppy, Comandos y Socios; Socios registra visitas separadas de las asistencias de clase
- program sessions and real attendance rows
- versioned class schedules and cancellations
- payment obligations separated from payments
- `payment_settings` as the single banking source
- multiple dogs through `dogs` + `program_enrollments.dog_id`
- advanced dog profiles/documents disabled until explicitly activated
