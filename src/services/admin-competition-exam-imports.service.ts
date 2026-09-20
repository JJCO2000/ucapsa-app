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
import {
  type CompetitionExamAttempt,
} from './admin-competition-exam-attempts.service';

export type CompetitionExamImportBatch = Database['public']['Tables']['ucapsa_import_batches']['Row'];
export type CompetitionExamImportPreviewRow = Database['public']['Views']['ucapsa_exam_import_preview']['Row'];

export type AdminCompetitionExamImportBatchRow = {
  batch: CompetitionExamImportBatch;
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  attemptsTotal: number;
  draftAttempts: number;
  reviewedAttempts: number;
  publishedAttempts: number;
  voidedAttempts: number;
  officialAttempts: number;
};

export type AdminCompetitionExamImportWorkspace = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  items: CompetitionExamItem[];
  batches: AdminCompetitionExamImportBatchRow[];
};

export type AdminCompetitionExamImportDetail = {
  exam: CompetitionExam;
  season: CompetitionSeason | null;
  items: CompetitionExamItem[];
  batch: CompetitionExamImportBatch;
  preview: CompetitionExamImportPreviewRow[];
  attempts: CompetitionExamAttempt[];
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  draftAttempts: number;
  reviewedAttempts: number;
  publishedAttempts: number;
  voidedAttempts: number;
  officialAttempts: number;
};

function importMetadataNumber(batch: CompetitionExamImportBatch, key: string) {
  const metadata = batch.metadata;
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') return 0;
  const value = (metadata as Record<string, unknown>)[key];
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function importAttemptCounts(attempts: CompetitionExamAttempt[]) {
  return {
    attemptsTotal: attempts.length,
    draftAttempts: attempts.filter((attempt) => attempt.status === 'draft').length,
    reviewedAttempts: attempts.filter((attempt) => attempt.status === 'reviewed').length,
    publishedAttempts: attempts.filter((attempt) => attempt.status === 'published').length,
    voidedAttempts: attempts.filter((attempt) => attempt.status === 'voided').length,
    officialAttempts: attempts.filter((attempt) => attempt.is_official).length,
  };
}

export async function getAdminCompetitionExamImportWorkspace(
  examId: string,
): Promise<AdminCompetitionExamImportWorkspace> {
  const cleanExamId = examId.trim();
  if (!cleanExamId) throw new Error('Falta el examen.');

  const [examResult, seasons, itemsResult, batchesResult] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', cleanExamId).single(),
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', cleanExamId)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_import_batches')
      .select('*')
      .eq('exam_id', cleanExamId)
      .eq('import_type', 'exam_results')
      .order('created_at', { ascending: false }),
  ]);

  if (examResult.error) throw examResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (batchesResult.error) throw batchesResult.error;

  const batches = batchesResult.data ?? [];
  const batchIds = batches.map((batch) => batch.id);
  let attempts: CompetitionExamAttempt[] = [];

  if (batchIds.length > 0) {
    const attemptsResult = await supabase
      .from('ucapsa_exam_attempts')
      .select('*')
      .in('import_batch_id', batchIds);
    if (attemptsResult.error) throw attemptsResult.error;
    attempts = attemptsResult.data ?? [];
  }

  const attemptsByBatch = new Map<string, CompetitionExamAttempt[]>();
  for (const attempt of attempts) {
    if (!attempt.import_batch_id) continue;
    const current = attemptsByBatch.get(attempt.import_batch_id) ?? [];
    current.push(attempt);
    attemptsByBatch.set(attempt.import_batch_id, current);
  }

  return {
    exam: examResult.data,
    season: seasons.find((season) => season.id === examResult.data.season_id) ?? null,
    items: itemsResult.data ?? [],
    batches: batches.map((batch) => {
      const counts = importAttemptCounts(attemptsByBatch.get(batch.id) ?? []);
      return {
        batch,
        rowsTotal: importMetadataNumber(batch, 'rows_total'),
        rowsValid: importMetadataNumber(batch, 'rows_valid'),
        rowsInvalid: importMetadataNumber(batch, 'rows_invalid'),
        ...counts,
      };
    }),
  };
}

