\set ON_ERROR_STOP on
do $guard$ begin
  if current_database()<>'ucapsa_role_test' then
    raise exception 'Refuse non-test database';
  end if;
end $guard$;

-- Ordinary user must be blocked from assigning any privileged role.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $denied$
declare blocked boolean:=false;
begin
  begin
    perform public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000002','admin');
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'Client promoted own role'; end if;
end $denied$;
reset role;

-- Superadmin automatically grants Socio membership as not_required (no fake payment).
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000002','member');
select public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000002','member');
reset role;
do $grant$
begin
 if (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000002')<>'member'
  then raise exception 'Socio role not set'; end if;
 if (select count(*) from public.memberships where user_id='00000000-0000-4000-8000-000000000002')<>1
  then raise exception 'Duplicate membership'; end if;
 if not exists(select 1 from public.memberships where user_id='00000000-0000-4000-8000-000000000002'
    and status='active' and current_payment_status='not_required' and approved_by='00000000-0000-4000-8000-000000000001')
  then raise exception 'Granted membership must not invent a payment'; end if;
end $grant$;

-- Exiting Socio role revokes current privileges; history and actual payments remain.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000002','trainer');
select public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000003','admin');
reset role;
do $revoke$
begin
 if (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000002')<>'trainer'
   then raise exception 'Trainer role missing'; end if;
 if not exists (select 1 from public.memberships where user_id='00000000-0000-4000-8000-000000000002'
   and status='cancelled' and current_payment_status='not_required')
   then raise exception 'Granted membership not disabled'; end if;
 if not exists (select 1 from public.memberships where user_id='00000000-0000-4000-8000-000000000003'
   and status='cancelled' and current_payment_status='paid' and last_payment_at='2026-04-02T12:00:00Z')
   then raise exception 'Paid membership history altered'; end if;
end $revoke$;

-- Role changes to Admin & Superadmin only by Superadmin.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000004','admin');
select public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000005','super_admin');
do $super_guard$
declare blocked boolean:=false;
begin
 begin
   perform public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000001','member');
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Superadmin self-demoted'; end if;
end $super_guard$;
reset role;

do $audit$
begin
 if (select count(*) from public.admin_audit_logs where action='profile.staff_role_change')<>5 then
    raise exception 'Audit log missing or duplicate events';
 end if;
 if exists (select 1 from public.admin_audit_logs
    where action='profile.staff_role_change'
      and details->>'membership_action' is null) then
    raise exception 'Audit lacks membership impact';
 end if;
end $audit$;
select 'UCAPSA Superadmin role membership SSOT: PASS' as result;
