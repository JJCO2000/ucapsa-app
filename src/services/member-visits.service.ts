import { supabase } from '../lib/supabase';
import type { MemberVisit, Profile } from '../types/app.types';

export type RegisterMemberVisitFromQrResult = {
  visit_id: string | null;
  result: 'registered' | 'invalid_qr' | 'membership_not_active' | 'not_authenticated' | string;
  message: string;
};

export type MemberVisitMonthlyStat = {
  month_start: string;
  total_visits: number;
  unique_members: number;
};

export type AdminMemberVisitRow = MemberVisit & { profile: Profile | null };

export async function registerMyMemberVisitFromQr(token: string): Promise<RegisterMemberVisitFromQrResult> {
  const normalized = token.trim();
  if (!normalized) throw new Error('QR de socio vacio.');
  const { data, error } = await supabase.rpc('register_member_visit_from_qr', { p_qr_token: normalized });
  if (error) throw error;
  const first = Array.isArray(data) ? data[0] : data;
  if (!first) throw new Error('Supabase no devolvio resultado del registro de visita.');
  return first as RegisterMemberVisitFromQrResult;
}

export async function getAdminMemberVisitMonthlyStats(months = 12): Promise<MemberVisitMonthlyStat[]> {
  const { data, error } = await supabase.rpc('get_admin_member_visit_monthly_stats', { p_months: Math.max(2, Math.min(24, Math.round(months))) });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    month_start: String(row.month_start),
    total_visits: Number(row.total_visits ?? 0),
    unique_members: Number(row.unique_members ?? 0),
  }));
}

export async function getAdminMemberVisits(limit = 100): Promise<AdminMemberVisitRow[]> {
  const { data, error } = await supabase.from('member_visits').select('*').order('visited_at', { ascending: false }).limit(Math.max(1, Math.min(500, limit)));
  if (error) throw error;
  const visits = (data ?? []) as MemberVisit[];
  if (visits.length === 0) return [];
  const userIds = [...new Set(visits.map((item) => item.user_id))];
  const profilesResult = await supabase.from('profiles').select('*').in('user_id', userIds);
  if (profilesResult.error) throw profilesResult.error;
  const profiles = ((profilesResult.data ?? []) as Profile[]).reduce<Record<string, Profile>>((acc, profile) => {
    acc[profile.user_id] = profile;
    return acc;
  }, {});
  return visits.map((visit) => ({ ...visit, profile: profiles[visit.user_id] ?? null }));
}

export async function getAdminMemberVisitsForUser(userId: string): Promise<MemberVisit[]> {
  const { data, error } = await supabase.from('member_visits').select('*').eq('user_id', userId).order('visited_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MemberVisit[];
}

export async function registerMemberVisitAdmin(input: { userId: string; visitedAt?: string; notes?: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('register_member_visit_admin', {
    p_user_id: input.userId,
    p_visited_at: input.visitedAt ?? new Date().toISOString(),
    p_notes: input.notes?.trim() || undefined,
  });
  if (error) throw error;
  if (!data) throw new Error('No se pudo crear la visita.');
  return String(data);
}

export async function correctMemberVisitAdmin(input: { visitId: string; visitedAt: string; notes?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('correct_member_visit_admin', {
    p_visit_id: input.visitId,
    p_visited_at: input.visitedAt,
    p_notes: input.notes?.trim() || undefined,
  });
  if (error) throw error;
}

export async function deleteMemberVisitAdmin(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_member_visit_admin', { p_visit_id: visitId });
  if (error) throw error;
}
