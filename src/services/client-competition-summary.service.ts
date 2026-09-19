import { supabase } from '../lib/supabase';
import {
  readClientResource,
  writeClientResource,
  type CachedResource,
} from './client-read-cache.service';
import type {
  ClientCompetitionInput,
  ClientOfficialExamResult,
} from './client-competition.types';

export type ClientDogCompetitionSnapshot = {
  dog_id: string;
  dog_name: string;
  seasons: ClientCompetitionInput[];
  official_exams: ClientOfficialExamResult[];
};

function competitionResourceKey(dogId: string) {
  return `competition-dog:${dogId}`;
}

function isCompetitionSnapshot(
  value: unknown,
  dogId: string,
): value is ClientDogCompetitionSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ClientDogCompetitionSnapshot>;
  return (
    candidate.dog_id === dogId
    && typeof candidate.dog_name === 'string'
    && Array.isArray(candidate.seasons)
    && Array.isArray(candidate.official_exams)
  );
}

export async function getCachedMyDogCompetition(
  userId: string,
  dogId: string,
): Promise<CachedResource<ClientDogCompetitionSnapshot> | null> {
  const cached = await readClientResource<ClientDogCompetitionSnapshot>(
    userId,
    competitionResourceKey(dogId),
  );

  if (!cached || !isCompetitionSnapshot(cached.data, dogId)) return null;
  return cached;
}

async function fetchMyDogCompetition(
  userId: string,
  dogId: string,
): Promise<ClientDogCompetitionSnapshot> {
  const cleanDogId = dogId.trim();
  if (!userId.trim() || !cleanDogId) throw new Error('Falta el usuario o el perro.');

  const dogResult = await supabase
    .from('dogs')
    .select('id,name,user_id')
    .eq('id', cleanDogId)
    .eq('user_id', userId)
    .single();

  if (dogResult.error) throw dogResult.error;

  const [inputsResult, examsResult] = await Promise.all([
    supabase
      .from('ucapsa_competition_ranges')
      .select('*')
      .eq('dog_id', cleanDogId)
      .eq('owner_user_id', userId)
      .order('season_starts_at', { ascending: false }),
    supabase
      .from('ucapsa_exam_official_results')
      .select('*')
      .eq('dog_id', cleanDogId)
      .order('published_at', { ascending: false }),
  ]);

  if (inputsResult.error) throw inputsResult.error;
  if (examsResult.error) throw examsResult.error;

  return {
    dog_id: dogResult.data.id,
    dog_name: dogResult.data.name,
    seasons: inputsResult.data ?? [],
    official_exams: examsResult.data ?? [],
  };
}

export async function refreshMyDogCompetition(
  userId: string,
  dogId: string,
): Promise<CachedResource<ClientDogCompetitionSnapshot>> {
  const snapshot = await fetchMyDogCompetition(userId, dogId);
  return writeClientResource(userId, competitionResourceKey(dogId), snapshot);
}

export async function getMyDogCompetition(
  dogId: string,
  options: {
    userId: string;
    forceRefresh?: boolean;
    allowCachedOnError?: boolean;
  },
): Promise<ClientDogCompetitionSnapshot> {
  const userId = options.userId;
  const forceRefresh = options.forceRefresh ?? false;
  const allowCachedOnError = options.allowCachedOnError ?? true;

  if (!forceRefresh) {
    const cached = await getCachedMyDogCompetition(userId, dogId);
    if (cached) return cached.data;
  }

  try {
    const refreshed = await refreshMyDogCompetition(userId, dogId);
    return refreshed.data;
  } catch (error) {
    if (allowCachedOnError) {
      const cached = await getCachedMyDogCompetition(userId, dogId);
      if (cached) return cached.data;
    }
    throw error;
  }
}
