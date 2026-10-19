-- Synthetic PostgreSQL ONLY. Runs AFTER first approved auto-claim.
\set ON_ERROR_STOP on
do $$begin if current_database()<>'ucapsa_test'
  then raise exception 'Refuse non-test DB'; end if; end $$;

-- A second provisional record with a DIFFERENT contact is not silently
-- claimed just because the user owns an earlier dog.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Manual Example Owner','', '+525598765433','Milo',
  'comandos','principiante','',null,2,
  array[date '2026-10-17',date '2026-10-18'],'Synthetic second dog'
);
reset role;

-- A new match without an authorized account association cannot be auto-linked.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',false);
do $repeat_unapproved$
declare r jsonb;
begin
  r:=public.preview_my_preregistered_dogs();
  if r->>'status'='available' then
    raise exception 'Unapproved second record exposed: %',r;
  end if;
  r:=public.claim_my_first_preregistered_dogs();
  if r->>'status'<>'requires_approval' then
    raise exception 'Second silent claim permitted: %',r;
  end if;
end $repeat_unapproved$;
reset role;

-- Admin checks the actual person/account, and creates a second approval.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $repeat_approve$
declare r jsonb;
begin
  r:=public.admin_preview_preregistration_owner_link(
    '+525598765433','manual-unverified@test.invalid');
  if r->>'status'<>'available' or r->>'account_email'<>'manual-unverified@test.invalid' then
    raise exception 'Admin failed to find secondary staged owner: %',r;
  end if;
  r:=public.admin_approve_preregistration_owner_link(
    (r->>'person_id')::uuid,(r->>'user_id')::uuid,
    'Comprobé de nuevo la identidad presencialmente y revisé tarjeta física.');
  if r->>'status'<>'approved' then raise exception 'Second Admin approval failed: %',r; end if;
end $repeat_approve$;
reset role;

-- Preview may now show another dog, but it MUST NOT offer auto_first.
-- The user's separate confirmation is required.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',false);
do $repeat_confirm$
declare r jsonb;
begin
  r:=public.preview_my_preregistered_dogs();
  if r->>'status'<>'available' or r->>'auto_first'<>'false' or (r->>'count')::int<>1 then
    raise exception 'Second consent offer missing or auto flag enabled: %',r;
  end if;
  r:=public.claim_my_first_preregistered_dogs();
  if r->>'status'<>'requires_approval' then
    raise exception 'Second record silently linked: %',r;
  end if;
  -- Simulates the confirmed "Sí, vincular" action.
  r:=public.claim_my_preregistered_dogs();
  if r->>'status'<>'linked' or (r->>'linked_dogs')::int<>1 then
    raise exception 'Second approved + accepted record failed: %',r;
  end if;
end $repeat_confirm$;
reset role;

do $repeat_history$
begin
  if (select count(*) from public.dogs
      where user_id='00000000-0000-4000-8000-000000000009'
      and name in ('Bongo','Milo'))<>2 then
    raise exception 'Second link lost ownership of a dog';
  end if;
  if not exists(select 1 from public.program_enrollments e
      join public.dogs d on d.id=e.dog_id
      where d.name='Milo' and e.attendances_count=2
      and e.user_id='00000000-0000-4000-8000-000000000009') then
    raise exception 'Second link lost Comandos attendance';
  end if;
  if (select count(*) from ucapsa_intake.owner_link_approvals
       where consumed_at is not null)<>2 then
    raise exception 'Second approval not consumed';
  end if;
end $repeat_history$;
