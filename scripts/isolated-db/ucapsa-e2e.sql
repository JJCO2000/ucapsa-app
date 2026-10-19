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

-- Preview is not available anonymously, and an unmatched account cannot
-- enumerate tutor/dog details or invent a match.
do $preview_anonymous$
declare denied boolean := false;
begin
  if has_function_privilege('anon','public.preview_my_preregistered_dogs()','EXECUTE') then
    raise exception 'Anonymous access to private preview';
  end if;
end $preview_anonymous$;

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

-- Authenticated but unmatched account gets no private data.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $preview_none$
declare info jsonb;
begin
  info := public.preview_my_preregistered_dogs();
  if info->>'status'<>'none' or (info->>'count')::int<>0 then
    raise exception 'Unmatched preview leaked candidate information: %',info;
  end if;
end $preview_none$;
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
  result:=public.preview_my_preregistered_dogs();
  if result->>'status'<>'conflict' or (result->>'count')::int<>0 then
    raise exception 'Shared contact preview leaked candidate details: %',result;
  end if;
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
  result:=public.preview_my_preregistered_dogs();
  if result->>'status'<>'available' or (result->>'count')::integer<>2 then
    raise exception 'Verified user should see 2 pending dogs BEFORE consent: %',result;
  end if;
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

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $preview_after_claim$
declare info jsonb;
begin
  info:=public.preview_my_preregistered_dogs();
  if info->>'status'<>'none' then
    raise exception 'Previously linked dog offered for duplicate transfer: %',info;
  end if;
end $preview_after_claim$;
reset role;

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

-- Administración permite preinscripción únicamente con celular E.164.
-- Verificar el teléfono debe ocurrir en Supabase Auth, no en public.profiles.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
do $contact_required$
declare denied boolean := false;
begin
  begin
    perform public.admin_preregister_dog_with_program(
      'Phone Parent','','','Nala','puppy','base',
      'P-200','2026-09-01',1,array[]::date[],'missing all contact');
  exception when invalid_parameter_value then denied := true;
  end;
  if not denied then raise exception 'Admin preregistered dog without contact'; end if;
end $contact_required$;
select public.admin_preregister_dog_with_program(
  'Phone Parent','','+525512345678','Nala','puppy','base',
  'P-200','2026-09-01',1,array[]::date[],'phone-only owner attested');
reset role;

-- Profile phone alone is not an Auth-verified credential.
update auth.users set phone='+525512345678',phone_confirmed_at=null
where id='00000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $phone_unverified$
declare result jsonb;
begin
  result:=public.preview_my_preregistered_dogs();
  if result->>'status'<>'unverified' then
    raise exception 'Unverified phone leaked preview: %',result;
  end if;
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'unverified' then
    raise exception 'Unverified profile phone claimed account: %',result;
  end if;
end $phone_unverified$;
reset role;

-- Verificado con OTP (evidencia simulada únicamente en fixture aislado).
update auth.users set phone_confirmed_at=now()
where id='00000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $phone_verified$
declare result jsonb;
begin
  result:=public.preview_my_preregistered_dogs();
  if result->>'status'<>'available' or (result->>'count')::int<>1 then
    raise exception 'Confirmed cellphone should preview one dog: %',result;
  end if;
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'linked' or (result->>'linked_dogs')::int<>1 then
    raise exception 'Verified phone did not link unique matching dog: %',result;
  end if;
end $phone_verified$;
reset role;

-- Protección contra reutilización de un número que otra cuenta verifica.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $check_phone_before_sms$
begin
  if public.can_request_my_phone_verification('+525512345678') then
    raise exception 'Phone already verified by another Auth user was considered available';
  end if;
  if not public.can_request_my_phone_verification('+525588882222') then
    raise exception 'New phone unexpectedly blocked';
  end if;
end $check_phone_before_sms$;
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
  '',null,0,array[]::date[],'Admin authorized Comandos without physical reference');
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
-- Comandos conserva su ÚNICO horario; cambiar solo su día en fixture aislado.
update public.program_schedules s set day_of_week=extract(dow from (now() at time zone 'America/Mexico_City'))::int
where s.program_id=(select p.id from public.programs p where p.code='comandos');

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
  -- La inscripción Comandos autorizada por Admin no tiene número de tarjeta.
  select intake_program_id into v_id from public.get_staff_preregistered_class_roster(v_date)
  where dog_name='Thor' and program_code='comandos' and card_status='valid';
  if v_id is null then raise exception 'Comandos autorizado por Admin no aparece en roster'; end if;
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
do $comandos_no_reference$
begin
  if not exists (
    select 1 from ucapsa_intake.attendance_evidence h
    join ucapsa_intake.programs st on st.id=h.intake_program_id
    join ucapsa_intake.dogs d on d.id=st.dog_id
    where d.dog_name='Thor' and st.physical_card_number is null
      and h.evidence_source='staff_roster'
  ) then raise exception 'Comandos without physical number did not register attendance'; end if;
