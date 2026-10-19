-- Regression of private Admin directory against the PostgreSQL-only UCAPSA
-- fixture AFTER the preregistration and account-claim E2E has populated it.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'ucapsa_test' then
    raise exception 'Refusing directory E2E on production: %', current_database();
  end if;
end $$;

-- RPC must exist without granting SELECT to private staging tables.
do $visibility$
begin
  if to_regprocedure('public.admin_get_preregistered_program_records(uuid)') is null then
    raise exception 'Admin directory RPC missing';
  end if;
  if has_function_privilege('anon',
     'public.admin_get_preregistered_program_records(uuid)','EXECUTE') then
    raise exception 'Anonymous actor could call Admin directory';
  end if;
  if has_schema_privilege('authenticated','ucapsa_intake','USAGE') then
    raise exception 'Private identity schema unexpectedly exposed';
  end if;
end $visibility$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $client_deny$
declare rejected boolean := false;
begin
  begin
    perform * from public.admin_get_preregistered_program_records(null::uuid);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then
    raise exception 'Client could read private preregistration records';
  end if;
end $client_deny$;
reset role;

-- The authorized Admin is authenticated but receives data through
-- SECURITY DEFINER, never a raw SELECT from ucapsa_intake.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $admin_directory$
declare
  v_record record;
  v_count integer;
begin
  select count(*) into v_count
    from public.admin_get_preregistered_program_records(null::uuid);
  if v_count < 2 then
    raise exception 'Expected seeded preregistrations, found %',v_count;
  end if;
  -- The linked record remains inspectable without a synthetic membership.
  select * into v_record from public.admin_get_preregistered_program_records(null::uuid)
    where owner_name='Six Count Owner' and dog_name='Six Dog';
  if not found or v_record.registration_status <> 'linked'
    or v_record.attendances_count <> 6
    or v_record.dated_attendances <> 0
    or v_record.undated_attendances <> 6
    or v_record.membership_status is not null then
    raise exception 'Historical linked count or membership was fabricated';
  end if;
  if (select count(*) from public.admin_get_preregistered_program_records(
        v_record.intake_program_id)) <> 1 then
    raise exception 'Directory filter did not isolate the selected record';
  end if;
  if exists (
    select 1 from public.admin_get_preregistered_program_records(null::uuid)
    where program_code='comandos' and physical_card_reference is not null
  ) then
    raise exception 'Comandos incorrectly exposes Puppy-only reference';
  end if;
end $admin_directory$;
reset role;

select 'UCAPSA preregistration Admin-only directory: PASS' as result;
