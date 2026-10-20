-- Synthetic-only membership activation; MUST run after existing E2E.
\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'ucapsa_test' then raise exception 'Isolated PostgreSQL only'; end if;
end $$;

-- Non-Admin cannot authorize someone else's unlimited membership.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $not_admin$
declare denied boolean := false;
begin
  begin
    perform public.admin_preregister_dog_with_membership(
      'Member Owner','member@ucapsa.invalid','+525588887777','Kira',
      'comandos','avanzado','',null,3,array[]::date[],'staff confirmed',
      true);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Client authorized membership before Auth'; end if;
end $not_admin$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_membership(
  'Member Owner','member@ucapsa.invalid','+525588887777','Kira',
  'comandos','avanzado','',null,3,array[]::date[],'Admin confirmed stage',
  true) as provisional_member_dog;
-- Same dog, different program; must retain Comandos as its member stage.
select public.admin_preregister_dog_with_program(
  'Member Owner','member@ucapsa.invalid','+525588887777','Kira',
  'puppy','base','P-SOC-100',null,2,array[]::date[],'Admin confirmed Puppy'
) as extra_program;
reset role;

do $stage_not_auth$
begin
  if exists (select 1 from public.memberships where user_id =
    '00000000-0000-4000-8000-000000000010') then
    raise exception 'Invented Auth membership before owner account existed';
  end if;
  if not exists (
    select 1 from ucapsa_intake.people where owner_name='Member Owner'
      and member_preapproved and member_preapproved_by=
        '00000000-0000-4000-8000-000000000001'
      and status='pending'
  ) then raise exception 'Member preapproval not stored'; end if;
  if not exists (
    select 1 from public.admin_audit_logs
      where action='preregistration.membership_authorization') then
    raise exception 'Member authorization lacks audit'; end if;
end $stage_not_auth$;

-- Admin sees provisional Socio status; other roles cannot use the directory.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $read_pending$
begin
  if (select count(*) from public.admin_get_preregistered_program_records(null::uuid)
    where owner_name='Member Owner' and membership_status='preapproved')<>2 then
    raise exception 'Provisional membership must be visible for both programs';
  end if;
end $read_pending$;
reset role;

insert into auth.users(id,email,email_confirmed_at)
values('00000000-0000-4000-8000-000000000010','member@ucapsa.invalid',now());
insert into public.profiles(user_id,email,role)
values('00000000-0000-4000-8000-000000000010','member@ucapsa.invalid','client');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false);
do $first_member_claim$
declare result jsonb;
begin
  result:=public.claim_my_preregistered_dogs();
  if result->>'status'<>'linked' or (result->>'linked_dogs')::int<>1 then
    raise exception 'First member claim failed: %', result;
  end if;
end $first_member_claim$;
reset role;

do $member_truth$
declare v_id uuid;
begin
  select id into v_id from public.memberships
  where user_id='00000000-0000-4000-8000-000000000010'
    and status='active';
  if v_id is null then raise exception 'Member authorization not activated'; end if;
  if not exists (select 1 from public.profiles
    where user_id='00000000-0000-4000-8000-000000000010'
      and role='member') then
    raise exception 'Canonical member role not synchronized'; end if;
  if (select count(*) from public.memberships
    where user_id='00000000-0000-4000-8000-000000000010')<>1 then
    raise exception 'Duplicate membership'; end if;
  if not exists (
    select 1 from public.program_enrollments e
    join public.programs p on p.id=e.program_id
    where e.user_id='00000000-0000-4000-8000-000000000010'
      and e.membership_id=v_id and e.access_mode='membership' and e.status='active'
      and p.code='comandos' and e.program_level='avanzado'
  ) then raise exception 'Unlimited Comandos advanced stage lost'; end if;
  if not exists (
    select 1 from public.program_enrollments e join public.programs p on p.id=e.program_id
    where e.user_id='00000000-0000-4000-8000-000000000010'
    and p.code='comandos' and e.access_mode='card' and e.attendances_count=3
  ) then raise exception 'Original Comandos attendance was overwritten'; end if;
  if not exists (
    select 1 from public.program_enrollments e join public.programs p on p.id=e.program_id
    where e.user_id='00000000-0000-4000-8000-000000000010'
    and p.code='puppy' and e.attendances_count=2
  ) then raise exception 'Puppy attendance was lost'; end if;
end $member_truth$;

-- Repeat linking must not mint a second membership or duplicate history.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false);
select public.claim_my_preregistered_dogs();
reset role;
do $member_idempotency$
begin
  if (select count(*) from public.memberships
    where user_id='00000000-0000-4000-8000-000000000010')<>1 then
    raise exception 'Repeated claim duplicated membership'; end if;
end $member_idempotency$;
select 'UCAPSA provisional Socio with Comandos/Puppy: PASS' as result;
