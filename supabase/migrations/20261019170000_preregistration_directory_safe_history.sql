-- UCAPSA: directorio provisional y edición de histórico no destructiva.
-- Usar solo cuando seguridad/integración de esquema real hayan sido revisadas.
-- Solo Admin puede listar contactos provisionales: no hay SELECT público.
create or replace function public.admin_get_preregistered_directory()
returns table(
  intake_person_id uuid, intake_dog_id uuid, intake_program_id uuid,
  owner_name text, owner_email text, owner_phone text, dog_name text,
  program_code text, program_level text, schedule_id uuid,
  physical_card_number text, card_started_on date, authorized_on date,
  historical_attendances integer, staff_attendances integer,
  known_dates date[], source_note text
)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede consultar preinscripciones.'
      using errcode='42501';
  end if;
  return query
  select pe.id, d.id, st.id,
    pe.owner_name::text, pe.email_key::text, pe.phone_e164::text,
    d.dog_name::text, pr.code::text, st.program_level::text,
    st.schedule_id, st.physical_card_number::text, st.card_started_on,
    st.authorized_on,
    coalesce((
      select sum(h.quantity)::integer
      from ucapsa_intake.attendance_evidence h
      where h.intake_program_id=st.id and h.evidence_source='admin_history'
    ),0),
    coalesce((
      select sum(h.quantity)::integer
      from ucapsa_intake.attendance_evidence h
      where h.intake_program_id=st.id and h.evidence_source='staff_roster'
    ),0),
    coalesce((
      select array_agg(h.attendance_date order by h.attendance_date)
      from ucapsa_intake.attendance_evidence h
      where h.intake_program_id=st.id
        and h.evidence_source='admin_history'
        and h.attendance_date is not null
    ),array[]::date[]),
    (select h.source_note from ucapsa_intake.attendance_evidence h
     where h.intake_program_id=st.id and h.evidence_source='admin_history'
       and h.source_note is not null
     order by h.recorded_at desc,h.id desc limit 1)::text
  from ucapsa_intake.people pe
  join ucapsa_intake.dogs d on d.person_id=pe.id and d.linked_dog_id is null
  join ucapsa_intake.programs st on st.dog_id=d.id
    and st.linked_enrollment_id is null
  join public.programs pr on pr.id=st.program_id
  where pe.status='pending'
  order by pe.owner_name,d.dog_name,pr.code,st.id;
end;
$function$;
revoke all on function public.admin_get_preregistered_directory() from public,anon;
grant execute on function public.admin_get_preregistered_directory() to authenticated;

