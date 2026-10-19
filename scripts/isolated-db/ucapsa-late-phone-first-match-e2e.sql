-- UCAPSA: regression for email registration followed by adding a phone
-- to a profile. This is an AS-IS behavior test of the current first-claim
-- implementation, NOT evidence that an unverified phone proves ownership.
-- Synthetic isolated PostgreSQL only: never execute on Supabase production.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'ucapsa_test' then
    raise exception 'Refusing to run outside synthetic ucapsa_test';
  end if;
end $$;

-- The owner does not have an account when Admin creates the intake.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Email Then Phone', '', '+525512345920', 'Phone Later Dog',
  'comandos', 'principiante', '', null, 2, array[]::date[],
  'Synthetic late phone scenario');
reset role;

-- User registers with a different email and does NOT provide a phone.
insert into auth.users (id,email,email_confirmed_at,phone,phone_confirmed_at)
values ('00000000-0000-4000-8000-000000000020','email-only-later@test.invalid',now(),null,null);
insert into public.profiles (user_id,email,phone,role)
values ('00000000-0000-4000-8000-000000000020','email-only-later@test.invalid',null,'client');

-- Before adding phone there can be NO candidate or ownership transfer.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000020',false);
do $no_contact$
declare result jsonb;
begin
 result := public.preview_my_preregistered_dogs();
 if result->>'status' <> 'none' then
   raise exception 'Unexpected match before phone was provided: %',result;
 end if;
end $no_contact$;
reset role;

-- Mirrors account-settings -> updateMyProfile -> acceptProfile.
-- The SQL fixture directly sets the final profile value as fixture owner;
-- it does not claim to exercise the React interface.
update public.profiles set phone='55 1234 5920'
where user_id='00000000-0000-4000-8000-000000000020';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000020',false);
do $first_contact$
declare result jsonb;
begin
 result := public.preview_my_preregistered_dogs();
 if result->>'status'<>'available' or result->>'auto_first'<>'true' then
   raise exception 'Late phone profile update not recognized: %',result;
 end if;
 result := public.claim_my_first_preregistered_dogs();
 if result->>'status'<>'linked' or (result->>'linked_dogs')::integer<>1 then
   raise exception 'Late phone match failed first claim: %',result;
 end if;
 result := public.claim_my_first_preregistered_dogs();
 if result->>'status'<>'requires_approval' then
   raise exception 'Second automatic claim was not blocked: %',result;
 end if;
end $first_contact$;
reset role;

do $preserved$
begin
 if not exists (
   select 1 from public.program_enrollments e
   join public.dogs d on d.id=e.dog_id
   join public.programs p on p.id=e.program_id
   where e.user_id='00000000-0000-4000-8000-000000000020'
     and p.code='comandos' and d.name='Phone Later Dog'
     and e.program_level='principiante' and e.attendances_count=2
 ) then raise exception 'Phone claim lost official program/level/history'; end if;
 if (select count(*) from public.dogs where user_id='00000000-0000-4000-8000-000000000020'
   and name='Phone Later Dog')<>1 then
   raise exception 'Late phone claim produced duplicated dog'; end if;
 if not exists (
  select 1 from public.admin_audit_logs
  where action='dog_preregistration.claimed'
    and details->>'link_method'='first_contact_unverified'
 ) then raise exception 'No audit trail showing unverified matching risk'; end if;
end $preserved$;
select 'UCAPSA late phone first claim: current behavior reproduced (UNVERIFIED OWNERSHIP RISK)' as result;
