-- UCAPSA role/commercial separation (minimal, production-body-derived patch).
-- Orig: pg_get_functiondef(public.sync_membership_status_lifecycle) read-only
-- Keeps existing payment cancellation and client/member lifecycle unchanged.
-- A TRAINER may be an active member commercially without losing staff permissions.
-- Admin and Superadmin remain protected as before.
CREATE OR REPLACE FUNCTION public.sync_membership_status_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and p.role not in ('trainer', 'admin', 'super_admin')
    and p.role is distinct from v_next_role;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$
;
