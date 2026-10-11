-- UCAPSA — resumen de aforo para Entrenadores
--
-- México: 19:00 del día anterior (01:00 UTC). A esa hora los clientes ya
-- recibieron por la mañana su recordatorio de clase y tuvieron tiempo de RSVP.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $ucapsa$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'send-trainer-class-summary-next-day'
  order by jobid desc
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$ucapsa$;

select cron.schedule(
  'send-trainer-class-summary-next-day',
  '0 1 * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ucapsa_project_url'
        limit 1
      ) || '/functions/v1/send-trainer-class-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'ucapsa_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $cron$
);
