import { supabase } from '../lib/supabase';
import {
  readClientResource,
  writeClientResource,
  type CachedResource,
} from './client-read-cache.service';
import type {
  ClientCompetitionInput,
  ClientConstancyEvent,
} from './client-competition.types';

export type ClientConstancyDetail = {
  dog_id: string;
  dog_name: string;
  season: ClientCompetitionInput;
  events: ClientConstancyEvent[];
};

function competitionConstancyResourceKey(dogId: string, seasonId: string) {
  return `competition-constancy:${dogId}:${seasonId}`;
}

function isConstancyDetail(
  value: unknown,
  dogId: string,
  seasonId: string,
): value is ClientConstancyDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ClientConstancyDetail>;
  return (
    candidate.dog_id === dogId
    && candidate.season?.season_id === seasonId
    && Array.isArray(candidate.events)
  );
}

export async function getCachedMyConstancyDetail(
  userId: string,
  dogId: string,
  seasonId: string,
): Promise<CachedResource<ClientConstancyDetail> | null> {
  const cached = await readClientResource<ClientConstancyDetail>(
    userId,
    competitionConstancyResourceKey(dogId, seasonId),
  );

  if (!cached || !isConstancyDetail(cached.data, dogId, seasonId)) return null;
  return cached;
}

async function fetchMyConstancyDetail(
  userId: string,
  dogId: string,
  seasonId: string,
): Promise<ClientConstancyDetail> {
  const cleanDogId = dogId.trim();
  const cleanSeasonId = seasonId.trim();
  if (!userId.trim() || !cleanDogId || !cleanSeasonId) {
    throw new Error('Falta el usuario, perro o temporada.');
  }

  const dogResult = await supabase
    .from('dogs')
    .select('id,name,user_id')
    .eq('id', cleanDogId)
    .eq('user_id', userId)
    .single();

  if (dogResult.error) throw dogResult.error;

  const [inputResult, eventsResult] = await Promise.all([
    supabase
      .from('ucapsa_competition_ranges')
      .select('*')
      .eq('dog_id', cleanDogId)
      .eq('season_id', cleanSeasonId)
      .eq('owner_user_id', userId)
      .single(),
    supabase
      .from('ucapsa_constancy_events')
      .select('*')
      .eq('dog_id', cleanDogId)
      .eq('season_id', cleanSeasonId)
      .order('event_date', { ascending: false })
      .order('source_id', { ascending: false }),
  ]);

  if (inputResult.error) throw inputResult.error;
  if (eventsResult.error) throw eventsResult.error;

  return {
    dog_id: dogResult.data.id,
    dog_name: dogResult.data.name,
    season: inputResult.data,
    events: eventsResult.data ?? [],
  };
}

export async function refreshMyConstancyDetail(
  userId: string,
  dogId: string,
  seasonId: string,
): Promise<CachedResource<ClientConstancyDetail>> {
  const detail = await fetchMyConstancyDetail(userId, dogId, seasonId);
  return writeClientResource(
    userId,
    competitionConstancyResourceKey(dogId, seasonId),
    detail,
  );
}

export async function getMyConstancyDetail(
  dogId: string,
  seasonId: string,
  options: {
    userId: string;
    forceRefresh?: boolean;
    allowCachedOnError?: boolean;
  },
): Promise<ClientConstancyDetail> {
  const userId = options.userId;
  const forceRefresh = options.forceRefresh ?? false;
  const allowCachedOnError = options.allowCachedOnError ?? true;

  if (!forceRefresh) {
    const cached = await getCachedMyConstancyDetail(userId, dogId, seasonId);
    if (cached) return cached.data;
  }

  try {
    const refreshed = await refreshMyConstancyDetail(userId, dogId, seasonId);
    return refreshed.data;
  } catch (error) {
    if (allowCachedOnError) {
      const cached = await getCachedMyConstancyDetail(userId, dogId, seasonId);
      if (cached) return cached.data;
    }
    throw error;
  }
}
