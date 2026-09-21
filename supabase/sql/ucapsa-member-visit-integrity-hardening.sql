-- UCAPSA — integridad canónica de visitas de socios
--
-- Objetivos:
-- 1) impedir visitas antes del inicio real de la membresía;
-- 2) impedir timestamps futuros;
-- 3) auditar correcciones administrativas con before/after;
-- 4) forzar escrituras por RPC, evitando bypass directo de PostgREST.
--
-- Las visitas históricas siguen siendo corregibles mientras las reglas de
-- temporada abierta lo permitan; no se inventa un límite de antigüedad Admin.

create or replace function public.register_member_visit_from_qr(
  p_qr_token text,
  p_client_event_id uuid,
  p_captured_at timestamptz
)
returns table(visit_id uuid, result text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships%rowtype;
  v_visit_id uuid;
  v_server_now timestamptz := clock_timestamp();
  v_capture timestamptz := coalesce(p_captured_at, clock_timestamp());
  v_capture_date date;
begin
  if v_user_id is null then
    return query
    select null::uuid, 'not_authenticated'::text, 'No hay sesion activa.'::text;
    return;
  end if;

  if p_client_event_id is not null then
    select mv.id
      into v_visit_id
    from public.member_visits mv
    where mv.user_id = v_user_id
      and mv.client_event_id = p_client_event_id
    limit 1;

    if v_visit_id is not null then
      return query
      select v_visit_id, 'already_registered'::text, 'La visita ya estaba registrada.'::text;
      return;
    end if;
  end if;

  if v_capture > v_server_now + interval '10 minutes' then
    return query
    select null::uuid, 'invalid_capture_time'::text, 'La hora de captura del dispositivo no es valida.'::text;
    return;
  end if;

  if v_capture < v_server_now - interval '7 days' then
    return query
    select null::uuid, 'offline_capture_too_old'::text, 'La captura offline tiene mas de 7 dias y necesita revision de UCAPSA.'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.attendance_qr_codes q
    where q.program_code = 'member'
      and q.token::text = btrim(p_qr_token)
      and q.is_active = true
  ) then
    return query
    select null::uuid, 'invalid_qr'::text, 'QR de Socios UCAPSA no valido.'::text;
    return;
  end if;

  v_capture_date := (v_capture at time zone 'America/Mexico_City')::date;

  select *
    into v_membership
  from public.memberships
  where user_id = v_user_id
    and status = 'active'
    and (start_date is null or start_date <= v_capture_date)
  order by created_at desc
  limit 1;

  if not found then
    return query
    select null::uuid, 'membership_not_active'::text, 'Tu membresia no estaba activa en la fecha de la visita.'::text;
    return;
  end if;

  insert into public.member_visits (
    user_id,
    membership_id,
    visited_at,
    visit_date,
    source,
    recorded_by,
    notes,
    client_event_id
  ) values (
    v_user_id,
    v_membership.id,
    v_capture,
    v_capture_date,
    'qr_member',
    v_user_id,
    null,
    p_client_event_id
  )
  on conflict (user_id, client_event_id) where client_event_id is not null
  do nothing
  returning id into v_visit_id;

  if v_visit_id is null and p_client_event_id is not null then
    select mv.id
      into v_visit_id
    from public.member_visits mv
    where mv.user_id = v_user_id
      and mv.client_event_id = p_client_event_id
    limit 1;

    return query
    select v_visit_id, 'already_registered'::text, 'La visita ya estaba registrada.'::text;
    return;
  end if;

  return query
  select v_visit_id, 'registered'::text, 'Visita de socio registrada.'::text;
end;
$$;

create or replace function public.register_member_visit_admin(
  p_user_id uuid,
  p_visited_at timestamptz default now(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  v_visit_id uuid;
  v_visited_at timestamptz := coalesce(p_visited_at, clock_timestamp());
  v_visit_date date;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden registrar visitas.';
  end if;

  if v_visited_at > clock_timestamp() + interval '10 minutes' then
    raise exception 'No se puede registrar una visita en el futuro.';
  end if;

  v_visit_date := (v_visited_at at time zone 'America/Mexico_City')::date;

  select *
    into v_membership
  from public.memberships
  where user_id = p_user_id
    and status = 'active'
    and (start_date is null or start_date <= v_visit_date)
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'El usuario no tenía una membresía activa en esa fecha.';
  end if;

  insert into public.member_visits (
    user_id,
    membership_id,
    visited_at,
    visit_date,
    source,
    recorded_by,
    notes
  ) values (
    p_user_id,
    v_membership.id,
    v_visited_at,
    v_visit_date,
    'admin_manual',
    auth.uid(),
    nullif(btrim(p_notes), '')
  )
  returning id into v_visit_id;

  return v_visit_id;
end;
$$;

create or replace function public.correct_member_visit_admin(
  p_visit_id uuid,
  p_visited_at timestamptz,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.member_visits%rowtype;
  v_after public.member_visits%rowtype;
  v_start_date date;
  v_visited_at timestamptz := p_visited_at;
  v_visit_date date;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden corregir visitas.';
  end if;

  if v_visited_at is null then
    raise exception 'La fecha de visita es obligatoria.';
  end if;

  if v_visited_at > clock_timestamp() + interval '10 minutes' then
    raise exception 'No se puede registrar una visita en el futuro.';
  end if;

  select *
    into v_before
  from public.member_visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'Visita no encontrada.';
  end if;

  v_visit_date := (v_visited_at at time zone 'America/Mexico_City')::date;

  select m.start_date
    into v_start_date
  from public.memberships m
  where m.id = v_before.membership_id;

  if found and v_start_date is not null and v_visit_date < v_start_date then
    raise exception 'La visita no puede quedar antes del inicio de la membresía.';
  end if;

  update public.member_visits
  set
    visited_at = v_visited_at,
    visit_date = v_visit_date,
    notes = nullif(btrim(p_notes), ''),
    recorded_by = auth.uid(),
    updated_at = now()
  where id = p_visit_id
  returning * into v_after;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'member_visit.update',
    'member_visit',
    v_after.id,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after', to_jsonb(v_after)
    )
  );
end;
$$;

revoke all on function public.register_member_visit_admin(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.register_member_visit_admin(uuid, timestamptz, text)
  to authenticated, service_role;

revoke all on function public.correct_member_visit_admin(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.correct_member_visit_admin(uuid, timestamptz, text)
  to authenticated, service_role;

-- QR wrappers remain compatible and delegate to the hardened 3-argument RPC.
revoke all on function public.register_member_visit_from_qr(text, uuid, timestamptz)
  from public, anon;
grant execute on function public.register_member_visit_from_qr(text, uuid, timestamptz)
  to authenticated, service_role;

-- All application writes are already RPC-based. Keep SELECT for RLS reads, but
-- remove direct PostgREST write paths that could bypass audit/time invariants.
revoke insert, update, delete on table public.member_visits from authenticated;
