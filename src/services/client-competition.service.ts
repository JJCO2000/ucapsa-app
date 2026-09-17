import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import {
  readClientResource,
  writeClientResource,
  type CachedResource,
} from './client-read-cache.service';

export type ClientCompetitionInput = Database['public']['Views']['ucapsa_competition_inputs']['Row'];
export type ClientOfficialExamResult = Database['public']['Views']['ucapsa_exam_official_results']['Row'];

export type ClientDogCompetitionSnapshot = {
  dog_id: string;
  dog_name: string;
  seasons: ClientCompetitionInput[];
  official_exams: ClientOfficialExamResult[];
};

function competitionResourceKey(dogId: string) {
  return `competition-dog:${dogId}`;
}

function isCompetitionSnapshot(value: unknown, dogId: string): value is ClientDogCompetitionSnapshot {
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
      .from('ucapsa_competition_inputs')
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

export type ClientExamItem = Database['public']['Tables']['ucapsa_exam_items']['Row'];
export type ClientExamItemResult = Database['public']['Tables']['ucapsa_exam_item_results']['Row'];

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
  if (!officialResult.data.exam_id) throw new Error('El resultado oficial no tiene examen asociado.');

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

export type ClientConstancyEvent = Database['public']['Views']['ucapsa_constancy_events']['Row'];

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
      .from('ucapsa_competition_inputs')
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

