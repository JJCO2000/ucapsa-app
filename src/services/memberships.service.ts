import { supabase } from '../lib/supabase';
import type {
  Membership,
  MembershipDeleteRequest,
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

export type MembershipDeleteRequestRow = {
  request: MembershipDeleteRequest;
  membership: Membership | null;
  profile: Profile | null;
};

export type UpdateMembershipDetailsInput = {
  memberNumber?: string | null;
  status?: MembershipStatus;
  currentPaymentStatus?: MembershipPaymentStatus | null;
  lastPaymentAt?: string | null;
  endDate?: string | null;
  paymentNotes?: string | null;
};

function createQrToken() {
  const randomA = Math.random().toString(36).slice(2, 12);
  const randomB = Math.random().toString(36).slice(2, 12);
  return `ucapsa_${Date.now()}_${randomA}${randomB}`;
}

export function getDisplayName(profile: Profile | null | undefined) {
  return profile?.full_name?.trim() || profile?.email?.trim() || 'Usuario';
}

export function getMembershipStatusLabel(status: MembershipStatus) {
  const labels: Record<MembershipStatus, string> = {
    none: 'Sin membresía',
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
    none: 'Sin pago',
    pending: 'Pendiente',
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

function dateKeyToIso(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00.000Z`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function syncProfileRoleForMembership(membership: Membership, status: MembershipStatus) {
  const now = new Date().toISOString();
  const nextRole = status === 'active' ? 'member' : 'client';
  const { error } = await supabase
    .from('profiles')
    .update({ role: nextRole, updated_at: now })
    .eq('user_id', membership.user_id)
    .not('role', 'in', '(admin,super_admin)');

  if (error) throw error;
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
  if (!userId) throw new Error('No hay sesión activa.');

  const existing = await getMyMembership();
  if (existing && ['pending', 'active'].includes(existing.status)) return existing;

  const { data, error } = await supabase
    .from('memberships')
    .insert({
      user_id: userId,
      status: 'pending',
      qr_token: createQrToken(),
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
  const payload: Record<string, string | null> = { status, updated_at: now };

  if (options && 'memberNumber' in options) payload.member_number = options.memberNumber?.trim() || null;
  if (options && 'startDate' in options) payload.start_date = options.startDate || null;
  if (options && 'endDate' in options) payload.end_date = options.endDate || null;
  if (options && 'paymentNotes' in options) payload.payment_notes = options.paymentNotes?.trim() || null;
  if (status === 'active') payload.approved_by = authData.user?.id ?? null;

  const { error } = await supabase.from('memberships').update(payload).eq('id', membership.id);
  if (error) throw error;

  await syncProfileRoleForMembership(membership, status);
}

export async function updateMembershipDetails(membership: Membership, input: UpdateMembershipDetailsInput): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, string | null> = { updated_at: now };

  if ('memberNumber' in input) payload.member_number = input.memberNumber?.trim() || null;
  if ('status' in input && input.status) payload.status = input.status;
  if ('currentPaymentStatus' in input) payload.current_payment_status = input.currentPaymentStatus || 'pending';
  if ('lastPaymentAt' in input) payload.last_payment_at = dateKeyToIso(input.lastPaymentAt);
  if ('endDate' in input) payload.end_date = dateKeyToIso(input.endDate);
  if ('paymentNotes' in input) payload.payment_notes = input.paymentNotes?.trim() || null;

  const { error } = await supabase.from('memberships').update(payload).eq('id', membership.id);
  if (error) throw error;

  if (input.status) await syncProfileRoleForMembership(membership, input.status);
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
    notes: 'Pago registrado rápido desde tabla de socios.',
    periodLabel: 'Mensualidad',
    paymentMethod: 'manual',
  });
}

export async function requestPermanentMembershipDeletion(row: MembershipAdminRow, reason?: string | null): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const now = new Date().toISOString();

  const { error: requestError } = await supabase.from('membership_delete_requests').insert({
    membership_id: row.membership.id,
    user_id: row.membership.user_id,
    requested_by: authData.user?.id ?? null,
    status: 'pending',
    reason: reason?.trim() || 'Solicitud de eliminación definitiva desde ficha de socio.',
    snapshot_member_number: row.membership.member_number,
    snapshot_name: getDisplayName(row.profile),
    snapshot_email: row.profile?.email ?? null,
  });

  if (requestError) throw requestError;

  const { error: membershipError } = await supabase
    .from('memberships')
    .update({
      status: 'cancelled',
      current_payment_status: 'not_required',
      payment_notes: 'Desactivado mientras super_admin revisa eliminación definitiva.',
      updated_at: now,
    })
    .eq('id', row.membership.id);

  if (membershipError) throw membershipError;
  await syncProfileRoleForMembership(row.membership, 'cancelled');
}

export async function getMembershipDeleteRequests(): Promise<MembershipDeleteRequestRow[]> {
  const { data: requestsData, error: requestsError } = await supabase
    .from('membership_delete_requests')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  if (requestsError) throw requestsError;

  const requests = (requestsData ?? []) as MembershipDeleteRequest[];
  if (requests.length === 0) return [];

  const membershipIds = [...new Set(requests.map((item) => item.membership_id))];
  const userIds = [...new Set(requests.map((item) => item.user_id))];

  const { data: membershipsData, error: membershipsError } = await supabase
    .from('memberships')
    .select('*')
    .in('id', membershipIds);

  if (membershipsError) throw membershipsError;

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', userIds);

  if (profilesError) throw profilesError;

  const memberships = ((membershipsData ?? []) as Membership[]).reduce<Record<string, Membership>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const profiles = ((profilesData ?? []) as Profile[]).reduce<Record<string, Profile>>((acc, item) => {
    acc[item.user_id] = item;
    return acc;
  }, {});

  return requests.map((request) => ({
    request,
    membership: memberships[request.membership_id] ?? null,
    profile: profiles[request.user_id] ?? null,
  }));
}

export async function approveMembershipDeleteRequest(row: MembershipDeleteRequestRow): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const now = new Date().toISOString();

  const { error: paymentsError } = await supabase.from('payments').delete().eq('membership_id', row.request.membership_id);
  if (paymentsError) throw paymentsError;

  const { error: membershipError } = await supabase.from('memberships').delete().eq('id', row.request.membership_id);
  if (membershipError) throw membershipError;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'client', updated_at: now })
    .eq('user_id', row.request.user_id)
    .not('role', 'in', '(admin,super_admin)');

  if (profileError) throw profileError;

  const { error: requestError } = await supabase
    .from('membership_delete_requests')
    .update({ status: 'approved', resolved_by: authData.user?.id ?? null, resolved_at: now, updated_at: now })
    .eq('id', row.request.id);

  if (requestError) throw requestError;
}

export async function rejectMembershipDeleteRequest(row: MembershipDeleteRequestRow): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('membership_delete_requests')
    .update({ status: 'rejected', resolved_by: authData.user?.id ?? null, resolved_at: now, updated_at: now })
    .eq('id', row.request.id);

  if (error) throw error;
}
