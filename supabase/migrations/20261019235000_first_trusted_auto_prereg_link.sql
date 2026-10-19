-- First trusted preregistration can be accepted without a second UI confirmation:
-- only if Supabase Auth has CONFIRMED the contact, or Admin has approved
-- the precise account in person. Unverified typed contact is NOT ownership.
-- Later new provisional persons for the same account require Admin approval
-- and the signed-in user's explicit consent. No SMS is activated.
create or replace function public.admin_approve_preregistration_owner_link(
  p_person_id uuid, p_user_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $manual_approve$
declare
  v_reason text := btrim(coalesce(p_reason,''));
  v_person ucapsa_intake.people%rowtype;
  v_dogs integer;
  v_programs integer;
  v_existing uuid;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede aprobar enlaces.' using errcode='42501';
  end if;
  if length(v_reason) not between 12 and 400 then
    raise exception 'Registra cómo comprobaste la identidad (12 a 400 caracteres).' using errcode='22023';
  end if;
  if p_person_id is null or p_user_id is null then
    raise exception 'Selecciona expediente y cuenta concretos.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ucapsa-manual-claim:'||p_person_id::text,0));
  select * into v_person from ucapsa_intake.people p where p.id=p_person_id for update;
  if not found or v_person.status<>'pending' or v_person.linked_user_id is not null then
    raise exception 'El expediente ya no está pendiente.' using errcode='23505';
  end if;
  if not exists(select 1 from auth.users u
                join public.profiles pr on pr.user_id=u.id
                where u.id=p_user_id) then
    raise exception 'La cuenta de destino no existe.' using errcode='22023';
  end if;
  -- Una cuenta puede adquirir un SEGUNDO expediente únicamente por aprobación
  -- expresa de Administración y confirmación del usuario. Jamás por contacto
  -- que el cliente escribió en su perfil.
  select count(*) into v_dogs from ucapsa_intake.dogs d
    where d.person_id=p_person_id and d.linked_dog_id is null;
  select count(*) into v_programs from ucapsa_intake.programs pr
    join ucapsa_intake.dogs d on d.id=pr.dog_id
    where d.person_id=p_person_id and pr.linked_enrollment_id is null;
  if v_dogs=0 or v_programs=0 then
    raise exception 'Falta perro o historial de inscripción para autorizar.' using errcode='23505';
  end if;
  if exists(select 1 from ucapsa_intake.dogs d
     join public.dogs existing on existing.user_id=p_user_id and existing.is_active
       and lower(btrim(existing.name))=lower(btrim(d.dog_name))
     where d.person_id=p_person_id) then
    raise exception 'La cuenta ya tiene un perro con ese nombre; revisa el expediente.' using errcode='23505';
  end if;
  select a.user_id into v_existing from ucapsa_intake.owner_link_approvals a
    where a.person_id=p_person_id for update;
  if v_existing is not null and v_existing<>p_user_id then
    raise exception 'La preinscripción ya fue autorizada para otra cuenta.' using errcode='23505';
  end if;
  insert into ucapsa_intake.owner_link_approvals(person_id,user_id,approved_by,reason)
  values(p_person_id,p_user_id,auth.uid(),v_reason)
  on conflict(person_id) do nothing;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'dog_preregistration.manual_approval','dog_preregistration',
      p_person_id,jsonb_build_object('target_user_id',p_user_id,'evidence',v_reason));
  return jsonb_build_object('status','approved');
