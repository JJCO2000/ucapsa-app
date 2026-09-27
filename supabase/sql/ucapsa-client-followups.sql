-- UCAPSA — seguimiento administrativo de continuidad por perro
--
-- Reglas aprobadas:
-- 1) Puppy sin continuidad: Puppy terminado hace 14 días o más y sin ninguna
--    inscripción posterior para el mismo perro.
-- 2) Inactividad: 30 días o más desde la última asistencia registrada.
--
-- El estado es derivado; no se guarda un "rojo" manual. Si el perro vuelve a
-- inscribirse o asistir, deja de aparecer automáticamente.

begin;

create or replace function public.get_admin_client_followups()
returns table (
  user_id uuid,
  dog_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  dog_name text,
  last_attendance_date date,
  puppy_completed_on date,
  puppy_no_continuity boolean,
  inactive_30d boolean,
  inactivity_days integer,
  puppy_days_since_completion integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede consultar seguimiento de clientes.'
      using errcode = '42501';
  end if;

  return query
  with dog_attendance as (
    select
      e.user_id,
      e.dog_id,
      max(a.attendance_date)::date as last_attendance_date
    from public.program_enrollments e
    join public.program_attendances a
      on a.enrollment_id = e.id
    where e.dog_id is not null
    group by e.user_id, e.dog_id
  ),
  latest_completed_puppy as (
    select distinct on (e.user_id, e.dog_id)
      e.user_id,
      e.dog_id,
      coalesce(e.completed_at, e.updated_at, e.created_at) as completed_at
    from public.program_enrollments e
    join public.programs pr
      on pr.id = e.program_id
    where e.dog_id is not null
      and e.status = 'completed'
      and pr.code = 'puppy'
    order by
      e.user_id,
      e.dog_id,
      coalesce(e.completed_at, e.updated_at, e.created_at) desc
  ),
  candidates as (
    select
      d.user_id,
      d.id as dog_id,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente UCAPSA') as customer_name,
      p.email as customer_email,
      p.phone as customer_phone,
      d.name as dog_name,
      da.last_attendance_date,
      case
        when puppy.completed_at is null then null
        else (puppy.completed_at at time zone 'America/Mexico_City')::date
      end as puppy_completed_on,
      (
        puppy.completed_at is not null
        and (puppy.completed_at at time zone 'America/Mexico_City')::date <= v_today - 14
        and not exists (
          select 1
          from public.program_enrollments later
          where later.user_id = d.user_id
            and later.dog_id = d.id
            and later.created_at > puppy.completed_at
        )
      ) as puppy_no_continuity,
      (
        da.last_attendance_date is not null
        and da.last_attendance_date <= v_today - 30
      ) as inactive_30d
    from public.dogs d
    join public.profiles p
      on p.user_id = d.user_id
    left join dog_attendance da
      on da.user_id = d.user_id
      and da.dog_id = d.id
    left join latest_completed_puppy puppy
      on puppy.user_id = d.user_id
      and puppy.dog_id = d.id
    where d.is_active = true
      and p.role in ('client', 'member')
  )
  select
    c.user_id,
    c.dog_id,
    c.customer_name,
    c.customer_email,
    c.customer_phone,
    c.dog_name,
    c.last_attendance_date,
    c.puppy_completed_on,
    c.puppy_no_continuity,
    c.inactive_30d,
    case
      when c.last_attendance_date is null then 0
      else greatest(0, v_today - c.last_attendance_date)
    end::integer as inactivity_days,
    case
      when c.puppy_completed_on is null then 0
      else greatest(0, v_today - c.puppy_completed_on)
    end::integer as puppy_days_since_completion
  from candidates c
  where c.puppy_no_continuity
     or c.inactive_30d
  order by
    (c.puppy_no_continuity and c.inactive_30d) desc,
    greatest(
      case when c.last_attendance_date is null then 0 else v_today - c.last_attendance_date end,
      case when c.puppy_completed_on is null then 0 else v_today - c.puppy_completed_on end
    ) desc,
    c.customer_name,
    c.dog_name;
end;
$$;

revoke all on function public.get_admin_client_followups()
  from public, anon;
grant execute on function public.get_admin_client_followups()
  to authenticated, service_role;

commit;
