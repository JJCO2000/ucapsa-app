-- UCAPSA — temporal integrity for member visits
--
-- A member visit is a historical fact. It must not be created in the future or
-- before the membership represented by membership_id had started. Offline QR
-- capture uses the captured time, not the later sync time.
--
-- Admin corrections also become explicit admin_manual facts. The prior source
-- remains available in admin_audit_logs through the correction audit snapshot.

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
  v_visit_date date := (coalesce(p_captured_at, clock_timestamp()) at time zone 'America/Mexico_City')::date;
begin
  if v_user_id is null then
    return query select null::uuid, 'not_authenticated'::text, 'No hay sesion activa.'::text;
    return;
  end if;

  if p_client_event_id is not null then
    select mv.id into v_visit_id
    from public.member_visits mv
    where mv.user_id = v_user_id
      and mv.client_event_id = p_client_event_id
    limit 1;

    if v_visit_id is not null then
      return query select v_visit_id, 'already_registered'::text, 'La visita ya estaba registrada.'::text;
      return;
    end if;
  end if;

  if v_capture > v_server_now + interval '10 minutes' then
    return query select null::uuid, 'invalid_capture_time'::text, 'La hora de captura del dispositivo no es valida.'::text;
    return;
  end if;

  if v_capture < v_server_now - interval '7 days' then
    return query select null::uuid, 'offline_capture_too_old'::text, 'La captura offline tiene mas de 7 dias y necesita revision de UCAPSA.'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.attendance_qr_codes q
    where q.program_code = 'member'
      and q.token::text = btrim(p_qr_token)
      and q.is_active = true
  ) then
    return query select null::uuid, 'invalid_qr'::text, 'QR de Socios UCAPSA no valido.'::text;
    return;
  end if;

  select * into v_membership
  from public.memberships
  where user_id = v_user_id
    and status = 'active'
  order by created_at desc
  limit 1;

  if not found then
    return query select null::uuid, 'membership_not_active'::text, 'Tu membresia no esta activa.'::text;
    return;
  end if;

  if v_membership.start_date is null then
    return query select null::uuid, 'membership_dates_missing'::text, 'La fecha de inicio de la membresia necesita revision administrativa.'::text;
    return;
  end if;

  if v_visit_date < v_membership.start_date then
    return query select null::uuid, 'membership_not_started_at_capture'::text, 'La membresia aun no habia iniciado al momento de la captura.'::text;
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
    v_visit_date,
    'qr_member',
    v_user_id,
    null,
    p_client_event_id
  )
  on conflict (user_id, client_event_id) where client_event_id is not null
  do nothing
  returning id into v_visit_id;

  if v_visit_id is null and p_client_event_id is not null then
    select mv.id into v_visit_id
    from public.member_visits mv
    where mv.user_id = v_user_id
      and mv.client_event_id = p_client_event_id
    limit 1;
    return query select v_visit_id, 'already_registered'::text, 'La visita ya estaba registrada.'::text;
    return;
  end if;

  return query select v_visit_id, 'registered'::text, 'Visita de socio registrada.'::text;
end;
$$;

create or replace function public.register_member_visit_from_qr(
  p_qr_token text,
  p_client_event_id uuid
)
returns table(visit_id uuid, result text, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.register_member_visit_from_qr(
    p_qr_token,
    p_client_event_id,
    clock_timestamp()
  );
$$;

create or replace function public.register_member_visit_from_qr(p_qr_token text)
returns table(visit_id uuid, result text, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.register_member_visit_from_qr(
    p_qr_token,
    null::uuid,
    clock_timestamp()
  );
$$;

revoke all on function public.register_member_visit_from_qr(text, uuid, timestamptz)
  from public, anon;
revoke all on function public.register_member_visit_from_qr(text, uuid)
  from public, anon;
revoke all on function public.register_member_visit_from_qr(text)
  from public, anon;
grant execute on function public.register_member_visit_from_qr(text, uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.register_member_visit_from_qr(text, uuid)
  to authenticated, service_role;
grant execute on function public.register_member_visit_from_qr(text)
  to authenticated, service_role;

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
  v_visit_date date := (coalesce(p_visited_at, clock_timestamp()) at time zone 'America/Mexico_City')::date;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden registrar visitas.';
  end if;

  if v_visited_at > clock_timestamp() + interval '10 minutes' then
    raise exception 'No se puede registrar una visita en el futuro.';
  end if;

  select * into v_membership
  from public.memberships
  where user_id = p_user_id
    and status = 'active'
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'El usuario no tiene una membresia activa.';
  end if;

  if v_membership.start_date is null then
    raise exception 'La membresia activa no tiene fecha de inicio.';
  end if;

  if v_visit_date < v_membership.start_date then
    raise exception 'La visita no puede ser anterior al inicio de la membresia.';
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

revoke all on function public.register_member_visit_admin(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.register_member_visit_admin(uuid, timestamptz, text)
  to authenticated, service_role;

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
  v_membership public.memberships%rowtype;
  v_visit_date date := (p_visited_at at time zone 'America/Mexico_City')::date;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden corregir visitas.';
  end if;

  if p_visited_at is null then
    raise exception 'La fecha de visita es obligatoria.';
  end if;

  if p_visited_at > clock_timestamp() + interval '10 minutes' then
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

  select *
    into v_membership
  from public.memberships
  where id = v_before.membership_id;

  if not found then
    raise exception 'La membresia asociada a la visita no existe.';
  end if;

  if v_membership.start_date is null then
    raise exception 'La membresia asociada no tiene fecha de inicio.';
  end if;

  if v_visit_date < v_membership.start_date then
    raise exception 'La visita no puede ser anterior al inicio de la membresia.';
  end if;

  update public.member_visits
  set visited_at = p_visited_at,
      visit_date = v_visit_date,
      source = 'admin_manual',
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
    'member_visit.correct',
    'member_visit',
    v_after.id,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after', to_jsonb(v_after)
    )
  );
end;
$$;

revoke all on function public.correct_member_visit_admin(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.correct_member_visit_admin(uuid, timestamptz, text)
  to authenticated, service_role;
