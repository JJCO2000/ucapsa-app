-- UCAPSA — canonical RPC-only write boundaries for historical events.
--
-- Historical facts must not be writable through generic PostgREST table
-- mutations when canonical RPCs already enforce idempotency, temporal rules
-- and audit evidence.
--
-- This migration:
-- 1) makes admin_audit_logs append-only through trusted SECURITY DEFINER code;
-- 2) forces Practice writes through register_my_practice_session();
-- 3) forces Attendance writes through the canonical Admin/QR RPCs;
-- 4) forces Payment registration/correction/void through canonical RPCs.

-- Audit evidence must not be forgeable by an authenticated Admin client.
revoke insert on table public.admin_audit_logs from authenticated;
drop policy if exists "audit_logs_admin_insert" on public.admin_audit_logs;

-- Practice history is written only by register_my_practice_session().
revoke insert on table public.practice_sessions from authenticated;
grant select on table public.practice_sessions to authenticated;
drop policy if exists "practice_sessions_own_insert" on public.practice_sessions;

-- Attendance history is written/corrected/deleted only by canonical RPCs.
revoke insert, update, delete on table public.program_attendances from authenticated;
grant select on table public.program_attendances to authenticated;
drop policy if exists "program_attendances_admin_insert" on public.program_attendances;
drop policy if exists "program_attendances_admin_update" on public.program_attendances;
drop policy if exists "program_attendances_admin_delete" on public.program_attendances;

-- Payment history is registered/corrected/voided only by canonical RPCs.
revoke insert, update, delete on table public.payments from authenticated;
grant select on table public.payments to authenticated;
drop policy if exists "payments_admin_insert" on public.payments;
drop policy if exists "payments_admin_update" on public.payments;

create or replace function public.admin_correct_payment(
  p_payment_id uuid,
  p_patch jsonb
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.payments%rowtype;
  v_after public.payments%rowtype;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_amount numeric;
  v_obligation_id uuid;
  v_paid_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden corregir pagos.';
  end if;

  if p_payment_id is null then
    raise exception 'Falta el pago a corregir.';
  end if;

  if jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'La correccion del pago debe ser un objeto JSON.';
  end if;

  if v_patch = '{}'::jsonb then
    raise exception 'No hay cambios que aplicar al pago.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_patch) as key_name
    where key_name not in (
      'amount',
      'notes',
      'period_label',
      'payment_method',
      'obligation_id',
      'paid_at',
      'concept'
    )
  ) then
    raise exception 'La correccion contiene campos no permitidos.';
  end if;

  select *
    into v_before
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if v_before.voided_at is not null then
    raise exception 'El pago ya esta anulado y no puede corregirse.';
  end if;

  if v_patch ? 'amount' then
    if v_patch -> 'amount' is null or jsonb_typeof(v_patch -> 'amount') = 'null' then
      raise exception 'El monto del pago es obligatorio.';
    end if;
    v_amount := (v_patch ->> 'amount')::numeric;
    if v_amount <= 0 then
      raise exception 'El monto del pago debe ser mayor a cero.';
    end if;
  else
    v_amount := v_before.amount;
  end if;

  if v_patch ? 'obligation_id' then
    if jsonb_typeof(v_patch -> 'obligation_id') = 'null' then
      v_obligation_id := null;
    else
      v_obligation_id := nullif(btrim(v_patch ->> 'obligation_id'), '')::uuid;
    end if;
  else
    v_obligation_id := v_before.obligation_id;
  end if;

  if v_patch ? 'paid_at' then
    if jsonb_typeof(v_patch -> 'paid_at') = 'null' then
      v_paid_at := null;
    else
      v_paid_at := nullif(btrim(v_patch ->> 'paid_at'), '')::timestamptz;
    end if;
  else
    v_paid_at := v_before.paid_at;
  end if;

  update public.payments
  set amount = v_amount,
      notes = case
        when v_patch ? 'notes' then nullif(btrim(v_patch ->> 'notes'), '')
        else notes
      end,
      period_label = case
        when v_patch ? 'period_label' then nullif(btrim(v_patch ->> 'period_label'), '')
        else period_label
      end,
      payment_method = case
        when v_patch ? 'payment_method'
          then coalesce(nullif(btrim(v_patch ->> 'payment_method'), ''), 'manual')
        else payment_method
      end,
      obligation_id = v_obligation_id,
      paid_at = v_paid_at,
      concept = case
        when v_patch ? 'concept'
          then coalesce(nullif(btrim(v_patch ->> 'concept'), ''), 'Pago manual')
        else concept
      end,
      updated_at = now()
  where id = p_payment_id
  returning * into v_after;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'payment.correct',
    'payment',
    v_after.id,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after', to_jsonb(v_after)
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_correct_payment(uuid, jsonb)
  from public, anon;
grant execute on function public.admin_correct_payment(uuid, jsonb)
  to authenticated, service_role;

-- Keep trusted backend maintenance explicit.
grant select, insert, update, delete on table public.practice_sessions to service_role;
grant select, insert, update, delete on table public.program_attendances to service_role;
grant select, insert, update, delete on table public.payments to service_role;
grant select, insert on table public.admin_audit_logs to service_role;
