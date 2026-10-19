\set ON_ERROR_STOP on
do $guard$ begin
 if current_database()<>'ucapsa_role_separation_test' then
  raise exception 'No ejecutar en base real';
 end if;
end $guard$;

-- Staff commercial membership never demotes privileges.
insert into public.memberships(user_id,status,current_payment_status)
values('00000000-0000-4000-8000-000000000001','active','paid');
do $t$ begin
 if (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000001')<>'trainer' then
  raise exception 'Trainer was overwritten by member role';
 end if;
end $t$;

-- Ordinary customers are still projected as members when active.
insert into public.memberships(user_id,status,current_payment_status)
values('00000000-0000-4000-8000-000000000002','active','paid');
do $c$ begin
 if (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000002')<>'member'
 then raise exception 'Customer did not become a member'; end if;
end $c$;

-- Paid obligations past and due today remain, only future unpaid are cancelled.
insert into public.payment_obligations(membership_id,due_date,amount)
select id,current_date+10,100 from public.memberships where user_id='00000000-0000-4000-8000-000000000002';
insert into public.payment_obligations(membership_id,due_date,amount)
select id,current_date,100 from public.memberships where user_id='00000000-0000-4000-8000-000000000002';

-- Member cancellation is still reflected in customer presentation.
update public.memberships set status='cancelled'
where user_id='00000000-0000-4000-8000-000000000002';
do $x$ begin
 if (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000002')<>'client'
 then raise exception 'Cancelled member did not return to customer'; end if;
 if (select count(*) from public.payment_obligations o join public.memberships m on m.id=o.membership_id
     where m.user_id='00000000-0000-4000-8000-000000000002' and o.cancelled_at is not null)<>1
 then raise exception 'Future obligations not selectively cancelled'; end if;
end $x$;

-- Trainer membership changes and renewals never alter operational role.
update public.memberships set status='cancelled'
where user_id='00000000-0000-4000-8000-000000000001';
update public.memberships set status='active'
where user_id='00000000-0000-4000-8000-000000000001';
do $t2$ begin
 if (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000001')<>'trainer'
 then raise exception 'Renewal demoted Trainer'; end if;
end $t2$;

-- Admin and Superadmin keep operational privileges when memberships change.
insert into public.memberships(user_id,status,current_payment_status)
values('00000000-0000-4000-8000-000000000004','active','paid'),
 ('00000000-0000-4000-8000-000000000005','active','paid');
do $a$ begin
 if (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000004')<>'admin'
 or (select role from public.profiles where user_id='00000000-0000-4000-8000-000000000005')<>'super_admin'
 then raise exception 'Elevated staff permissions overwritten by commercial membership'; end if;
end $a$;

select 'UCAPSA role/commercial separation PostgreSQL E2E PASS' as result;
