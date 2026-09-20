import { PROGRAM_COMPLETION_ACHIEVEMENT_CODES, type ProgramCompletionAchievementCode } from '../constants/programCompletion';
import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import type {
  Membership,
  MembershipPaymentStatus,
  MembershipStatus,
  Payment,
  Profile,
} from '../types/app.types';
import { registerMembershipPayment } from './payments.service';
import { isMembershipActiveToday } from './memberships.domain';

export {
  formatDate,
  getDisplayName,
  getMembershipEffectiveStatus,
  getMembershipEffectiveStatusLabel,
  getMembershipStatusLabel,
  getPaymentStatusLabel,
  isMembershipActiveToday,
  isMembershipDateExpired,
} from './memberships.domain';
export type { MembershipEffectiveStatus } from './memberships.domain';


export type MembershipAdminRow = {
  membership: Membership;
  profile: Profile | null;
  payments: Payment[];
};


export type UpdateMembershipDetailsInput = {
  memberNumber?: string | null;
  status?: MembershipStatus;
  currentPaymentStatus?: MembershipPaymentStatus | null;
  lastPaymentAt?: string | null;
  endDate?: string | null;
  paymentNotes?: string | null;
};

export type MembershipEligibilitySource = 'program_enrollment' | 'program_completion_achievement' | 'none';

export type MembershipEligibility = {
  eligible: boolean;
  source: MembershipEligibilitySource;
  enrollmentId: string | null;
  achievementCode: ProgramCompletionAchievementCode | null;
};

export async function getMembershipEligibilityForUser(userId: string): Promise<MembershipEligibility> {
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('program_enrollments')
    .select('id,status')
    .eq('user_id', userId)
    .in('status', ['active', 'completed'])
    .limit(1)
    .maybeSingle();

  if (enrollmentError) throw enrollmentError;
  if (enrollment) {
    return {
      eligible: true,
      source: 'program_enrollment',
      enrollmentId: enrollment.id,
      achievementCode: null,
    };
  }

  // Legacy-safe evidence. Some historical customers have a completion medal but
  // no recoverable enrollment row. Do not fabricate an enrollment; accept the
  // explicit UCAPSA completion medal as evidence for membership eligibility.
  const { data: achievement, error: achievementError } = await supabase
    .from('user_achievements')
    .select('achievement_code')
    .eq('user_id', userId)
    .in('achievement_code', [...PROGRAM_COMPLETION_ACHIEVEMENT_CODES])
    .order('awarded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (achievementError) throw achievementError;
  if (achievement?.achievement_code) {
    return {
      eligible: true,
      source: 'program_completion_achievement',
      enrollmentId: null,
      achievementCode: achievement.achievement_code as ProgramCompletionAchievementCode,
    };
  }

  return { eligible: false, source: 'none', enrollmentId: null, achievementCode: null };
}

export async function getMyMembershipEligibility(): Promise<MembershipEligibility> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');
  return getMembershipEligibilityForUser(userId);
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
  if (!userId) throw new Error('No hay sesion activa.');

  const existing = await getMyMembership();
  if (existing?.status === 'pending') return existing;
  if (existing?.status === 'active') {
    if (isMembershipActiveToday(existing)) return existing;
    throw new Error('La membresia esta marcada activa pero fuera de vigencia. Administracion debe revisar sus fechas antes de crear una nueva solicitud.');
  }

  const eligibility = await getMembershipEligibilityForUser(userId);
  if (!eligibility.eligible) {
    throw new Error('Para solicitar membresia primero debes estar inscrito o haber completado Puppy o Comandos.');
  }

  const { data, error } = await supabase
    .from('memberships')
    .insert({
      user_id: userId,
      status: 'pending',
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

  const { error } = await supabase.from('memberships').update(payload as TableUpdate<'memberships'>).eq('id', membership.id);
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

  const { error } = await supabase.from('memberships').update(payload as TableUpdate<'memberships'>).eq('id', membership.id);
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
    notes: 'Pago registrado rapido desde tabla de socios.',
    periodLabel: 'Mensualidad',
    paymentMethod: 'manual',
  });
}

function buildForcedMemberNumber(profile: Profile) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const shortId = profile.user_id.replace(/-/g, '').slice(0, 5).toUpperCase();
  return `SOC-${year}${month}-${shortId}`;
}

export async function forceMembershipForProfile(profile: Profile): Promise<Membership> {
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    throw new Error('No se debe convertir una cuenta administrativa en socio desde esta ficha.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const adminUserId = authData.user?.id ?? null;
  const now = new Date().toISOString();

  const { data: existingData, error: existingError } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  let membership: Membership;

  if (existingData) {
    const current = existingData as Membership;
    const { data, error } = await supabase
      .from('memberships')
      .update({
        status: 'active',
        member_number: current.member_number || buildForcedMemberNumber(profile),
        start_date: current.start_date || now,
        current_payment_status: current.current_payment_status === 'paid' ? 'paid' : 'pending',
        payment_notes: 'Socio activado manualmente desde ficha de usuario.',
        approved_by: adminUserId,
        updated_at: now,
      })
      .eq('id', current.id)
      .select('*')
      .single();

    if (error) throw error;
    membership = data as Membership;
  } else {
    const { data, error } = await supabase
      .from('memberships')
      .insert({
        user_id: profile.user_id,
        member_number: buildForcedMemberNumber(profile),
        status: 'active',
        start_date: now,
        end_date: null,
          approved_by: adminUserId,
        current_payment_status: 'pending',
        last_payment_at: null,
        payment_notes: 'Socio creado manualmente desde ficha de usuario.',
      })
      .select('*')
      .single();

    if (error) throw error;
    membership = data as Membership;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'member', updated_at: now })
    .eq('user_id', profile.user_id)
    .not('role', 'in', '(admin,super_admin)');

  if (profileError) throw profileError;
  return membership;
}

export async function deactivateMembershipForProfile(profile: Profile): Promise<void> {
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    throw new Error('No se debe cambiar una cuenta administrativa desde esta accion.');
  }

  const now = new Date().toISOString();

  const { data: existingData, error: existingError } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingData) {
    const membership = existingData as Membership;
    const { error } = await supabase
      .from('memberships')
      .update({
        status: 'cancelled',
        current_payment_status: 'not_required',
        payment_notes: 'Socio desactivado manualmente desde ficha de usuario.',
        updated_at: now,
      } as never)
      .eq('id', membership.id);

    if (error) throw error;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'client', updated_at: now })
    .eq('user_id', profile.user_id)
    .not('role', 'in', '(admin,super_admin)');

  if (profileError) throw profileError;
}


export async function getMembershipByQrToken(qrToken: string): Promise<MembershipAdminRow | null> {
  const cleanToken = qrToken.trim();
  if (!cleanToken) return null;

  const { data: membershipData, error: membershipError } = await supabase
    .from('memberships')
    .select('*')
    .eq('qr_token', cleanToken)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membershipData) return null;

  const membership = membershipData as Membership;

  const [profileResult, paymentsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', membership.user_id).maybeSingle(),
    supabase.from('payments').select('*').eq('membership_id', membership.id).order('paid_at', { ascending: false }),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  return {
    membership,
    profile: (profileResult.data as Profile | null) ?? null,
    payments: (paymentsResult.data ?? []) as Payment[],
  };
}
