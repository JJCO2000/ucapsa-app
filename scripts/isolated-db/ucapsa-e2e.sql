-- Execute ONLY on ephemeral PostgreSQL database.
\set ON_ERROR_STOP on
-- Ensure the test never silently runs on production.
do $$ begin
  if current_database() <> 'ucapsa_test' then
    raise exception 'Refusing to test on %',current_database();
  end if;
end $$;

-- All client-to-server mutations must enforce the authenticated role.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.admin_preregister_dog_with_program(
      'Example Owner','first@test.invalid','','Luna','puppy','base',
      'P-100','2026-09-01',2,array[date '2026-10-04'],'synthetic');
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Client illegitimately created a preregistration'; end if;
end $$;
reset role;

-- One owner, TWO dogs; a shared contact produces ONE person.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Example Owner','later@test.invalid','','Luna','puppy','base',
  'P-100','2026-09-01',2,array[date '2026-10-04'],'synthetic physical card') as first_dog;
select public.admin_preregister_dog_with_program(
  'Example Owner','later@test.invalid','','Max','comandos','avanzado',
  '',null,0,array[]::date[],'synthetic advanced placement') as second_dog;
-- Introspection is intentionally not accessible to the authenticated role:
-- exercise it as DB owner, independently of the RPC authorization test.
reset role;
do $
begin
  if (select count(*) from ucapsa_intake.people) <> 1 then
    raise exception 'Duplicate provisional owner';
  end if;
  if (select count(*) from ucapsa_intake.dogs) <> 2 then
    raise exception 'Missing or duplicate provisional dogs';
  end if;
  if (select sum(quantity) from ucapsa_intake.attendance_evidence) <> 2 then
    raise exception 'Bad prior attendance total';
  end if;
  if (select count(*) from ucapsa_intake.attendance_evidence where attendance_date is null) <> 1 then
    raise exception 'Unknown attendance date was invented';
  end if;
end $$;

-- Idempotency: same dog, same owner, same card must not multiply records.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Example Owner','later@test.invalid','','Luna','puppy','base',
  'P-100','2026-09-01',2,array[date '2026-10-04'],'synthetic physical card');
reset role;
do $
declare rejected boolean := false;
begin
  if (select count(*) from ucapsa_intake.dogs) <> 2 then
    raise exception 'Duplicate idempotent dog';
  end if;
  begin
    perform public.admin_preregister_dog_with_program(
      'Different Owner','later@test.invalid','','Rex','puppy','base',
      'P-101','2026-09-01',0,array[]::date[],null);
  exception when unique_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Contact reassignment to different owner allowed'; end if;
end $$;
reset role;

-- Claim requires a VERIFIED Auth address, not a manually entered profile address.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$
declare result jsonb;
begin
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'none' then
    raise exception 'Unmatched account claimed a dog: %',result;
  end if;
end $$;
reset role;

-- Simulate verified email AFTER preregistration. No external provider calls.
update auth.users set email='later@test.invalid',email_confirmed_at=now()
where id='00000000-0000-4000-8000-000000000002';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$
declare result jsonb;
begin
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'linked' or (result->>'linked_dogs')::integer<>2
      or (result->>'linked_programs')::integer<>2 then
    raise exception 'Claim did not transfer both dogs/programs: %',result;
  end if;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.dogs where user_id='00000000-0000-4000-8000-000000000002')<>2 then
    raise exception 'Canonical dogs incorrectly linked';
  end if;
  if (select count(*) from public.program_enrollments)<>2 then
    raise exception 'Canonical enrollments incorrectly linked';
  end if;
  if (select attendances_count from public.program_enrollments e
      join public.programs p on p.id=e.program_id where p.code='puppy')<>2 then
    raise exception 'Historical count missing from canonical progress';
  end if;
  if (select count(*) from public.program_attendance_historical_evidence where attendance_date is null)<>1 then
    raise exception 'Unknown historical date was fabricated';
  end if;
  if (select last_attendance_at from public.program_enrollments e
      join public.programs p on p.id=e.program_id where p.code='puppy')<>date '2026-10-04' then
    raise exception 'Last attendance date differs from actual evidence';
  end if;
  if (select count(*) from public.program_enrollments e join public.programs p
      on e.program_id=p.id join public.program_schedules s on s.id=e.schedule_id
      where p.code='comandos' and s.program_id=p.id and e.program_level='avanzado')<>1 then
    raise exception 'Comandos advanced generated a different schedule';
  end if;
end $$;

-- A date already in historical ledger cannot be added again as ordinary QR.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
declare
  v_enrollment uuid;
  rejected boolean := false;
begin
  select e.id into v_enrollment
  from public.program_enrollments e join public.programs p on p.id=e.program_id
  where p.code='puppy';
  begin
    insert into public.program_attendances(enrollment_id,attendance_date)
    values(v_enrollment,'2026-10-04');
  exception when unique_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Duplicate historic + ordinary attendance permitted'; end if;
end $$;
reset role;

-- A new real class date increases canonical total exactly one.
insert into public.program_attendances(enrollment_id,attendance_date)
select e.id,'2026-10-11'::date from public.program_enrollments e
join public.programs p on p.id=e.program_id where p.code='puppy';
do $$
begin
  if (select e.attendances_count from public.program_enrollments e
      join public.programs p on p.id=e.program_id where p.code='puppy')<>3 then
    raise exception 'Incorrect progression after new dated attendance';
  end if;
end $$;

-- Subsequent verified logins must not add any more canonical rows.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select public.claim_my_preregistered_dogs();
reset role;
do $$
begin
  if (select count(*) from public.program_enrollments)<>2 then
    raise exception 'Second login duplicated enrollments';
  end if;
  if (select count(*) from public.program_attendance_historical_evidence)<>2 then
    raise exception 'Second login duplicated evidence';
  end if;
end $$;
select 'UCAPSA isolated database E2E: PASS' as result;
