import { supabase } from '../lib/supabase';
import { getAdminMembershipRows } from './memberships.service';
import { getAdminProgramRows } from './programs.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../utils/async.utils';

export type AdminDashboardStats = {
  clients: number;
  activePrograms: number;
  pendingRequests: number;
  paymentAttention: number;
};

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const [profilesResult, memberships, programs, obligationsResult, paymentsResult] = await withOperationTimeout(Promise.all([
    supabase.from('profiles').select('user_id, role'),
    getAdminMembershipRows(),
    getAdminProgramRows(),
    supabase.from('payment_obligations').select('id, user_id, amount, due_date, cancelled_at').is('cancelled_at', null),
    supabase.from('payments').select('obligation_id, amount, status').eq('status', 'paid').not('obligation_id', 'is', null),
  ]), DEFAULT_READ_TIMEOUT_MS, 'admin-dashboard-load');

  if (profilesResult.error) throw profilesResult.error;
  if (obligationsResult.error) throw obligationsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const paidByObligation = new Map<string, number>();
  for (const payment of paymentsResult.data ?? []) {
    if (!payment.obligation_id) continue;
    paidByObligation.set(payment.obligation_id, (paidByObligation.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
  }

  const attentionUsers = new Set<string>();
  for (const obligation of obligationsResult.data ?? []) {
    const amount = Number(obligation.amount ?? 0);
    const paid = paidByObligation.get(obligation.id) ?? 0;
    if (amount - paid > 0.005 && obligation.user_id) attentionUsers.add(obligation.user_id);
  }
  for (const row of memberships) {
    if (row.membership.current_payment_status === 'pending') attentionUsers.add(row.membership.user_id);
  }

  return {
    clients: (profilesResult.data ?? []).filter((item: { role: string }) => item.role === 'client' || item.role === 'member').length,
    activePrograms: programs.filter((item) => item.enrollment.status === 'active').length,
    pendingRequests: memberships.filter((item) => item.membership.status === 'pending').length,
    paymentAttention: attentionUsers.size,
  };
}
