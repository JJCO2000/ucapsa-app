-- UCAPSA payment data invariants.
--
-- A payment is evidence of money received, so zero/negative amounts are invalid.
-- Reassigning a payment to a cancelled obligation is also invalid.
-- Existing production rows were checked before this migration: no amount <= 0.

alter table public.payments
  drop constraint if exists payments_amount_non_negative;

alter table public.payments
  add constraint payments_amount_positive
  check (amount > 0);

create or replace function public.validate_payment_obligation_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obligation_user uuid;
  v_obligation_membership uuid;
  v_obligation_cancelled_at timestamptz;
begin
  if new.obligation_id is null then
    return new;
  end if;

  select user_id, membership_id, cancelled_at
    into v_obligation_user, v_obligation_membership, v_obligation_cancelled_at
  from public.payment_obligations
  where id = new.obligation_id
  for share;

  if v_obligation_user is null then
    raise exception 'Obligacion de pago no encontrada.';
  end if;

  if v_obligation_cancelled_at is not null then
    raise exception 'No se puede vincular un pago a una obligacion cancelada.';
  end if;

  if new.user_id is distinct from v_obligation_user then
    raise exception 'El pago y la obligacion pertenecen a usuarios diferentes.';
  end if;

  if new.membership_id is null and v_obligation_membership is not null then
    new.membership_id := v_obligation_membership;
  elsif new.membership_id is not null
    and v_obligation_membership is not null
    and new.membership_id is distinct from v_obligation_membership then
    raise exception 'La membresia del pago no coincide con la obligacion.';
  elsif new.membership_id is not null
    and v_obligation_membership is null then
    raise exception 'La obligacion no pertenece a la membresia indicada.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_payment_obligation_owner()
  from public, anon, authenticated;
grant execute on function public.validate_payment_obligation_owner()
  to service_role;


-- Existing idempotent events are resolved before current obligation-state
-- validation. A later cancellation must not make the same payment UUID stop
-- being idempotent. Only a genuinely new payment requires an active obligation.
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

  -- Resolve an already-created business event before revalidating mutable
  -- obligation state. This is what makes retries stable after later changes.
  select *
    into v_existing
  from public.payments p
  where p.id = p_payment_id
  limit 1;

  if found then
    if p_obligation_id is not null then
      select *
        into v_obligation
      from public.payment_obligations o
      where o.id = p_obligation_id
      limit 1;

      if found then
        if v_obligation.user_id is distinct from p_user_id then
          raise exception 'El identificador idempotente ya fue usado con datos distintos.';
        end if;

        if v_obligation.membership_id is not null then
          if p_membership_id is not null
             and p_membership_id is distinct from v_obligation.membership_id then
            raise exception 'El identificador idempotente ya fue usado con datos distintos.';
          end if;
          v_effective_membership_id := v_obligation.membership_id;
        elsif p_membership_id is not null then
          raise exception 'El identificador idempotente ya fue usado con datos distintos.';
        end if;
      end if;
    end if;

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

  -- New payments must point to a currently active obligation. FOR SHARE keeps
  -- cancellation from racing this validation and the following INSERT.
  if p_obligation_id is not null then
    select *
      into v_obligation
    from public.payment_obligations o
    where o.id = p_obligation_id
      and o.user_id = p_user_id
      and o.cancelled_at is null
    limit 1
    for share;

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

  return v_payment;
end;
$$;

revoke all on function public.admin_register_payment(
  uuid, uuid, uuid, uuid, numeric, text, text, text, text, timestamptz
) from public, anon;

grant execute on function public.admin_register_payment(
  uuid, uuid, uuid, uuid, numeric, text, text, text, text, timestamptz
) to authenticated, service_role;
