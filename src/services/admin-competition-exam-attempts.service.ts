import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

import {
  getAdminCompetitionSeasons,
  type CompetitionSeason,
} from './admin-competition-seasons.service';
import {
  type CompetitionExam,
  type CompetitionExamItem,
} from './admin-competition-exam-definition.service';

export type CompetitionExamAttempt = Database['public']['Tables']['ucapsa_exam_attempts']['Row'];
export type CompetitionExamItemResult = Database['public']['Tables']['ucapsa_exam_item_results']['Row'];
export type CompetitionExamAttemptSummary = Database['public']['Views']['ucapsa_exam_attempt_summary']['Row'];

export type CompetitionExamDog = Pick<
  Database['public']['Tables']['dogs']['Row'],
  'id' | 'name' | 'user_id' | 'is_active'
> & {
  ownerName: string | null;
};

export type AdminCompetitionExamAttemptRow = {
  attempt: CompetitionExamAttempt;
  summary: CompetitionExamAttemptSummary;
  dogName: string;
  ownerName: string | null;
};

export type AdminCompetitionExamAttemptsWorkspace = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  dogs: CompetitionExamDog[];
  attempts: AdminCompetitionExamAttemptRow[];
};

export type AdminCompetitionExamAttemptDetail = {
  attempt: CompetitionExamAttempt;
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  dog: CompetitionExamDog;
  items: CompetitionExamItem[];
  results: CompetitionExamItemResult[];
  totalPointsAwarded: number;
  maxPoints: number;
  isComplete: boolean;
};

async function getCompetitionExamDogsWithOwners(): Promise<CompetitionExamDog[]> {
  const dogsResult = await supabase
    .from('dogs')
    .select('id,name,user_id,is_active')
    .order('name', { ascending: true })
    .limit(1000);
  if (dogsResult.error) throw dogsResult.error;

  const dogs = dogsResult.data ?? [];
  const ownerIds = [...new Set(dogs.map((dog) => dog.user_id).filter(Boolean))];
  let profiles: Array<Pick<Database['public']['Tables']['profiles']['Row'], 'user_id' | 'full_name' | 'email'>> = [];

  if (ownerIds.length > 0) {
    const profilesResult = await supabase
      .from('profiles')
      .select('user_id,full_name,email')
      .in('user_id', ownerIds);
    if (profilesResult.error) throw profilesResult.error;
    profiles = profilesResult.data ?? [];
  }

  const profileByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  return dogs.map((dog) => {
    const profile = profileByUserId.get(dog.user_id);
    return {
      ...dog,
      ownerName: profile?.full_name?.trim() || profile?.email?.trim() || null,
    };
  });
}

export async function getAdminCompetitionExamAttemptsWorkspace(
  examId: string,
): Promise<AdminCompetitionExamAttemptsWorkspace> {
  const cleanExamId = examId.trim();
  if (!cleanExamId) throw new Error('Falta el examen.');

  const [examResult, seasons, dogs, attemptsResult, rawAttemptsResult] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', cleanExamId).single(),
    getAdminCompetitionSeasons(),
    getCompetitionExamDogsWithOwners(),
    supabase
      .from('ucapsa_exam_attempt_summary')
      .select('*')
      .eq('exam_id', cleanExamId)
      .order('presented_at', { ascending: false }),
    supabase
      .from('ucapsa_exam_attempts')
      .select('*')
      .eq('exam_id', cleanExamId)
      .order('presented_at', { ascending: false }),
  ]);

  if (examResult.error) throw examResult.error;
  if (attemptsResult.error) throw attemptsResult.error;
  if (rawAttemptsResult.error) throw rawAttemptsResult.error;

  const dogById = new Map(dogs.map((dog) => [dog.id, dog]));
  const rawAttemptById = new Map((rawAttemptsResult.data ?? []).map((attempt) => [attempt.id, attempt]));
  const attempts = (attemptsResult.data ?? []).flatMap<AdminCompetitionExamAttemptRow>((summary) => {
    if (!summary.attempt_id) return [];
    const attempt = rawAttemptById.get(summary.attempt_id);
    if (!attempt) return [];
    const dog = summary.dog_id ? dogById.get(summary.dog_id) : null;
    return [{
      attempt,
      summary,
      dogName: dog?.name ?? 'Perro no disponible',
      ownerName: dog?.ownerName ?? null,
    }];
  });

  return {
    exam: examResult.data,
    season: seasons.find((season) => season.id === examResult.data.season_id) ?? null,
    dogs,
    attempts,
  };
}