end;
$manual_approve$;
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
  v_manual boolean := false;
  v_approved_person uuid;
  v_manual_count integer := 0;
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


  -- El administrador ya comprobó presencialmente la identidad del titular.
  -- Se autoriza SOLO el expediente identificado para esta cuenta Auth.
  select count(*) into v_manual_count
  from ucapsa_intake.owner_link_approvals a
  join ucapsa_intake.people p on p.id=a.person_id
  where a.user_id=v_user and a.consumed_at is null and p.status='pending';
  select a.person_id into v_approved_person
  from ucapsa_intake.owner_link_approvals a
  join ucapsa_intake.people p on p.id=a.person_id
  where a.user_id=v_user and a.consumed_at is null and p.status='pending'
  limit 1;
  if v_manual_count>1 then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;
  v_manual := v_manual_count=1;

  select case when u.email_confirmed_at is not null
       then nullif(lower(btrim(u.email)),'') else null end,
       case when u.phone_confirmed_at is not null
       then nullif(btrim(u.phone),'') else null end
  into v_email,v_phone
  from auth.users u where u.id=v_user;
  if v_phone is null and v_email is null and not v_manual then
    -- Solo Auth puede verificar contactos: los datos escritos en perfiles
    -- o formularios no autorizan reclamar historial ajeno.
    return pg_catalog.jsonb_build_object('status','unverified','linked_dogs',0);
  end if;
  -- No basta con un candidato provisional único: exigir identidad única
  -- entre TODAS las cuentas Auth verificadas. Un teléfono compartido o
  -- reasignado no puede transferir un expediente a la cuenta equivocada.
  if not v_manual and exists (
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
  where p.status='pending'
    and ((v_manual and p.id=v_approved_person)
      or (not v_manual and ((v_phone is not null and p.phone_e164=v_phone)
        or (v_email is not null and p.email_key=v_email))));
  if v_count=0 then
    return pg_catalog.jsonb_build_object('status','none','linked_dogs',0);
  end if;
  if v_count<>1 then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  select * into v_person from ucapsa_intake.people p
  where p.status='pending'
    and ((v_manual and p.id=v_approved_person)
      or (not v_manual and ((v_phone is not null and p.phone_e164=v_phone)
        or (v_email is not null and p.email_key=v_email)))) for update;

  -- Un contacto verificado que contradiga la ficha impide reclamación.
  if not v_manual and (
       (v_email is not null and v_person.email_key is not null and v_email<>v_person.email_key)
    or (v_phone is not null and v_person.phone_e164 is not null and v_phone<>v_person.phone_e164)
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  -- Evitar reasignación y asociación de fichas de otras identidades.
  if not v_manual and exists (
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

  if v_manual then
    update ucapsa_intake.owner_link_approvals
       set consumed_at=clock_timestamp()
     where person_id=v_person.id and user_id=v_user and consumed_at is null;
  end if;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(v_user,'dog_preregistration.claimed','dog_preregistration',v_person.id,
    pg_catalog.jsonb_build_object('dogs',v_linked,'programs',v_linked_programs,
      'link_method',case when v_manual then 'admin_approved' else 'verified_contact' end));
  return pg_catalog.jsonb_build_object('status','linked','linked_dogs',v_linked,'linked_programs',v_linked_programs);
end;
$function$;
create or replace function public.preview_my_preregistered_dogs()
returns jsonb
language plpgsql stable security definer set search_path=''
as $fn$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_phone text;
  v_pending_count integer;
  v_person ucapsa_intake.people%rowtype;
  v_dogs integer;
  v_programs integer;
  v_manual boolean := false;
  v_approved_person uuid;
  v_manual_count integer := 0;
begin
  if v_user is null then
    raise exception 'Inicia sesión.' using errcode='42501';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id=v_user) then
    return pg_catalog.jsonb_build_object('status','not_applicable','count',0);
  end if;

  -- El administrador ya comprobó presencialmente la identidad del titular.
  -- Se autoriza SOLO el expediente identificado para esta cuenta Auth.
  select count(*) into v_manual_count
  from ucapsa_intake.owner_link_approvals a
  join ucapsa_intake.people p on p.id=a.person_id
  where a.user_id=v_user and a.consumed_at is null and p.status='pending';
  select a.person_id into v_approved_person
  from ucapsa_intake.owner_link_approvals a
  join ucapsa_intake.people p on p.id=a.person_id
  where a.user_id=v_user and a.consumed_at is null and p.status='pending'
  limit 1;
  if v_manual_count>1 then
    return pg_catalog.jsonb_build_object('status','conflict','count',0);
  end if;
  v_manual := v_manual_count=1;

  select case when u.email_confirmed_at is not null
    then nullif(pg_catalog.lower(pg_catalog.btrim(u.email)),'') else null end,
    case when u.phone_confirmed_at is not null
    then nullif(pg_catalog.btrim(u.phone),'') else null end
    into v_email,v_phone from auth.users u where u.id=v_user;
  if v_email is null and v_phone is null and not v_manual then
    return pg_catalog.jsonb_build_object('status','unverified','count',0);
  end if;
  if not v_manual and exists (
    select 1 from auth.users u where u.id<>v_user and (
      (v_email is not null and u.email_confirmed_at is not null
        and pg_catalog.lower(pg_catalog.btrim(u.email))=v_email)
      or
      (v_phone is not null and u.phone_confirmed_at is not null
        and pg_catalog.btrim(u.phone)=v_phone)
    )
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','count',0);
  end if;

  select count(*) into v_pending_count
  from ucapsa_intake.people p where p.status='pending' and (
    (v_manual and p.id=v_approved_person)
    or (not v_manual and ((v_phone is not null and p.phone_e164=v_phone)
      or (v_email is not null and p.email_key=v_email)))
  );
  if v_pending_count=0 then
    return pg_catalog.jsonb_build_object('status','none','count',0);
  end if;
  if v_pending_count<>1 then
    return pg_catalog.jsonb_build_object('status','conflict','count',0);
  end if;
  select * into v_person from ucapsa_intake.people p
  where p.status='pending' and (
    (v_manual and p.id=v_approved_person)
    or (not v_manual and ((v_phone is not null and p.phone_e164=v_phone)
      or (v_email is not null and p.email_key=v_email)))
  );
  -- Same collision and account ownership protections as claim RPC.
  if (not v_manual and (
       (v_email is not null and v_person.email_key is not null
          and v_email<>v_person.email_key)
       or (v_phone is not null and v_person.phone_e164 is not null
          and v_phone<>v_person.phone_e164)
    ))
    or (not v_manual and exists (
      select 1 from ucapsa_intake.people p
      where p.linked_user_id=v_user and p.id<>v_person.id
    ))
    or exists (
      select 1 from ucapsa_intake.dogs staged
      join public.dogs d on d.user_id=v_user and d.is_active
        and pg_catalog.lower(pg_catalog.btrim(d.name))=
            pg_catalog.lower(pg_catalog.btrim(staged.dog_name))
      where staged.person_id=v_person.id
    )
  then
    return pg_catalog.jsonb_build_object('status','conflict','count',0);
  end if;

  select count(*) into v_dogs from ucapsa_intake.dogs d
  where d.person_id=v_person.id and d.linked_dog_id is null;
  select count(*) into v_programs from ucapsa_intake.programs st
  join ucapsa_intake.dogs d on d.id=st.dog_id
  where d.person_id=v_person.id and st.linked_enrollment_id is null;
  if v_dogs=0 or v_programs=0 then
    return pg_catalog.jsonb_build_object('status','none','count',0);
  end if;
  return pg_catalog.jsonb_build_object('status','available','count',v_dogs,
    'auto_first',not exists (
      select 1 from ucapsa_intake.people p where p.linked_user_id=v_user
    ));
end;
$fn$;
-- Auto-link FIRST intake only. Lock the user BEFORE checking prior links to
-- avoid two overlapping sessions racing to silently claim multiple records.
-- The canonical claim enforces verified Auth contact OR prior Admin approval,
-- checks the stage ownership and creates a full audit trail in one transaction.
create or replace function public.claim_my_first_preregistered_dogs()
returns jsonb language plpgsql security definer set search_path=''
as $first_auto$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Inicia sesión para vincular.' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ucapsa-claim:'||v_user::text,0));
  if exists(select 1 from ucapsa_intake.people p where p.linked_user_id=v_user) then
    return pg_catalog.jsonb_build_object('status','requires_approval','linked_dogs',0);
  end if;
  return public.claim_my_preregistered_dogs();
end;
$first_auto$;
revoke all on function public.claim_my_first_preregistered_dogs() from public,anon;
grant execute on function public.claim_my_first_preregistered_dogs() to authenticated;
revoke all on function public.admin_approve_preregistration_owner_link(uuid,uuid,text) from public,anon;
revoke all on function public.claim_my_preregistered_dogs() from public,anon;
revoke all on function public.preview_my_preregistered_dogs() from public,anon;
grant execute on function public.admin_approve_preregistration_owner_link(uuid,uuid,text) to authenticated;
grant execute on function public.claim_my_preregistered_dogs() to authenticated;
grant execute on function public.preview_my_preregistered_dogs() to authenticated;
