import { supabase } from '../lib/supabase';
import {
  readClientResource,
  writeClientResource,
  type CachedResource,
} from './client-read-cache.service';
import type {
  ClientExamItem,
  ClientExamItemResult,
  ClientOfficialExamResult,
} from './client-competition.types';

export type ClientOfficialExamDetail = {
  dog_id: string;
  dog_name: string;
  official: ClientOfficialExamResult;
  items: ClientExamItem[];
  results: ClientExamItemResult[];
};

function competitionExamResourceKey(dogId: string, attemptId: string) {
  return `competition-exam:${dogId}:${attemptId}`;
}

function isOfficialExamDetail(
  value: unknown,
  dogId: string,
  attemptId: string,
): value is ClientOfficialExamDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ClientOfficialExamDetail>;
  return (
    candidate.dog_id === dogId
    && candidate.official?.attempt_id === attemptId
    && Array.isArray(candidate.items)
    && Array.isArray(candidate.results)
  );
}

export async function getCachedMyOfficialExamDetail(
  userId: string,
  dogId: string,
  attemptId: string,
): Promise<CachedResource<ClientOfficialExamDetail> | null> {
  const cached = await readClientResource<ClientOfficialExamDetail>(
    userId,
    competitionExamResourceKey(dogId, attemptId),
  );

  if (!cached || !isOfficialExamDetail(cached.data, dogId, attemptId)) return null;
  return cached;
}

async function fetchMyOfficialExamDetail(
  userId: string,
  dogId: string,
  attemptId: string,
): Promise<ClientOfficialExamDetail> {
  const cleanDogId = dogId.trim();
  const cleanAttemptId = attemptId.trim();
  if (!userId.trim() || !cleanDogId || !cleanAttemptId) {
    throw new Error('Falta el usuario, perro o intento.');
  }

  const dogResult = await supabase
    .from('dogs')
    .select('id,name,user_id')
    .eq('id', cleanDogId)
    .eq('user_id', userId)
    .single();

  if (dogResult.error) throw dogResult.error;

  const officialResult = await supabase
    .from('ucapsa_exam_official_results')
    .select('*')
    .eq('dog_id', cleanDogId)
    .eq('attempt_id', cleanAttemptId)
    .single();

  if (officialResult.error) throw officialResult.error;
  if (!officialResult.data.exam_id) {
    throw new Error('El resultado oficial no tiene examen asociado.');
  }

  const [itemsResult, resultsResult] = await Promise.all([
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', officialResult.data.exam_id)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_item_results')
      .select('*')
      .eq('attempt_id', cleanAttemptId),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (resultsResult.error) throw resultsResult.error;

  return {
    dog_id: dogResult.data.id,
    dog_name: dogResult.data.name,
    official: officialResult.data,
    items: itemsResult.data ?? [],
    results: resultsResult.data ?? [],
  };
}

export async function refreshMyOfficialExamDetail(
  userId: string,
  dogId: string,
  attemptId: string,
): Promise<CachedResource<ClientOfficialExamDetail>> {
  const detail = await fetchMyOfficialExamDetail(userId, dogId, attemptId);
  return writeClientResource(
    userId,
    competitionExamResourceKey(dogId, attemptId),
    detail,
  );
}

export async function getMyOfficialExamDetail(
  dogId: string,
  attemptId: string,
  options: {
    userId: string;
    forceRefresh?: boolean;
    allowCachedOnError?: boolean;
  },
): Promise<ClientOfficialExamDetail> {
  const userId = options.userId;
  const forceRefresh = options.forceRefresh ?? false;
  const allowCachedOnError = options.allowCachedOnError ?? true;

  if (!forceRefresh) {
    const cached = await getCachedMyOfficialExamDetail(userId, dogId, attemptId);
    if (cached) return cached.data;
  }

  try {
    const refreshed = await refreshMyOfficialExamDetail(userId, dogId, attemptId);
    return refreshed.data;
  } catch (error) {
    if (allowCachedOnError) {
      const cached = await getCachedMyOfficialExamDetail(userId, dogId, attemptId);
      if (cached) return cached.data;
    }
    throw error;
  }
}
