-- UCAPSA canonical payment void workflow.
--
-- Payments are financial evidence. Normal Admin operation may void a payment,
-- but must not physically delete it or rewrite it after voiding.

create or replace function public.enforce_payment_void_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context text := current_setting('ucapsa.payment_void_context', true);
begin
  if old.voided_at is not null and new is distinct from old then
    raise exception 'Un pago anulado es inmutable.';
  end if;

  if (
    new.voided_at is distinct from old.voided_at
    or new.voided_by is distinct from old.voided_by
    or new.void_reason is distinct from old.void_reason
  ) and coalesce(v_context, '') <> 'admin_void_payment' then
    raise exception 'La anulación de pagos debe usar el flujo canónico.';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_void_integrity_guard on public.payments;
create trigger payments_void_integrity_guard
before update on public.payments
for each row
execute function public.enforce_payment_void_integrity();

create or replace function public.admin_void_payment(
  p_payment_id uuid,
  p_reason text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Solo administracion puede anular pagos.';
  end if;

  if v_reason is null or length(v_reason) < 5 then
    raise exception 'La anulación requiere un motivo de al menos 5 caracteres.';
  end if;

  select *
    into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if v_payment.voided_at is not null then
    return v_payment;
  end if;

  perform set_config('ucapsa.payment_void_context', 'admin_void_payment', true);

  update public.payments
  set
    voided_at = v_now,
    voided_by = auth.uid(),
    void_reason = v_reason,
    updated_at = v_now
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.admin_void_payment(uuid, text)
  from public, anon;
grant execute on function public.admin_void_payment(uuid, text)
  to authenticated, service_role;

-- Normal client roles can no longer physically delete payment evidence.
drop policy if exists "payments_admin_delete_v2" on public.payments;
revoke delete on table public.payments from authenticated;

-- Trigger helper is internal only.
revoke all on function public.enforce_payment_void_integrity()
  from public, anon, authenticated;
grant execute on function public.enforce_payment_void_integrity()
  to service_role;
