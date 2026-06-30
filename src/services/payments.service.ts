import { supabase } from '../lib/supabase';
import type { Payment } from '../types/app.types';

export type RegisterMembershipPaymentInput = {
  userId: string;
  membershipId: string;
  amount?: number;
  notes?: string | null;
  periodLabel?: string | null;
  paymentMethod?: string | null;
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

export async function registerMembershipPayment(input: RegisterMembershipPaymentInput): Promise<Payment> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const paidAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: input.userId,
      membership_id: input.membershipId,
      amount: Number.isFinite(input.amount ?? 0) ? input.amount ?? 0 : 0,
      concept: 'Mensualidad de socio',
      status: 'paid',
      payment_method: input.paymentMethod || 'manual',
      paid_at: paidAt,
      registered_by: authData.user?.id ?? null,
      notes: input.notes?.trim() || null,
      period_label: input.periodLabel?.trim() || null,
    })
    .select('*')
    .single();

  if (error) throw error;

  const { error: membershipError } = await supabase
    .from('memberships')
    .update({
      current_payment_status: 'paid',
      last_payment_at: paidAt,
      payment_notes: input.notes?.trim() || null,
      updated_at: paidAt,
    })
    .eq('id', input.membershipId);

  if (membershipError) throw membershipError;
  return data as Payment;
}

export async function deleteMembershipPayment(paymentId: string, membershipId: string): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId)
    .eq('membership_id', membershipId);

  if (error) throw error;

  const remaining = await getPaymentsByMembershipId(membershipId);
  const latestPaid = remaining.find((payment) => payment.status === 'paid' && payment.paid_at);
  const now = new Date().toISOString();

  const { error: membershipError } = await supabase
    .from('memberships')
    .update({
      current_payment_status: latestPaid ? 'paid' : 'pending',
      last_payment_at: latestPaid?.paid_at ?? null,
      payment_notes: latestPaid ? latestPaid.notes ?? null : 'Pago eliminado del historial. Pendiente de revision.',
      updated_at: now,
    })
    .eq('id', membershipId);

  if (membershipError) throw membershipError;
}
