-- Consulta administrativa para expedientes provisionales, sin exponer
-- tablas privadas por RLS ni crear cuentas/membresías ficticias.
-- Una fila = un perro en un programa; usa el mismo ID de intake.
create or replace function public.admin_get_preregistered_program_records(
  p_intake_program_id uuid default null
)
returns table (
  intake_program_id uuid,
  intake_dog_id uuid,
  person_id uuid,
  owner_name text,
  owner_email text,
  owner_phone text,
  registration_status text,
  linked_user_id uuid,
  linked_enrollment_id uuid,
  dog_name text,
  program_code text,
  program_level text,
  schedule_name text,
  schedule_time time without time zone,
  physical_card_reference text,
  authorized_on date,
  attendances_count integer,
  dated_attendances integer,
  undated_attendances integer,
  membership_status text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede consultar preinscripciones.'
      using errcode = '42501';
  end if;

  return query
  select
    st.id, d.id, person.id,
    person.owner_name::text, person.email_key::text, person.phone_e164::text,
    person.status::text, person.linked_user_id, st.linked_enrollment_id,
    d.dog_name::text, pg.code::text, st.program_level::text,
    sch.name::text, sch.start_time,
    case when pg.code = 'puppy' then st.physical_card_number::text else null::text end,
    st.authorized_on,
    evid.total_count, evid.dated_count, evid.undated_count,
    membership.status::text
  from ucapsa_intake.programs st
  join ucapsa_intake.dogs d on d.id=st.dog_id
  join ucapsa_intake.people person on person.id=d.person_id
  join public.programs pg on pg.id=st.program_id
  join public.program_schedules sch on sch.id=st.schedule_id
  cross join lateral (
    select
      coalesce(sum(h.quantity),0)::integer as total_count,
      coalesce(sum(h.quantity) filter(where h.evidence_kind='dated'),0)::integer as dated_count,
      coalesce(sum(h.quantity) filter(where h.evidence_kind='undated_balance'),0)::integer as undated_count
    from ucapsa_intake.attendance_evidence h
    where h.intake_program_id=st.id
  ) evid
  left join lateral (
    select m.status
    from public.memberships m
    where m.user_id=person.linked_user_id
    order by (m.status='active') desc, m.updated_at desc, m.id
    limit 1
  ) membership on true
  where p_intake_program_id is null or st.id=p_intake_program_id
  order by person.created_at desc, d.created_at desc, pg.code, st.id;
end
$function$;

revoke all on function public.admin_get_preregistered_program_records(uuid)
from public, anon;
grant execute on function public.admin_get_preregistered_program_records(uuid)
to authenticated;

comment on function public.admin_get_preregistered_program_records(uuid)
is 'Consulta de solo lectura por Admin/Superadmin. Membresía se toma exclusivamente de public.memberships después de vinculación Auth.';
