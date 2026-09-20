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
  where id = new.obligation_id;

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
