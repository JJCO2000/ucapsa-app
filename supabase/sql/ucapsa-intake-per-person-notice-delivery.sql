-- UCAPSA: per-person staff attestation of delivery of privacy notice 1.4.
-- This is a record that staff ASSERT they provided the notice. It does not
-- prove the recipient's identity/consent and gives no family/photo access.
-- Built on the installed capture_notice_id version-stamping triggers.
-- New wrappers call old business RPCs in the SAME TRANSACTION, preserving
-- schedules, enrollment, deduplication and legacy mobile compatibility.

alter table ucapsa_intake.people
  add column if not exists notice_delivery_method text,
  add column if not exists notice_delivery_attested boolean not null default false,
  add column if not exists notice_delivery_reported_by uuid references auth.users(id) on delete set null,
  add column if not exists notice_delivery_recorded_at timestamptz;

alter table ucapsa_intake.family_members
  add column if not exists notice_delivery_method text,
  add column if not exists notice_delivery_attested boolean not null default false,
  add column if not exists notice_delivery_reported_by uuid references auth.users(id) on delete set null,
  add column if not exists notice_delivery_recorded_at timestamptz;

comment on column ucapsa_intake.people.notice_delivery_attested is
  'Staff reports the published notice was provided; not recipient consent/identity proof.';
comment on column ucapsa_intake.family_members.notice_delivery_attested is
  'Staff reports individual family member was given the notice; no permissions granted.';

create or replace function ucapsa_intake.record_notice_delivery_for_dog(
  p_dog_id uuid, p_owner_method text, p_family jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_person_id uuid;
  v_notice_id uuid;
  v_entry jsonb;
  v_method text;
  v_updated integer;
  v_name text;
  v_email text;
  v_phone text;
begin
  if v_actor is null or not public.is_ucapsa_staff() then
    raise exception 'Personal no autorizado para registrar el aviso.' using errcode='42501';
  end if;
  if p_family is null or pg_catalog.jsonb_typeof(p_family)<>'array'
     or pg_catalog.jsonb_array_length(p_family)>30 then
    raise exception 'Lista de familiares inválida.' using errcode='22023';
  end if;
  select d.person_id into v_person_id from ucapsa_intake.dogs d
    where d.id=p_dog_id;
  if v_person_id is null then
    raise exception 'No existe la preinscripción.' using errcode='22023';
  end if;
  select n.id into v_notice_id from public.privacy_notices n
    where n.status='published' and n.published_at is not null
      and n.effective_from <= pg_catalog.now()
    limit 1;
  if v_notice_id is null then
    raise exception 'Se requiere aviso vigente publicado.' using errcode='23514';
  end if;

  if p_owner_method is not null then
    if p_owner_method not in ('presencial','correo_entregado','otro_documentado') then
      raise exception 'Selecciona cómo recibió el aviso el titular.' using errcode='23514';
    end if;
    update ucapsa_intake.people set
      notice_delivery_method=p_owner_method,
      notice_delivery_attested=true,
      notice_delivery_reported_by=v_actor,
      notice_delivery_recorded_at=pg_catalog.clock_timestamp()
    where id=v_person_id and capture_notice_id=v_notice_id;
    get diagnostics v_updated = row_count;
    if v_updated<>1 then raise exception 'El aviso del titular cambió; no se guardó la constancia.'
      using errcode='23514'; end if;
  end if;

  for v_entry in select value from pg_catalog.jsonb_array_elements(p_family)
  loop
    if pg_catalog.jsonb_typeof(v_entry)<>'object' then
      raise exception 'Datos de constancia familiar inválidos.' using errcode='22023';
    end if;
    v_method:=v_entry->>'notice_delivery_method';
    v_name:=pg_catalog.btrim(coalesce(v_entry->>'full_name',''));
    v_email:=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(v_entry->>'email',''))),'');
    v_phone:=nullif(pg_catalog.btrim(coalesce(v_entry->>'phone','')),'');
    if v_method not in ('presencial','correo_entregado','otro_documentado')
      or v_method is null or v_name='' or (v_email is null and v_phone is null) then
      raise exception 'Debes documentar la entrega del aviso para cada familiar.'
        using errcode='23514';
    end if;
    update ucapsa_intake.family_members set
      notice_delivery_method=v_method,
      notice_delivery_attested=true,
      notice_delivery_reported_by=v_actor,
      notice_delivery_recorded_at=pg_catalog.clock_timestamp()
    where person_id=v_person_id and full_name=v_name
      and email_key is not distinct from v_email
      and phone_e164 is not distinct from v_phone
      and capture_notice_id=v_notice_id;
    get diagnostics v_updated = row_count;
    if v_updated<>1 then
      raise exception 'No coincide el familiar con la constancia; operación revertida.'
        using errcode='23514';
    end if;
  end loop;
