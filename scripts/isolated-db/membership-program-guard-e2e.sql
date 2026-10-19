\set ON_ERROR_STOP on
do $guard$ begin
 if current_database() <> 'ucapsa_membership_program_guard_test' then
  raise exception 'Refusing to run outside ephemeral test database';
 end if;
end $guard$;

-- Both cancellation and demotion to pending must be rejected before legacy triggers fire.
do $test$ declare blocked boolean := false;
begin
 begin
  update public.memberships set status='cancelled'
  where id='00000000-0000-4000-8000-000000000001';
 exception when check_violation then blocked := true;
 end;
 if not blocked then raise exception 'Unsafe cancellation was not blocked'; end if;
 blocked := false;
 begin
  update public.memberships set status='pending'
  where id='00000000-0000-4000-8000-000000000001';
 exception when check_violation then blocked := true;
 end;
 if not blocked then raise exception 'Unsafe suspension was not blocked'; end if;
 if (select status from public.program_enrollments
     where id='00000000-0000-4000-8000-100000000001') <> 'active' then
  raise exception 'Enrollment was silently cancelled';
 end if;
 if (select status from public.memberships
     where id='00000000-0000-4000-8000-000000000001') <> 'active' then
  raise exception 'Membership was mutated despite guarded failure';
 end if;
end $test$;

-- Unrelated edits and unchanged status remain allowed for an active membership.
update public.memberships set current_payment_status='paid'
where id='00000000-0000-4000-8000-000000000001';
update public.memberships set status='active'
where id='00000000-0000-4000-8000-000000000001';

-- Normal cancellation with completed/cancelled training history is still allowed.
update public.memberships set status='cancelled'
where id='00000000-0000-4000-8000-000000000002';
update public.memberships set status='cancelled'
where id='00000000-0000-4000-8000-000000000003';
do $assert$ begin
 if (select status from public.program_enrollments
    where id='00000000-0000-4000-8000-100000000002') <> 'completed' then
  raise exception 'Completed program historical evidence was changed';
 end if;
 if (select status from public.program_enrollments
    where id='00000000-0000-4000-8000-100000000003') <> 'cancelled' then
  raise exception 'Cancelled program was changed';
 end if;
end $assert$;
select 'PASS: membership transitions cannot cancel live program enrollments' result;
