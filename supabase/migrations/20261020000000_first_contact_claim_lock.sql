-- First-use by contact without SMS (operational choice; carries a risk
-- of a false first claimant). No grants to private data. Audit remains on.
create or replace function ucapsa_intake.normalize_profile_phone(raw text)
returns text language sql immutable set search_path=''
as $normalize$
select case
  when pg_catalog.regexp_replace(coalesce(raw,''),'[^+0-9]','','g')
       ~ '^[+][1-9][0-9]{7,14}$'
    then pg_catalog.regexp_replace(raw,'[^+0-9]','','g')
  when pg_catalog.regexp_replace(coalesce(raw,''),'[^0-9]','','g')
       ~ '^[0-9]{10}$'
    then '+52'||pg_catalog.regexp_replace(raw,'[^0-9]','','g')
  else null
end
$normalize$;
revoke all on function ucapsa_intake.normalize_profile_phone(text) from public,anon,authenticated;

create table if not exists ucapsa_intake.claimed_contacts(
  kind text not null check(kind in ('phone','email')),
  contact_key text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  person_id uuid not null references ucapsa_intake.people(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  primary key(kind,contact_key)
);
alter table ucapsa_intake.claimed_contacts enable row level security;
revoke all on ucapsa_intake.claimed_contacts from public,anon,authenticated;
grant select,insert,update on ucapsa_intake.claimed_contacts to service_role;

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
  v_first_contact boolean := false;
  v_used_unverified boolean := false;
  v_first_email text;
  v_first_phone text;
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
  -- Primera toma de contacto, por petición operativa de UCAPSA:
  -- el número escrito en perfil aún no es identidad verificada. Solo
  -- se permite si nunca reclamó expedientes y nadie más usa ese contacto.
  if not v_manual and not exists (
    select 1 from ucapsa_intake.people p where p.linked_user_id=v_user
  ) then
    v_first_contact := true;
    select nullif(pg_catalog.lower(pg_catalog.btrim(u.email)), ''),
           ucapsa_intake.normalize_profile_phone(
             coalesce(nullif(p.phone,''),nullif(u.phone,'')))
    into v_first_email,v_first_phone
    from auth.users u join public.profiles p on p.user_id=u.id
    where u.id=v_user;
    v_used_unverified := (v_email is null and v_first_email is not null)
      or (v_phone is null and v_first_phone is not null);
    v_email := coalesce(v_email,v_first_email);
    v_phone := coalesce(v_phone,v_first_phone);
    if exists(
      select 1 from public.profiles other where other.user_id<>v_user
        and (
          (v_phone is not null and ucapsa_intake.normalize_profile_phone(other.phone)=v_phone)
          or (v_email is not null and pg_catalog.lower(pg_catalog.btrim(other.email))=v_email)
        )
    ) or exists(
      select 1 from auth.users other where other.id<>v_user
        and (
          (v_phone is not null and ucapsa_intake.normalize_profile_phone(other.phone)=v_phone)
          or (v_email is not null and pg_catalog.lower(pg_catalog.btrim(other.email))=v_email)
        )
    ) then
      return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
    end if;
  end if;
  -- Bloqueos globales por contacto: dos cuentas distintas no pueden
  -- reclamar a la vez el mismo número o correo, incluso sin SMS.
  if not v_manual and v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-first-email:'||v_email,0));
  end if;
  if not v_manual and v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-first-phone:'||v_phone,0));
  end if;
  if not v_manual and exists (
    select 1 from ucapsa_intake.people prev
    where prev.status='linked' and prev.linked_user_id<>v_user
      and ((v_phone is not null and prev.phone_e164=v_phone)
        or (v_email is not null and prev.email_key=v_email))
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;
  if not v_manual and exists (
    select 1 from ucapsa_intake.claimed_contacts c
    where c.user_id<>v_user
      and ((c.kind='phone' and c.contact_key=v_phone)
       or (c.kind='email' and c.contact_key=v_email))
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;
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
  if not v_manual and not v_first_contact and (
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

  -- Reservar ambos datos de contacto de la ficha al titular inicial.
  -- La restricción UNIQUE es el cierre definitivo contra otra cuenta.
  insert into ucapsa_intake.claimed_contacts(kind,contact_key,user_id,person_id)
  select contacts.kind,contacts.contact_key,v_user,v_person.id
  from (values ('email'::text,v_person.email_key),
               ('phone'::text,v_person.phone_e164)) contacts(kind,contact_key)
  where contacts.contact_key is not null
  on conflict (kind,contact_key) do nothing;
  if exists (
    select 1 from ucapsa_intake.claimed_contacts c
    where ((c.kind='email' and c.contact_key=v_person.email_key)
      or (c.kind='phone' and c.contact_key=v_person.phone_e164))
      and c.user_id<>v_user
  ) then
    raise exception 'El contacto fue vinculado antes a otra cuenta.'
      using errcode='23505';
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
      'link_method',case when v_manual then 'admin_approved' when v_used_unverified then 'first_contact_unverified' else 'verified_contact' end));
  return pg_catalog.jsonb_build_object('status','linked','linked_dogs',v_linked,'linked_programs',v_linked_programs);
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_my_preregistered_dogs()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_phone text;
  v_pending_count integer;
  v_person ucapsa_intake.people%rowtype;
  v_dogs integer;
  v_programs integer;
  v_first_contact boolean := false;
  v_first_email text;
  v_first_phone text;
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
  if not v_manual and not exists (
    select 1 from ucapsa_intake.people p where p.linked_user_id=v_user
  ) then
    v_first_contact := true;
    select nullif(pg_catalog.lower(pg_catalog.btrim(u.email)), ''),
           ucapsa_intake.normalize_profile_phone(
             coalesce(nullif(p.phone,''),nullif(u.phone,'')))
    into v_first_email,v_first_phone
    from auth.users u join public.profiles p on p.user_id=u.id
    where u.id=v_user;
    v_email := coalesce(v_email,v_first_email);
    v_phone := coalesce(v_phone,v_first_phone);
    if exists (
      select 1 from public.profiles other where other.user_id<>v_user
        and ((v_phone is not null and ucapsa_intake.normalize_profile_phone(other.phone)=v_phone)
          or (v_email is not null and pg_catalog.lower(pg_catalog.btrim(other.email))=v_email))
    ) or exists (
      select 1 from auth.users other where other.id<>v_user
        and ((v_phone is not null and ucapsa_intake.normalize_profile_phone(other.phone)=v_phone)
          or (v_email is not null and pg_catalog.lower(pg_catalog.btrim(other.email))=v_email))
    ) then
      return pg_catalog.jsonb_build_object('status','conflict','count',0);
    end if;
  end if;
  if not v_manual and exists (
    select 1 from ucapsa_intake.people prev
    where prev.status='linked' and prev.linked_user_id<>v_user
      and ((v_phone is not null and prev.phone_e164=v_phone)
        or (v_email is not null and prev.email_key=v_email))
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','count',0);
  end if;
  if not v_manual and exists (
    select 1 from ucapsa_intake.claimed_contacts c
    where c.user_id<>v_user and
      ((c.kind='phone' and c.contact_key=v_phone)
        or (c.kind='email' and c.contact_key=v_email))
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','count',0);
  end if;
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
  if (not v_manual and not v_first_contact and (
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
$function$;
