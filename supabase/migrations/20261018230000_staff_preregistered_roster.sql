-- UCAPSA preregistration operational extension.
-- Only add after 20261018220000_link_preregistered_history.sql.
-- No table access for client/staff; all operations via checked RPCs.

alter table ucapsa_intake.attendance_evidence
  add column if not exists evidence_source text not null default 'admin_history'
  check (evidence_source in ('admin_history','staff_roster'));

-- Do not erase a real attendance when Admin edits provisional history.
create or replace function public.guard_staged_staff_evidence()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if old.evidence_source='staff_roster' then
    raise exception 'No se puede reemplazar una asistencia real de entrenador por un saldo histórico.'
      using errcode='23505';
  end if;
  return old;
end;
$fn$;
revoke all on function public.guard_staged_staff_evidence() from public,anon,authenticated;
drop trigger if exists trg_guard_staged_staff_evidence on ucapsa_intake.attendance_evidence;
create trigger trg_guard_staged_staff_evidence
before update or delete on ucapsa_intake.attendance_evidence
for each row execute function public.guard_staged_staff_evidence();

create or replace function public.get_staff_preregistered_class_roster(p_class_date date)
returns table (
  intake_program_id uuid,
  schedule_id uuid,
  program_code text,
  program_level text,
  schedule_name text,
  start_time time,
  dog_name text,
  owner_name text,
  attended boolean,
  card_status text,
  total_attendances integer
)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if auth.uid() is null or not public.is_ucapsa_staff() then
    raise exception 'Solo personal autorizado puede consultar perros preinscritos.'
      using errcode='42501';
  end if;
  if p_class_date is null then
    raise exception 'Elige fecha de clase.' using errcode='22023';
  end if;
  return query
  select st.id,st.schedule_id,pr.code::text,st.program_level::text,
    eff.name::text,eff.start_time,d.dog_name::text,person.owner_name::text,
    exists(select 1 from ucapsa_intake.attendance_evidence h
      where h.intake_program_id=st.id and h.attendance_date=p_class_date
        and h.evidence_kind='dated') as attended,
    -- La inscripción administrativa es la autorización; el número Puppy
    -- no participa en este permiso ni certifica un pago.
    case
      when p_class_date < st.authorized_on then 'not_started'
      when p_class_date > (st.authorized_on + interval '1 year')::date then 'expired'
      else 'valid'
    end::text as card_status,
    coalesce((select sum(h.quantity)::integer
      from ucapsa_intake.attendance_evidence h
      where h.intake_program_id=st.id),0) as total_attendances
  from ucapsa_intake.programs st
  join ucapsa_intake.dogs d on d.id=st.dog_id and d.linked_dog_id is null
  join ucapsa_intake.people person on person.id=d.person_id and person.status='pending'
  join public.programs pr on pr.id=st.program_id and pr.is_active
  join lateral public.get_effective_program_schedule(st.schedule_id,p_class_date) eff on true
  where st.linked_enrollment_id is null
    and eff.is_active and eff.program_id=st.program_id
    and public.program_schedule_occurs_on_date(st.schedule_id,p_class_date)
    and not exists (select 1 from public.program_class_cancellations c
      where c.schedule_id=st.schedule_id and c.cancellation_date=p_class_date and c.restored_at is null)
  order by eff.start_time,pr.code,st.program_level,d.dog_name,st.id;
end;
$fn$;
revoke all on function public.get_staff_preregistered_class_roster(date) from public,anon;
grant execute on function public.get_staff_preregistered_class_roster(date) to authenticated;

create or replace function public.staff_register_preregistered_attendance(
  p_intake_program_id uuid, p_attendance_date date
)
returns uuid language plpgsql security definer set search_path=''
as $fn$
declare
  v_person_id uuid;
  v_person ucapsa_intake.people%rowtype;
  v_dog ucapsa_intake.dogs%rowtype;
  v_program ucapsa_intake.programs%rowtype;
  v_existing uuid;
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
begin
  if auth.uid() is null or not public.is_ucapsa_staff() then
    raise exception 'Solo staff puede registrar asistencia.' using errcode='42501';
  end if;
  if p_attendance_date is distinct from v_today then
    raise exception 'El entrenador registra solamente la asistencia de hoy.'
      using errcode='22023';
  end if;

  select d.person_id into v_person_id
  from ucapsa_intake.programs st
  join ucapsa_intake.dogs d on d.id=st.dog_id
  where st.id=p_intake_program_id;
  if v_person_id is null then raise exception 'Inscripción provisional inexistente.' using errcode='22023'; end if;

  -- Same order as claim: person -> dog -> enrollment. Prevents half-claim races.
  select * into v_person from ucapsa_intake.people where id=v_person_id for update;
  if v_person.status<>'pending' then
    raise exception 'Este perro ya se vinculó: usa su inscripción oficial.' using errcode='55000';
  end if;
  select d.* into v_dog from ucapsa_intake.dogs d
  join ucapsa_intake.programs st on st.dog_id=d.id where st.id=p_intake_program_id
  for update of d;
  select * into v_program from ucapsa_intake.programs
  where id=p_intake_program_id for update;
  if v_dog.linked_dog_id is not null or v_program.linked_enrollment_id is not null then
    raise exception 'Esta inscripción ya está vinculada.' using errcode='55000';
  end if;
  if not public.program_schedule_occurs_on_date(v_program.schedule_id,p_attendance_date)
    or exists(select 1 from public.program_class_cancellations c
      where c.schedule_id=v_program.schedule_id
        and c.cancellation_date=p_attendance_date and c.restored_at is null)
  then
    raise exception 'No existe clase activa para esta fecha.' using errcode='22023';
  end if;
  -- No depender de la referencia Puppy ni de una fecha física desconocida.
  -- Respeta la vigencia temporal que ya maneja el sistema oficial.
  if p_attendance_date < v_program.authorized_on
     or p_attendance_date > (v_program.authorized_on + interval '1 year')::date then
    raise exception 'Inscripción administrativa no vigente para esta clase.'
      using errcode='22023';
  end if;
  select id into v_existing from ucapsa_intake.attendance_evidence
  where intake_program_id=v_program.id and attendance_date=p_attendance_date
    and evidence_kind='dated' limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into ucapsa_intake.attendance_evidence(
    intake_program_id,evidence_kind,attendance_date,quantity,recorded_by,
    source_note,evidence_source
  ) values(
    v_program.id,'dated',p_attendance_date,1,auth.uid(),
    'Asistencia del día registrada por Entrenador','staff_roster'
  ) returning id into v_existing;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'dog_preregistration.staff_attendance',
    'intake_attendance',v_existing,
    pg_catalog.jsonb_build_object('program_id',v_program.id,'date',p_attendance_date));
  return v_existing;
end;
$fn$;
revoke all on function public.staff_register_preregistered_attendance(uuid,date) from public,anon;
grant execute on function public.staff_register_preregistered_attendance(uuid,date) to authenticated;
