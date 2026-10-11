-- Hotfix for the deployed RSVP RPC (SQLSTATE 42702 on conflict column).
-- Use the named unique constraint rather than ambiguous TABLE output variables.
-- No tables or existing rows altered.
begin;

create or replace function public.set_my_class_rsvp(
  p_enrollment_id uuid,
  p_class_date date,
  p_response text
)
returns table (
  enrollment_id uuid,
  class_date date,
  response text,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments%rowtype;
  v_effective record;
  v_response text := lower(btrim(coalesce(p_response, '')));
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
  v_occurs boolean := false;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para confirmar tu clase.'
      using errcode = '42501';
  end if;

  if v_response not in ('yes', 'no') then
    raise exception 'Respuesta no válida.'
      using errcode = '22023';
  end if;

  if p_class_date < v_today then
    raise exception 'No puedes confirmar una clase pasada.'
      using errcode = '22023';
  end if;

  select *
    into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.user_id = v_user_id
    and e.status = 'active';

  if not found then
    raise exception 'Inscripción activa no encontrada.'
      using errcode = '42501';
  end if;

  select *
    into v_effective
  from public.get_effective_program_schedule(v_enrollment.schedule_id, p_class_date)
  limit 1;

  if not found
     or v_effective.program_id <> v_enrollment.program_id
     or not v_effective.is_active then
    raise exception 'No hay una clase activa para esa fecha.'
      using errcode = '22023';
  end if;

  v_occurs :=
    extract(dow from p_class_date)::integer = v_effective.day_of_week
    and (
      v_effective.repeat_type <> 'biweekly'
      or (
        v_effective.cycle_start_date is not null
        and p_class_date >= v_effective.cycle_start_date
        and mod(((p_class_date - v_effective.cycle_start_date) / 7)::integer, 2) = 0
      )
    );

  if not v_occurs then
    raise exception 'La clase no ocurre en esa fecha.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.program_class_cancellations c
    where c.schedule_id = v_enrollment.schedule_id
      and c.cancellation_date = p_class_date
      and c.restored_at is null
  ) then
    raise exception 'La clase está cancelada.'
      using errcode = '22023';
  end if;

  if coalesce(v_enrollment.access_mode, 'card') <> 'membership'
     and (
       v_enrollment.card_started_on is null
       or v_enrollment.card_expires_on is null
       or p_class_date < v_enrollment.card_started_on
       or p_class_date > v_enrollment.card_expires_on
     ) then
    raise exception 'Tu acceso no está vigente para esa clase.'
      using errcode = '22023';
  end if;

  insert into public.program_class_rsvps (
    enrollment_id,
    user_id,
    class_date,
    response,
    responded_at,
    updated_at
  ) values (
    v_enrollment.id,
    v_user_id,
    p_class_date,
    v_response,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict on constraint program_class_rsvps_enrollment_date_unique do update
  set
    user_id = excluded.user_id,
    response = excluded.response,
    responded_at = clock_timestamp(),
    updated_at = clock_timestamp();

  return query
  select
    r.enrollment_id,
    r.class_date,
    r.response,
    r.responded_at
  from public.program_class_rsvps r
  where r.enrollment_id = v_enrollment.id
    and r.class_date = p_class_date;
end;
$$;

revoke all on function public.set_my_class_rsvp(uuid,date,text)
  from public, anon;
grant execute on function public.set_my_class_rsvp(uuid,date,text)
  to authenticated, service_role;

commit;
