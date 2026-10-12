import { supabase } from '../lib/supabase';
import type { ProgramEnrollmentWithDetails } from '../types/app.types';
import {
  clientReadKeys,
  readClientResource,
  sanitizeProgramRowsForCache,
  writeClientResource,
  type MemberVisitOfflineSummary,
} from './client-read-cache.service';
import { getMyProgramEnrollments } from './programs.service';
import { getMyDogs, type BasicDog } from './dogs.service';
import { buildPracticeEngagementStats } from './practice.domain';
import {
  getCachedMyPracticeActivity,
  getMyPracticeActivity,
  type PracticeActivitySnapshot,
} from './practice.service';

export type ClientActivityFacts = {
  attendanceTotal: number;
  memberVisitsTotal: number;
  practiceTotal: number;
  currentPracticeStreak: number;
  longestPracticeStreak: number;
};

export type CachedClientActivityFacts = {
  data: ClientActivityFacts;
  saved_at: string;
};

function buildClientActivityFacts(
  programs: ProgramEnrollmentWithDetails[],
  visits: MemberVisitOfflineSummary[],
  practice: PracticeActivitySnapshot,
): ClientActivityFacts {
  return {
    attendanceTotal: programs.reduce((sum, item) => sum + item.attendances.length, 0),
    memberVisitsTotal: visits.length,
    practiceTotal: practice.entries.length,
    currentPracticeStreak: practice.stats.currentStreak,
    longestPracticeStreak: practice.stats.longestStreak,
  };
}

export async function getCachedMyMemberVisits(userId: string) {
  return readClientResource<MemberVisitOfflineSummary[]>(userId, clientReadKeys.memberVisits);
}

export async function getCachedMyClientActivityFacts(userId: string): Promise<CachedClientActivityFacts | null> {
  const [programCache, visitCache, practice] = await Promise.all([
    readClientResource<ProgramEnrollmentWithDetails[]>(userId, clientReadKeys.programs),
    getCachedMyMemberVisits(userId),
    getCachedMyPracticeActivity(userId),
  ]);

  // No inventar ceros cuando una fuente nunca se ha sincronizado. El resumen sólo
  // es válido offline cuando existen las tres fuentes canónicas.
  if (!programCache || !visitCache || !practice || !practice.savedAt) return null;

  const savedAt = [programCache.saved_at, visitCache.saved_at, practice.savedAt].sort()[0];
  return {
    data: buildClientActivityFacts(programCache.data, visitCache.data, practice),
    saved_at: savedAt,
  };
}

export async function getMyMemberVisits(userId: string, limit = 200): Promise<MemberVisitOfflineSummary[]> {
  const { data, error } = await supabase
    .from('member_visits')
    .select('id,visit_date,visited_at,source')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(Math.max(1, Math.min(500, Math.round(limit))));
  if (error) throw error;

  const visits = (data ?? []) as MemberVisitOfflineSummary[];
  await writeClientResource(userId, clientReadKeys.memberVisits, visits);
  return visits;
}

export async function getMyClientActivityFacts(userId: string): Promise<ClientActivityFacts> {
  const [programs, visits, practice] = await Promise.all([
    getMyProgramEnrollments(),
    getMyMemberVisits(userId, 500),
    getMyPracticeActivity(userId, 3650),
  ]);

  await writeClientResource(userId, clientReadKeys.programs, sanitizeProgramRowsForCache(programs));
  return buildClientActivityFacts(programs, visits, practice);
}


/** El detalle de insignias del perro no debe mezclar actividad de toda la cuenta. */
export function buildDogActivityFacts(
  dogId: string,
  dogName: string,
  programs: ProgramEnrollmentWithDetails[],
  practice: PracticeActivitySnapshot,
): ClientActivityFacts {
  const sameName = (name: string | null | undefined) =>
    (name ?? '').trim().toLocaleLowerCase('es-MX') === dogName.trim().toLocaleLowerCase('es-MX');
  const dogPrograms = programs.filter((item) =>
    item.enrollment.dog_id ? item.enrollment.dog_id === dogId : sameName(item.enrollment.dog_name)
  );
  const dogPractices = practice.entries.filter((item) =>
    item.dogId ? item.dogId === dogId : sameName(item.dogName)
  );
  const stats = buildPracticeEngagementStats(dogPractices);
  return {
    attendanceTotal: dogPrograms.reduce((sum, item) => sum + item.attendances.length, 0),
    memberVisitsTotal: 0, // Las visitas se atribuyen al socio, no a un perro específico.
    practiceTotal: dogPractices.length,
    currentPracticeStreak: stats.currentStreak,
    longestPracticeStreak: stats.longestStreak,
  };
}

export async function getCachedDogActivityFacts(userId: string, dogId: string): Promise<CachedClientActivityFacts | null> {
  const [programCache, dogCache, practice] = await Promise.all([
    readClientResource<ProgramEnrollmentWithDetails[]>(userId, clientReadKeys.programs),
    readClientResource<BasicDog[]>(userId, clientReadKeys.dogs),
    getCachedMyPracticeActivity(userId),
  ]);
  const dog = dogCache?.data.find((item) => item.id === dogId);
  if (!programCache || !dogCache || !dog || !practice?.savedAt) return null;
  return {
    data: buildDogActivityFacts(dogId, dog.name, programCache.data, practice),
    saved_at: [programCache.saved_at, dogCache.saved_at, practice.savedAt].sort()[0],
  };
}

export async function getMyDogActivityFacts(userId: string, dogId: string): Promise<ClientActivityFacts> {
  const [programs, practice, dogs] = await Promise.all([
    getMyProgramEnrollments(),
    getMyPracticeActivity(userId, 3650),
    getMyDogs(),
  ]);
  const dog = dogs.find((item) => item.id === dogId);
  if (!dog) throw new Error('Este perro no está disponible en tu cuenta.');
  await writeClientResource(userId, clientReadKeys.programs, sanitizeProgramRowsForCache(programs));
  return buildDogActivityFacts(dogId, dog.name, programs, practice);
}