export async function getAdminCompetitionExamImportDetail(
  batchId: string,
): Promise<AdminCompetitionExamImportDetail> {
  const cleanBatchId = batchId.trim();
  if (!cleanBatchId) throw new Error('Falta el lote de importación.');

  const batchResult = await supabase
    .from('ucapsa_import_batches')
    .select('*')
    .eq('id', cleanBatchId)
    .eq('import_type', 'exam_results')
    .single();
  if (batchResult.error) throw batchResult.error;

  const batch = batchResult.data;
  if (!batch.exam_id) throw new Error('El lote no tiene examen asociado.');

  const [examResult, seasons, itemsResult, previewResult, attemptsResult] = await Promise.all([
    supabase.from('ucapsa_exams').select('*').eq('id', batch.exam_id).single(),
    getAdminCompetitionSeasons(),
    supabase
      .from('ucapsa_exam_items')
      .select('*')
      .eq('exam_id', batch.exam_id)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_import_preview')
      .select('*')
      .eq('batch_id', cleanBatchId)
      .order('row_number', { ascending: true }),
    supabase
      .from('ucapsa_exam_attempts')
      .select('*')
      .eq('import_batch_id', cleanBatchId)
      .order('created_at', { ascending: true }),
  ]);

  if (examResult.error) throw examResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (previewResult.error) throw previewResult.error;
  if (attemptsResult.error) throw attemptsResult.error;

  const attempts = attemptsResult.data ?? [];
  const counts = importAttemptCounts(attempts);

  return {
    exam: examResult.data,
    season: seasons.find((season) => season.id === batch.season_id) ?? null,
    items: itemsResult.data ?? [],
    batch,
    preview: previewResult.data ?? [],
    attempts,
    rowsTotal: importMetadataNumber(batch, 'rows_total'),
    rowsValid: importMetadataNumber(batch, 'rows_valid'),
    rowsInvalid: importMetadataNumber(batch, 'rows_invalid'),
    draftAttempts: counts.draftAttempts,
    reviewedAttempts: counts.reviewedAttempts,
    publishedAttempts: counts.publishedAttempts,
    voidedAttempts: counts.voidedAttempts,
    officialAttempts: counts.officialAttempts,
  };
}

export async function createCompetitionExamImportBatch(input: {
  examId: string;
  fileName: string;
}) {
  const examId = input.examId.trim();
  const fileName = input.fileName.trim();
  if (!examId) throw new Error('Falta el examen.');

  const { data, error } = await supabase.rpc('admin_create_ucapsa_exam_import_batch', {
    p_exam_id: examId,
    p_file_name: fileName || undefined,
  });
  if (error) throw error;
  return data;
}

export async function validateCompetitionExamImportBatch(input: {
  batchId: string;
  rows: Array<{
    member_number: string;
    dog_name: string;
    scores: Record<string, number | string>;
  }>;
}) {
  const batchId = input.batchId.trim();
  if (!batchId) throw new Error('Falta el lote de importación.');
  if (input.rows.length === 0) throw new Error('El Excel no contiene filas de resultados.');

  const { data, error } = await supabase.rpc('admin_validate_ucapsa_exam_import_batch', {
    p_batch_id: batchId,
    p_rows: input.rows as never,
  });
  if (error) throw error;
  return data;
}

export async function commitCompetitionExamImportBatch(batchId: string) {
  const cleanId = batchId.trim();
  if (!cleanId) throw new Error('Falta el lote de importación.');
  const { data, error } = await supabase.rpc('admin_commit_ucapsa_exam_import_batch', {
    p_batch_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export async function reviewCompetitionExamImportBatch(batchId: string) {
  const cleanId = batchId.trim();
  if (!cleanId) throw new Error('Falta el lote de importación.');
  const { data, error } = await supabase.rpc('admin_review_ucapsa_exam_import_batch', {
    p_batch_id: cleanId,
  });
  if (error) throw error;
  return data;
}

export async function publishCompetitionExamImportBatch(input: {
  batchId: string;
  makeOfficial: boolean;
}) {
  const batchId = input.batchId.trim();
  if (!batchId) throw new Error('Falta el lote de importación.');

  const { data, error } = await supabase.rpc('admin_publish_ucapsa_exam_import_batch', {
    p_batch_id: batchId,
    p_make_official: input.makeOfficial,
  });
  if (error) throw error;
  return data;
}

export async function revertCompetitionExamImportBatch(batchId: string) {
  const cleanId = batchId.trim();
  if (!cleanId) throw new Error('Falta el lote de importación.');
  const { data, error } = await supabase.rpc('admin_revert_ucapsa_exam_import_batch', {
    p_batch_id: cleanId,
  });
  if (error) throw error;
  return data;
}
