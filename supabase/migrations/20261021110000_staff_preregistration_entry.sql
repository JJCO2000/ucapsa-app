-- 2026-10-21 | Allow trainer quick pre-enrollment without making admin-only operations available.
-- Core routines remain the only source for validation and persistence. Their direct
-- execution is revoked: privileged staff/admin wrappers perform role checks server-side.
-- No change to Auth users, membership, payments, official enrollment or actual data.

CREATE OR REPLACE FUNCTION public.admin_preregister_dog(p_owner_name text, p_owner_email text, p_owner_phone text, p_dog_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := nullif(lower(btrim(coalesce(p_owner_email,''))), '');
  v_phone text := nullif(btrim(coalesce(p_owner_phone,'')), '');
  v_owner text := btrim(coalesce(p_owner_name,''));
  v_dog text := btrim(coalesce(p_dog_name,''));
  v_person ucapsa_intake.people%rowtype;
  v_count integer;
  v_dog_id uuid;
begin
  if auth.uid() is null or not public.is_ucapsa_staff() then
    raise exception 'Solo Admin o Superadmin puede preinscribir perros.' using errcode='42501';
  end if;
  if length(v_owner) not between 2 and 120 or length(v_dog) not between 1 and 80
      or v_owner ~ '[[:cntrl:]]' or v_dog ~ '[[:cntrl:]]' then
    raise exception 'Nombre de tutor o perro inválido.' using errcode='22023';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'Indica celular o correo del tutor; el celular es prioritario.'
      using errcode='22023';
  end if;
  if v_email is not null and (length(v_email) > 254 or
      v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') then
    raise exception 'Correo inválido.' using errcode='22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Usa teléfono internacional E.164 (ej. +525512345678).' using errcode='22023';
  end if;

  -- Bloqueo de los dos contactos en orden estable: evita alta paralela duplicada.
  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ucapsa-intake-email:'||v_email, 0));
  end if;
  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ucapsa-intake-phone:'||v_phone, 0));
  end if;

  -- Una cuenta Auth existente es identidad canónica aun si el perfil
  -- administrativo aún no ha sincronizado su email/teléfono.
  if exists (
    select 1 from auth.users u where
      (v_email is not null and u.email_confirmed_at is not null
       and lower(btrim(u.email))=v_email)
      or (v_phone is not null and u.phone_confirmed_at is not null
       and u.phone=v_phone)
  ) or exists (
    select 1 from public.profiles p where
      (v_email is not null and lower(btrim(p.email))=v_email)
      or (v_phone is not null and p.phone=v_phone)
  ) then
    raise exception 'El tutor ya tiene una cuenta; usa su ficha oficial, no una segunda preinscripción.'
      using errcode='23505';
  end if;

  select count(*) into v_count
  from ucapsa_intake.people p
  where p.status='pending' and (
    (v_email is not null and p.email_key=v_email) or
    (v_phone is not null and p.phone_e164=v_phone)
  );
  if v_count > 1 then
    raise exception 'Contactos asociados a fichas distintas: no se puede unir automáticamente.' using errcode='23505';
  end if;
  if v_count=1 then
    select * into v_person from ucapsa_intake.people p
    where p.status='pending' and (
      (v_email is not null and p.email_key=v_email) or
      (v_phone is not null and p.phone_e164=v_phone)
    ) for update;
    -- Mismo contacto NO autoriza fusionar automáticamente dos tutores distintos.
    if lower(btrim(v_person.owner_name)) <> lower(v_owner) then
      raise exception 'Contacto compartido o identidad diferente: requiere revisión.'
        using errcode='23505';
    end if;
    if (v_email is not null and v_person.email_key is not null and v_email<>v_person.email_key)
      or (v_phone is not null and v_person.phone_e164 is not null and v_phone<>v_person.phone_e164) then
      raise exception 'Datos de contacto contradictorios; revisa la identidad.' using errcode='23505';
    end if;
    update ucapsa_intake.people
      set email_key=coalesce(email_key,v_email), phone_e164=coalesce(phone_e164,v_phone)
      where id=v_person.id;
  else
    insert into ucapsa_intake.people(owner_name,email_key,phone_e164,created_by)
    values(v_owner,v_email,v_phone,auth.uid()) returning * into v_person;
  end if;

  insert into ucapsa_intake.dogs(person_id,dog_name)
  values (v_person.id,v_dog)
  on conflict do nothing
  returning id into v_dog_id;

  if v_dog_id is null then
    select d.id into v_dog_id from ucapsa_intake.dogs d
      where d.person_id=v_person.id and lower(btrim(d.dog_name))=lower(v_dog);
  else
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'dog_preregistration.created','dog_preregistration',v_dog_id,
      pg_catalog.jsonb_build_object('person_id',v_person.id));
  end if;
  return v_dog_id;
end;
$function$

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
  if v_actor is null or not public.is_ucapsa_staff() then
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
  from ucapsa_intake.attendance_evidence h where h.intake_program_id=v_stage.id;
  delete from ucapsa_intake.attendance_evidence h where h.intake_program_id=v_stage.id;

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


revoke execute on function public.admin_preregister_dog(text,text,text,text) from public, anon, authenticated;
revoke execute on function public.admin_save_preregistered_program_history(uuid,text,text,text,date,integer,date[],text) from public, anon, authenticated;

-- Staff can CREATE pending enrollment evidence only. Existing history cannot be
-- overwritten from the trainer shortcut (and will not authorize Socio).
create or replace function public.staff_preregister_dog_with_program(
  p_owner_name text, p_owner_email text, p_owner_phone text, p_dog_name text,
  p_program_code text, p_program_level text
) returns uuid language plpgsql security definer
set search_path to ''
as $staff$
declare
  v_email text := nullif(lower(btrim(coalesce(p_owner_email,''))), '');
  v_phone text := nullif(btrim(coalesce(p_owner_phone,'')), '');
  v_dog_id uuid;
begin
  if auth.uid() is null or not public.is_ucapsa_staff() then
    raise exception 'Solo personal UCAPSA puede preinscribir.' using errcode='42501';
  end if;
  if coalesce(lower(btrim(p_program_code)), '') not in ('puppy','comandos') then
    raise exception 'Programa no admitido.' using errcode='22023';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'Se requiere correo o celular.' using errcode='22023';
  end if;

  -- Same lock order used by the existing Admin helper. Prevent double saves.
  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-intake-email:'||v_email,0));
  end if;
  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-intake-phone:'||v_phone,0));
  end if;

  -- A trainer must never overwrite the attendance history of an existing card.
  if exists (
    select 1 from ucapsa_intake.people p
    join ucapsa_intake.dogs d on d.person_id=p.id
    join ucapsa_intake.programs st on st.dog_id=d.id
    join public.programs prog on prog.id=st.program_id
    where p.status='pending'
      and lower(btrim(d.dog_name))=lower(btrim(p_dog_name))
      and prog.code=lower(btrim(p_program_code))
      and ((v_email is not null and p.email_key=v_email)
        or (v_phone is not null and p.phone_e164=v_phone))
  ) then
    raise exception 'La preinscripción ya existe. Administración debe revisar cualquier corrección.'
      using errcode='23505';
  end if;

  -- Shared validation and SSOT: the existing Admin core functions enforce
  -- contacts, account identity, official schedule, Puppy/Comandos and levels.
  v_dog_id := public.admin_preregister_dog(
    p_owner_name,p_owner_email,p_owner_phone,p_dog_name);
  perform public.admin_save_preregistered_program_history(
    v_dog_id,p_program_code,p_program_level,
    null::text,null::date,0,array[]::date[],
    'Captura rápida por personal UCAPSA; sin asistencias históricas');
  return v_dog_id;
end;
$staff$;

revoke all on function public.staff_preregister_dog_with_program(text,text,text,text,text,text) from public, anon;
grant execute on function public.staff_preregister_dog_with_program(text,text,text,text,text,text) to authenticated;