-- Conservar asistencia staff_roster al modificar solo admin_history.
CREATE OR REPLACE FUNCTION public.admin_save_preregistered_program_history(p_intake_dog_id uuid, p_program_code text, p_program_level text, p_card_number text, p_card_started_on date, p_total_attendances integer, p_known_dates date[], p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_program public.programs%rowtype;
  v_schedule_id uuid;
  v_dog ucapsa_intake.dogs%rowtype;
  v_stage ucapsa_intake.programs%rowtype;
  v_level text := coalesce(nullif(btrim(p_program_level),''),'base');
  v_card text := nullif(btrim(coalesce(p_card_number,'')),'');
  v_dates date[] := coalesce(p_known_dates,array[]::date[]);
  v_unique_count integer;
  v_missing integer;
  v_previous_history jsonb;
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
begin
  if v_actor is null or not public.is_ucapsa_admin() then
    raise exception 'Se requiere Admin o Superadmin.' using errcode='42501';
  end if;
  if p_total_attendances is null or p_total_attendances not between 0 and 500 then
    raise exception 'Total de clases inválido.' using errcode='22023';
  end if;
  if coalesce(array_length(v_dates,1),0)>500 then
    raise exception 'Demasiadas fechas.' using errcode='22023';
  end if;
  select count(distinct dt) into v_unique_count from unnest(v_dates) as dates(dt);
  if exists (select 1 from unnest(v_dates) as dates(dt) where dt is null or dt>v_today) or
     v_unique_count <> coalesce(array_length(v_dates,1),0) then
    raise exception 'Las fechas deben ser reales, únicas y no futuras.' using errcode='22023';
  end if;
  if v_unique_count>p_total_attendances then
    raise exception 'Las fechas conocidas no pueden superar el total.' using errcode='22023';
  end if;
  v_missing:=p_total_attendances-v_unique_count;

  select * into v_dog from ucapsa_intake.dogs d
  where d.id=p_intake_dog_id for update;
  if not found or v_dog.linked_dog_id is not null then
    raise exception 'Perro provisional no disponible.' using errcode='55000';
  end if;
  if not exists (
    select 1 from ucapsa_intake.people p
    where p.id=v_dog.person_id and p.status='pending'
  ) then
    raise exception 'La cuenta provisional ya está vinculada.' using errcode='55000';
  end if;

  select * into v_program from public.programs p
  where p.code=lower(btrim(p_program_code)) and p.is_active
    and p.code in ('puppy','comandos');
  if not found then
    raise exception 'Programa no admitido.' using errcode='22023';
  end if;
  if v_program.code='puppy' and v_level<>'base' then
    raise exception 'Puppy requiere nivel base.' using errcode='22023';
  end if;
  if v_program.code='comandos' and v_level not in ('principiante','medio','avanzado') then
    raise exception 'Indica Básico, Intermedio o Avanzado.' using errcode='22023';
  end if;
  if v_program.code='comandos' and (v_card is not null or p_card_started_on is not null) then
    raise exception 'Comandos no utiliza referencia física de tarjeta.' using errcode='22023';
  end if;
  if v_card is not null and (length(v_card)>80 or v_card ~ '[[:cntrl:]]') then
    raise exception 'Número de tarjeta inválido.' using errcode='22023';
  end if;
  if p_card_started_on is not null and p_card_started_on>v_today then
    raise exception 'No se admite una fecha de tarjeta futura.' using errcode='22023';
  end if;
  if exists (
    select 1 from public.program_enrollments e
    where e.program_id=v_program.id and v_card is not null
      and lower(btrim(e.physical_card_number))=lower(v_card)
  ) then
    raise exception 'Tarjeta ya registrada en inscripciones oficiales.' using errcode='23505';
  end if;

  -- Se guarda un único horario oficial. Comandos nunca genera horario por nivel.
  select s.id into v_schedule_id
  from public.program_schedules s
  join lateral public.get_effective_program_schedule(s.id,v_today) e on true
  where s.program_id=v_program.id and e.is_active
  order by e.sequence_order,e.start_time,s.id limit 1;
  if v_schedule_id is null then
    raise exception 'No existe horario oficial activo para este programa.' using errcode='55000';
  end if;

  insert into ucapsa_intake.programs(
    dog_id,program_id,schedule_id,program_level,physical_card_number,
    card_started_on,created_by
  ) values (
    v_dog.id,v_program.id,v_schedule_id,
    v_level,
    v_card,p_card_started_on,v_actor
  ) on conflict(dog_id,program_id) do update set
    program_level=excluded.program_level,
    physical_card_number=excluded.physical_card_number,
    card_started_on=excluded.card_started_on
  where ucapsa_intake.programs.linked_enrollment_id is null
  returning * into v_stage;

  if v_stage.id is null then
    raise exception 'La inscripción ya está vinculada.' using errcode='55000';
  end if;
  -- Conservar prueba exacta de la versión anterior antes de corregirla.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',h.id,'kind',h.evidence_kind,'date',h.attendance_date,
      'quantity',h.quantity,'actor',h.recorded_by,'recorded_at',h.recorded_at,
      'note',h.source_note
    ) order by h.recorded_at,h.id
  ),'[]'::jsonb) into v_previous_history
  from ucapsa_intake.attendance_evidence h where h.intake_program_id=v_stage.id
    and h.evidence_source='admin_history';
  -- Staff retains their independently recorded attendance when Admin edits
  -- only historic evidence. An already-attended date cannot be reinserted.
  if exists (
    select 1 from ucapsa_intake.attendance_evidence h
    where h.intake_program_id=v_stage.id
      and h.evidence_source='staff_roster'
      and h.attendance_date=any(v_dates)
  ) then
    raise exception 'Fecha ya registrada por Entrenador; corrige el histórico sin duplicarla.'
      using errcode='23505';
  end if;
  delete from ucapsa_intake.attendance_evidence h
  where h.intake_program_id=v_stage.id and h.evidence_source='admin_history';

  insert into ucapsa_intake.attendance_evidence (
    intake_program_id,evidence_kind,attendance_date,quantity,recorded_by,source_note
  )
  select v_stage.id,'dated',dt,1,v_actor,nullif(btrim(p_note),'')
  from unnest(v_dates) dt;
  if v_missing>0 then
    insert into ucapsa_intake.attendance_evidence (
      intake_program_id,evidence_kind,attendance_date,quantity,recorded_by,source_note
    ) values (
      v_stage.id,'undated_balance',null,v_missing,v_actor,
      nullif(btrim(p_note),'')
    );
  end if;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(v_actor,'dog_preregistration.history_set','intake_program',v_stage.id,
    jsonb_build_object(
      'program_code',v_program.code,
      'before_evidence',coalesce(v_previous_history,'[]'::jsonb),
      'after_known_dates',to_jsonb(v_dates),
      'after_undated_balance',v_missing,
      'after_total',p_total_attendances,
      'source_note',nullif(btrim(p_note),''),
      'card_number_changed',v_card is not null
    ));
  return v_stage.id;
end;
$function$