end
$comandos_no_reference$;
-- Trainer must not be permitted to create a fresh dog or edit historical data.
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
-- Verify audit invariants as DB owner; even Admin has no direct staging SELECT.
-- The RPC itself still checks auth.uid() and public.is_ucapsa_admin().
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


-- A trainer's dated session and Admin undated balance both survive account claim.
insert into auth.users(id,email,email_confirmed_at)
values('00000000-0000-4000-8000-000000000006','staged@test.invalid',now());
insert into public.profiles(user_id,email,role)
values('00000000-0000-4000-8000-000000000006','staged@test.invalid','client');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',false);
do $staff_transfer$
declare result jsonb;
begin
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'linked' then
    raise exception 'Pre-Auth trainer record was not linked: %',result;
  end if;
end
$staff_transfer$;
reset role;
do $staff_provenance$
declare v_id uuid;
begin
  select e.id into v_id from public.program_enrollments e
  join public.dogs d on d.id=e.dog_id
  where d.user_id='00000000-0000-4000-8000-000000000006' and d.name='Bongo';
  if v_id is null then raise exception 'Transferred provisional dog not in canonical enrollments'; end if;
  if (select count(*) from public.program_attendance_historical_evidence h
    where h.enrollment_id=v_id and h.evidence_source='staff_roster')<>1 then
    raise exception 'Transfer lost origin of trainer attendance';
  end if;
  if (select attendances_count from public.program_enrollments where id=v_id)<>2 then
    raise exception 'Transfer double counted or lost prior attendance';
  end if;
  if (select count(*) from ucapsa_intake.people where email_key='staged@test.invalid' and status='pending')<>0 then
    raise exception 'Linked person still pending in staging';
  end if;
  -- Comandos sin referencia conserva la autorización administrativa y el
  -- registro del entrenador después de vincular Auth.
  if not exists (
    select 1 from public.program_enrollments e
    join public.programs p on p.id=e.program_id
    join public.dogs d on d.id=e.dog_id
    where d.user_id='00000000-0000-4000-8000-000000000006'
      and d.name='Thor' and p.code='comandos'
      and e.status='active' and e.physical_card_number is null
      and e.card_started_on is not null and e.card_expires_on is not null
      and e.attendances_count=1
  ) then
    raise exception 'Comandos lost its Admin authorization or attendance after Auth claim';
  end if;
end
$staff_provenance$;


-- Read and action must be blocked for ordinary client accounts.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $client_roster_denied$
declare failed_view boolean:=false; failed_action boolean:=false;
begin
  begin
    perform * from public.get_staff_preregistered_class_roster(
      (now() at time zone 'America/Mexico_City')::date);
  exception when insufficient_privilege then failed_view:=true;
  end;
  begin
    perform public.staff_register_preregistered_attendance(
      '00000000-0000-4000-8000-000000000099',
      (now() at time zone 'America/Mexico_City')::date);
  exception when insufficient_privilege then failed_action:=true;
  end;
  if not failed_view or not failed_action then
    raise exception 'Client has access to restricted staff roster or attendance';
  end if;
end
$client_roster_denied$;
reset role;
-- Puppy without a known physical start remains authorized from Admin registration date.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Needs Review','pendingcard@test.invalid','','Pippa','puppy','base',
  'P-404',null,0,array[]::date[],'old card start unknown');
reset role;
do $setup_unknown$
begin
  update ucapsa_intake.programs st set schedule_id=s.id
  from ucapsa_intake.dogs d, ucapsa_intake.people p, public.program_schedules s
  where st.dog_id=d.id and d.person_id=p.id
    and p.email_key='pendingcard@test.invalid' and s.name='TEST TODAY';
end
$setup_unknown$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
do $puppy_admin_authorized$
declare row_id uuid; today_date date:=(now() at time zone 'America/Mexico_City')::date;
begin
  select intake_program_id into row_id
  from public.get_staff_preregistered_class_roster(today_date)
  where dog_name='Pippa' and card_status='valid';
  if row_id is null then raise exception 'Admin-authorized Puppy is missing without physical start'; end if;
  perform public.staff_register_preregistered_attendance(row_id,today_date);
  perform public.staff_register_preregistered_attendance(row_id,today_date);
end
$puppy_admin_authorized$;
reset role;

-- El rol operativo Entrenador no borra ni bloquea su expediente canónico.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
 'Staff Owner','staffowner@test.invalid','','Staff Dog','comandos','principiante',
 '',null,0,array[]::date[],'synthetic staff owner');
