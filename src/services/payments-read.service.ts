import { supabase } from '../lib/supabase';
import type {
  MyPaymentOverview,
  Payment,
  PaymentObligation,
  PaymentObligationWithBalance,
} from '../types/app.types';

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function getMyPaymentOverview(): Promise<MyPaymentOverview> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;

  if (!userId) {
    return {
      obligations: [],
      payments: [],
      outstanding_total: 0,
      attention_total: 0,
      future_total: 0,
      overdue_count: 0,
      legacy_membership_pending: false,
    };
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
      .is('voided_at', null)
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
    paidByObligation.set(
      payment.obligation_id,
      (paidByObligation.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0),
    );
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
    .sort(
      (a, b) =>
        statusPriority[a.display_status] - statusPriority[b.display_status]
        || a.due_date.localeCompare(b.due_date),
    );
  const attentionObligations = openObligations.filter(
    (item) => item.display_status !== 'future',
  );
  const futureObligations = openObligations.filter(
    (item) => item.display_status === 'future',
  );

  return {
    obligations: openObligations,
    payments,
    outstanding_total: openObligations.reduce(
      (total, item) => total + item.remaining_amount,
      0,
    ),
    attention_total: attentionObligations.reduce(
      (total, item) => total + item.remaining_amount,
      0,
    ),
    future_total: futureObligations.reduce(
      (total, item) => total + item.remaining_amount,
      0,
    ),
    overdue_count: openObligations.filter(
      (item) => item.display_status === 'overdue',
    ).length,
    legacy_membership_pending:
      membershipResult.data?.current_payment_status === 'pending'
      && openObligations.length === 0,
  };
}
