import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import type { Payment } from '../types/app.types';

export type AdminPaymentAttentionRow = {
  userId: string;
  balance: number;
  overdue: boolean;
  partial: boolean;
  obligations: number;
};

export type RegisterCustomerPaymentInput = {
  paymentId: string;
  userId: string;
  membershipId?: string | null;
  obligationId?: string | null;
  amount: number;
  concept: string;
  notes?: string | null;
  periodLabel?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
};

export type RegisterMembershipPaymentInput = {
  userId: string;
  membershipId: string;
  amount?: number;
  notes?: string | null;
  periodLabel?: string | null;
  paymentMethod?: string | null;
  obligationId?: string | null;
  paidAt?: string | null;
};

export type UpdateCustomerPaymentInput = {
  amount?: number;
  notes?: string | null;
  periodLabel?: string | null;
  paymentMethod?: string | null;
  obligationId?: string | null;
  paidAt?: string | null;
  concept?: string;
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function getAdminPaymentAttentionRows(): Promise<AdminPaymentAttentionRow[]> {
  const [obligationsResult, paymentsResult] = await Promise.all([
    supabase
      .from('payment_obligations')
      .select('id, user_id, due_date, amount')
      .is('cancelled_at', null),
    supabase
      .from('payments')
      .select('obligation_id, amount')
      .eq('status', 'paid')
      .is('voided_at', null)
      .not('obligation_id', 'is', null),
  ]);

  if (obligationsResult.error) throw obligationsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const paidByObligation = new Map<string, number>();
  for (const payment of paymentsResult.data ?? []) {
    if (!payment.obligation_id) continue;
    paidByObligation.set(
      payment.obligation_id,
      (paidByObligation.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0),
    );
  }

  const today = localDateKey();
  const byUser = new Map<string, AdminPaymentAttentionRow>();
  for (const obligation of obligationsResult.data ?? []) {
    const amount = Number(obligation.amount ?? 0);
    const paid = paidByObligation.get(obligation.id) ?? 0;
    const balance = Math.max(0, amount - paid);
    if (balance <= 0.005 || !obligation.user_id) continue;

    const current = byUser.get(obligation.user_id) ?? {
      userId: obligation.user_id,
      balance: 0,
      overdue: false,
      partial: false,
      obligations: 0,
    };
    current.balance += balance;
    current.overdue = current.overdue || obligation.due_date < today;
    current.partial = current.partial || paid > 0.005;
    current.obligations += 1;
    byUser.set(obligation.user_id, current);
  }

  return [...byUser.values()];
}

export async function getPaymentsByMembershipId(membershipId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('membership_id', membershipId)
    .order('paid_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Payment[];
}

export async function registerCustomerPayment(
  input: RegisterCustomerPaymentInput,
): Promise<Payment> {
  if (!input.paymentId.trim()) {
    throw new Error('Falta el identificador idempotente del intento de pago.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto del pago debe ser mayor a cero.');
  }

  const { data, error } = await supabase.rpc('admin_register_payment', {
    p_payment_id: input.paymentId,
    p_user_id: input.userId,
    p_membership_id: input.membershipId ?? null,
    p_obligation_id: input.obligationId ?? null,
    p_amount: input.amount,
    p_concept: input.concept.trim() || 'Pago manual',
    p_notes: input.notes?.trim() || null,
    p_period_label: input.periodLabel?.trim() || null,
    p_payment_method: input.paymentMethod?.trim() || 'manual',
    p_paid_at: input.paidAt || null,
  });

  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvió el pago registrado.');
  return data as Payment;
}

export async function updateCustomerPayment(
  paymentId: string,
  input: UpdateCustomerPaymentInput,
): Promise<Payment> {
  if ('amount' in input && (!Number.isFinite(input.amount) || (input.amount ?? 0) <= 0)) {
    throw new Error('El monto del pago debe ser mayor a cero.');
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('amount' in input) payload.amount = input.amount;
  if ('notes' in input) payload.notes = input.notes?.trim() || null;
  if ('periodLabel' in input) payload.period_label = input.periodLabel?.trim() || null;
  if ('paymentMethod' in input) payload.payment_method = input.paymentMethod?.trim() || 'manual';
  if ('obligationId' in input) payload.obligation_id = input.obligationId || null;
  if ('paidAt' in input) payload.paid_at = input.paidAt || new Date().toISOString();
  if ('concept' in input) payload.concept = input.concept?.trim() || 'Pago manual';

  const { data, error } = await supabase
    .from('payments')
    .update(payload as TableUpdate<'payments'>)
    .eq('id', paymentId)
    .is('voided_at', null)
    .select('*')
    .single();

  if (error) throw error;
  return data as Payment;
}

export async function updateMembershipPayment(
  paymentId: string,
  membershipId: string,
  input: UpdateCustomerPaymentInput,
): Promise<Payment> {
  const { data: current, error: currentError } = await supabase
    .from('payments')
    .select('id, membership_id, voided_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current || current.membership_id !== membershipId) {
    throw new Error('El pago no pertenece a la membresia esperada.');
  }
  if (current.voided_at) throw new Error('El pago ya está anulado y no puede corregirse.');

  return updateCustomerPayment(paymentId, input);
}

export async function voidCustomerPayment(paymentId: string, reason: string): Promise<Payment> {
  const cleanReason = reason.trim();
  if (cleanReason.length < 5) {
    throw new Error('Escribe un motivo de anulación de al menos 5 caracteres.');
  }

  const { data, error } = await supabase.rpc('admin_void_payment', {
    p_payment_id: paymentId,
    p_reason: cleanReason,
  });

  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvió el pago anulado.');

  return data as Payment;
}

export async function voidMembershipPayment(
  paymentId: string,
  membershipId: string,
  reason: string,
): Promise<Payment> {
  const { data: current, error: currentError } = await supabase
    .from('payments')
    .select('id, membership_id, voided_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current || current.membership_id !== membershipId) {
    throw new Error('El pago no pertenece a la membresia esperada.');
  }
  if (current.voided_at) return current as Payment;

  return voidCustomerPayment(paymentId, reason);
}
