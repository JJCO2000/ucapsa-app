-- UCAPSA payment summary SSOT hardening.
--
-- 1) Normalizes the effective membership before idempotency comparison so an
--    obligation-linked payment retries correctly even if the caller omitted
--    membership_id and the ownership trigger derived it.
-- 2) Refreshes the membership payment summary when payment obligations change,
--    not only when payments change.
--
-- No historical rows are deleted or rewritten by this migration.

create or replace function public.sync_obligation_membership_summary_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_obligation_summary_trigger$
begin
  if tg_op = 'DELETE' then
    if old.membership_id is not null then
      perform public.refresh_membership_payment_summary(old.membership_id);
    end if;
    return old;
  end if;

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
$payment_obligation_summary_trigger$;

drop trigger if exists trg_sync_obligation_membership_summary
  on public.payment_obligations;

create trigger trg_sync_obligation_membership_summary
after insert or delete or update of membership_id, amount, obligation_type, cancelled_at
on public.payment_obligations
for each row
execute function public.sync_obligation_membership_summary_trigger();

revoke all on function public.sync_obligation_membership_summary_trigger()
  from public, anon, authenticated;
grant execute on function public.sync_obligation_membership_summary_trigger()
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
  v_obligation public.payment_obligations%rowtype;
  v_actor uuid := auth.uid();
  v_effective_membership_id uuid := p_membership_id;
  v_concept text := coalesce(nullif(btrim(coalesce(p_concept, '')), ''), 'Pago manual');
  v_method text := coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), 'manual');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_period_label text := nullif(btrim(coalesce(p_period_label, '')), '');
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

  if p_obligation_id is not null then
    select *
      into v_obligation
    from public.payment_obligations o
    where o.id = p_obligation_id
      and o.user_id = p_user_id
      and o.cancelled_at is null
    limit 1;

    if not found then
      raise exception 'La obligacion no pertenece al cliente o ya fue cancelada.';
    end if;

    if v_obligation.membership_id is not null then
      if p_membership_id is not null
         and p_membership_id is distinct from v_obligation.membership_id then
        raise exception 'La obligacion no pertenece a la membresia indicada.';
      end if;
      v_effective_membership_id := v_obligation.membership_id;
    elsif p_membership_id is not null then
      raise exception 'La obligacion no pertenece a la membresia indicada.';
    end if;
  end if;

  if v_effective_membership_id is not null and not exists (
    select 1
    from public.memberships m
    where m.id = v_effective_membership_id
      and m.user_id = p_user_id
  ) then
    raise exception 'La membresia no pertenece al cliente.';
  end if;

  select *
    into v_existing
  from public.payments p
  where p.id = p_payment_id
  limit 1;

  if found then
    if v_existing.user_id is distinct from p_user_id
       or v_existing.membership_id is distinct from v_effective_membership_id
       or v_existing.obligation_id is distinct from p_obligation_id
       or v_existing.amount is distinct from p_amount
       or coalesce(v_existing.concept, '') is distinct from v_concept
       or coalesce(v_existing.payment_method, '') is distinct from v_method
       or (p_paid_at is not null and v_existing.paid_at is distinct from p_paid_at)
       or coalesce(v_existing.notes, '') is distinct from coalesce(v_notes, '')
       or coalesce(v_existing.period_label, '') is distinct from coalesce(v_period_label, '') then
      raise exception 'El identificador idempotente ya fue usado con datos distintos.';
    end if;
    return v_existing;
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
      v_effective_membership_id,
      p_obligation_id,
      p_amount,
      v_concept,
      'paid',
      v_method,
      coalesce(p_paid_at, now()),
      v_actor,
      v_notes,
      v_period_label
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
         or v_payment.membership_id is distinct from v_effective_membership_id
         or v_payment.obligation_id is distinct from p_obligation_id
         or v_payment.amount is distinct from p_amount
         or coalesce(v_payment.concept, '') is distinct from v_concept
         or coalesce(v_payment.payment_method, '') is distinct from v_method
         or (p_paid_at is not null and v_payment.paid_at is distinct from p_paid_at)
         or coalesce(v_payment.notes, '') is distinct from coalesce(v_notes, '')
         or coalesce(v_payment.period_label, '') is distinct from coalesce(v_period_label, '') then
        raise exception 'El identificador idempotente ya fue usado con datos distintos.';
      end if;
  end;

  -- Payments trigger refreshes the membership summary in this transaction.
  return v_payment;
end;
$$;

revoke all on function public.admin_register_payment(
  uuid, uuid, uuid, uuid, numeric, text, text, text, text, timestamptz
) from public, anon;

grant execute on function public.admin_register_payment(
  uuid, uuid, uuid, uuid, numeric, text, text, text, text, timestamptz
) to authenticated, service_role;
