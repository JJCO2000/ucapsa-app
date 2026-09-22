import { supabase } from '../lib/supabase';
import type { ProgramCode, ProgramEnrollmentWithDetails, ProgramLevel } from '../types/app.types';
import {
  getAdminProgramRows,
  getProgramEnrollmentDogName,
  getProgramLevelLabel,
} from './programs.service';

export type TrainingDecisionAction = 'no_continue' | 'repeat_level' | 'next_level';

export type AdminTrainingDecisionRow = {
  enrollmentId: string;
  userId: string;
  dogId: string | null;
  customerName: string;
  dogName: string;
  programCode: ProgramCode;
  programName: string;
  programLevel: ProgramLevel;
  levelLabel: string;
  attendanceCount: number;
  requiredAttendances: number;
  physicalCardNumber: string | null;
  requirementsMetAt: string | null;
  createdAt: string;
};

export type AdminTrainingDecisionHistoryRow = {
  decidedAt: string;
  decision: TrainingDecisionAction;
  enrollmentId: string;
  nextEnrollmentId: string | null;
  userId: string | null;
  dogId: string | null;
  customerName: string;
  dogName: string;
  programCode: string;
  programLevel: string;
  physicalCardNumber: string | null;
  attendanceCount: number;
};

export type ResolveTrainingDecisionResult = {
  decision: TrainingDecisionAction;
  nextEnrollmentId: string | null;
  awardedAchievementCode: string | null;
};

function customerName(row: ProgramEnrollmentWithDetails) {
  return row.profile?.full_name?.trim() || row.profile?.email?.trim() || 'Cliente UCAPSA';
}

function isFiniteTrainingCard(row: ProgramEnrollmentWithDetails) {
  return Boolean(
    row.enrollment.physical_card_number
    || row.enrollment.card_started_on
    || row.enrollment.card_expires_on,
  );
}

export function isTrainingDecisionReady(row: ProgramEnrollmentWithDetails) {
  const required = Math.max(1, Number(row.program.required_attendances ?? 0));
  return row.enrollment.status === 'active'
    && isFiniteTrainingCard(row)
    && row.attendances.length >= required;
}

export async function getAdminTrainingDecisionRows(): Promise<AdminTrainingDecisionRow[]> {
  const rows = await getAdminProgramRows();

  return rows
    .filter(isTrainingDecisionReady)
    .map((row) => ({
      enrollmentId: row.enrollment.id,
      userId: row.enrollment.user_id,
      dogId: row.enrollment.dog_id ?? null,
      customerName: customerName(row),
      dogName: getProgramEnrollmentDogName(row),
      programCode: row.program.code,
      programName: row.program.name,
      programLevel: row.enrollment.program_level,
      levelLabel: row.program.code === 'comandos'
        ? getProgramLevelLabel(row.enrollment.program_level)
        : 'Puppy',
      attendanceCount: row.attendances.length,
      requiredAttendances: Math.max(1, Number(row.program.required_attendances ?? 0)),
      physicalCardNumber: row.enrollment.physical_card_number ?? null,
      requirementsMetAt: row.enrollment.requirements_met_at ?? null,
      createdAt: row.enrollment.created_at,
    }))
    .sort((a, b) => {
      const readyA = a.requirementsMetAt ?? a.createdAt;
      const readyB = b.requirementsMetAt ?? b.createdAt;
      return readyA.localeCompare(readyB);
    });
}

export async function resolveAdminTrainingDecision(
  enrollmentId: string,
  decision: TrainingDecisionAction,
  newCardNumber?: string | null,
): Promise<ResolveTrainingDecisionResult> {
  const { data, error } = await supabase.rpc('admin_resolve_training_card_decision', {
    p_enrollment_id: enrollmentId,
    p_decision: decision,
    p_new_card_number: newCardNumber?.trim() || undefined,
  });
  if (error) throw error;

  const first = Array.isArray(data) ? data[0] : data;
  if (!first) throw new Error('UCAPSA no devolvió el resultado de la decisión.');

  return {
    decision: first.decision as TrainingDecisionAction,
    nextEnrollmentId: first.next_enrollment_id ?? null,
    awardedAchievementCode: first.awarded_achievement_code ?? null,
  };
}

export async function getAdminTrainingDecisionHistory(
  limit = 20,
): Promise<AdminTrainingDecisionHistoryRow[]> {
  const { data, error } = await supabase.rpc('get_admin_training_decision_history', {
    p_limit: Math.max(1, Math.min(100, Math.round(limit))),
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    decidedAt: row.decided_at,
    decision: row.decision as TrainingDecisionAction,
    enrollmentId: row.enrollment_id,
    nextEnrollmentId: row.next_enrollment_id ?? null,
    userId: row.user_id ?? null,
    dogId: row.dog_id ?? null,
    customerName: row.customer_name || 'Cliente UCAPSA',
    dogName: row.dog_name || 'Perro',
    programCode: row.program_code || '',
    programLevel: row.program_level || '',
    physicalCardNumber: row.physical_card_number ?? null,
    attendanceCount: Number(row.attendance_count ?? 0),
  }));
}
