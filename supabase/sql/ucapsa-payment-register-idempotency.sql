-- UCAPSA idempotent manual payment registration.
--
-- A payment registration is one business event. The client supplies a stable
-- UUID for the attempt. Repeating the same UUID returns the same payment instead
-- of creating a duplicate after a lost response.
--
-- Membership payment summary is refreshed inside the same PostgreSQL
-- transaction so the payment and its derived membership summary cannot diverge.

create or replace function public.refresh_membership_payment_summary(
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_obligations boolean := false;
  v_has_outstanding boolean := false;
  v_latest public.payments%rowtype;
  v_status text;
begin
  if p_membership_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.id = p_membership_id
  ) then
    raise exception 'Membresia no encontrada.';
  end if;

  select exists (
    select 1
    from public.payment_obligations o
    where o.membership_id = p_membership_id
      and o.obligation_type = 'membership'
      and o.cancelled_at is null
  )
  into v_has_obligations;

  select exists (
    select 1
    from public.payment_obligations o
    where o.membership_id = p_membership_id
      and o.obligation_type = 'membership'
      and o.cancelled_at is null
      and (
        o.amount - coalesce((
          select sum(p.amount)
          from public.payments p
          where p.obligation_id = o.id
            and p.status = 'paid'
            and p.voided_at is null
        ), 0)
      ) > 0.005
  )
  into v_has_outstanding;

  select *
    into v_latest
  from public.payments p
  where p.membership_id = p_membership_id
    and p.status = 'paid'
    and p.voided_at is null
  order by p.paid_at desc, p.created_at desc
  limit 1;

  v_status := case
    when v_has_obligations and v_has_outstanding then 'pending'
    when v_has_obligations then 'paid'
    when v_latest.id is not null then 'paid'
    else 'pending'
  end;

  update public.memberships m
  set
    current_payment_status = v_status,
    last_payment_at = v_latest.paid_at,
    payment_notes = v_latest.notes,
    updated_at = now()
  where m.id = p_membership_id;
end;
$$;

revoke all on function public.refresh_membership_payment_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_membership_payment_summary(uuid)
  to service_role;


create or replace function public.sync_payment_membership_summary_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_summary_trigger$
begin
  if tg_op = 'UPDATE'
     and old.membership_id is distinct from new.membership_id
     and old.membership_id is not null then
    perform public.refresh_membership_payment_summary(old.membership_id);
  end if;

  if new.membership_id is not null then
    perform public.refresh_membership_payment_summary(new.membership_id);
  end if;

  return new;
end;
$payment_summary_trigger$;

drop trigger if exists trg_sync_payment_membership_summary on public.payments;
create trigger trg_sync_payment_membership_summary
after insert or update of membership_id, obligation_id, amount, paid_at, notes, status, voided_at
on public.payments
for each row
execute function public.sync_payment_membership_summary_trigger();

revoke all on function public.sync_payment_membership_summary_trigger()
  from public, anon, authenticated;
grant execute on function public.sync_payment_membership_summary_trigger()
  to service_role;

create or replace function public.admin_register_payment(
  p_payment_id uuid,
  p_user_id uuid,
  p_membership_id uuid,
  p_obligation_id uuid,
  p_amount numeric,
  p_concept text,
  p_notes text,
  p_period_label text,
  p_payment_method text,
  p_paid_at timestamptz
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.payments%rowtype;
  v_payment public.payments%rowtype;
  v_actor uuid := auth.uid();
  v_concept text := coalesce(nullif(btrim(coalesce(p_concept, '')), ''), 'Pago manual');
  v_method text := coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), 'manual');
begin
  if not public.is_admin() then
    raise exception 'Solo administracion puede registrar pagos.';
  end if;

  if p_payment_id is null then
    raise exception 'Falta el identificador idempotente del pago.';
  end if;

  if p_user_id is null then
    raise exception 'Falta el cliente del pago.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero.';
  end if;

  select *
    into v_existing
  from public.payments p
  where p.id = p_payment_id
  limit 1;

  if found then
    if v_existing.user_id is distinct from p_user_id
       or v_existing.membership_id is distinct from p_membership_id
       or v_existing.obligation_id is distinct from p_obligation_id
       or v_existing.amount is distinct from p_amount
       or coalesce(v_existing.concept, '') is distinct from v_concept
       or coalesce(v_existing.payment_method, '') is distinct from v_method
       or coalesce(v_existing.notes, '') is distinct from coalesce(nullif(btrim(coalesce(p_notes, '')), ''), '')
       or coalesce(v_existing.period_label, '') is distinct from coalesce(nullif(btrim(coalesce(p_period_label, '')), ''), '') then
      raise exception 'El identificador idempotente ya fue usado con datos distintos.';
    end if;
    return v_existing;
  end if;

  if p_membership_id is not null and not exists (
    select 1
    from public.memberships m
    where m.id = p_membership_id
      and m.user_id = p_user_id
  ) then
    raise exception 'La membresia no pertenece al cliente.';
  end if;

  if p_obligation_id is not null and not exists (
    select 1
    from public.payment_obligations o
    where o.id = p_obligation_id
      and o.user_id = p_user_id
      and o.cancelled_at is null
      and (
        p_membership_id is null
        or o.membership_id = p_membership_id
      )
  ) then
    raise exception 'La obligacion no pertenece al cliente o a la membresia indicada.';
  end if;

  begin
    insert into public.payments (
      id,
      user_id,
      membership_id,
      obligation_id,
      amount,
      concept,
      status,
      payment_method,
      paid_at,
      registered_by,
      notes,
      period_label
    ) values (
      p_payment_id,
      p_user_id,
      p_membership_id,
      p_obligation_id,
      p_amount,
      v_concept,
      'paid',
      v_method,
      coalesce(p_paid_at, now()),
      v_actor,
      nullif(btrim(coalesce(p_notes, '')), ''),
      nullif(btrim(coalesce(p_period_label, '')), '')
    )
    returning * into v_payment;
  exception
    when unique_violation then
      select *
        into v_payment
      from public.payments p
      where p.id = p_payment_id
      limit 1;

      if not found
         or v_payment.user_id is distinct from p_user_id
         or v_payment.membership_id is distinct from p_membership_id
         or v_payment.obligation_id is distinct from p_obligation_id
         or v_payment.amount is distinct from p_amount
         or coalesce(v_payment.concept, '') is distinct from v_concept
         or coalesce(v_payment.payment_method, '') is distinct from v_method then
        raise exception 'El identificador idempotente ya fue usado con datos distintos.';
      end if;
  end;

  -- The payments trigger refreshes the membership summary in this same transaction.
  return v_payment;
end;
$$;

revoke all on function public.admin_register_payment(
  uuid, uuid, uuid, uuid, numeric, text, text, text, text, timestamptz
) from public, anon;

grant execute on function public.admin_register_payment(
  uuid, uuid, uuid, uuid, numeric, text, text, text, text, timestamptz
) to authenticated, service_role;
