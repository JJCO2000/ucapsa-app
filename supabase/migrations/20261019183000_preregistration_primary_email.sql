-- UCAPSA identidad principal: email obligatorio y verificado.
-- Fuente: cuerpos reales de public.admin_preregister_dog y
-- public.claim_my_preregistered_dogs recuperados de Supabase producción.
-- No altera firmas, datos de inscripciones, evidencias, pagos ni roles.
-- El teléfono continúa opcional y se utiliza solo como corroboración
-- si tiene prueba independiente de verificación por Auth.
-- No agrega Firebase Auth: UCAPSA usa Supabase Auth como identidad única.

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
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Admin o Superadmin puede preinscribir perros.' using errcode='42501';
  end if;
  if length(v_owner) not between 2 and 120 or length(v_dog) not between 1 and 80
      or v_owner ~ '[[:cntrl:]]' or v_dog ~ '[[:cntrl:]]' then
    raise exception 'Nombre de tutor o perro inválido.' using errcode='22023';
  end if;
  if v_email is null then
    raise exception 'El correo electrónico del tutor es obligatorio para su preinscripción.'
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_my_preregistered_dogs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_phone text;
  v_profile_role public.app_role;
  v_count integer;
  v_person ucapsa_intake.people%rowtype;
  v_dog record;
  v_dog_id uuid;
  v_linked integer := 0;
  v_linked_programs integer := 0;
  v_stage ucapsa_intake.programs%rowtype;
  v_enrollment_id uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.' using errcode='42501';
  end if;
  select p.role into v_profile_role from public.profiles p where p.user_id=v_user;
  -- Rol de Staff no impide reclamar su propia ficha con contacto verificado.
  if v_profile_role is null then
    return pg_catalog.jsonb_build_object('status','not_applicable','linked_dogs',0);
  end if;

  select case when u.email_confirmed_at is not null
       then nullif(lower(btrim(u.email)),'') else null end,
       case when u.phone_confirmed_at is not null
       then nullif(btrim(u.phone),'') else null end
  into v_email,v_phone
  from auth.users u where u.id=v_user;
  if v_email is null then
    -- El teléfono sirve como contacto auxiliar, no como prueba primaria de
    -- titularidad del expediente ni para vinculación sin correo confirmado.
    return pg_catalog.jsonb_build_object('status','unverified','linked_dogs',0);
  end if;
  -- No basta con un candidato provisional único: exigir identidad única
  -- entre TODAS las cuentas Auth verificadas. Un teléfono compartido o
  -- reasignado no puede transferir un expediente a la cuenta equivocada.
  if exists (
    select 1 from auth.users u
    where u.id<>v_user
      and (
        (v_email is not null and u.email_confirmed_at is not null
          and lower(btrim(u.email))=v_email)
        or
        (v_phone is not null and u.phone_confirmed_at is not null
          and btrim(u.phone)=v_phone)
      )
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  -- Bloquea solicitudes simultáneas de la misma cuenta.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ucapsa-claim:'||v_user::text,0));

  select count(*) into v_count from ucapsa_intake.people p
  where p.status='pending' and p.email_key=v_email;
  if v_count=0 then
    return pg_catalog.jsonb_build_object('status','none','linked_dogs',0);
  end if;
  if v_count<>1 then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  select * into v_person from ucapsa_intake.people p
  where p.status='pending' and p.email_key=v_email for update;

  -- Un contacto verificado que contradiga la ficha impide reclamación.
  if (v_email is not null and v_person.email_key is not null and v_email<>v_person.email_key)
    or (v_phone is not null and v_person.phone_e164 is not null and v_phone<>v_person.phone_e164) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  -- Evitar reasignación y asociación de fichas de otras identidades.
  if exists (
    select 1 from ucapsa_intake.people p
    where p.linked_user_id=v_user and p.id<>v_person.id
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;
  if exists (
    select 1 from ucapsa_intake.dogs staged
    join public.dogs d on d.user_id=v_user and d.is_active
     and lower(btrim(d.name))=lower(btrim(staged.dog_name))
    where staged.person_id=v_person.id
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  for v_dog in select d.id,d.dog_name from ucapsa_intake.dogs d
    where d.person_id=v_person.id order by d.id for update
  loop
    insert into public.dogs(user_id,name,is_active)
    values(v_user,v_dog.dog_name,true)
    returning id into v_dog_id;
    update ucapsa_intake.dogs set linked_dog_id=v_dog_id where id=v_dog.id;

    -- La fecha histórica de la tarjeta física permanece en ucapsa_intake.programs.
    -- La inscripción oficial empieza cuando Admin la autorizó, sin inventar
    -- la fecha física ni alterar el histórico de asistencias o generar pagos.
    -- La columna card_started_on es un campo legado de vigencia operativa.
    for v_stage in
      select st.* from ucapsa_intake.programs st
      where st.dog_id=v_dog.id
      order by st.program_id for update
    loop
      if v_stage.linked_enrollment_id is not null then
        raise exception 'La tarjeta provisional ya está vinculada.'
          using errcode='23505';
      end if;
      if not exists (
        select 1 from public.program_schedules sch
        where sch.id=v_stage.schedule_id and sch.program_id=v_stage.program_id
      ) then
        raise exception 'No se encontró el horario oficial original.'
          using errcode='55000';
      end if;
      insert into public.program_enrollments(
        user_id,program_id,schedule_id,dog_id,dog_name,
        physical_card_number,program_level,access_mode,status,
        started_at,card_started_on,intake_program_id
      ) values (
        v_user,v_stage.program_id,v_stage.schedule_id,v_dog_id,v_dog.dog_name,
        v_stage.physical_card_number,v_stage.program_level,'card','active',
        v_stage.authorized_on,v_stage.authorized_on,v_stage.id
      ) returning id into v_enrollment_id;

      update ucapsa_intake.programs
      set linked_enrollment_id=v_enrollment_id where id=v_stage.id;

      insert into public.program_attendance_historical_evidence (
        enrollment_id,intake_evidence_id,evidence_kind,evidence_source,
        attendance_date,quantity,recorded_by,recorded_at,source_note
      )
      select
        v_enrollment_id,h.id,h.evidence_kind,h.evidence_source,
        h.attendance_date,h.quantity,h.recorded_by,h.recorded_at,h.source_note
      from ucapsa_intake.attendance_evidence h
      where h.intake_program_id=v_stage.id;

      -- Idempotencia: la fuente del balance mantiene un único ID histórico.
      perform public.refresh_program_enrollment_progress(v_enrollment_id);
      v_linked_programs:=v_linked_programs+1;
    end loop;

    v_linked:=v_linked+1;
  end loop;
  update ucapsa_intake.people
    set status='linked', linked_user_id=v_user, linked_at=clock_timestamp()
    where id=v_person.id and status='pending';

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(v_user,'dog_preregistration.claimed','dog_preregistration',v_person.id,
    pg_catalog.jsonb_build_object('dogs',v_linked,'programs',v_linked_programs));
  return pg_catalog.jsonb_build_object('status','linked','linked_dogs',v_linked,'linked_programs',v_linked_programs);
end;
$function$;

-- RPC previas solo para authenticated; Auth/role verificado dentro.
revoke all on function public.admin_preregister_dog(text,text,text,text) from public,anon;
grant execute on function public.admin_preregister_dog(text,text,text,text) to authenticated;
revoke all on function public.claim_my_preregistered_dogs() from public,anon;
grant execute on function public.claim_my_preregistered_dogs() to authenticated;
