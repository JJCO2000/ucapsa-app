-- Preserve payment evidence while allowing operational corrections.
--
-- A payment is never physically deleted by normal Admin flows. Instead it can
-- be voided with actor/time/reason and excluded from effective balances.

alter table public.payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text;

comment on column public.payments.voided_at is
  'When set, this payment is historical evidence only and must not count toward balances.';

comment on column public.payments.voided_by is
  'Admin user that voided the payment.';

comment on column public.payments.void_reason is
  'Reason recorded when the payment was voided.';
