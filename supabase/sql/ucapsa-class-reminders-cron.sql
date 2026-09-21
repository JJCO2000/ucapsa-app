-- UCAPSA — scheduled class reminders
--
-- Production pg_cron runs in GMT. Current UCAPSA schedules start between
-- 10:00 and 13:30 America/Mexico_City, so 16:00 GMT triggers the next-day
-- reminder run at 10:00 local time. The Edge Function resolves the target date
-- in America/Mexico_City and class-reminder locks make the run idempotent.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto;

do $ucapsa$
declare
  v_job_id bigint;
begin
  if not exists (select 1 from vault.secrets where name = 'ucapsa_cron_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'ucapsa_cron_secret',
      'Shared secret for UCAPSA scheduled Edge Function invocations'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'ucapsa_project_url') then
    perform vault.create_secret(
      'https://hrfecmviyiluubymsoeq.supabase.co',
      'ucapsa_project_url',
      'UCAPSA Supabase project URL for scheduled Edge Function invocations'
    );
  end if;

  select jobid
    into v_job_id
  from cron.job
  where jobname = 'send-class-reminders-next-day'
  order by jobid desc
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$ucapsa$;

select cron.schedule(
  'send-class-reminders-next-day',
  '0 16 * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ucapsa_project_url'
        limit 1
      ) || '/functions/v1/send-class-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'ucapsa_cron_secret'
          limit 1
        )
      ),
      body := '{"days_ahead":1,"reminder_type":"class_24h"}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $cron$
);
