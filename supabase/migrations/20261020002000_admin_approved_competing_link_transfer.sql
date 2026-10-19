-- Administratively authorized ownership transfer for an already-linked
-- preregistration. Refuse cases with later activity/membership/payment history
-- that cannot be transferred safely by simply moving intake-linked records.
create or replace function public.admin_approve_preregistration_link_request(
  p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $approve$
declare
  v_req ucapsa_intake.owner_link_requests%rowtype;
  v_person ucapsa_intake.people%rowtype;
  v_old uuid;
  v_new uuid;
  v_dogs uuid[];
  v_enrollments uuid[];
  v_num integer;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administracion puede autorizar cambios.' using errcode='42501';
  end if;
  select * into v_req from ucapsa_intake.owner_link_requests
  where id=p_request_id for update;
  if not found or v_req.status<>'pending' then
    raise exception 'La solicitud ya no esta pendiente.' using errcode='23505';
  end if;
  select * into v_person from ucapsa_intake.people
  where id=v_req.person_id for update;
  v_old:=v_person.linked_user_id;
  v_new:=v_req.requester_user_id;
  if v_person.status<>'linked' or v_old is null or v_old=v_new then
    raise exception 'El expediente no esta disponible para reasignacion.' using errcode='23505';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_new) then
    raise exception 'La cuenta solicitante ya no existe.' using errcode='23503';
  end if;

  select pg_catalog.array_agg(linked_dog_id) into v_dogs
  from ucapsa_intake.dogs where person_id=v_person.id;
  select pg_catalog.array_agg(st.linked_enrollment_id) into v_enrollments
  from ucapsa_intake.programs st
  join ucapsa_intake.dogs d on d.id=st.dog_id
  where d.person_id=v_person.id;
  if v_dogs is null or v_enrollments is null or
    pg_catalog.array_position(v_dogs,null) is not null or
    pg_catalog.array_position(v_enrollments,null) is not null then
    raise exception 'La vinculacion historica esta incompleta.' using errcode='55000';
  end if;
  if exists (
    select 1 from public.dogs d where d.id=any(v_dogs) and d.user_id<>v_old
  ) or exists (
    select 1 from public.program_enrollments e
    where e.id=any(v_enrollments) and (e.user_id<>v_old or e.membership_id is not null
      or e.access_mode<>'card')
  ) or exists (
    select 1 from public.program_enrollments e
    where e.dog_id=any(v_dogs) and not (e.id=any(v_enrollments))
  ) then
    raise exception 'El perro tiene inscripciones modificadas o datos de otra cuenta. Revision manual requerida.'
      using errcode='55000';
  end if;
  if exists(select 1 from public.dogs d
    join public.dogs incoming on incoming.id=any(v_dogs)
    where d.user_id=v_new and d.is_active
      and pg_catalog.lower(pg_catalog.btrim(d.name))=
          pg_catalog.lower(pg_catalog.btrim(incoming.name))) then
    raise exception 'La cuenta destino ya tiene un perro con este nombre.' using errcode='23505';
  end if;
  -- All following tables may contain records created AFTER preregistration.
  -- Preserve them intact: a complex case must go through separate reconciliation.
  if exists(select 1 from public.program_attendances x where x.enrollment_id=any(v_enrollments))
    or exists(select 1 from public.program_attendance_absences x where x.enrollment_id=any(v_enrollments))
    or exists(select 1 from public.program_exams x where x.enrollment_id=any(v_enrollments))
    or exists(select 1 from public.program_class_rsvps x where x.enrollment_id=any(v_enrollments))
    or exists(select 1 from public.practice_sessions x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.membership_dog_access x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.member_visit_dogs x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.dog_awards x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.ucapsa_exam_attempts x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.intro_class_agenda_plans x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.ucapsa_value_exposures x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.user_achievements x where x.dog_id=any(v_dogs))
    or exists(select 1 from public.payments x where x.user_id=v_old)
    or exists(select 1 from public.payment_obligations x where x.user_id=v_old)
  then
    raise exception 'Hay actividad, membresias o pagos posteriores: no se transfiere sin conciliacion.'
      using errcode='55000';
  end if;

  -- Atomic change: preserve dogs, original enrollment IDs, attendance
  -- historical evidence and level data; no delete/recreation.
  update public.dogs d set user_id=v_new where d.id=any(v_dogs) and d.user_id=v_old;
  get diagnostics v_num=row_count;
  if v_num<>pg_catalog.array_length(v_dogs,1) then
    raise exception 'No se pudieron transferir todos los perros.' using errcode='55000';
  end if;
  update public.program_enrollments e set user_id=v_new
    where e.id=any(v_enrollments) and e.user_id=v_old;
  get diagnostics v_num=row_count;
  if v_num<>pg_catalog.array_length(v_enrollments,1) then
    raise exception 'No se pudieron transferir todas las inscripciones.' using errcode='55000';
  end if;
  update ucapsa_intake.claimed_contacts c
    set user_id=v_new where c.person_id=v_person.id and c.user_id=v_old;
  update ucapsa_intake.people p
    set linked_user_id=v_new, linked_at=clock_timestamp()
    where p.id=v_person.id and p.linked_user_id=v_old;
  update ucapsa_intake.owner_link_requests r
    set status='reviewed',resolved_at=clock_timestamp(),resolved_by=auth.uid()
    where r.id=p_request_id and r.status='pending';
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'dog_preregistration.admin_transfer','dog_preregistration',
    v_person.id,pg_catalog.jsonb_build_object(
    'request_id',p_request_id,'previous_user_id',v_old,'new_user_id',v_new,
    'dog_ids',v_dogs,'enrollment_ids',v_enrollments));
  return pg_catalog.jsonb_build_object('status','linked','linked_dogs',
    pg_catalog.array_length(v_dogs,1));
end;
$approve$;
revoke all on function public.admin_approve_preregistration_link_request(uuid) from public,anon;
grant execute on function public.admin_approve_preregistration_link_request(uuid) to authenticated;
