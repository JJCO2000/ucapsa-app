-- Execute ONLY in the synthetic isolated PostgreSQL database, NEVER production.
\set ON_ERROR_STOP on
do $$begin
 if current_database()<>'ucapsa_test' then raise exception 'Refusing to test against non-fixture database'; end if;
end $$;

-- Dedicated Auth fixture with NO verified contact (earlier tests verify user 003's phone).
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
values ('00000000-0000-4000-8000-000000000009','manual-unverified@test.invalid',null,null,null);
insert into public.profiles(user_id,full_name,email,role)
values ('00000000-0000-4000-8000-000000000009','Manual Example Owner',
        'manual-unverified@test.invalid','client');

-- New pending dog attached to a physical card; the recipient has an UNVERIFIED
-- Auth email and no phone. This is NOT proof of ownership until Admin approves.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Manual Example Owner','', '+525598765432', 'Bongo',
  'puppy','base','P-MANUAL-019',null,1,array[date '2026-10-18'],
  'Synthetic physical card inspected') as staged_dog;
reset role;

-- Before approval, an unverified user receives no candidate data.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',false);
do $unverified_before$
declare out_json jsonb; denied boolean:=false;
begin
  out_json:=public.preview_my_preregistered_dogs();
  if out_json->>'status' not in ('unverified','none') then
    raise exception 'Unverified user could preview private dog details before approval: %',out_json;
  end if;
  begin
    perform public.admin_preview_preregistration_owner_link('+525598765432','manual-unverified@test.invalid');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Non-admin was able to enumerate owner records'; end if;
end $unverified_before$;
reset role;

-- Administrative authorization is explicit, evidence-based and auditable.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $approve$
declare
  j jsonb;
  person_id uuid;
  user_id uuid;
begin
  j:=public.admin_preview_preregistration_owner_link('+525598765432','manual-unverified@test.invalid');
  if j->>'status'<>'available' or (j->>'dog_count')::int<>1 then
    raise exception 'Admin preview mismatch: %',j;
  end if;
  person_id:=(j->>'person_id')::uuid;
  user_id:=(j->>'user_id')::uuid;
  if user_id<>'00000000-0000-4000-8000-000000000009'::uuid then
    raise exception 'Admin preview resolved another account';
  end if;
  j:=public.admin_approve_preregistration_owner_link(person_id,user_id,
      'Tutora identificada presencialmente con tarjeta física.');
  if j->>'status'<>'approved' then raise exception 'Approval failed: %',j; end if;
end $approve$;
reset role;

-- Unrelated account still cannot preview this approval or claim its dogs.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $unrelated$
declare j jsonb;
begin
  j:=public.preview_my_preregistered_dogs();
  if j->>'status'='available' then raise exception 'Wrong account can see approved records: %',j; end if;
  j:=public.claim_my_preregistered_dogs();
  if j->>'status'='linked' then raise exception 'Wrong account stole dogs: %',j; end if;
end $unrelated$;
reset role;

-- Explicitly accepting in the assigned UNVERIFIED account transfers history.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',false);
do $manual_claim$
declare j jsonb;
begin
  j:=public.preview_my_preregistered_dogs();
  if j->>'status'<>'available' or (j->>'count')::int<>1 then
    raise exception 'Admin-approved contactless preview failed: %',j;
  end if;
  if j->>'auto_first'<>'true' then
    raise exception 'First trusted approval must be eligible for automatic linking: %',j;
  end if;
  j:=public.claim_my_first_preregistered_dogs();
  if j->>'status'<>'linked' or (j->>'linked_dogs')::int<>1
     or (j->>'linked_programs')::int<>1 then
    raise exception 'Automatic first approved claim failed: %',j;
  end if;
  j:=public.claim_my_preregistered_dogs();
  if j->>'status'='linked' then raise exception 'Duplicate manual claim accepted'; end if;
end $manual_claim$;
reset role;

do $verify$
begin
 if not exists(
   select 1 from public.dogs d
   where d.name='Bongo' and d.user_id='00000000-0000-4000-8000-000000000009'
 ) then raise exception 'Manual linked dog not owned by approved user'; end if;
 if not exists(
   select 1 from public.program_enrollments e
   join public.dogs d on d.id=e.dog_id
   where d.name='Bongo' and e.user_id='00000000-0000-4000-8000-000000000009'
   and e.attendances_count=1
 ) then raise exception 'Historical attendance was not preserved'; end if;
 if (select count(*) from ucapsa_intake.owner_link_approvals
     where consumed_at is not null)<>1 then
   raise exception 'Approval was not consumed exactly once';
 end if;
 if not exists(select 1 from public.admin_audit_logs
     where action='dog_preregistration.manual_approval') then
   raise exception 'Manual approval audit missing';
 end if;
end $verify$;
