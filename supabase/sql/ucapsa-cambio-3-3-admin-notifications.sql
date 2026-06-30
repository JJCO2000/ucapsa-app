-- UCAPSA Cambio 3.3 — Envio manual de notificaciones admin
-- Ejecutar en Supabase SQL Editor despues de Cambio 3.2.
-- Esta fase crea historial/campanas y entregas. El envio real lo hace la Edge Function send-notification.

create extension if not exists pgcrypto;

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'public' check (audience in ('public', 'clients', 'members', 'admins')),
  category text not null default 'announcements_events' check (category in ('announcements_events', 'classes', 'membership', 'achievements')),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'partial_failed', 'failed', 'no_targets')),
  total_targets integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_campaigns_created_at_idx on public.notification_campaigns(created_at desc);
create index if not exists notification_campaigns_created_by_idx on public.notification_campaigns(created_by);
create index if not exists notification_campaigns_status_idx on public.notification_campaigns(status);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.notification_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid references public.notification_tokens(id) on delete set null,
  expo_push_token text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'error')),
  expo_response jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_deliveries_campaign_id_idx on public.notification_deliveries(campaign_id);
create index if not exists notification_deliveries_user_id_idx on public.notification_deliveries(user_id);
create index if not exists notification_deliveries_status_idx on public.notification_deliveries(status);

-- Reusar trigger global de Cambio 3.2 si existe. Si no existe, crearlo.
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_notification_campaigns_updated_at on public.notification_campaigns;
create trigger set_notification_campaigns_updated_at
before update on public.notification_campaigns
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_notification_deliveries_updated_at on public.notification_deliveries;
create trigger set_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row
execute function public.set_updated_at_timestamp();

alter table public.notification_campaigns enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "Admins can read notification campaigns" on public.notification_campaigns;
create policy "Admins can read notification campaigns"
on public.notification_campaigns
for select
to authenticated
using (public.is_ucapsa_admin());

drop policy if exists "Admins can read notification deliveries" on public.notification_deliveries;
create policy "Admins can read notification deliveries"
on public.notification_deliveries
for select
to authenticated
using (public.is_ucapsa_admin());

-- Inserciones/updates los realiza la Edge Function con service_role.
-- No se concede insert/update directo desde la app para evitar que un cliente fabrique envios.
