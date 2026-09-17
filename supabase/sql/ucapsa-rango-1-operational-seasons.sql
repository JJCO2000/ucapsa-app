-- UCAPSA Rango 1 — temporadas operativas
--
-- Ciclo competitivo:
--   draft -> active -> closed
--   closed -> reopened -> closed
--
-- `reopened` es un estado administrativo histórico. No convierte una temporada
-- pasada en la temporada competitiva actual y por tanto no compite con la regla
-- de una sola temporada `active`.
--
-- Las fechas recibidas por RPC son inclusivas para Admin. Internamente ends_at
-- continúa siendo exclusivo y ambos límites caen a medianoche de CDMX.

alter table public.ucapsa_competition_seasons
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references auth.users(id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id) on delete set null;

create index if not exists ucapsa_competition_seasons_activated_by_idx
  on public.ucapsa_competition_seasons (activated_by);
create index if not exists ucapsa_competition_seasons_reopened_by_idx
  on public.ucapsa_competition_seasons (reopened_by);

alter table public.ucapsa_competition_seasons
  drop constraint if exists ucapsa_competition_seasons_status_check;
alter table public.ucapsa_competition_seasons
  add constraint ucapsa_competition_seasons_status_check
  check (status in ('draft', 'active', 'reopened', 'closed'));

-- Los clientes no deben consumir temporadas todavía no publicadas.
drop policy if exists "Authenticated read competition seasons"
  on public.ucapsa_competition_seasons;
create policy "Authenticated read competition seasons"
on public.ucapsa_competition_seasons
for select
to authenticated
using (
  status <> 'draft'
  or (select public.is_ucapsa_admin())
);

create or replace function public.admin_create_ucapsa_competition_season(
  p_code text,
  p_name text,
  p_starts_on date,
  p_ends_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := nullif(btrim(p_code), '');
  v_name text := nullif(btrim(p_name), '');
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Solo superadmin puede crear temporadas UCAPSA.';
  end if;

  if v_code is null then
    raise exception 'El codigo de temporada es obligatorio.';
  end if;
  if v_name is null then
    raise exception 'El nombre de temporada es obligatorio.';
  end if;
  if p_starts_on is null or p_ends_on is null then
    raise exception 'Las fechas de temporada son obligatorias.';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'La fecha final no puede ser anterior a la inicial.';
  end if;

  v_starts_at := p_starts_on::timestamp at time zone 'America/Mexico_City';
  v_ends_at := (p_ends_on + 1)::timestamp at time zone 'America/Mexico_City';

  insert into public.ucapsa_competition_seasons (
    code,
    name,
    starts_at,
    ends_at,
    status,
    created_by
  ) values (
    v_code,
    v_name,
    v_starts_at,
    v_ends_at,
    'draft',
    auth.uid()
  )
  returning id into v_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_competition_season.create',
    'ucapsa_competition_season',
    v_id,
    jsonb_build_object(
      'code', v_code,
      'name', v_name,
      'starts_on', p_starts_on,
      'ends_on', p_ends_on,
      'status', 'draft'
    )
  );

  return v_id;
end;
$$;

create or replace function public.admin_update_ucapsa_competition_season(
  p_season_id uuid,
  p_code text,
  p_name text,
  p_starts_on date,
  p_ends_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.ucapsa_competition_seasons%rowtype;
  v_code text := nullif(btrim(p_code), '');
  v_name text := nullif(btrim(p_name), '');
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Solo superadmin puede configurar temporadas UCAPSA.';
  end if;

  select * into v_before
  from public.ucapsa_competition_seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Temporada UCAPSA no encontrada.';
  end if;
  if v_before.status = 'closed' then
    raise exception 'La temporada esta cerrada. Reabrela antes de modificarla.';
  end if;
  if v_code is null or v_name is null then
    raise exception 'Codigo y nombre son obligatorios.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'Rango de fechas de temporada invalido.';
  end if;

  v_starts_at := p_starts_on::timestamp at time zone 'America/Mexico_City';
  v_ends_at := (p_ends_on + 1)::timestamp at time zone 'America/Mexico_City';

  update public.ucapsa_competition_seasons
  set code = v_code,
      name = v_name,
      starts_at = v_starts_at,
      ends_at = v_ends_at
  where id = p_season_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_competition_season.update',
    'ucapsa_competition_season',
    p_season_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'code', v_before.code,
        'name', v_before.name,
        'starts_at', v_before.starts_at,
        'ends_at', v_before.ends_at,
        'status', v_before.status
      ),
      'after', jsonb_build_object(
        'code', v_code,
        'name', v_name,
        'starts_on', p_starts_on,
        'ends_on', p_ends_on,
        'status', v_before.status
      )
    )
  );

  return p_season_id;
