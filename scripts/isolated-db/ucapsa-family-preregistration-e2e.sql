-- Synthetic-only: family capture after preregistration + Socio test suite.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'ucapsa_test' then
    raise exception 'Never run on production';
  end if;
end $$;

-- No public/anonymous direct family access.
do $private$
begin
  if has_schema_privilege('authenticated','ucapsa_intake','USAGE')
     or has_table_privilege('authenticated','ucapsa_intake.family_members','SELECT')
     or has_table_privilege('anon','ucapsa_intake.family_members','SELECT') then
    raise exception 'Private family table leaked to clients';
  end if;
end $private$;

-- Customer cannot create a family nor enumerate a family's contact details.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $client_denied$
declare denied boolean := false;
begin
  begin
    perform public.staff_preregister_dog_with_family(
      'Blocked Owner','blocked-family@test.invalid','','Luna','puppy','base',
      '[{"full_name":"Blocked Partner"}]'::jsonb);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Client created unauthorized family'; end if;
  denied := false;
  begin
    perform public.admin_get_preregistered_family_members(gen_random_uuid());
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Client read family data'; end if;
end $client_denied$;
reset role;

-- Trainer may add family to provisional intake, never authorize Socio or expose directory.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
select public.staff_preregister_dog_with_family(
  'Trainer Owner','trainer-family@test.invalid','+525555511111','Koda',
  'comandos','principiante',
  '[{"full_name":"Paula Ruiz","email":"","phone":""},{"full_name":"Mario Ruiz","email":"mario@test.invalid","phone":"+525555522222"}]'::jsonb);
do $trainer_denied$
declare denied boolean := false;
begin
  begin
    perform public.admin_get_preregistered_family_members(gen_random_uuid());
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Trainer read Admin private family directory'; end if;
end $trainer_denied$;
reset role;

-- Confirm family belongs to same titular and does not create Auth, membership or enrollments.
do $trainer_data$
begin
  if (select count(*) from ucapsa_intake.family_members fm
      join ucapsa_intake.people p on p.id=fm.person_id
      where p.email_key='trainer-family@test.invalid')<>2 then
    raise exception 'Trainer family was not saved';
  end if;
  if exists (select 1 from auth.users where email='mario@test.invalid') then
    raise exception 'Created fake family Auth account';
  end if;
end $trainer_data$;

-- Admin may create an authorized primary membership and multiple additional FAMILY contacts,
-- but authorization belongs to primary and does not replicate to other people.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_family(
  'Admin Owner','admin-family@test.invalid','+525555533333','Tina',
  'puppy','base','F-TEST-01',null,0,array[]::date[],'Family synthetic test',true,
  '[{"full_name":"Andrea López","phone":"","email":"andrea@test.invalid"}]'::jsonb);
do $admin_view$
declare v_id uuid;
begin
  select ip.id into v_id from ucapsa_intake.programs ip
    join ucapsa_intake.dogs d on d.id=ip.dog_id
    join ucapsa_intake.people p on p.id=d.person_id
    where p.email_key='admin-family@test.invalid' limit 1;
  if (select count(*) from public.admin_get_preregistered_family_members(v_id))<>1 then
    raise exception 'Admin family detail cannot read captured members';
  end if;
  if public.admin_add_preregistered_family_members(
    v_id,'[{"full_name":"Andrea López","phone":"","email":"andrea@test.invalid"},{"full_name":"Ricardo López"}]'::jsonb)<>1 then
    raise exception 'Append must deduplicate existing and insert one new person';
  end if;
  if (select count(*) from public.admin_get_preregistered_family_members(v_id))<>2 then
    raise exception 'Adding another family member did not persist';
  end if;
end $admin_view$;
reset role;

-- Client must not claim accounts using only the optional family email.
insert into auth.users(id,email,email_confirmed_at)
values ('00000000-0000-4000-8000-000000000996','andrea@test.invalid',now());
insert into public.profiles(user_id,email,role)
values ('00000000-0000-4000-8000-000000000996','andrea@test.invalid','client');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000996',false);
do $no_auto_claim$
declare result jsonb;
begin
  result:=public.claim_my_first_preregistered_dogs();
  if result->>'status' not in ('none','unverified','not_applicable') then
    raise exception 'Optional family email acquired primary dog's account: %',result;
  end if;
end $no_auto_claim$;
reset role;

do $final$
begin
  if (select count(*) from ucapsa_intake.family_members) <> 4 then
    raise exception 'Wrong family data count';
  end if;
  if exists (select 1 from public.program_enrollments pe
    join auth.users u on pe.user_id=u.id
    where u.email in ('andrea@test.invalid','mario@test.invalid')) then
    raise exception 'Family staged contact acquired official enrollment';
  end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id=m.user_id
    where u.email='andrea@test.invalid') then
    raise exception 'Family staged contact acquired membership';
  end if;
  if exists (select 1 from ucapsa_intake.people p
    where p.email_key='blocked-family@test.invalid') then
    raise exception 'Unauthorized family insert was not rolled back';
  end if;
end $final$;
select 'UCAPSA family pre-enrollment isolated e2e: PASS' as result;
