-- UCAPSA Cambio 3.2 — Base real de notificaciones
-- Ejecutar en Supabase SQL Editor antes de probar la app.
-- Esta fase SOLO registra dispositivos y preferencias. No envia pushes todavia.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_ucapsa_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin', 'super_admin')
  );
$$;

grant execute on function public.is_ucapsa_admin() to authenticated;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  announcements_events boolean not null default true,
  classes boolean not null default true,
  membership boolean not null default true,
  achievements boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at_timestamp();

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can read own notification preferences" on public.notification_preferences;
create policy "Users can read own notification preferences"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id or public.is_ucapsa_admin());

drop policy if exists "Users can insert own notification preferences" on public.notification_preferences;
create policy "Users can insert own notification preferences"
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own notification preferences" on public.notification_preferences;
create policy "Users can update own notification preferences"
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id or public.is_ucapsa_admin())
with check (auth.uid() = user_id or public.is_ucapsa_admin());

create table if not exists public.notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'unknown')),
  device_name text,
  device_id text,
  app_ownership text,
  app_version text,
  project_id text,
  is_active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_tokens_user_id_idx on public.notification_tokens(user_id);
create index if not exists notification_tokens_active_idx on public.notification_tokens(is_active) where is_active = true;

drop trigger if exists set_notification_tokens_updated_at on public.notification_tokens;
create trigger set_notification_tokens_updated_at
before update on public.notification_tokens
for each row
execute function public.set_updated_at_timestamp();

alter table public.notification_tokens enable row level security;

drop policy if exists "Users can read own notification tokens" on public.notification_tokens;
create policy "Users can read own notification tokens"
on public.notification_tokens
for select
to authenticated
using (auth.uid() = user_id or public.is_ucapsa_admin());

drop policy if exists "Users can insert own notification tokens" on public.notification_tokens;
create policy "Users can insert own notification tokens"
on public.notification_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own notification tokens" on public.notification_tokens;
create policy "Users can update own notification tokens"
on public.notification_tokens
for update
to authenticated
using (auth.uid() = user_id or public.is_ucapsa_admin())
with check (auth.uid() = user_id or public.is_ucapsa_admin());

create or replace function public.upsert_notification_token(
  p_expo_push_token text,
  p_platform text default 'unknown',
  p_device_name text default null,
  p_device_id text default null,
  p_app_ownership text default null,
  p_app_version text default null,
  p_project_id text default null
)
returns public.notification_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.notification_tokens;
  v_platform text := coalesce(nullif(trim(p_platform), ''), 'unknown');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_expo_push_token), '') is null then
    raise exception 'Expo push token requerido';
  end if;

  if v_platform not in ('ios', 'android', 'web', 'unknown') then
    v_platform := 'unknown';
  end if;

  update public.notification_tokens
  set user_id = v_user_id,
      platform = v_platform,
      device_name = p_device_name,
      device_id = p_device_id,
      app_ownership = p_app_ownership,
      app_version = p_app_version,
      project_id = p_project_id,
      is_active = true,
      disabled_at = null,
      last_registered_at = now(),
      updated_at = now()
  where expo_push_token = p_expo_push_token
  returning * into v_row;

  if found then
    return v_row;
  end if;

  insert into public.notification_tokens (
    user_id,
    expo_push_token,
    platform,
    device_name,
    device_id,
    app_ownership,
    app_version,
    project_id
  ) values (
    v_user_id,
    p_expo_push_token,
    v_platform,
    p_device_name,
    p_device_id,
    p_app_ownership,
    p_app_version,
    p_project_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.disable_notification_token(
  p_expo_push_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.notification_tokens
  set is_active = false,
      disabled_at = now(),
      updated_at = now()
  where expo_push_token = p_expo_push_token
    and user_id = v_user_id;
end;
$$;

revoke all on function public.upsert_notification_token(text, text, text, text, text, text, text) from public;
revoke all on function public.disable_notification_token(text) from public;
grant execute on function public.upsert_notification_token(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.disable_notification_token(text) to authenticated;
