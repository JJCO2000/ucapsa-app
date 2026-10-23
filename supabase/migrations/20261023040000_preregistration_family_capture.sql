-- UCAPSA | Preregistro: integrantes familiares opcionales vinculados al titular provisional.
-- No crea auth.users, profiles, membresias, obligaciones, perros ni inscripciones familiares.
-- Los contactos familiares NO participan en claim_my_first_preregistered_dogs.
create table if not exists ucapsa_intake.family_members (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references ucapsa_intake.people(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 120 and full_name !~ '[[:cntrl:]]'),
  email_key text null check (email_key is null or (email_key=lower(btrim(email_key)) and length(email_key)<=254)),
  phone_e164 text null check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index if not exists intake_family_person_member_unique
  on ucapsa_intake.family_members
    (person_id, lower(btrim(full_name)), coalesce(email_key,''), coalesce(phone_e164,''));
create index if not exists intake_family_by_person
  on ucapsa_intake.family_members(person_id);
alter table ucapsa_intake.family_members enable row level security;
revoke all on ucapsa_intake.family_members from public, anon, authenticated;
grant select, insert, update, delete on ucapsa_intake.family_members to service_role;

-- Solo invocada desde wrappers autenticados; no conceder ejecución directa.
create or replace function ucapsa_intake.append_family_for_dog(p_dog_id uuid, p_members jsonb)
returns void language plpgsql security invoker set search_path = ''
as $function$
declare
  v_person_id uuid;
  v_status text;
  v_item jsonb;
  v_name text;
  v_email text;
  v_phone text;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array'
      or jsonb_array_length(p_members) > 30 then
    raise exception 'Revisa la lista de familiares.' using errcode='22023';
  end if;
  if jsonb_array_length(p_members)=0 then return; end if;
  select d.person_id, p.status into v_person_id, v_status
    from ucapsa_intake.dogs d
    join ucapsa_intake.people p on p.id=d.person_id
    where d.id=p_dog_id
    for update of p;
  if v_person_id is null or v_status <> 'pending' then
    raise exception 'Solo pueden agregarse familiares a preinscripciones pendientes.' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_members) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Revisa los datos del integrante.' using errcode='22023';
    end if;
    v_name := btrim(coalesce(v_item->>'full_name',''));
    v_email := nullif(lower(btrim(coalesce(v_item->>'email',''))),'');
    v_phone := nullif(btrim(coalesce(v_item->>'phone','')),'');
    if length(v_name) not between 2 and 120 or v_name ~ '[[:cntrl:]]'
      or (v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
      or (v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$') then
      raise exception 'Nombre, correo o celular del familiar inválido.' using errcode='22023';
    end if;
    insert into ucapsa_intake.family_members (person_id,full_name,email_key,phone_e164,created_by)
      values (v_person_id,v_name,v_email,v_phone,auth.uid())
      on conflict do nothing;
  end loop;
end;
$function$;
revoke all on function ucapsa_intake.append_family_for_dog(uuid,jsonb)
  from public, anon, authenticated;
comment on function ucapsa_intake.append_family_for_dog(uuid,jsonb) is
  'Escritura interna de contactos familiares provisionales. No concede pertenencia, acceso ni vinculación a una cuenta.';

-- Alta administrativa atómica: reutiliza exactamente el alta y autorización previas.
create or replace function public.admin_preregister_dog_with_family(
  p_owner_name text, p_owner_email text, p_owner_phone text, p_dog_name text,
  p_program_code text, p_program_level text, p_card_number text,
  p_card_started_on date, p_total_attendances integer,
  p_known_dates date[], p_note text, p_member_authorized boolean,
  p_family_members jsonb
) returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_dog_id uuid;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede preinscribir.' using errcode='42501';
  end if;
  v_dog_id := public.admin_preregister_dog_with_membership(
    p_owner_name,p_owner_email,p_owner_phone,p_dog_name,p_program_code,
    p_program_level,p_card_number,p_card_started_on,p_total_attendances,
    p_known_dates,p_note,p_member_authorized);
  perform ucapsa_intake.append_family_for_dog(v_dog_id,p_family_members);
  return v_dog_id;
end;
$function$;
revoke all on function public.admin_preregister_dog_with_family(
  text,text,text,text,text,text,text,date,integer,date[],text,boolean,jsonb
) from public,anon;
grant execute on function public.admin_preregister_dog_with_family(
  text,text,text,text,text,text,text,date,integer,date[],text,boolean,jsonb
) to authenticated;

-- Entrenador: reaprovecha la ruta limitada (sin pagos, historial ni membresías).
create or replace function public.staff_preregister_dog_with_family(
  p_owner_name text, p_owner_email text, p_owner_phone text, p_dog_name text,
  p_program_code text, p_program_level text, p_family_members jsonb
) returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_dog_id uuid;
begin
  if auth.uid() is null or not public.is_ucapsa_staff() then
    raise exception 'Solo personal UCAPSA puede preinscribir.' using errcode='42501';
  end if;
  v_dog_id := public.staff_preregister_dog_with_program(
    p_owner_name,p_owner_email,p_owner_phone,p_dog_name,p_program_code,p_program_level);
  perform ucapsa_intake.append_family_for_dog(v_dog_id,p_family_members);
  return v_dog_id;
end;
$function$;
revoke all on function public.staff_preregister_dog_with_family(
  text,text,text,text,text,text,jsonb
) from public,anon;
grant execute on function public.staff_preregister_dog_with_family(
  text,text,text,text,text,text,jsonb
) to authenticated;

-- Dirección administrativa: el identificador es el expediente de programa,
-- se resuelve su titular en servidor. No exponemos la tabla privada.
create or replace function public.admin_get_preregistered_family_members(p_intake_program_id uuid)
returns table (id uuid, full_name text, email text, phone text)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede consultar familiares.' using errcode='42501';
  end if;
  return query
    select f.id,f.full_name,f.email_key,f.phone_e164
      from ucapsa_intake.programs ip
      join ucapsa_intake.dogs d on d.id=ip.dog_id
      join ucapsa_intake.family_members f on f.person_id=d.person_id
      where ip.id=p_intake_program_id
      order by f.created_at,f.id;
end;
$function$;
revoke all on function public.admin_get_preregistered_family_members(uuid) from public,anon;
grant execute on function public.admin_get_preregistered_family_members(uuid) to authenticated;

create or replace function public.admin_add_preregistered_family_members(
  p_intake_program_id uuid, p_family_members jsonb
) returns integer language plpgsql security definer set search_path = ''
as $function$
declare v_dog_id uuid; v_before integer; v_after integer;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede agregar familiares.' using errcode='42501';
  end if;
  select ip.dog_id into v_dog_id from ucapsa_intake.programs ip
    where ip.id=p_intake_program_id;
  if v_dog_id is null then
    raise exception 'No se encontró la preinscripción.' using errcode='22023';
  end if;
  select count(*) into v_before from ucapsa_intake.family_members f
    join ucapsa_intake.dogs d on d.person_id=f.person_id where d.id=v_dog_id;
  perform ucapsa_intake.append_family_for_dog(v_dog_id,p_family_members);
  select count(*) into v_after from ucapsa_intake.family_members f
    join ucapsa_intake.dogs d on d.person_id=f.person_id where d.id=v_dog_id;
  return v_after-v_before;
end;
$function$;
revoke all on function public.admin_add_preregistered_family_members(uuid,jsonb) from public,anon;
grant execute on function public.admin_add_preregistered_family_members(uuid,jsonb) to authenticated;
