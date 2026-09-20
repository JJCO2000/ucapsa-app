-- UCAPSA canonical membership status lifecycle.
--
-- Goals:
-- 1) keep one canonical membership-state invariant trigger;
-- 2) make membership status side effects atomic at the database boundary;
-- 3) preserve paid/current/overdue financial evidence;
-- 4) cancel only genuinely open future obligations;
-- 5) derive profile role from the real set of active memberships.

-- Retire both historical lifetime implementations and replace them with one
-- membership-state invariant.
drop trigger if exists trg_membership_lifetime_active on public.memberships;
drop trigger if exists trg_enforce_lifetime_membership on public.memberships;
drop function if exists public.enforce_lifetime_active_membership();
drop function if exists public.enforce_lifetime_membership();

create or replace function public.enforce_membership_state_invariants()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' then
    new.end_date := null;

    -- A reactivated membership must not remain in the cancelled-only payment
    -- state. Preserve an existing paid/pending state; normalize only not_required.
    if new.current_payment_status = 'not_required' then
      new.current_payment_status := 'pending';
    end if;
  elsif new.status = 'cancelled' then
    new.current_payment_status := 'not_required';
  end if;

  return new;
end;
$$;

create trigger trg_membership_state_invariants
before insert or update of status, end_date, current_payment_status
on public.memberships
for each row
execute function public.enforce_membership_state_invariants();

revoke all on function public.enforce_membership_state_invariants()
  from public, anon, authenticated;
grant execute on function public.enforce_membership_state_invariants()
  to service_role;

create or replace function public.sync_membership_status_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_has_active boolean;
  v_next_role public.app_role;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  -- Ignore ordinary edits that do not change membership state.
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  -- A cancellation stops only future obligations that still have an unpaid
  -- balance. This preserves paid evidence plus debt due today or already due.
  -- "Future" matches the canonical client payments rule: due_date > current_date.
  if tg_op <> 'DELETE'
     and new.status = 'cancelled'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.payment_obligations o
    set
      cancelled_at = v_now,
      cancelled_by = coalesce(o.cancelled_by, v_actor),
      updated_at = v_now
    where o.membership_id = new.id
      and o.cancelled_at is null
      and o.due_date > current_date
      and (
        o.amount - coalesce((
          select sum(p.amount)
          from public.payments p
          where p.obligation_id = o.id
            and p.status = 'paid'
            and p.voided_at is null
        ), 0)
      ) > 0.005;
  end if;

  select exists (
    select 1
    from public.memberships m
    where m.user_id = v_user_id
      and m.status = 'active'
  )
  into v_has_active;

  v_next_role := case
    when v_has_active then 'member'::public.app_role
    else 'client'::public.app_role
  end;

  update public.profiles p
  set
    role = v_next_role,
    updated_at = v_now
  where p.user_id = v_user_id
    and p.role not in ('admin', 'super_admin')
    and p.role is distinct from v_next_role;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_membership_status_lifecycle on public.memberships;
create trigger trg_membership_status_lifecycle
after insert or update or delete on public.memberships
for each row
execute function public.sync_membership_status_lifecycle();

revoke all on function public.sync_membership_status_lifecycle()
  from public, anon, authenticated;
grant execute on function public.sync_membership_status_lifecycle()
  to service_role;
