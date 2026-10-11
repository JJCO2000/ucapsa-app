import { supabase } from '../lib/supabase';
import { tomorrowDateKey } from './class-rsvp.service';

export type StaffClassSummary = {
  scheduleId: string;
  programCode: string;
  programName: string;
  programLevel: string;
  scheduleName: string;
  startTime: string;
  eligibleCount: number;
  confirmedCount: number;
  declinedCount: number;
  noResponseCount: number;
};

export type StaffClassRosterRow = {
  enrollmentId: string;
  dogId: string | null;
  dogName: string;
  ownerName: string;
  programCode: string;
  programLevel: string;
  scheduleId: string;
  scheduleName: string;
  startTime: string;
  rsvpResponse: 'yes' | 'no' | null;
  membershipStatus: string;
};

export type StaffClassReportRow = {
  classDate: string;
  scheduleId: string;
  programCode: string;
  programLevel: string;
  startTime: string;
  eligibleCount: number;
  confirmedCount: number;
  declinedCount: number;
  noResponseCount: number;
  attendanceCount: number;
};

export type StaffDogRow = {
  dogId: string;
  dogName: string;
  ownerName: string;
  programCode: string | null;
  programLevel: string | null;
  membershipStatus: string;
  behaviorNotes: string | null;
  latestStaffNote: string | null;
  latestNoteType: string | null;
  latestNoteSeverity: string | null;
  latestNoteAt: string | null;
};

export type StaffDogNote = {
  id: string;
  dogId: string;
  noteType: string;
  severity: string;
  note: string;
  occurredAt: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string;
};

export type StaffExam = {
  examId: string;
  examCode: string;
  examTitle: string;
  examDate: string | null;
  seasonName: string;
};

export type StaffExamDraft = {
  examId: string;
  examCode: string;
  examTitle: string;
  examDate: string | null;
  itemsCount: number;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
};

export type StaffExamImportErrorRow = {
  rowNumber: number;
  memberNumber: string | null;
  dogName: string | null;
  errors: Array<{ code?: string; message?: string; [key: string]: unknown }>;
};

export type StaffExamImportResult = {
  batchId: string;
  status: 'invalid' | 'reviewed';
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  errors: StaffExamImportErrorRow[];
};

export type StaffExamItem = {
  examItemId: string;
  itemNumber: number;
  title: string;
  description: string | null;
  maxPoints: number;
};

export type StaffExamAttempt = {
  attemptId: string;
  examId: string;
  examTitle: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  attemptStatus: string;
  attemptNumber: number;
  presentedAt: string;
};

export type StaffExamAttemptItem = {
  attemptId: string;
  examId: string;
  examTitle: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  attemptStatus: string;
  examItemId: string;
  itemNumber: number;
  itemTitle: string;
  itemDescription: string | null;
  maxPoints: number;
  pointsAwarded: number | null;
  evaluatorNote: string | null;
};

export async function getStaffClassSummary(classDate = tomorrowDateKey()): Promise<StaffClassSummary[]> {
  const { data, error } = await supabase.rpc('get_staff_class_rsvp_summary', { p_class_date: classDate });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    scheduleId: row.schedule_id,
    programCode: row.program_code,
    programName: row.program_name,
    programLevel: row.program_level,
    scheduleName: row.schedule_name,
    startTime: String(row.start_time ?? '').slice(0, 5),
    eligibleCount: Number(row.eligible_count ?? 0),
    confirmedCount: Number(row.confirmed_count ?? 0),
    declinedCount: Number(row.declined_count ?? 0),
    noResponseCount: Number(row.no_response_count ?? 0),
  }));
}

export async function getStaffClassRoster(classDate = tomorrowDateKey()): Promise<StaffClassRosterRow[]> {
  const { data, error } = await supabase.rpc('get_staff_class_roster', { p_class_date: classDate });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    enrollmentId: row.enrollment_id,
    dogId: row.dog_id ?? null,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    programCode: row.program_code,
    programLevel: row.program_level,
    scheduleId: row.schedule_id,
    scheduleName: row.schedule_name,
    startTime: String(row.start_time ?? '').slice(0, 5),
    rsvpResponse: row.rsvp_response === 'yes' || row.rsvp_response === 'no' ? row.rsvp_response : null,
    membershipStatus: row.membership_status,
  }));
}

