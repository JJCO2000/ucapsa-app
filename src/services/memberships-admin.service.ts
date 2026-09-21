import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import type {
  Membership,
  MembershipStatus,
  Profile,
} from '../types/app.types';

export type MembershipAdminRow = {
  membership: Membership;
  profile: Profile | null;
};

export type UpdateMembershipDetailsInput = {
  memberNumber?: string | null;
  status?: MembershipStatus;
  endDate?: string | null;
};

function dateKeyToIso(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00.000Z`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildForcedMemberNumber(profile: Profile) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const shortId = profile.user_id.replace(/-/g, '').slice(0, 5).toUpperCase();
  return `SOC-${year}${month}-${shortId}`;
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

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', userIds);

  if (profilesError) throw profilesError;

  const profiles = ((profilesData ?? []) as Profile[])
    .reduce<Record<string, Profile>>((acc, profile) => {
      acc[profile.user_id] = profile;
      return acc;
    }, {});

  return memberships.map((membership) => ({
    membership,
    profile: profiles[membership.user_id] ?? null,
  }));
}

export async function updateMembershipStatus(
  membership: Membership,
  status: MembershipStatus,
  options?: {
    memberNumber?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const now = new Date().toISOString();
  const payload: TableUpdate<'memberships'> = {
    status,
    updated_at: now,
  };

  if (options && 'memberNumber' in options) {
    payload.member_number = options.memberNumber?.trim() || null;
  }
  if (options && 'startDate' in options) payload.start_date = options.startDate || null;
  if (options && 'endDate' in options) payload.end_date = options.endDate || null;
  if (status === 'active') payload.approved_by = authData.user?.id ?? null;

  const { error } = await supabase
    .from('memberships')
    .update(payload)
    .eq('id', membership.id);

  if (error) throw error;
}

export async function updateMembershipDetails(
  membership: Membership,
  input: UpdateMembershipDetailsInput,
): Promise<void> {
  const now = new Date().toISOString();
  const payload: TableUpdate<'memberships'> = { updated_at: now };

  if ('status' in input && input.status === 'active') {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    payload.approved_by = authData.user?.id ?? null;
  }

  if ('memberNumber' in input) {
    payload.member_number = input.memberNumber?.trim() || null;
  }
  if ('status' in input && input.status) payload.status = input.status;
  if ('endDate' in input) payload.end_date = dateKeyToIso(input.endDate);

  const { error } = await supabase
    .from('memberships')
    .update(payload)
    .eq('id', membership.id);

  if (error) throw error;
}

export async function forceMembershipForProfile(profile: Profile): Promise<Membership> {
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    throw new Error(
      'No se debe convertir una cuenta administrativa en socio desde esta ficha.',
    );
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

  if (existingData) {
    const current = existingData as Membership;
    const { data, error } = await supabase
      .from('memberships')
      .update({
        status: 'active',
        member_number: current.member_number || buildForcedMemberNumber(profile),
        start_date: current.start_date || now,
        approved_by: adminUserId,
        updated_at: now,
      })
      .eq('id', current.id)
      .select('*')
      .single();

    if (error) throw error;
    return data as Membership;
  }

  const { data, error } = await supabase
    .from('memberships')
    .insert({
      user_id: profile.user_id,
      member_number: buildForcedMemberNumber(profile),
      status: 'active',
      start_date: now,
      end_date: null,
      approved_by: adminUserId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Membership;
}

export async function deactivateMembershipForProfile(profile: Profile): Promise<void> {
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    throw new Error('No se debe cambiar una cuenta administrativa desde esta accion.');
  }

  const { data: existingData, error: existingError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existingData) return;

  const payload: TableUpdate<'memberships'> = {
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('memberships')
    .update(payload)
    .eq('id', existingData.id);

  if (error) throw error;
}

export async function getMembershipByQrToken(
  qrToken: string,
): Promise<MembershipAdminRow | null> {
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

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', membership.user_id)
    .maybeSingle();

  if (profileError) throw profileError;

  return {
    membership,
    profile: (profileData as Profile | null) ?? null,
  };
}
