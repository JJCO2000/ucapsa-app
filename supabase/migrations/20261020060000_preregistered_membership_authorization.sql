-- UCAPSA: Socio autorizado antes de existir Auth.
-- La preinscripción no es una membresía oficial hasta reclamar la cuenta.
-- La cuenta y los permisos de Socio siguen teniendo SSOT en public.memberships.
alter table ucapsa_intake.people
  add column if not exists member_preapproved boolean not null default false,
  add column if not exists member_preapproved_by uuid references auth.users(id),
  add column if not exists member_preapproved_at timestamptz;

alter table ucapsa_intake.people
  add constraint ucapsa_member_preapproval_provenance
  check (
    (member_preapproved and member_preapproved_by is not null and member_preapproved_at is not null)
    or (not member_preapproved and member_preapproved_by is null and member_preapproved_at is null)
  );

create or replace function public.admin_set_preregistered_membership(
  p_intake_dog_id uuid, p_is_member boolean
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_person ucapsa_intake.people%rowtype;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede autorizar Socios preinscritos.'
      using errcode='42501';
  end if;
  if p_is_member is null then
    raise exception 'Indica explícitamente el estado de Socio.' using errcode='22023';
  end if;

  select pe.* into v_person
  from ucapsa_intake.dogs d
  join ucapsa_intake.people pe on pe.id=d.person_id
  where d.id=p_intake_dog_id and d.linked_dog_id is null
  for update of pe;
  if not found or v_person.status<>'pending' then
    raise exception 'Expediente provisional no disponible.'
      using errcode='55000';
  end if;
  if v_person.member_preapproved is distinct from p_is_member then
    update ucapsa_intake.people set member_preapproved=p_is_member,
      member_preapproved_by=case when p_is_member then auth.uid() else null end,
      member_preapproved_at=case when p_is_member then clock_timestamp() else null end
    where id=v_person.id;
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'preregistration.membership_authorization',
      'dog_preregistration',v_person.id,
      jsonb_build_object('approved',p_is_member,'phase','before_account'));
  end if;
  return p_is_member;
end;
$function$;

revoke all on function public.admin_set_preregistered_membership(uuid,boolean) from public,anon;
grant execute on function public.admin_set_preregistered_membership(uuid,boolean) to authenticated;

-- Alta atómica: si falla la autorización provisional no queda un registro parcial.
create or replace function public.admin_preregister_dog_with_membership(
  p_owner_name text, p_owner_email text, p_owner_phone text, p_dog_name text,
  p_program_code text, p_program_level text, p_card_number text,
  p_card_started_on date, p_total_attendances integer,
  p_known_dates date[], p_note text, p_member_authorized boolean
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_dog uuid;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede preinscribir Socios.'
      using errcode='42501';
  end if;
  v_dog := public.admin_preregister_dog_with_program(
    p_owner_name,p_owner_email,p_owner_phone,p_dog_name,p_program_code,
    p_program_level,p_card_number,p_card_started_on,p_total_attendances,
    p_known_dates,p_note);
  -- Una segunda tarjeta del mismo tutor no revoca por accidente una
  -- autorización de socio anterior. Para revocar se usa el RPC explícito.
  if p_member_authorized then
    perform public.admin_set_preregistered_membership(v_dog,true);
  end if;
  return v_dog;
end;
$function$;

revoke all on function public.admin_preregister_dog_with_membership(
  text,text,text,text,text,text,text,date,integer,date[],text,boolean
) from public,anon;
grant execute on function public.admin_preregister_dog_with_membership(
  text,text,text,text,text,text,text,date,integer,date[],text,boolean
) to authenticated;

-- Una sola fuente oficial de Socio al cambiar el expediente a linked.
-- Se ejecuta después de crear perros, inscripciones e historial canónicos
-- durante claim_my_preregistered_dogs().
create or replace function ucapsa_intake.activate_preapproved_membership()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_member public.memberships%rowtype;
  v_created boolean := false;
begin
  if new.status<>'linked' or old.status='linked'
    or not new.member_preapproved or new.member_preapproved_by is null
    or new.linked_user_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ucapsa-member:'||new.linked_user_id::text,0));

  select * into v_member from public.memberships m
  where m.user_id=new.linked_user_id for update;

  if not found then
    insert into public.memberships(
      user_id,status,start_date,end_date,approved_by
    ) values (
      new.linked_user_id,'active',
      (clock_timestamp() at time zone 'America/Mexico_City')::date,
      null,new.member_preapproved_by
    ) returning * into v_member;
    v_created:=true;
  elsif v_member.status<>'active' then
    update public.memberships set status='active',end_date=null,
      approved_by=new.member_preapproved_by,
      start_date=coalesce(start_date,
        (clock_timestamp() at time zone 'America/Mexico_City')::date)
    where id=v_member.id returning * into v_member;
  end if;

  -- Los triggers canónicos generan cobertura y acceso por perro, nivel y programa.
  -- Reconciliar en caso de que la cuenta ya tuviera una membresía activa.
  perform public.ucapsa_sync_membership_dog_access(v_member.id);

  -- Si esta es una nueva membresía y el perro tiene Puppy Y Comandos,
  -- Comandos conserva prioridad como etapa de Socio; el historial Puppy
  -- continúa íntegro en su inscripción original.
  if v_created then
    update public.program_enrollments member_training
    set program_id=comandos.program_id,
        schedule_id=comandos.schedule_id,
        program_level=comandos.program_level,
        updated_at=clock_timestamp()
    from public.program_enrollments comandos
    join public.programs p on p.id=comandos.program_id and p.code='comandos'
    where member_training.membership_id=v_member.id
      and member_training.user_id=new.linked_user_id
      and member_training.dog_id=comandos.dog_id
      and member_training.access_mode='membership'
      and member_training.status='active'
      and comandos.user_id=new.linked_user_id
      and comandos.intake_program_id is not null
      and member_training.program_id<>comandos.program_id;
  end if;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(new.member_preapproved_by,'preregistration.membership_activated',
    'dog_preregistration',new.id,
    jsonb_build_object('user_id',new.linked_user_id,'membership_id',v_member.id,
      'prior_authorization',true));
  return new;
end;
$function$;

drop trigger if exists trg_activate_preapproved_membership on ucapsa_intake.people;
create trigger trg_activate_preapproved_membership
after update of status on ucapsa_intake.people
for each row when (old.status is distinct from new.status)
execute function ucapsa_intake.activate_preapproved_membership();

revoke all on function ucapsa_intake.activate_preapproved_membership() from public,anon,authenticated;