export async function getStaffClassReport(fromDate: string, toDate: string): Promise<StaffClassReportRow[]> {
  const { data, error } = await supabase.rpc('get_staff_class_report', {
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    classDate: row.class_date,
    scheduleId: row.schedule_id,
    programCode: row.program_code,
    programLevel: row.program_level,
    startTime: String(row.start_time ?? '').slice(0, 5),
    eligibleCount: Number(row.eligible_count ?? 0),
    confirmedCount: Number(row.confirmed_count ?? 0),
    declinedCount: Number(row.declined_count ?? 0),
    noResponseCount: Number(row.no_response_count ?? 0),
    attendanceCount: Number(row.attendance_count ?? 0),
  }));
}

export async function getStaffDogs(query = ''): Promise<StaffDogRow[]> {
  const { data, error } = await supabase.rpc('get_staff_dog_directory', { p_query: query.trim() || undefined });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    dogId: row.dog_id,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    programCode: row.program_code ?? null,
    programLevel: row.program_level ?? null,
    membershipStatus: row.membership_status,
    behaviorNotes: row.behavior_notes ?? null,
    latestStaffNote: row.latest_staff_note ?? null,
    latestNoteType: row.latest_note_type ?? null,
    latestNoteSeverity: row.latest_note_severity ?? null,
    latestNoteAt: row.latest_note_at ?? null,
  }));
}

export async function getStaffDogNotes(dogId: string): Promise<StaffDogNote[]> {
  const { data, error } = await supabase.rpc('get_staff_dog_notes', { p_dog_id: dogId, p_limit: 100 });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    dogId: row.dog_id,
    noteType: row.note_type,
    severity: row.severity,
    note: row.note,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    createdByName: row.created_by_name,
  }));
}

export async function addStaffDogNote(input: {
  dogId: string;
  note: string;
  noteType: 'general' | 'training' | 'behavior' | 'interaction' | 'safety';
  severity: 'info' | 'watch' | 'high';
  occurredAt?: string;
}) {
  const { data, error } = await supabase.rpc('staff_add_dog_note', {
    p_dog_id: input.dogId,
    p_note: input.note.trim(),
    p_note_type: input.noteType,
    p_severity: input.severity,
    p_occurred_at: input.occurredAt,
  });
  if (error) throw error;
  return data;
}

export async function getStaffExamDrafts(): Promise<StaffExamDraft[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_drafts');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    examId: row.exam_id,
    examCode: row.exam_code,
    examTitle: row.exam_title,
    examDate: row.exam_date ?? null,
    itemsCount: Number(row.items_count ?? 0),
    createdBy: row.created_by ?? null,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }));
}

