-- UCAPSA: coincidencia sin SMS -> solicitud consentida -> identidad revisada
-- por Administración. Número NO verificado nunca autoriza automáticamente.
create table ucapsa_intake.link_requests(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 intake_person_id uuid references ucapsa_intake.people(id),
 requested_phone text,requested_email text,
 consent_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','approved','rejected','claimed')),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,
 proof_note text,claimed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index intake_link_open_user_unique on ucapsa_intake.link_requests(user_id)
 where status in ('pending','approved');
create unique index intake_link_approved_person_unique on ucapsa_intake.link_requests(intake_person_id)
 where status='approved';
create index intake_link_status_idx on ucapsa_intake.link_requests(status,created_at);
alter table ucapsa_intake.link_requests enable row level security;
revoke all on ucapsa_intake.link_requests from public,anon,authenticated;

create or replace function public.request_my_preregistration_link()
returns text language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();v_phone text;v_email text;v_person uuid;v_count integer;
begin
 if v_user is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 select nullif(pg_catalog.btrim(p.phone),''),
        nullif(lower(pg_catalog.btrim(u.email)),'')
 into v_phone,v_email from public.profiles p join auth.users u on u.id=p.user_id
 where p.user_id=v_user;
 if not found then raise exception 'Cuenta sin perfil.' using errcode='42501'; end if;
 if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
  raise exception 'Guarda primero el teléfono con +52 y diez dígitos.' using errcode='22023';
 end if;
 if v_phone is null and v_email is null then
  raise exception 'Tu cuenta necesita al menos un contacto.' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ucapsa-link:'||v_user::text,0));
 if exists(select 1 from ucapsa_intake.link_requests r where r.user_id=v_user
   and (r.status in ('pending','approved') or r.created_at>now()-interval '24 hours')) then
   return 'pending';
 end if;
 select count(*)::integer,min(id::text)::uuid into v_count,v_person
 from ucapsa_intake.people pe where pe.status='pending'
 and ((v_phone is not null and pe.phone_e164=v_phone)
   or (v_email is not null and pe.email_key=v_email));
 if v_count<>1 then v_person:=null; end if;
 insert into ucapsa_intake.link_requests(user_id,intake_person_id,requested_phone,requested_email)
 values(v_user,v_person,v_phone,v_email);
 return 'pending'; -- No revelar existencia de otra persona al cliente.
end;
$function$;
revoke all on function public.request_my_preregistration_link() from public,anon;
grant execute on function public.request_my_preregistration_link() to authenticated;

create or replace function public.get_my_preregistration_link_status()
returns text language sql stable security definer set search_path=''
as $function$
 select coalesce((select r.status from ucapsa_intake.link_requests r
  where r.user_id=auth.uid() order by r.created_at desc,r.id desc limit 1),'none')::text
$function$;
revoke all on function public.get_my_preregistration_link_status() from public,anon;
grant execute on function public.get_my_preregistration_link_status() to authenticated;

create or replace function public.admin_get_preregistration_link_requests()
returns table(request_id uuid,account_user_id uuid,account_name text,
 account_email text,account_phone text,owner_name text,dog_names text,
 requested_phone text,requested_email text,request_status text,requested_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.is_ucapsa_admin() then
   raise exception 'Solo Administración.' using errcode='42501';
 end if;
 return query
 select r.id,r.user_id,p.full_name::text,u.email::text,p.phone::text,
   pe.owner_name::text,
   (select pg_catalog.string_agg(d.dog_name,', ' order by d.dog_name)
    from ucapsa_intake.dogs d where d.person_id=pe.id)::text,
   r.requested_phone,r.requested_email,r.status,r.created_at
 from ucapsa_intake.link_requests r join auth.users u on u.id=r.user_id
 left join public.profiles p on p.user_id=r.user_id
 left join ucapsa_intake.people pe on pe.id=r.intake_person_id
 where r.status='pending' order by r.created_at asc,r.id;
end;
$function$;
revoke all on function public.admin_get_preregistration_link_requests() from public,anon;
grant execute on function public.admin_get_preregistration_link_requests() to authenticated;

create or replace function public.admin_review_preregistration_link(
 p_request_id uuid,p_approve boolean,p_proof_note text)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_request ucapsa_intake.link_requests%rowtype;
 v_person ucapsa_intake.people%rowtype;v_phone text;v_email text;
begin
 if auth.uid() is null or not public.is_ucapsa_admin() then
   raise exception 'Solo Administración.' using errcode='42501';
 end if;
 if p_proof_note is null or length(pg_catalog.btrim(p_proof_note))<15 then
   raise exception 'Describe cómo comprobaste la identidad (mínimo 15 caracteres).' using errcode='22023';
 end if;
 select * into v_request from ucapsa_intake.link_requests
 where id=p_request_id and status='pending' for update;
 if not found then raise exception 'La solicitud ya fue resuelta.' using errcode='23505'; end if;
 if v_request.user_id=auth.uid() then
   raise exception 'No puedes aprobar tu propia solicitud.' using errcode='42501'; end if;
 if p_approve then
   if v_request.intake_person_id is null then
     raise exception 'No existe coincidencia única; requiere revisión presencial.' using errcode='23505';
   end if;
   select * into v_person from ucapsa_intake.people
   where id=v_request.intake_person_id and status='pending' for update;
   if not found then raise exception 'Expediente no disponible.' using errcode='23505'; end if;
   select nullif(pg_catalog.btrim(p.phone),''),nullif(lower(pg_catalog.btrim(u.email)),'')
     into v_phone,v_email from public.profiles p join auth.users u on u.id=p.user_id
     where p.user_id=v_request.user_id;
   if v_request.requested_phone is distinct from v_phone
      or v_request.requested_email is distinct from v_email then
     raise exception 'Los contactos de la cuenta cambiaron.' using errcode='23505';
   end if;
   if not ((v_phone is not null and v_person.phone_e164=v_phone)
      or (v_email is not null and v_person.email_key=v_email)) then
     raise exception 'El contacto ya no coincide.' using errcode='23505';
   end if;
 end if;
 update ucapsa_intake.link_requests
 set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),proof_note=pg_catalog.btrim(p_proof_note)
 where id=v_request.id;
 insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
 values(auth.uid(),case when p_approve then 'dog_preregistration.manual_link_approved'
  else 'dog_preregistration.manual_link_rejected' end,'dog_preregistration',v_request.id,
 pg_catalog.jsonb_build_object('user_id',v_request.user_id,'approved',p_approve));
 return case when p_approve then 'approved' else 'rejected' end;
end;
$function$;
revoke all on function public.admin_review_preregistration_link(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_preregistration_link(uuid,boolean,text) to authenticated;

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
  v_manual_person uuid;
  v_manual_request uuid;
  v_manual boolean := false;
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
  select lr.id,lr.intake_person_id into v_manual_request,v_manual_person
  from ucapsa_intake.link_requests lr
  where lr.user_id=v_user and lr.status='approved'
  order by lr.reviewed_at desc,lr.id limit 1;
  v_manual := v_manual_request is not null;
  if not v_manual and v_phone is null and v_email is null then
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
  where p.status='pending'
    and ((v_manual and p.id=v_manual_person)
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
    and ((v_manual and p.id=v_manual_person)
       or (not v_manual and ((v_phone is not null and p.phone_e164=v_phone)
      or (v_email is not null and p.email_key=v_email)))) for update;

  -- Un contacto verificado que contradiga la ficha impide reclamación.
  if not v_manual and ((v_email is not null and v_person.email_key is not null and v_email<>v_person.email_key)
    or (v_phone is not null and v_person.phone_e164 is not null and v_phone<>v_person.phone_e164)) then
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
  if v_manual then
    update ucapsa_intake.link_requests set status='claimed',claimed_at=clock_timestamp()
    where id=v_manual_request and user_id=v_user and status='approved';
  end if;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(v_user,'dog_preregistration.claimed','dog_preregistration',v_person.id,
    pg_catalog.jsonb_build_object('dogs',v_linked,'programs',v_linked_programs));
  return pg_catalog.jsonb_build_object('status','linked','linked_dogs',v_linked,'linked_programs',v_linked_programs);
end;
$function$;
revoke all on function public.claim_my_preregistered_dogs() from public,anon;
grant execute on function public.claim_my_preregistered_dogs() to authenticated;
