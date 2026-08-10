import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import type { MyPaymentOverview, Payment, PaymentObligation, PaymentObligationWithBalance, PaymentSettings } from '../types/app.types';

export type RegisterCustomerPaymentInput = {
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

export async function getPaymentsByMembershipId(membershipId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('membership_id', membershipId)
    .order('paid_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Payment[];
}

export async function syncMembershipPaymentSummary(membershipId: string): Promise<void> {
  const [obligationsResult, paymentsResult] = await Promise.all([
    supabase
      .from('payment_obligations')
      .select('id, amount')
      .eq('membership_id', membershipId)
      .eq('obligation_type', 'membership')
      .is('cancelled_at', null),
    supabase
      .from('payments')
      .select('id, obligation_id, amount, paid_at, notes, status')
      .eq('membership_id', membershipId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false }),
  ]);

  if (obligationsResult.error) throw obligationsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const payments = paymentsResult.data ?? [];
  const paidByObligation = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.obligation_id) continue;
    paidByObligation.set(payment.obligation_id, (paidByObligation.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
  }

  const obligations = obligationsResult.data ?? [];
  const hasOutstanding = obligations.some((obligation) => Number(obligation.amount ?? 0) - (paidByObligation.get(obligation.id) ?? 0) > 0.005);
  const latest = payments[0] ?? null;
  const currentPaymentStatus = obligations.length > 0 ? (hasOutstanding ? 'pending' : 'paid') : (latest ? 'paid' : 'pending');

  const { error } = await supabase
    .from('memberships')
    .update({
      current_payment_status: currentPaymentStatus,
      last_payment_at: latest?.paid_at ?? null,
      payment_notes: latest?.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', membershipId);

  if (error) throw error;
}

export async function registerCustomerPayment(input: RegisterCustomerPaymentInput): Promise<Payment> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: input.userId,
      membership_id: input.membershipId ?? null,
      obligation_id: input.obligationId ?? null,
      amount: Number.isFinite(input.amount) ? input.amount : 0,
      concept: input.concept.trim() || 'Pago manual',
      status: 'paid',
      payment_method: input.paymentMethod?.trim() || 'manual',
      paid_at: input.paidAt || new Date().toISOString(),
      registered_by: authData.user?.id ?? null,
      notes: input.notes?.trim() || null,
      period_label: input.periodLabel?.trim() || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  if (input.membershipId) await syncMembershipPaymentSummary(input.membershipId);
  return data as Payment;
}

export async function registerMembershipPayment(input: RegisterMembershipPaymentInput): Promise<Payment> {
  return registerCustomerPayment({
    userId: input.userId,
    membershipId: input.membershipId,
    obligationId: input.obligationId,
    amount: Number.isFinite(input.amount ?? 0) ? input.amount ?? 0 : 0,
    concept: 'Mensualidad de socio',
    notes: input.notes,
    periodLabel: input.periodLabel,
    paymentMethod: input.paymentMethod,
    paidAt: input.paidAt,
  });
}

export async function updateCustomerPayment(paymentId: string, input: UpdateCustomerPaymentInput): Promise<Payment> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('amount' in input) payload.amount = Number.isFinite(input.amount ?? 0) ? input.amount ?? 0 : 0;
  if ('notes' in input) payload.notes = input.notes?.trim() || null;
  if ('periodLabel' in input) payload.period_label = input.periodLabel?.trim() || null;
  if ('paymentMethod' in input) payload.payment_method = input.paymentMethod?.trim() || 'manual';
  if ('obligationId' in input) payload.obligation_id = input.obligationId || null;
  if ('paidAt' in input) payload.paid_at = input.paidAt || new Date().toISOString();
  if ('concept' in input) payload.concept = input.concept?.trim() || 'Pago manual';

  const { data, error } = await supabase.from('payments').update(payload as TableUpdate<'payments'>).eq('id', paymentId).select('*').single();
  if (error) throw error;
  const payment = data as Payment;
  if (payment.membership_id) await syncMembershipPaymentSummary(payment.membership_id);
  return payment;
}

export async function updateMembershipPayment(paymentId: string, membershipId: string, input: UpdateCustomerPaymentInput): Promise<Payment> {
  const { data: current, error: currentError } = await supabase
    .from('payments')
    .select('id, membership_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current || current.membership_id !== membershipId) throw new Error('El pago no pertenece a la membresia esperada.');
  return updateCustomerPayment(paymentId, input);
}

export async function deleteCustomerPayment(paymentId: string): Promise<void> {
  const { data: current, error: currentError } = await supabase.from('payments').select('id, membership_id').eq('id', paymentId).maybeSingle();
  if (currentError) throw currentError;

  const { error } = await supabase.from('payments').delete().eq('id', paymentId);
  if (error) throw error;
  if (current?.membership_id) await syncMembershipPaymentSummary(current.membership_id);
}

export async function deleteMembershipPayment(paymentId: string, membershipId: string): Promise<void> {
  const { data: current, error: currentError } = await supabase.from('payments').select('id, membership_id').eq('id', paymentId).maybeSingle();
  if (currentError) throw currentError;
  if (current?.membership_id && current.membership_id !== membershipId) throw new Error('El pago no pertenece a la membresia esperada.');
  await deleteCustomerPayment(paymentId);
}


export type UpdatePaymentSettingsInput = {
  bankName?: string | null;
  accountHolder?: string | null;
  clabe?: string | null;
  transferInstructions?: string | null;
  clipUrl?: string | null;
  isActive?: boolean;
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function getPaymentSettings(): Promise<PaymentSettings | null> {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  return (data as PaymentSettings | null) ?? null;
}

export async function updatePaymentSettings(input: UpdatePaymentSettingsInput): Promise<PaymentSettings> {
  const clabe = input.clabe?.replace(/\D/g, '') || null;
  const clipUrl = input.clipUrl?.trim() || null;
  if (clabe && clabe.length !== 18) throw new Error('La CLABE debe tener exactamente 18 digitos.');
  if (clipUrl && !/^https?:\/\//i.test(clipUrl)) throw new Error('El enlace de pago debe comenzar con http:// o https://.');

  const payload: Record<string, unknown> = {};
  if ('bankName' in input) payload.bank_name = input.bankName?.trim() || null;
  if ('accountHolder' in input) payload.account_holder = input.accountHolder?.trim() || null;
  if ('clabe' in input) payload.clabe = clabe;
  if ('transferInstructions' in input) payload.transfer_instructions = input.transferInstructions?.trim() || null;
  if ('clipUrl' in input) payload.clip_url = clipUrl;
  if ('isActive' in input) payload.is_active = Boolean(input.isActive);

  const { data, error } = await supabase
    .from('payment_settings')
    .update(payload as TableUpdate<'payment_settings'>)
    .eq('id', 1)
    .select('*')
    .single();

  if (error) throw error;
  return data as PaymentSettings;
}

export async function getMyPaymentOverview(): Promise<MyPaymentOverview> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) {
    return { obligations: [], payments: [], outstanding_total: 0, attention_total: 0, future_total: 0, overdue_count: 0, legacy_membership_pending: false };
  }

  const [obligationsResult, paymentsResult, membershipResult] = await Promise.all([
    supabase
      .from('payment_obligations')
      .select('*')
      .eq('user_id', userId)
      .is('cancelled_at', null)
      .order('due_date', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false }),
    supabase
      .from('memberships')
      .select('current_payment_status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (obligationsResult.error) throw obligationsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const payments = (paymentsResult.data ?? []) as Payment[];
  const paidByObligation = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.obligation_id) continue;
    paidByObligation.set(payment.obligation_id, (paidByObligation.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
  }

  const today = localDateKey();
  const obligations = ((obligationsResult.data ?? []) as PaymentObligation[]).map((obligation) => {
    const amount = Number(obligation.amount ?? 0);
    const paidAmount = Math.max(0, paidByObligation.get(obligation.id) ?? 0);
    const remaining = Math.max(0, amount - paidAmount);
    const displayStatus: PaymentObligationWithBalance['display_status'] = remaining <= 0.005
      ? 'paid'
      : obligation.due_date < today
        ? 'overdue'
        : paidAmount > 0.005
          ? 'partial'
          : obligation.due_date > today
            ? 'future'
            : 'pending';

    return {
      ...obligation,
      amount,
      paid_amount: paidAmount,
      remaining_amount: remaining,
      display_status: displayStatus,
    };
  });

  const statusPriority: Record<PaymentObligationWithBalance['display_status'], number> = {
    overdue: 0,
    pending: 1,
    partial: 2,
    future: 3,
    paid: 4,
  };
  const openObligations = obligations
    .filter((item) => item.remaining_amount > 0.005)
    .sort((a, b) => statusPriority[a.display_status] - statusPriority[b.display_status] || a.due_date.localeCompare(b.due_date));
  const attentionObligations = openObligations.filter((item) => item.display_status !== 'future');
  const futureObligations = openObligations.filter((item) => item.display_status === 'future');

  return {
    obligations: openObligations,
    payments,
    outstanding_total: openObligations.reduce((total, item) => total + item.remaining_amount, 0),
    attention_total: attentionObligations.reduce((total, item) => total + item.remaining_amount, 0),
    future_total: futureObligations.reduce((total, item) => total + item.remaining_amount, 0),
    overdue_count: openObligations.filter((item) => item.display_status === 'overdue').length,
    legacy_membership_pending: membershipResult.data?.current_payment_status === 'pending' && openObligations.length === 0,
  };
}