export async function createStaffExamDraft(input: {
  code: string;
  title: string;
  examDate?: string | null;
  items: Array<{ title: string; description?: string | null; max_points: number }>;
}) {
  const { data, error } = await supabase.rpc('trainer_create_ucapsa_exam_draft', {
    p_code: input.code.trim(),
    p_title: input.title.trim(),
    p_exam_date: input.examDate?.trim() || null,
    p_items: input.items as never,
  });
  if (error) throw error;
  if (!data) throw new Error('No se pudo crear el borrador de examen.');
  return String(data);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function importStaffExamResults(input: {
  examId: string;
  fileName: string;
  rows: Array<{
    member_number: string;
    dog_name: string;
    scores: Record<string, number | string>;
  }>;
}): Promise<StaffExamImportResult> {
  const { data, error } = await supabase.rpc('trainer_import_ucapsa_exam_results', {
    p_exam_id: input.examId.trim(),
    p_file_name: input.fileName.trim(),
    p_rows: input.rows as never,
  });
  if (error) throw error;

  const payload = asObject(data);
  const rawErrors = Array.isArray(payload.errors) ? payload.errors : [];
  const errors: StaffExamImportErrorRow[] = rawErrors.map((entry) => {
    const row = asObject(entry);
    return {
      rowNumber: Number(row.row_number ?? 0),
      memberNumber: typeof row.member_number === 'string' ? row.member_number : null,
      dogName: typeof row.dog_name === 'string' ? row.dog_name : null,
      errors: Array.isArray(row.errors)
        ? row.errors.map((item) => asObject(item) as StaffExamImportErrorRow['errors'][number])
        : [],
    };
  });

  return {
    batchId: String(payload.batch_id ?? ''),
    status: payload.status === 'reviewed' ? 'reviewed' : 'invalid',
    rowsTotal: Number(payload.rows_total ?? 0),
    rowsValid: Number(payload.rows_valid ?? 0),
    rowsInvalid: Number(payload.rows_invalid ?? 0),
    errors,
  };
}

export async function getStaffPublishedExams(): Promise<StaffExam[]> {
  const { data, error } = await supabase.rpc('get_staff_published_exams');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    examId: row.exam_id,
    examCode: row.exam_code,
    examTitle: row.exam_title,
    examDate: row.exam_date ?? null,
    seasonName: row.season_name,
  }));
}

export async function getStaffExamItems(examId: string): Promise<StaffExamItem[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_items', { p_exam_id: examId.trim() });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    examItemId: row.exam_item_id,
    itemNumber: row.item_number,
    title: row.title,
    description: row.description ?? null,
    maxPoints: Number(row.max_points ?? 0),
  }));
}

export async function getStaffExamAttempts(): Promise<StaffExamAttempt[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_attempts', { p_limit: 100 });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    attemptId: row.attempt_id,
    examId: row.exam_id,
    examTitle: row.exam_title,
    dogId: row.dog_id,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    attemptStatus: row.attempt_status,
    attemptNumber: row.attempt_number,
    presentedAt: row.presented_at,
  }));
}

export async function createStaffExamAttempt(examId: string, dogId: string) {
  const { data, error } = await supabase.rpc('trainer_create_ucapsa_exam_attempt', {
    p_exam_id: examId,
    p_dog_id: dogId,
    p_presented_at: new Date().toISOString(),
  });
  if (error) throw error;
  if (!data) throw new Error('No se pudo crear el intento.');
  return String(data);
}

export async function getStaffExamAttemptDetail(attemptId: string): Promise<StaffExamAttemptItem[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_attempt_detail', { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    attemptId: row.attempt_id,
    examId: row.exam_id,
    examTitle: row.exam_title,
    dogId: row.dog_id,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    attemptStatus: row.attempt_status,
    examItemId: row.exam_item_id,
    itemNumber: row.item_number,
    itemTitle: row.item_title,
    itemDescription: row.item_description ?? null,
    maxPoints: Number(row.max_points ?? 0),
    pointsAwarded: row.points_awarded === null ? null : Number(row.points_awarded),
    evaluatorNote: row.evaluator_note ?? null,
  }));
}

export async function saveStaffExamResult(input: {
  attemptId: string;
  examItemId: string;
  pointsAwarded: number;
  evaluatorNote?: string | null;
}) {
  const { data, error } = await supabase.rpc('trainer_upsert_ucapsa_exam_item_result', {
    p_attempt_id: input.attemptId,
    p_exam_item_id: input.examItemId,
    p_points_awarded: input.pointsAwarded,
    p_evaluator_note: input.evaluatorNote?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function reviewStaffExamAttempt(attemptId: string) {
  const { data, error } = await supabase.rpc('trainer_review_ucapsa_exam_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return data;
}

export async function setTrainerRole(userId: string, enabled: boolean) {
  const { data, error } = await supabase.rpc('superadmin_set_trainer_role', {
    p_user_id: userId,
    p_enabled: enabled,
  });
  if (error) throw error;
  return data;
}
