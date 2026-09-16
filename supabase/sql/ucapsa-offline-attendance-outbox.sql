-- UCAPSA — Idempotencia para visitas de socio capturadas offline
--
-- Objetivo: una visita puede guardarse primero en el dispositivo y reintentarse
-- cuando vuelva la red sin crear duplicados si la respuesta del primer intento
-- se perdió. El estado de socio depende de memberships.status = 'active'; pagos
-- y end_date no revocan automáticamente la membresía.

alter table public.member_visits
  add column if not exists client_event_id uuid;

create unique index if not exists member_visits_user_client_event_unique_idx
  on public.member_visits(user_id, client_event_id)
  where client_event_id is not null;

create or replace function public.register_member_visit_from_qr(
  p_qr_token text,
  p_client_event_id uuid
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
  v_now timestamptz := clock_timestamp();
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
    v_now,
    (v_now at time zone 'America/Mexico_City')::date,
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

-- Compatibilidad con clientes instalados que aún llaman la firma anterior.
create or replace function public.register_member_visit_from_qr(p_qr_token text)
returns table(visit_id uuid, result text, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.register_member_visit_from_qr(p_qr_token, null::uuid);
$$;

grant execute on function public.register_member_visit_from_qr(text, uuid) to authenticated;
grant execute on function public.register_member_visit_from_qr(text) to authenticated;