end;
$$;
revoke all on function ucapsa_intake.record_notice_delivery_for_dog(uuid,text,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.admin_preregister_dog_with_notice(
 p_values jsonb, p_owner_method text, p_family_members jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_dog uuid;
begin
 if auth.uid() is null or not public.is_ucapsa_admin() then
  raise exception 'Solo Administración puede preinscribir.' using errcode='42501';
 end if;
 if p_owner_method not in ('presencial','correo_entregado','otro_documentado')
   or p_owner_method is null then
  raise exception 'Confirma la entrega del aviso al titular.' using errcode='23514';
 end if;
 if p_values is null or pg_catalog.jsonb_typeof(p_values)<>'object' then
  raise exception 'Faltan datos de la preinscripción.' using errcode='22023';
 end if;
 v_dog:=public.admin_preregister_dog_with_family(
  p_values->>'p_owner_name',p_values->>'p_owner_email',p_values->>'p_owner_phone',
  p_values->>'p_dog_name',p_values->>'p_program_code',p_values->>'p_program_level',
  p_values->>'p_card_number',nullif(p_values->>'p_card_started_on','')::date,
  coalesce((p_values->>'p_total_attendances')::integer,0),
  array(select val::date from pg_catalog.jsonb_array_elements_text(
    coalesce(p_values->'p_known_dates','[]'::jsonb)) as val),
  p_values->>'p_note',coalesce((p_values->>'p_member_authorized')::boolean,false),
  p_family_members);
 perform ucapsa_intake.record_notice_delivery_for_dog(v_dog,p_owner_method,p_family_members);
 return v_dog;
end;
$$;

create or replace function public.staff_preregister_dog_with_notice(
 p_values jsonb, p_owner_method text, p_family_members jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_dog uuid;
begin
 if auth.uid() is null or not public.is_ucapsa_staff() then
  raise exception 'Solo personal autorizado puede preinscribir.' using errcode='42501';
 end if;
 if p_owner_method not in ('presencial','correo_entregado','otro_documentado')
   or p_owner_method is null then
  raise exception 'Confirma la entrega del aviso al titular.' using errcode='23514';
 end if;
 if p_values is null or pg_catalog.jsonb_typeof(p_values)<>'object' then
  raise exception 'Faltan datos de la preinscripción.' using errcode='22023';
 end if;
 v_dog:=public.staff_preregister_dog_with_family(
  p_values->>'p_owner_name',p_values->>'p_owner_email',p_values->>'p_owner_phone',
  p_values->>'p_dog_name',p_values->>'p_program_code',p_values->>'p_program_level',
  p_family_members);
 perform ucapsa_intake.record_notice_delivery_for_dog(v_dog,p_owner_method,p_family_members);
 return v_dog;
end;
$$;

create or replace function public.admin_add_preregistered_family_with_notice(
 p_intake_program_id uuid, p_family_members jsonb
) returns integer language plpgsql security definer set search_path=''
as $$
declare v_dog uuid; v_added integer;
begin
 if auth.uid() is null or not public.is_ucapsa_admin() then
  raise exception 'Solo Administración puede añadir familiares.' using errcode='42501';
 end if;
 select p.dog_id into v_dog from ucapsa_intake.programs p where p.id=p_intake_program_id;
 if v_dog is null then raise exception 'Programa provisional no encontrado.' using errcode='22023'; end if;
 v_added:=public.admin_add_preregistered_family_members(p_intake_program_id,p_family_members);
 perform ucapsa_intake.record_notice_delivery_for_dog(v_dog,null,p_family_members);
 return v_added;
end;
$$;

create or replace function public.admin_complete_preregistration_contact_with_notice(
 p_person_id uuid,p_owner_email text,p_owner_phone text,p_owner_method text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_result jsonb; v_notice_id uuid;
begin
 if auth.uid() is null or not public.is_ucapsa_admin() then
  raise exception 'Solo Administración puede completar contactos.' using errcode='42501';
 end if;
 if p_owner_method not in ('presencial','correo_entregado','otro_documentado')
   or p_owner_method is null then
  raise exception 'Confirma la entrega del aviso al titular.' using errcode='23514';
 end if;
 v_result:=public.admin_complete_preregistration_contact(p_person_id,p_owner_email,p_owner_phone);
 select n.id into v_notice_id from public.privacy_notices n where n.status='published'
   and n.published_at is not null and n.effective_from<=pg_catalog.now() limit 1;
 update ucapsa_intake.people set notice_delivery_method=p_owner_method,
   notice_delivery_attested=true, notice_delivery_reported_by=auth.uid(),
   notice_delivery_recorded_at=pg_catalog.clock_timestamp()
 where id=p_person_id and capture_notice_id=v_notice_id;
 if not found then raise exception 'No se pudo registrar la constancia del titular.'
   using errcode='23514'; end if;
 return v_result;
end;
$$;

revoke all on function public.admin_preregister_dog_with_notice(jsonb,text,jsonb) from public,anon;
revoke all on function public.staff_preregister_dog_with_notice(jsonb,text,jsonb) from public,anon;
revoke all on function public.admin_add_preregistered_family_with_notice(uuid,jsonb) from public,anon;
revoke all on function public.admin_complete_preregistration_contact_with_notice(uuid,text,text,text) from public,anon;
grant execute on function public.admin_preregister_dog_with_notice(jsonb,text,jsonb) to authenticated;
grant execute on function public.staff_preregister_dog_with_notice(jsonb,text,jsonb) to authenticated;
grant execute on function public.admin_add_preregistered_family_with_notice(uuid,jsonb) to authenticated;
grant execute on function public.admin_complete_preregistration_contact_with_notice(uuid,text,text,text) to authenticated;

-- Old RPCs remain available during multi-platform client upgrades. They keep
-- stamping capture_notice_id, but CANNOT be described as attested. Close those
-- legacy entrypoints only when all deployed app versions call the wrappers.
