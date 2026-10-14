import { getMyCompetitionAccount } from './client-competition-account.service';
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

  // Misma fuente que la pantalla general de Competencia: el perro existe
  // incluso sin filas de rango, exámenes o puntos en una temporada.
  const account = await getMyCompetitionAccount({
    userId, forceRefresh: true, allowCachedOnError: false,
  });
  const dog = account.dogs.find(item => item.dog_id === cleanDogId);
  if (!dog) throw new Error('No encontramos este perro en tu cuenta.');
  return {
    dog_id: dog.dog_id,
    dog_name: dog.dog_name,
    seasons: dog.seasons,
    official_exams: dog.official_exams,
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