end;
$$;

create or replace function public.admin_activate_ucapsa_competition_season(
  p_season_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.ucapsa_competition_seasons%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Solo superadmin puede activar temporadas UCAPSA.';
  end if;

  select * into v_season
  from public.ucapsa_competition_seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Temporada UCAPSA no encontrada.';
  end if;
  if v_season.status <> 'draft' then
    raise exception 'Solo una temporada en borrador puede activarse.';
  end if;
  if exists (
    select 1
    from public.ucapsa_competition_seasons s
    where s.status = 'active'
      and s.id <> p_season_id
  ) then
    raise exception 'Ya existe una temporada UCAPSA activa.';
  end if;

  update public.ucapsa_competition_seasons
  set status = 'active',
      activated_at = now(),
      activated_by = auth.uid()
  where id = p_season_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_competition_season.activate',
    'ucapsa_competition_season',
    p_season_id,
    jsonb_build_object('from', 'draft', 'to', 'active')
  );

  return p_season_id;
end;
$$;

create or replace function public.admin_close_ucapsa_competition_season(
  p_season_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.ucapsa_competition_seasons%rowtype;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede cerrar temporadas UCAPSA.';
  end if;

  select * into v_season
  from public.ucapsa_competition_seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Temporada UCAPSA no encontrada.';
  end if;
  if v_season.status not in ('active', 'reopened') then
    raise exception 'Solo una temporada activa o reabierta puede cerrarse.';
  end if;

  update public.ucapsa_competition_seasons
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid()
  where id = p_season_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_competition_season.close',
    'ucapsa_competition_season',
    p_season_id,
    jsonb_build_object('from', v_season.status, 'to', 'closed')
  );

  return p_season_id;
end;
$$;

create or replace function public.admin_reopen_ucapsa_competition_season(
  p_season_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.ucapsa_competition_seasons%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Solo superadmin puede reabrir temporadas UCAPSA.';
  end if;

  select * into v_season
  from public.ucapsa_competition_seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Temporada UCAPSA no encontrada.';
  end if;
  if v_season.status <> 'closed' then
    raise exception 'Solo una temporada cerrada puede reabrirse.';
  end if;

  update public.ucapsa_competition_seasons
  set status = 'reopened',
      reopened_at = now(),
      reopened_by = auth.uid(),
      closed_at = null,
      closed_by = null
  where id = p_season_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_competition_season.reopen',
    'ucapsa_competition_season',
    p_season_id,
    jsonb_build_object('from', 'closed', 'to', 'reopened')
  );

  return p_season_id;
end;
$$;

for function_signature in
select unnest(array[
  'public.admin_create_ucapsa_competition_season(text,text,date,date)',
  'public.admin_update_ucapsa_competition_season(uuid,text,text,date,date)',
  'public.admin_activate_ucapsa_competition_season(uuid)',
  'public.admin_close_ucapsa_competition_season(uuid)',
  'public.admin_reopen_ucapsa_competition_season(uuid)'
])
loop
  -- Placeholder loop intentionally avoided below; explicit grants keep migration
  -- compatible across PostgreSQL versions used by Supabase.
end loop;

revoke all on function public.admin_create_ucapsa_competition_season(text,text,date,date)
  from public, anon, authenticated;
revoke all on function public.admin_update_ucapsa_competition_season(uuid,text,text,date,date)
  from public, anon, authenticated;
revoke all on function public.admin_activate_ucapsa_competition_season(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_close_ucapsa_competition_season(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_reopen_ucapsa_competition_season(uuid)
  from public, anon, authenticated;

grant execute on function public.admin_create_ucapsa_competition_season(text,text,date,date)
  to authenticated;
grant execute on function public.admin_update_ucapsa_competition_season(uuid,text,text,date,date)
  to authenticated;
grant execute on function public.admin_activate_ucapsa_competition_season(uuid)
  to authenticated;
grant execute on function public.admin_close_ucapsa_competition_season(uuid)
  to authenticated;
grant execute on function public.admin_reopen_ucapsa_competition_season(uuid)
  to authenticated;
