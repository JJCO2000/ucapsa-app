-- Aislamiento: NO ejecutar en Supabase real.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'ucapsa_test' then raise exception 'E2E only for ucapsa_test'; end if;
end $$;

-- La identidad original se prepara ANTES de crear cuenta, tal como opera UCAPSA.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Manual Parent','','+525599991111','Manual Dog','comandos','principiante',
  '',null,2,array[]::date[],'Histórico acreditado presencialmente');
reset role;

insert into auth.users(id,email,email_confirmed_at)
values ('00000000-0000-4000-8000-000000000009','manual-new@test.invalid',now());
insert into public.profiles(user_id,full_name,email,phone,role)
values ('00000000-0000-4000-8000-000000000009','Manual Parent',
  'manual-new@test.invalid','+525599991111','client');

-- Una coincidencia en profiles.phone sin confirmación de Auth NO transfiere perros.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',false);
do $no_auto$
declare r jsonb; v_status text;
begin
  r:=public.claim_my_preregistered_dogs();
  if r->>'status'='linked' then raise exception 'Unverified phone linked unexpectedly';end if;
  v_status:=public.request_my_preregistration_link();
  if v_status<>'pending' then raise exception 'Consent request not accepted';end if;
  if public.request_my_preregistration_link()<>'pending' then
   raise exception 'Repeated request not idempotent';end if;
  if public.get_my_preregistration_link_status()<>'pending' then
   raise exception 'Pending status not visible to owner';end if;
  if has_schema_privilege('authenticated','ucapsa_intake','USAGE') then
   raise exception 'Private intake exposed to clients';end if;
end $no_auto$;
reset role;

-- Un cliente de UCAPSA no puede aprobar otra cuenta.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $not_admin$
declare rid uuid; forbidden boolean:=false;
begin
  begin
    perform * from public.admin_get_preregistration_link_requests();
  exception when insufficient_privilege then forbidden:=true; end;
  if not forbidden then raise exception 'Client can inspect Admin requests';end if;
  begin
   perform public.admin_review_preregistration_link(
    '00000000-0000-4000-8000-000000000009',true,
    'Comprobación de identidad presencial en oficina');
  exception when insufficient_privilege then forbidden:=true; end;
end $not_admin$;
reset role;

-- Admin revisa fuera de la app y aprueba con evidencia, no por match.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $staff_review$
declare rid uuid; v_count integer; v_result text;
begin
 select request_id into rid from public.admin_get_preregistration_link_requests()
  where account_user_id='00000000-0000-4000-8000-000000000009'
    and account_phone='+525599991111'
    and dog_names='Manual Dog';
 if rid is null then raise exception 'Admin did not see pending matching request';end if;
 select count(*) into v_count from public.admin_get_preregistration_link_requests()
  where account_user_id='00000000-0000-4000-8000-000000000009';
 if v_count<>1 then raise exception 'Duplicate request';end if;
 begin
   perform public.admin_review_preregistration_link(rid,true,'short');
   raise exception 'Weak proof was accepted';
 exception when invalid_parameter_value then null; end;
 v_result:=public.admin_review_preregistration_link(rid,true,
   'Comprobación presencial de identidad del tutor y registro histórico');
 if v_result<>'approved' then raise exception 'Admin approval failed';end if;
end $staff_review$;
reset role;

-- Cliente confirmado por Admin: usar el MISMO camino canónico de transferencia.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',false);
do $manual_claim$
declare r jsonb;
begin
 if public.get_my_preregistration_link_status()<>'approved' then
  raise exception 'Admin-approved claim not offered'; end if;
 r:=public.claim_my_preregistered_dogs();
 if r->>'status'<>'linked' or (r->>'linked_dogs')::int<>1 then
  raise exception 'Approved account could not link: %',r; end if;
 if public.get_my_preregistration_link_status()<>'claimed' then
  raise exception 'Claim status not consumed';end if;
 r:=public.claim_my_preregistered_dogs();
 if r->>'status'='linked' then raise exception 'Duplicate manual link on retry';end if;
end $manual_claim$;
reset role;

-- Auditoría independiente como dueño del fixture.
do $validate_history$
begin
 if (select count(*) from public.dogs where user_id='00000000-0000-4000-8000-000000000009')<>1 then
   raise exception 'Missing or duplicate canonical dog';end if;
 if not exists(select 1 from public.program_enrollments e join public.programs p
   on p.id=e.program_id
  where e.user_id='00000000-0000-4000-8000-000000000009'
    and p.code='comandos' and e.program_level='principiante'
    and e.attendances_count=2 and e.physical_card_number is null) then
  raise exception 'Canonical enrollment lost stage or history';end if;
 if (select count(*) from public.program_attendances a join public.program_enrollments e
    on e.id=a.enrollment_id where e.user_id='00000000-0000-4000-8000-000000000009')<>0 then
   raise exception 'Fabricated attendance dates';end if;
 if not exists(select 1 from public.admin_audit_logs
    where action='dog_preregistration.manual_link_approved') then
   raise exception 'Admin approval was not audited';end if;
end $validate_history$;

select 'UCAPSA manual preregistration no SMS: PASS' as result;
