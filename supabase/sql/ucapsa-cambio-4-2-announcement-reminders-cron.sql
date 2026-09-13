-- UCAPSA Cambio 4.2 — Cron seguro para recordatorios de anuncios
-- Ejecutar en el proyecto Supabase de UCAPSA.
-- Habilita pg_cron + pg_net, guarda secretos en Vault y ejecuta run_due cada 5 minutos.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto;

do $$
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
end;
$$;

create or replace function public.get_internal_cron_secret()
returns text
language sql
security definer
set search_path = vault, public, pg_catalog
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'ucapsa_cron_secret'
  limit 1;
$$;

revoke all on function public.get_internal_cron_secret() from public;
revoke all on function public.get_internal_cron_secret() from anon;
revoke all on function public.get_internal_cron_secret() from authenticated;
grant execute on function public.get_internal_cron_secret() to service_role;

select cron.schedule(
  'send-announcement-reminders-due',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ucapsa_project_url'
        limit 1
      ) || '/functions/v1/send-announcement-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'ucapsa_cron_secret'
          limit 1
        )
      ),
      body := '{"action":"run_due"}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $cron$
);
