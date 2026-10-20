-- UCAPSA: Admin can complete ONLY missing contacts on a pending intake person.
-- No writes to Auth, profiles, official dogs, programs, levels or attendance.
create or replace function public.admin_complete_preregistration_contact(
  p_person_id uuid,
  p_owner_email text default null,
  p_owner_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_owner_email, ''))), '');
  v_phone text := nullif(pg_catalog.btrim(coalesce(p_owner_phone, '')), '');
  v_person ucapsa_intake.people%rowtype;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Administración puede completar contactos.'
      using errcode = '42501';
  end if;
  if p_person_id is null or (v_email is null and v_phone is null) then
    raise exception 'Indica el expediente y al menos un contacto faltante.'
      using errcode = '22023';
  end if;
  if v_email is not null and (
      pg_catalog.length(v_email) > 254
      or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  ) then
    raise exception 'Correo electrónico inválido.' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Usa teléfono internacional E.164, por ejemplo +525512345678.'
      using errcode = '22023';
  end if;

  -- Lock contacts before the person to serialize concurrent first claims.
  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-first-email:' || v_email, 0));
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-intake-email:' || v_email, 0));
  end if;
  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-first-phone:' || v_phone, 0));
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-intake-phone:' || v_phone, 0));
  end if;

  select * into v_person
  from ucapsa_intake.people p where p.id=p_person_id
  for update;
  if not found then
    raise exception 'La preinscripción no existe.' using errcode = '22023';
  end if;
  if v_person.status <> 'pending' or v_person.linked_user_id is not null then
    raise exception 'No se puede modificar un expediente ya vinculado.'
      using errcode = '23514';
  end if;
  if (v_email is not null and v_person.email_key is not null)
      or (v_phone is not null and v_person.phone_e164 is not null) then
    raise exception 'Solo se permite completar contactos vacíos; no reemplazarlos.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from ucapsa_intake.people p
    where p.id <> v_person.id and
      ((v_email is not null and p.email_key = v_email)
        or (v_phone is not null and p.phone_e164 = v_phone))
  ) or exists (
    select 1 from ucapsa_intake.claimed_contacts c
    where (c.kind = 'email' and c.contact_key = v_email)
       or (c.kind = 'phone' and c.contact_key = v_phone)
  ) then
    raise exception 'El contacto ya pertenece a otro expediente o fue reclamado.'
      using errcode = '23505';
  end if;

  update ucapsa_intake.people
  set email_key = coalesce(email_key, v_email),
      phone_e164 = coalesce(phone_e164, v_phone)
  where id = v_person.id and status = 'pending';

  insert into public.admin_audit_logs
    (admin_user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'preregistration.contact_completed', 'dog_preregistration',
    v_person.id,
    pg_catalog.jsonb_build_object('email_added', v_email is not null,
      'phone_added', v_phone is not null)
  );

  return pg_catalog.jsonb_build_object('status', 'updated',
    'email_added', v_email is not null, 'phone_added', v_phone is not null);
end;
$function$;

revoke all on function public.admin_complete_preregistration_contact(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_complete_preregistration_contact(uuid,text,text)
  to authenticated;
comment on function public.admin_complete_preregistration_contact(uuid,text,text)
  is 'Admin-only append of missing pre-registration contacts, pending only; audited. No official record changes.';
