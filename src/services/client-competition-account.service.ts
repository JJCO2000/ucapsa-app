import { supabase } from '../lib/supabase';
import { getMyDogs } from './dogs.service';
import {
  readClientResource,
  writeClientResource,
  type CachedResource,
} from './client-read-cache.service';
import type {
  ClientCompetitionInput,
  ClientOfficialExamResult,
} from './client-competition.types';

export type ClientAccountCompetitionDog = {
  dog_id: string;
  dog_name: string;
  seasons: ClientCompetitionInput[];
  official_exams: ClientOfficialExamResult[];
};

export type ClientAccountCompetitionSeason = {
  season_id: string;
  season_code: string;
  season_name: string;
  season_status: string;
  season_starts_at: string;
  season_ends_at: string;
};

export type ClientAccountCompetitionSnapshot = {
  dogs: ClientAccountCompetitionDog[];
  // Consulta independiente del perro: la temporada puede existir sin registros competitivos.
  seasons?: ClientAccountCompetitionSeason[];
};

const RESOURCE_KEY = 'competition-account';

function isSnapshot(value: unknown): value is ClientAccountCompetitionSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ClientAccountCompetitionSnapshot>;
  return Array.isArray(candidate.dogs)
    && candidate.dogs.every((dog) => (
      dog
      && typeof dog === 'object'
      && typeof dog.dog_id === 'string'
      && typeof dog.dog_name === 'string'
      && Array.isArray(dog.seasons)
      && Array.isArray(dog.official_exams)
    ));
}

export async function getCachedMyCompetitionAccount(
  userId: string,
): Promise<CachedResource<ClientAccountCompetitionSnapshot> | null> {
  if (!userId.trim()) return null;
  const cached = await readClientResource<ClientAccountCompetitionSnapshot>(userId, RESOURCE_KEY);
  return cached && isSnapshot(cached.data) ? cached : null;
}

async function fetchMyCompetitionAccount(
  userId: string,
): Promise<ClientAccountCompetitionSnapshot> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) throw new Error('Falta el usuario.');

  const [dogs, publishedSeasonsResult] = await Promise.all([
    getMyDogs(),
    supabase
      .from('ucapsa_competition_seasons')
      .select('id,code,name,status,starts_at,ends_at')
      .neq('status', 'draft')
      .order('starts_at', { ascending: false }),
  ]);
  if (publishedSeasonsResult.error) throw publishedSeasonsResult.error;
  const seasons: ClientAccountCompetitionSeason[] = (publishedSeasonsResult.data ?? []).map((season) => ({
    season_id: season.id,
    season_code: season.code,
    season_name: season.name,
    season_status: season.status,
    season_starts_at: season.starts_at,
    season_ends_at: season.ends_at,
  }));
  if (dogs.length === 0) return { dogs: [], seasons };

  const dogIds = dogs.map((dog) => dog.id);
  const [rangesResult, examsResult] = await Promise.all([
    supabase
      .from('ucapsa_competition_ranges')
      .select('*')
      .eq('owner_user_id', cleanUserId)
      .in('dog_id', dogIds)
      .order('season_starts_at', { ascending: false }),
    supabase
      .from('ucapsa_exam_official_results')
      .select('*')
      .in('dog_id', dogIds)
      .order('published_at', { ascending: false }),
  ]);

  if (rangesResult.error) throw rangesResult.error;
  if (examsResult.error) throw examsResult.error;

  const ranges = (rangesResult.data ?? []) as ClientCompetitionInput[];
  const exams = (examsResult.data ?? []) as ClientOfficialExamResult[];

  return {
    seasons,
    dogs: dogs.map((dog) => ({
      dog_id: dog.id,
      dog_name: dog.name,
      seasons: ranges.filter((row) => row.dog_id === dog.id),
      official_exams: exams.filter((row) => row.dog_id === dog.id),
    })),
  };
}

export async function refreshMyCompetitionAccount(
  userId: string,
): Promise<CachedResource<ClientAccountCompetitionSnapshot>> {
  const snapshot = await fetchMyCompetitionAccount(userId);
  return writeClientResource(userId, RESOURCE_KEY, snapshot);
}

export async function getMyCompetitionAccount(
  options: {
    userId: string;
    forceRefresh?: boolean;
    allowCachedOnError?: boolean;
  },
): Promise<ClientAccountCompetitionSnapshot> {
  const userId = options.userId;
  const forceRefresh = options.forceRefresh ?? false;
  const allowCachedOnError = options.allowCachedOnError ?? true;

  if (!forceRefresh) {
    const cached = await getCachedMyCompetitionAccount(userId);
    if (cached) return cached.data;
  }

  try {
    const refreshed = await refreshMyCompetitionAccount(userId);
    return refreshed.data;
  } catch (error) {
    if (allowCachedOnError) {
      const cached = await getCachedMyCompetitionAccount(userId);
      if (cached) return cached.data;
    }
    throw error;
  }
}

export function getAccountCompetitionSeasons(
  snapshot: ClientAccountCompetitionSnapshot,
): ClientCompetitionInput[] {
  const bySeason = new Map<string, ClientCompetitionInput>();
  for (const dog of snapshot.dogs) {
    for (const season of dog.seasons) {
      if (!season.season_id || bySeason.has(season.season_id)) continue;
      bySeason.set(season.season_id, season);
    }
  }

  return [...bySeason.values()].sort((left, right) =>
    String(right.season_starts_at ?? '').localeCompare(String(left.season_starts_at ?? '')),
  );
}
