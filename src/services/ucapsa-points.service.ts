import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import type {
  UcapsaPointsLedgerEntry,
  UcapsaPointsParticipant,
  UcapsaPointsScreenData,
  UcapsaPointsSeason,
  UcapsaPointsTier,
} from '../types/ucapsa-points.types';

const pointsDb = supabase as any;
const CACHE_PREFIX = 'ucapsa:points-screen:v1:';

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}${userId}`;
}

function normalizeSeason(row: any): UcapsaPointsSeason {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    status: row.status,
    eligibility_scope: row.eligibility_scope,
  };
}

function normalizeParticipant(row: any): UcapsaPointsParticipant {
  return {
    id: String(row.id),
    season_id: String(row.season_id),
    user_id: String(row.user_id),
    dog_id: String(row.dog_id),
    display_name: String(row.display_name),
    status: row.status,
    visible_in_leaderboard: row.visible_in_leaderboard !== false,
    joined_at: String(row.joined_at),
    locked_at: row.locked_at ? String(row.locked_at) : null,
  };
}

function normalizeTier(row: any): UcapsaPointsTier {
  return {
    id: String(row.id),
    season_id: String(row.season_id),
    code: String(row.code),
    label: String(row.label),
    min_points: toNumber(row.min_points),
    sort_order: toNumber(row.sort_order),
    icon_key: row.icon_key ? String(row.icon_key) : null,
  };
}

function normalizeLedger(row: any): UcapsaPointsLedgerEntry {
  return {
    id: String(row.id),
    season_id: String(row.season_id),
    participant_id: String(row.participant_id),
    rule_code: String(row.rule_code),
    source_type: String(row.source_type),
    source_id: row.source_id ? String(row.source_id) : null,
    dedupe_key: String(row.dedupe_key),
    points: toNumber(row.points),
    reason: String(row.reason),
    reversal_of_id: row.reversal_of_id ? String(row.reversal_of_id) : null,
    awarded_by: row.awarded_by ? String(row.awarded_by) : null,
    occurred_at: String(row.occurred_at),
    created_at: String(row.created_at),
  };
}

export async function readCachedUcapsaPointsScreenData(userId: string): Promise<UcapsaPointsScreenData | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as UcapsaPointsScreenData;
  } catch {
    return null;
  }
}

async function writeCachedUcapsaPointsScreenData(userId: string, data: UcapsaPointsScreenData) {
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(data));
  } catch {
    // Cache is best-effort. Live data remains the source of truth.
  }
}

export async function getUcapsaPointsScreenData(userId: string): Promise<UcapsaPointsScreenData> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) throw new Error('No hay sesión activa.');

  const now = new Date().toISOString();
  const seasonResult = await pointsDb
    .from('ucapsa_points_seasons')
    .select('id,code,name,starts_at,ends_at,status,eligibility_scope')
    .eq('status', 'active')
    .lte('starts_at', now)
    .gt('ends_at', now)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (seasonResult.error) throw seasonResult.error;
  if (!seasonResult.data) throw new Error('No hay una temporada activa de Puntos UCAPSA.');
  const season = normalizeSeason(seasonResult.data);

  const [leaderboardResult, participantResult, tiersResult] = await Promise.all([
    pointsDb.rpc('get_ucapsa_points_leaderboard', { p_limit: 100 }),
    pointsDb
      .from('ucapsa_points_participants')
      .select('id,season_id,user_id,dog_id,display_name,status,visible_in_leaderboard,joined_at,locked_at')
      .eq('season_id', season.id)
      .eq('user_id', cleanUserId)
      .maybeSingle(),
    pointsDb
      .from('ucapsa_points_tiers')
      .select('id,season_id,code,label,min_points,sort_order,icon_key')
      .eq('season_id', season.id)
      .order('min_points', { ascending: true }),
  ]);

  if (leaderboardResult.error) throw leaderboardResult.error;
  if (participantResult.error) throw participantResult.error;
  if (tiersResult.error) throw tiersResult.error;

  const participant = participantResult.data ? normalizeParticipant(participantResult.data) : null;
  const tiers = (tiersResult.data ?? []).map(normalizeTier);
  const leaderboard = (leaderboardResult.data ?? []).map((row: any) => ({
    rank: toNumber(row.rank),
    tied: Boolean(row.is_tied),
    dog_id: String(row.dog_id),
    display_name: String(row.display_name),
    total_points: toNumber(row.total_points),
    tier_code: row.tier_code ? String(row.tier_code) : null,
    tier_label: row.tier_label ? String(row.tier_label) : null,
    is_current_user: Boolean(row.is_current_user),
  }));

  let recentLedger: UcapsaPointsLedgerEntry[] = [];
  if (participant) {
    const ledgerResult = await pointsDb
      .from('ucapsa_points_ledger')
      .select('id,season_id,participant_id,rule_code,source_type,source_id,dedupe_key,points,reason,reversal_of_id,awarded_by,occurred_at,created_at')
      .eq('season_id', season.id)
      .eq('participant_id', participant.id)
      .order('occurred_at', { ascending: false })
      .limit(20);
    if (ledgerResult.error) throw ledgerResult.error;
    recentLedger = (ledgerResult.data ?? []).map(normalizeLedger);
  }

  const currentRow = leaderboard.find((row: any) => row.is_current_user) ?? null;
  const totalPoints = participant
    ? recentLedger.length > 0
      ? recentLedger.reduce((sum, item) => sum + item.points, 0)
      : toNumber(currentRow?.total_points)
    : 0;

  const currentTier = [...tiers].reverse().find((tier) => tier.min_points <= totalPoints) ?? null;
  const nextTier = tiers.find((tier) => tier.min_points > totalPoints) ?? null;
  const data: UcapsaPointsScreenData = {
    summary: {
      season,
      participant,
      total_points: totalPoints,
      rank: currentRow ? toNumber(currentRow.rank) : null,
      tied: Boolean(currentRow?.tied),
      participants: leaderboard.length,
      current_tier: currentTier,
      next_tier: nextTier,
      points_to_next_tier: nextTier ? Math.max(0, nextTier.min_points - totalPoints) : null,
    },
    leaderboard,
    recent_ledger: recentLedger,
    rules: [],
    cached_at: new Date().toISOString(),
  };

  await writeCachedUcapsaPointsScreenData(cleanUserId, data);
  return data;
}

export async function getAdminUcapsaPointsParticipant(userId: string): Promise<UcapsaPointsParticipant | null> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) return null;
  const { data: season, error: seasonError } = await pointsDb
    .from('ucapsa_points_seasons')
    .select('id')
    .eq('status', 'active')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seasonError) throw seasonError;
  if (!season?.id) return null;

  const { data, error } = await pointsDb
    .from('ucapsa_points_participants')
    .select('id,season_id,user_id,dog_id,display_name,status,visible_in_leaderboard,joined_at,locked_at')
    .eq('season_id', season.id)
    .eq('user_id', cleanUserId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeParticipant(data) : null;
}

export async function adminAdjustUcapsaPoints(input: {
  userId: string;
  dogId: string;
  points: number;
  reason: string;
}): Promise<{ ledgerId: string; participantId: string; totalPoints: number }> {
  const points = Math.trunc(input.points);
  const reason = input.reason.trim();
  if (!input.userId.trim() || !input.dogId.trim()) throw new Error('Selecciona un socio y un perro.');
  if (!Number.isFinite(points) || points === 0) throw new Error('Los puntos deben ser distintos de cero.');
  if (reason.length < 3) throw new Error('Escribe el motivo del ajuste.');

  const { data, error } = await pointsDb.rpc('admin_adjust_ucapsa_points', {
    p_user_id: input.userId.trim(),
    p_dog_id: input.dogId.trim(),
    p_points: points,
    p_reason: reason,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Supabase no devolvió el ajuste de puntos.');
  return {
    ledgerId: String(row.ledger_id),
    participantId: String(row.participant_id),
    totalPoints: toNumber(row.total_points),
  };
}
