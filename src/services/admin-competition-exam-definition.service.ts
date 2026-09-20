import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

import {
  getAdminCompetitionSeasons,
  type CompetitionSeason,
} from './admin-competition-seasons.service';

export type CompetitionExam = Database['public']['Tables']['ucapsa_exams']['Row'];
export type CompetitionExamItem = Database['public']['Tables']['ucapsa_exam_items']['Row'];

export type AdminCompetitionExamRow = CompetitionExam & {
  seasonName: string;
  itemCount: number;
  maxPoints: number;
};

export type AdminCompetitionExamWorkspace = {
  seasons: CompetitionSeason[];
  exams: AdminCompetitionExamRow[];
};

export type AdminCompetitionExamDetail = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  items: CompetitionExamItem[];
  structureLocked: boolean;
};

export async function getAdminCompetitionExamWorkspace(): Promise<AdminCompetitionExamWorkspace> {
  const [seasons, examsResult, itemsResult] = await Promise.all([
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exams')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }),
    supabase
      .from('ucapsa_exam_items')
      .select('id,exam_id,max_points'),
  ]);

  if (examsResult.error) throw examsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const itemStats = (itemsResult.data ?? []).reduce<Record<string, { count: number; maxPoints: number }>>((acc, item) => {
    const current = acc[item.exam_id] ?? { count: 0, maxPoints: 0 };
    current.count += 1;
    current.maxPoints += Number(item.max_points ?? 0);
    acc[item.exam_id] = current;
    return acc;
  }, {});

  return {
    seasons,
    exams: (examsResult.data ?? []).map((exam) => ({
      ...exam,
      seasonName: seasonById.get(exam.season_id)?.name ?? 'Temporada no disponible',
      itemCount: itemStats[exam.id]?.count ?? 0,
      maxPoints: itemStats[exam.id]?.maxPoints ?? 0,
    })),
  };
}

export async function getAdminCompetitionExamDetail(examId: string): Promise<AdminCompetitionExamDetail> {
  const cleanId = examId.trim();
  if (!cleanId) throw new Error('Falta el examen.');

  const examResult = await supabase
    .from('ucapsa_exams')
    .select('*')
    .eq('id', cleanId)
    .single();
  if (examResult.error) throw examResult.error;

  const exam = examResult.data;
  const [seasons, itemsResult, lockedAttemptResult] = await Promise.all([
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', cleanId)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_attempts')
      .select('id')
      .eq('exam_id', cleanId)
      .in('status', ['reviewed', 'published', 'voided'])
      .limit(1),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (lockedAttemptResult.error) throw lockedAttemptResult.error;

  return {
    exam,
    season: seasons.find((season) => season.id === exam.season_id) ?? null,
    items: itemsResult.data ?? [],
    structureLocked: exam.status !== 'draft' || (lockedAttemptResult.data?.length ?? 0) > 0,
  };
}

export async function createCompetitionExam(input: {
  seasonId: string;
  code: string;
  title: string;
  description?: string | null;
  examDate?: string | null;
  isRequiredForRanking: boolean;
  sortOrder?: number;
}) {
  const seasonId = input.seasonId.trim();
  const code = input.code.trim();
  const title = input.title.trim();
  if (!seasonId || !code || !title) throw new Error('Temporada, código y título son obligatorios.');

  const args: Database['public']['Functions']['admin_create_ucapsa_exam']['Args'] = {
    p_season_id: seasonId,
    p_code: code,
    p_title: title,
    p_description: input.description?.trim() || undefined,
    p_is_required_for_ranking: input.isRequiredForRanking,
    p_sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder ?? 0) : 0,
  };
  const examDate = input.examDate?.trim();
  if (examDate) args.p_exam_date = examDate;

  const { data, error } = await supabase.rpc('admin_create_ucapsa_exam', args);
  if (error) throw error;
  return data;
}

export async function updateCompetitionExam(input: {
  examId: string;
  code: string;
  title: string;
  description?: string | null;
  examDate?: string | null;
  isRequiredForRanking: boolean;
  sortOrder: number;
}) {
  const examId = input.examId.trim();
  const code = input.code.trim();
  const title = input.title.trim();
  if (!examId || !code || !title) throw new Error('Examen, código y título son obligatorios.');

  const { data, error } = await supabase.rpc('admin_update_ucapsa_exam', {
    p_exam_id: examId,
    p_code: code,
    p_title: title,
    p_description: input.description?.trim() || '',
    // PostgreSQL acepta NULL aquí; los tipos generados de argumentos RPC no expresan nullabilidad.
    p_exam_date: (input.examDate?.trim() || null) as never,
    p_is_required_for_ranking: input.isRequiredForRanking,
    p_sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : 0,
  });
  if (error) throw error;
  return data;
}

export async function publishCompetitionExam(examId: string) {
  const cleanId = examId.trim();
  if (!cleanId) throw new Error('Falta el examen.');
  const { data, error } = await supabase.rpc('admin_publish_ucapsa_exam', { p_exam_id: cleanId });
  if (error) throw error;
  return data;
}

export async function addCompetitionExamItem(input: {
  examId: string;
  title: string;
  description?: string | null;
  maxPoints: number;
  itemNumber?: number | null;
  sortOrder?: number | null;
}) {
  const examId = input.examId.trim();
  const title = input.title.trim();
  if (!examId || !title) throw new Error('Examen y título del ejercicio son obligatorios.');
  if (!Number.isFinite(input.maxPoints) || input.maxPoints <= 0) throw new Error('El puntaje máximo debe ser mayor que cero.');

  const args: Database['public']['Functions']['admin_add_ucapsa_exam_item']['Args'] = {
    p_exam_id: examId,
    p_title: title,
    p_max_points: input.maxPoints,
    p_description: input.description?.trim() || undefined,
  };
  if (input.itemNumber != null && Number.isFinite(input.itemNumber)) args.p_item_number = Math.round(input.itemNumber);
  if (input.sortOrder != null && Number.isFinite(input.sortOrder)) args.p_sort_order = Math.round(input.sortOrder);

  const { data, error } = await supabase.rpc('admin_add_ucapsa_exam_item', args);
  if (error) throw error;
  return data;
}

export async function updateCompetitionExamItem(input: {
  examItemId: string;
  itemNumber: number;
  title: string;
  description?: string | null;
  maxPoints: number;
  sortOrder: number;
}) {
  const examItemId = input.examItemId.trim();
  const title = input.title.trim();
  if (!examItemId || !title) throw new Error('Ejercicio y título son obligatorios.');
  if (!Number.isFinite(input.itemNumber) || input.itemNumber <= 0) throw new Error('El número de ejercicio debe ser mayor que cero.');
  if (!Number.isFinite(input.maxPoints) || input.maxPoints <= 0) throw new Error('El puntaje máximo debe ser mayor que cero.');

  const { data, error } = await supabase.rpc('admin_update_ucapsa_exam_item', {
    p_exam_item_id: examItemId,
    p_item_number: Math.round(input.itemNumber),
    p_title: title,
    p_description: input.description?.trim() || '',
    p_max_points: input.maxPoints,
    p_sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : Math.round(input.itemNumber),
  });
  if (error) throw error;
  return data;
}

export async function deleteCompetitionExamItem(examItemId: string) {
  const cleanId = examItemId.trim();
  if (!cleanId) throw new Error('Falta el ejercicio.');
  const { data, error } = await supabase.rpc('admin_delete_ucapsa_exam_item', { p_exam_item_id: cleanId });
  if (error) throw error;
  return data;
}
