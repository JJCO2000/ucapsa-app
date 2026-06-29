import { supabase } from '../lib/supabase';
import type {
  Membership,
  MembershipPaymentStatus,
  MembershipStatus,
  Payment,
  Profile,
} from '../types/app.types';
import { registerMembershipPayment } from './payments.service';

export type MembershipAdminRow = {
  membership: Membership;
  profile: Profile | null;
  payments: Payment[];
};

function createQrToken(userId: string) {
  const random = Math.random().toString(36).slice(2, 12);
  return `ucapsa_${userId}_${Date.now()}_${random}`;
}

export function getDisplayName(profile: Profile | null | undefined) {
  return profile?.full_name?.trim() || profile?.email?.trim() || 'Usuario';
}

export function getMembershipStatusLabel(status: MembershipStatus) {
  const labels: Record<MembershipStatus, string> = {
    none: 'Sin membresÃ­a',
    pending: 'Pendiente',
    active: 'Activo',
    expired: 'Vencido',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
  };

  return labels[status] ?? status;
}

export function getPaymentStatusLabel(status: MembershipPaymentStatus | null | undefined) {
  const labels: Record<MembershipPaymentStatus, string> = {
    
    none: 'Sin pago',pending: 'Pendiente',
    paid: 'Pagado',
    not_required: 'No aplica',
    overdue: 'Pago vencido',
  };

  return status ? labels[status] ?? status : 'Sin registro';
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function isMembershipDateExpired(membership: Membership | null | undefined) {
  if (!membership?.end_date) return false;
  const end = new Date(membership.end_date);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
}

export async function getMyMembership(): Promise<Membership | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as Membership | null) ?? null;
}

export async function requestMembership(): Promise<Membership> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesiÃ³n activa.');

  const existing = await getMyMembership();
  if (existing && ['pending', 'active'].includes(existing.status)) {
    return existing;
  }

  const { data, error } = await supabase
    .from('memberships')
    .insert({
      user_id: userId,
      status: 'pending',
      qr_token: createQrToken(userId),
      current_payment_status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Membership;
}

export async function getAdminMembershipRows(): Promise<MembershipAdminRow[]> {
  const { data: membershipsData, error: membershipsError } = await supabase
    .from('memberships')
    .select('*')
    .order('created_at', { ascending: false });

  if (membershipsError) throw membershipsError;

  const memberships = (membershipsData ?? []) as Membership[];
  if (memberships.length === 0) return [];

  const userIds = [...new Set(memberships.map((item) => item.user_id))];
  const membershipIds = memberships.map((item) => item.id);

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', userIds);

  if (profilesError) throw profilesError;

  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .in('membership_id', membershipIds)
    .order('paid_at', { ascending: false });

  if (paymentsError) throw paymentsError;

  const profiles = ((profilesData ?? []) as Profile[]).reduce<Record<string, Profile>>((acc, profile) => {
    acc[profile.user_id] = profile;
    return acc;
  }, {});

  const paymentsByMembership = ((paymentsData ?? []) as Payment[]).reduce<Record<string, Payment[]>>((acc, payment) => {
    if (!payment.membership_id) return acc;
    acc[payment.membership_id] = acc[payment.membership_id] ?? [];
    acc[payment.membership_id].push(payment);
    return acc;
  }, {});

  return memberships.map((membership) => ({
    membership,
    profile: profiles[membership.user_id] ?? null,
    payments: paymentsByMembership[membership.id] ?? [],
  }));
}

export async function updateMembershipStatus(
  membership: Membership,
  status: MembershipStatus,
  options?: {
    memberNumber?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    paymentNotes?: string | null;
  },
): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const now = new Date().toISOString();
  const payload: Record<string, string | null> = {
    status,
    updated_at: now,
  };

  if (options && 'memberNumber' in options) payload.member_number = options.memberNumber?.trim() || null;
  if (options && 'startDate' in options) payload.start_date = options.startDate || null;
  if (options && 'endDate' in options) payload.end_date = options.endDate || null;
  if (options && 'paymentNotes' in options) payload.payment_notes = options.paymentNotes?.trim() || null;
  if (status === 'active') payload.approved_by = authData.user?.id ?? null;

  const { error } = await supabase
    .from('memberships')
    .update(payload)
    .eq('id', membership.id);

  if (error) throw error;

  const nextRole = status === 'active' ? 'member' : 'client';
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: nextRole, updated_at: now })
    .eq('user_id', membership.user_id)
    .not('role', 'in', '(admin,super_admin)');

  if (profileError) throw profileError;
}

export async function updateMembershipPaymentStatus(
  membershipId: string,
  paymentStatus: MembershipPaymentStatus,
  notes?: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('memberships')
    .update({
      current_payment_status: paymentStatus,
      last_payment_at: paymentStatus === 'paid' ? now : null,
      payment_notes: notes?.trim() || null,
      updated_at: now,
    })
    .eq('id', membershipId);

  if (error) throw error;
}

export async function markMembershipPaidFast(row: MembershipAdminRow): Promise<void> {
  await registerMembershipPayment({
    userId: row.membership.user_id,
    membershipId: row.membership.id,
    amount: 0,
    notes: 'Pago registrado rÃ¡pido desde tabla de socios.',
    periodLabel: 'Mensualidad',
    paymentMethod: 'manual',
  });
}


