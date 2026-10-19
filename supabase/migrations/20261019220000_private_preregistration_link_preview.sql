-- UCAPSA: private preview for a pending preregistration.
-- No patient/dog/contact details are returned, and nothing is linked here.
-- The same confirmed contacts from auth.users are used by claim_my_preregistered_dogs.
-- This RPC NEVER accepts a phone/email input from the client.
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
begin
  if v_user is null then
    raise exception 'Inicia sesión.' using errcode='42501';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id=v_user) then
    return pg_catalog.jsonb_build_object('status','not_applicable','count',0);
  end if;
  select case when u.email_confirmed_at is not null
    then nullif(pg_catalog.lower(pg_catalog.btrim(u.email)),'') else null end,
    case when u.phone_confirmed_at is not null
    then nullif(pg_catalog.btrim(u.phone),'') else null end
    into v_email,v_phone from auth.users u where u.id=v_user;
  if v_email is null and v_phone is null then
    return pg_catalog.jsonb_build_object('status','unverified','count',0);
  end if;
  if exists (
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
    (v_phone is not null and p.phone_e164=v_phone) or
    (v_email is not null and p.email_key=v_email)
  );
  if v_pending_count=0 then
    return pg_catalog.jsonb_build_object('status','none','count',0);
  end if;
  if v_pending_count<>1 then
    return pg_catalog.jsonb_build_object('status','conflict','count',0);
  end if;
  select * into v_person from ucapsa_intake.people p
  where p.status='pending' and (
    (v_phone is not null and p.phone_e164=v_phone) or
    (v_email is not null and p.email_key=v_email)
  );
  -- Same collision and account ownership protections as claim RPC.
  if (v_email is not null and v_person.email_key is not null
       and v_email<>v_person.email_key)
    or (v_phone is not null and v_person.phone_e164 is not null
       and v_phone<>v_person.phone_e164)
    or exists (
      select 1 from ucapsa_intake.people p
      where p.linked_user_id=v_user and p.id<>v_person.id
    )
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
  return pg_catalog.jsonb_build_object('status','available','count',v_dogs);
end;
$fn$;

revoke all on function public.preview_my_preregistered_dogs() from public,anon;
grant execute on function public.preview_my_preregistered_dogs() to authenticated;