reset role;
insert into auth.users(id,email,email_confirmed_at)
values('00000000-0000-4000-8000-000000000007','staffowner@test.invalid',now());
insert into public.profiles(user_id,email,role)
values('00000000-0000-4000-8000-000000000007','staffowner@test.invalid','trainer');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',false);
do $staff_role_claim$
declare v_result jsonb;
begin
 v_result := public.claim_my_preregistered_dogs();
 if v_result->>'status'<>'linked' then
   raise exception 'Verified Trainer could not claim own approved dog: %',v_result;
 end if;
end
$staff_role_claim$;
reset role;
do $staff_role_retained$
begin
 if not exists (select 1 from public.profiles
   where user_id='00000000-0000-4000-8000-000000000007' and role='trainer') then
   raise exception 'Preregistration claim altered the Staff operational role';
 end if;
 if not exists (select 1 from public.program_enrollments e
  join public.programs p on p.id=e.program_id
  where e.user_id='00000000-0000-4000-8000-000000000007'
    and p.code='comandos' and e.physical_card_number is null
    and e.card_started_on is not null) then
   raise exception 'Verified Trainer lost authorized Comandos enrollment';
 end if;
end
$staff_role_retained$;

-- Regresión crítica: seis asistencias históricas reconocidas habilitan
-- evaluación Admin y progresión, sin inventar fechas ni cambiar de horario.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Six Count Owner','six@test.invalid','','Six Dog','comandos','principiante',
  '',null,6,array[]::date[],'Seis asistencias avaladas por Administración');
reset role;
insert into auth.users(id,email,email_confirmed_at)
values('00000000-0000-4000-8000-000000000008','six@test.invalid',now());
insert into public.profiles(user_id,email,role)
values('00000000-0000-4000-8000-000000000008','six@test.invalid','client');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000008',false);
do $historical_claim$
declare v_result jsonb;
begin
  v_result:=public.claim_my_preregistered_dogs();
  if v_result->>'status'<>'linked' then
    raise exception 'Historical Comandos not linked: %',v_result;
  end if;
end
$historical_claim$;
reset role;
do $historical_counts$
begin
  if not exists (
    select 1 from public.program_enrollments e
    join public.programs p on p.id=e.program_id
    where e.user_id='00000000-0000-4000-8000-000000000008'
      and p.code='comandos' and e.program_level='principiante'
      and e.attendances_count=6
      and e.last_attendance_at is null
      and e.status='active'
  ) then raise exception 'Six historical classes not in canonical SSOT'; end if;
  if (select count(*) from public.program_attendances a
    join public.program_enrollments e on e.id=a.enrollment_id
    where e.user_id='00000000-0000-4000-8000-000000000008')<>0 then
    raise exception 'Synthetic dates or attendance records were invented'; end if;
end
$historical_counts$;
-- Extraer IDs como propietario del fixture: la sesión autenticada NO obtiene
-- SELECT directo a tablas internas para construir parámetros del RPC.
select set_config('ucapsa.test.history_enrollment',e.id::text,false)
from public.program_enrollments e
join public.programs p on p.id=e.program_id
where e.user_id='00000000-0000-4000-8000-000000000008'
  and p.code='comandos' and e.program_level='principiante';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $admin_history_decision$
declare v_id uuid:=current_setting('ucapsa.test.history_enrollment')::uuid; v_result record;
begin
  select * into v_result from public.admin_resolve_training_card_decision(v_id,'next_level',null);
  if v_result.next_enrollment_id is null then
    raise exception 'Admin decision failed to create next level after historical 6'; end if;
  perform set_config('ucapsa.test.history_next',v_result.next_enrollment_id::text,false);
end
$admin_history_decision$;
reset role;

-- Validación independiente como dueño del fixture, después de ejecutar
-- la RPC con el rol real authenticated y auth.uid() de Admin.
do $history_decision_audit$
declare
  v_id uuid:=current_setting('ucapsa.test.history_enrollment')::uuid;
  v_next uuid:=current_setting('ucapsa.test.history_next')::uuid;
  v_original_schedule uuid;
begin
  select schedule_id into v_original_schedule from public.program_enrollments where id=v_id;
  if not exists (select 1 from public.program_enrollments
    where id=v_id and status='completed' and attendances_count=6) then
    raise exception 'Historic enrollment incorrectly closed'; end if;
  if not exists (select 1 from public.program_enrollments
    where id=v_next and status='active'
     and program_level='medio' and schedule_id=v_original_schedule
     and physical_card_number is null) then
    raise exception 'New level lost shared Comandos schedule or requires card reference'; end if;
  if not exists (select 1 from public.admin_audit_logs
    where entity_id=v_id and action='training_card.decision') then
    raise exception 'Training decision lacks audit evidence'; end if;
end
$history_decision_audit$;

select 'UCAPSA isolated database E2E: PASS' as result;
