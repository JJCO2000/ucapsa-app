-- Synthetic-only integration test. This file must never run in production.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'ucapsa_test' then
    raise exception 'Refusing contact-completion test outside isolated DB';
  end if;
end $$;

do $privileges$
begin
  if to_regprocedure('public.admin_complete_preregistration_contact(uuid,text,text)') is null then
    raise exception 'Missing contact completion RPC';
  end if;
  if has_function_privilege('anon',
    'public.admin_complete_preregistration_contact(uuid,text,text)','EXECUTE') then
    raise exception 'Anonymous actor can execute Admin contact RPC';
  end if;
  if has_schema_privilege('authenticated','ucapsa_intake','USAGE') then
    raise exception 'Private preregistration tables are exposed';
  end if;
end $privileges$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Complete Email','complete-email@test.invalid','','Caramelo',
  'puppy','base','P-COMPLETE-E-001',null,3,array[]::date[], 'Synthetic missing phone');
select public.admin_preregister_dog_with_program(
  'Complete Phone','', '+525588881002','Ámbar',
  'comandos','principiante','',null,4,array[]::date[], 'Synthetic missing email');
select public.admin_preregister_dog_with_program(
  'Complete Duplicate','', '+525588881003','Cereza',
  'puppy','base','P-COMPLETE-D-001',null,0,array[]::date[], 'Synthetic conflict');
reset role;

-- Verify client and trainer cannot change a provisional owner's contact.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $client_reject$
declare denied boolean := false;
begin
  begin
    perform * from public.admin_get_preregistered_program_records(null::uuid);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Client could read Admin directory'; end if;
end $client_reject$;
-- A known synthetic UUID is still forbidden to client.
do $client_write_reject$
declare denied boolean := false;
begin
  begin
    perform public.admin_complete_preregistration_contact(
      '00000000-0000-4000-8000-000000000777','client@fake.invalid',null);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Client could call Admin RPC'; end if;
end $client_write_reject$;
reset role;

-- Admin updates only genuinely missing fields and cannot overwrite either one.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $admin_completion$
declare
  v_email_id uuid;
  v_phone_id uuid;
  v_duplicate_id uuid;
  v_linked_id uuid;
  v_response jsonb;
  v_rejected boolean;
  v_before integer;
begin
  select person_id into v_email_id
  from public.admin_get_preregistered_program_records(null::uuid)
  where owner_name='Complete Email' limit 1;
  select person_id into v_phone_id
  from public.admin_get_preregistered_program_records(null::uuid)
  where owner_name='Complete Phone' limit 1;
  select person_id into v_duplicate_id
  from public.admin_get_preregistered_program_records(null::uuid)
  where owner_name='Complete Duplicate' limit 1;
  if v_email_id is null or v_phone_id is null or v_duplicate_id is null then
    raise exception 'Missing seeded preinscriptions';
  end if;
  select count(*) into v_before
  from public.admin_get_preregistered_program_records(null::uuid)
  where owner_name='Complete Email' and attendances_count=3;

  v_response:=public.admin_complete_preregistration_contact(
    v_email_id,null,'+525588881001');
  if v_response->>'status'<>'updated'
      or v_response->>'phone_added'<>'true'
      or v_response->>'email_added'<>'false' then
    raise exception 'Phone completion failed: %',v_response;
  end if;
  v_response:=public.admin_complete_preregistration_contact(
    v_phone_id,'Complete-Added@TEST.INVALID',null);
  if v_response->>'status'<>'updated'
      or v_response->>'email_added'<>'true' then
    raise exception 'Email completion failed: %',v_response;
  end if;

  v_rejected := false;
  begin
    perform public.admin_complete_preregistration_contact(
      v_email_id,'overwrite@test.invalid',null);
  exception when check_violation then v_rejected := true; end;
  if not v_rejected then raise exception 'Existing email was overwritten'; end if;

  v_rejected := false;
  begin
    perform public.admin_complete_preregistration_contact(
      v_email_id,null,'+525588881099');
  exception when check_violation then v_rejected := true; end;
  if not v_rejected then raise exception 'Existing phone was overwritten'; end if;

  v_rejected := false;
  begin
    perform public.admin_complete_preregistration_contact(
      v_phone_id,null,'bad-phone');
  exception when invalid_parameter_value then v_rejected := true; end;
  if not v_rejected then raise exception 'Malformed phone was accepted'; end if;

  v_rejected := false;
  begin
    perform public.admin_complete_preregistration_contact(
      v_duplicate_id,'complete-email@test.invalid',null);
  exception when unique_violation then v_rejected := true; end;
  if not v_rejected then raise exception 'Duplicate contact was allowed'; end if;

  select person_id into v_linked_id from
    public.admin_get_preregistered_program_records(null::uuid)
    where registration_status='linked' limit 1;
  if v_linked_id is null then raise exception 'Linked fixture not available'; end if;
  v_rejected := false;
  begin
    perform public.admin_complete_preregistration_contact(
      v_linked_id,'linked-change@test.invalid',null);
  exception when check_violation then v_rejected := true; end;
  if not v_rejected then raise exception 'Linked record was mutable'; end if;

  if (select count(*) from public.admin_get_preregistered_program_records(null::uuid)
        where owner_name='Complete Email' and attendances_count=3) <> v_before then
    raise exception 'Program attendance was modified';
  end if;
  if not exists(select 1 from public.admin_get_preregistered_program_records(null::uuid)
    where person_id=v_email_id and owner_email='complete-email@test.invalid'
      and owner_phone='+525588881001' and registration_status='pending') then
    raise exception 'Added phone disappeared or changed email';
  end if;
  if not exists(select 1 from public.admin_get_preregistered_program_records(null::uuid)
    where person_id=v_phone_id and owner_email='complete-added@test.invalid'
      and owner_phone='+525588881002' and registration_status='pending') then
    raise exception 'Added email normalization failed';
  end if;
end $admin_completion$;
reset role;

do $audit$
begin
  if (select count(*) from public.admin_audit_logs
      where action='preregistration.contact_completed')<>2 then
    raise exception 'Missing or duplicate contact completion audit';
  end if;
  if exists(select 1 from public.admin_audit_logs
     where action='preregistration.contact_completed'
       and details::text ~ '(@|\\+5255)') then
    raise exception 'Audit must not disclose contact values';
  end if;
end $audit$;

select 'UCAPSA admin missing-contact append, guards, and history: PASS';
