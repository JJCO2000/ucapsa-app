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
do $$
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
do $$
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
-- Artificial duplicate verified contact, which real Auth uniqueness normally
-- prevents: the RPC must independently reject it on the server.
update auth.users set email='later@test.invalid',email_confirmed_at=now()
where id='00000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $check_shared$
declare result jsonb;
begin
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'conflict' then
    raise exception 'Shared verified contact bypassed collision guard: %',result;
  end if;
end
$check_shared$;
reset role;
update auth.users set email='other@test.invalid',email_confirmed_at=null
where id='00000000-0000-4000-8000-000000000003';
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

-- Simulate the existing authorized attendance service as DB owner,
-- not direct table INSERT from arbitrary authenticated clients.
-- A date already in historical ledger cannot be added again as ordinary QR.
reset role;
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

-- Superadmin has the same scoped Admin prerogative; phone-only preregistration.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
select public.admin_preregister_dog_with_program(
  'Phone Parent','','+525512345678','Nala','puppy','base',
  'P-200','2026-09-01',1,array[]::date[],'card reviewed by superadmin');
reset role;
-- The mere presence of a phone in Auth is NOT proof of possession.
update auth.users set phone='+525512345678',phone_confirmed_at=null
where id='00000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $phone_unverified$
declare result jsonb;
begin
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'unverified' then
    raise exception 'Unverified phone incorrectly claimed a card: %',result;
  end if;
end
$phone_unverified$;
reset role;
update auth.users set phone_confirmed_at=now()
where id='00000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $phone_verified$
declare result jsonb;
begin
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'linked' or (result->>'linked_dogs')::int<>1 then
    raise exception 'Verified phone did not claim correct dog: %',result;
  end if;
end
$phone_verified$;
reset role;
do $history_unknown$
begin
  if not exists (
    select 1 from public.program_enrollments e
    join public.dogs d on d.id=e.dog_id
    where d.user_id='00000000-0000-4000-8000-000000000003'
      and e.attendances_count=1 and e.last_attendance_at is null
  ) then
    raise exception 'Undated-only prior attendance did not retain NULL date';
  end if;
end
$history_unknown$;


-- Trainer roster for a provisional dog BEFORE Auth registration.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Pending Tutor','staged@test.invalid','','Bongo','puppy','base',
  'P-313','2026-01-01',1,array[]::date[],'historical 1');
select public.admin_preregister_dog_with_program(
  'Pending Tutor','staged@test.invalid','','Thor','comandos','avanzado',
  '',null,0,array[]::date[],'without card must not grant access');
reset role;
-- Add an isolated effective class on whatever weekday the CI job runs.
insert into public.program_schedules(program_id,name,day_of_week,start_time,sequence_order)
select id,'TEST TODAY',extract(dow from (now() at time zone 'America/Mexico_City'))::int,
 '09:00',99 from public.programs where code='puppy';
update ucapsa_intake.programs st
set schedule_id=s.id
from ucapsa_intake.dogs d, ucapsa_intake.people person,
  public.program_schedules s
where st.dog_id=d.id and d.person_id=person.id and person.email_key='staged@test.invalid'
  and d.dog_name='Bongo' and s.name='TEST TODAY';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
do $trainer_roster$
declare v_id uuid; v_date date:= (now() at time zone 'America/Mexico_City')::date;
begin
  select intake_program_id into v_id from public.get_staff_preregistered_class_roster(v_date)
  where dog_name='Bongo' and card_status='valid';
  if v_id is null then raise exception 'Trainer cannot see pre-Auth dog with valid card'; end if;
  perform public.staff_register_preregistered_attendance(v_id,v_date);
  perform public.staff_register_preregistered_attendance(v_id,v_date);
end
$trainer_roster$;
reset role;
do $trainer_count$
begin
 if (select coalesce(sum(h.quantity),0) from ucapsa_intake.attendance_evidence h
     join ucapsa_intake.programs st on st.id=h.intake_program_id
     join ucapsa_intake.dogs d on d.id=st.dog_id where d.dog_name='Bongo')<>2 then
   raise exception 'Trainer repeat attendance doubled historical total';
 end if;
 if not exists(select 1 from ucapsa_intake.attendance_evidence h
     join ucapsa_intake.programs st on st.id=h.intake_program_id
     join ucapsa_intake.dogs d on d.id=st.dog_id
     where d.dog_name='Bongo' and h.evidence_source='staff_roster') then
   raise exception 'Trainer capture lost audit provenance';
 end if;
end
$trainer_count$;
-- Trainer must not be permitted to create a fresh dog or edit paid card.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
do $trainer_denied$
declare denied boolean:=false;
begin
  begin
    perform public.admin_preregister_dog('Denied Parent','denied@test.invalid','','DeniedDog');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Trainer unexpectedly has admin creation privileges'; end if;
end
$trainer_denied$;
reset role;
-- Admin historical correction must not erase a trainer's real dated class.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $history_guard$
declare v_dog uuid; rejected boolean:=false;
begin
  select d.id into v_dog from ucapsa_intake.dogs d
  join ucapsa_intake.people p on p.id=d.person_id
  where p.email_key='staged@test.invalid' and d.dog_name='Bongo';
  begin
    perform public.admin_save_preregistered_program_history(
      v_dog,'puppy','base','P-313','2026-01-01',1,array[]::date[],'overwrite');
  exception when unique_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Admin overwrote real trainer attendance'; end if;
end
$history_guard$;
reset role;

select 'UCAPSA isolated database E2E: PASS' as result;