export async function getAdminCompetitionExamAttemptDetail(
  attemptId: string,
): Promise<AdminCompetitionExamAttemptDetail> {
  const cleanAttemptId = attemptId.trim();
  if (!cleanAttemptId) throw new Error('Falta el intento.');

  const attemptResult = await supabase
    .from('ucapsa_exam_attempts')
    .select('*')
    .eq('id', cleanAttemptId)
    .single();
  if (attemptResult.error) throw attemptResult.error;

  const attempt = attemptResult.data;
  const [examResult, itemsResult, resultsResult, dogResult, seasons] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', attempt.exam_id).single(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', attempt.exam_id)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_item_results')
      .select('*')
      .eq('attempt_id', cleanAttemptId),
    supabase
      .from('dogs')
      .select('id,name,user_id,is_active')
      .eq('id', attempt.dog_id)
      .single(),
    getAdminCompetitionSeasons(),
  ]);

  if (examResult.error) throw examResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (resultsResult.error) throw resultsResult.error;
  if (dogResult.error) throw dogResult.error;

  const profileResult = await supabase
    .from('profiles')
    .select('user_id,full_name,email')
    .eq('user_id', dogResult.data.user_id)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;

  const dog: CompetitionExamDog = {
    ...dogResult.data,
    ownerName: profileResult.data?.full_name?.trim() || profileResult.data?.email?.trim() || null,
  };
  const items = itemsResult.data ?? [];
  const results = resultsResult.data ?? [];
  const itemIds = new Set(items.map((item) => item.id));
  const validResults = results.filter((result) => itemIds.has(result.exam_item_id));
  const totalPointsAwarded = validResults.reduce((sum, result) => sum + Number(result.points_awarded ?? 0), 0);
  const maxPoints = items.reduce((sum, item) => sum + Number(item.max_points ?? 0), 0);

  return {
    attempt,
    exam: examResult.data,
    season: seasons.find((season) => season.id === examResult.data.season_id) ?? null,
    dog,
    items,
    results: validResults,
    totalPointsAwarded,
    maxPoints,
    isComplete: items.length > 0 && validResults.length === items.length,
  };
}

export async function createCompetitionExamAttempt(input: {
  examId: string;
  dogId: string;
  presentedAt?: string | null;
}) {
  const examId = input.examId.trim();
  const dogId = input.dogId.trim();
  if (!examId || !dogId) throw new Error('Selecciona examen y perro.');

  const args: Database['public']['Functions']['admin_create_ucapsa_exam_attempt']['Args'] = {
    p_exam_id: examId,
    p_dog_id: dogId,
  };
  const presentedAt = input.presentedAt?.trim();
  if (presentedAt) args.p_presented_at = presentedAt;

  const { data, error } = await supabase.rpc('admin_create_ucapsa_exam_attempt', args);
  if (error) throw error;
  return data;
}

export async function saveCompetitionExamItemResult(input: {
  attemptId: string;
  examItemId: string;
  pointsAwarded: number;
  evaluatorNote?: string | null;
}) {
  const attemptId = input.attemptId.trim();
  const examItemId = input.examItemId.trim();
  if (!attemptId || !examItemId) throw new Error('Falta el intento o el ejercicio.');
  if (!Number.isFinite(input.pointsAwarded) || input.pointsAwarded < 0) {
    throw new Error('La puntuación debe ser cero o mayor.');
  }

  const { data, error } = await supabase.rpc('admin_upsert_ucapsa_exam_item_result', {
    p_attempt_id: attemptId,
    p_exam_item_id: examItemId,
    p_points_awarded: input.pointsAwarded,
    p_evaluator_note: input.evaluatorNote?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function deleteCompetitionExamItemResult(input: {
  attemptId: string;
  examItemId: string;
}) {
  const attemptId = input.attemptId.trim();
  const examItemId = input.examItemId.trim();
  if (!attemptId || !examItemId) throw new Error('Falta el intento o el ejercicio.');

  const { data, error } = await supabase.rpc('admin_delete_ucapsa_exam_item_result', {
    p_attempt_id: attemptId,
    p_exam_item_id: examItemId,
  });
  if (error) throw error;
  return data;
}

export async function reviewCompetitionExamAttempt(attemptId: string) {
  const cleanId = attemptId.trim();
  if (!cleanId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_review_ucapsa_exam_attempt', { p_attempt_id: cleanId });
  if (error) throw error;
  return data;
}

export async function publishCompetitionExamAttempt(input: {
  attemptId: string;
  makeOfficial: boolean;
}) {
  const attemptId = input.attemptId.trim();
  if (!attemptId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_publish_ucapsa_exam_attempt', {
    p_attempt_id: attemptId,
    p_make_official: input.makeOfficial,
  });
  if (error) throw error;
  return data;
}

export async function setCompetitionExamOfficialAttempt(attemptId: string) {
  const cleanId = attemptId.trim();
  if (!cleanId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_set_ucapsa_exam_official_attempt', {
    p_attempt_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export async function voidCompetitionExamAttempt(attemptId: string) {
  const cleanId = attemptId.trim();
  if (!cleanId) throw new Error('Falta el intento.');
  const { data, error } = await supabase.rpc('admin_void_ucapsa_exam_attempt', {
    p_attempt_id: cleanId,
  });
  if (error) throw error;
  return data;
}
