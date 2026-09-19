import { supabase } from '../lib/supabase';
import {
  readClientResource,
  writeClientResource,
  type CachedResource,
} from './client-read-cache.service';
import type { ClientCompetitionLeaderboardRow } from './client-competition.types';

function competitionLeaderboardResourceKey(seasonId: string) {
  return `competition-leaderboard:${seasonId}`;
}

function isCompetitionLeaderboard(
  value: unknown,
  seasonId: string,
): value is ClientCompetitionLeaderboardRow[] {
  return Array.isArray(value)
    && value.every((row) => (
      row
      && typeof row === 'object'
      && (row as ClientCompetitionLeaderboardRow).season_id === seasonId
    ));
}

export async function getCachedCompetitionLeaderboard(
  userId: string,
  seasonId: string,
): Promise<CachedResource<ClientCompetitionLeaderboardRow[]> | null> {
  const cleanSeasonId = seasonId.trim();
  if (!userId.trim() || !cleanSeasonId) return null;

  const cached = await readClientResource<ClientCompetitionLeaderboardRow[]>(
    userId,
    competitionLeaderboardResourceKey(cleanSeasonId),
  );

  if (!cached || !isCompetitionLeaderboard(cached.data, cleanSeasonId)) return null;
  return cached;
}

export async function refreshCompetitionLeaderboard(
  userId: string,
  seasonId: string,
): Promise<CachedResource<ClientCompetitionLeaderboardRow[]>> {
  const cleanSeasonId = seasonId.trim();
  if (!userId.trim() || !cleanSeasonId) {
    throw new Error('Falta el usuario o la temporada.');
  }

  const { data, error } = await supabase.rpc('get_ucapsa_competition_leaderboard', {
    p_season_id: cleanSeasonId,
  });
  if (error) throw error;

  const rows = (data ?? []) as ClientCompetitionLeaderboardRow[];
  return writeClientResource(
    userId,
    competitionLeaderboardResourceKey(cleanSeasonId),
    rows,
  );
}

export async function getCompetitionLeaderboard(
  seasonId: string,
  options: {
    userId: string;
    forceRefresh?: boolean;
    allowCachedOnError?: boolean;
  },
): Promise<ClientCompetitionLeaderboardRow[]> {
  const userId = options.userId;
  const forceRefresh = options.forceRefresh ?? false;
  const allowCachedOnError = options.allowCachedOnError ?? true;

  if (!forceRefresh) {
    const cached = await getCachedCompetitionLeaderboard(userId, seasonId);
    if (cached) return cached.data;
  }

  try {
    const refreshed = await refreshCompetitionLeaderboard(userId, seasonId);
    return refreshed.data;
  } catch (error) {
    if (allowCachedOnError) {
      const cached = await getCachedCompetitionLeaderboard(userId, seasonId);
      if (cached) return cached.data;
    }
    throw error;
  }
}
