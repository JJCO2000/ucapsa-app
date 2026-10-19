import { supabase } from '../lib/supabase';

export type StaffClassSummaryRow = {
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

export type StaffRosterRow = {
  scheduleId: string;
  programCode: string;
  programName: string;
  programLevel: string;
  scheduleName: string;
  startTime: string;
  enrollmentId: string;
  userId: string;
  clientName: string;
  dogId: string | null;
  dogName: string;
  rsvpResponse: 'yes' | 'no' | null;
  attended: boolean;
  absent: boolean;
  safetySeverity: 'high' | 'caution' | null;
  safetyNote: string | null;
};

export type StaffPreregisteredRosterRow = {
  intakeProgramId: string;
  scheduleId: string;
  programCode: string;
  programLevel: string;
  scheduleName: string;
  startTime: string;
  dogName: string;
  ownerName: string;
  attended: boolean;
  // Estado temporal del acceso autorizado; el contrato RPC conserva card_status.
  cardStatus: 'valid' | 'not_started' | 'expired';
  totalAttendances: number;
};

export type StaffDogNote = {
  id: string;
  dogId: string;
  noteType: 'general' | 'behavior' | 'incident' | 'training' | 'health_context';
  severity: 'info' | 'caution' | 'high';
  note: string;
  happenedOn: string;
  createdBy: string | null;
  updatedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffDogOperationalProfile = {
  dogId: string;
  dogName: string;
  ownerName: string;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  weightKg: number | null;
  allergies: string | null;
  medications: string | null;
  feedingNotes: string | null;
  behaviorNotes: string | null;
  veterinarianName: string | null;
  veterinarianPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

export type TrainerExamDraftItem = {
  title: string;
  description: string | null;
  max_points: number;
};

export type StaffTrainingReportRow = {
  classDate: string;
  scheduleId: string;
  programCode: string;
  programName: string;
  programLevel: string;
  startTime: string;
  enrollmentId: string;
  userId: string;
  dogId: string | null;
  clientName: string;
  dogName: string;
  rsvpResponse: 'yes' | 'no' | null;
  attended: boolean;
  absent: boolean;
};

export type StaffRecordedAttendanceRow = {
  attendanceId: string;
  classDate: string;
  programCode: string;
  programName: string;
  programLevel: string;
  enrollmentStatus: string;
  scheduleId: string;
  scheduleTime: string | null;
  enrollmentId: string;
  clientName: string;
  dogName: string;
  attendanceSource: string | null;
  outsideWindow: boolean;
  scheduleMatchStatus: string;
};

export type TrainerExamCatalogRow = {
  examId: string;
  examCode: string;
  examTitle: string;
  examDate: string | null;
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
  itemCount: number;
  maxPoints: number;
};

export type TrainerExamDraftRow = {
  examId: string;
  examCode: string;
  examTitle: string;
  examDate: string | null;
  seasonName: string;
  itemCount: number;
  maxPoints: number;
  createdAt: string;
};

export type TrainerExamDog = {
  dogId: string;
  dogName: string;
  ownerName: string;
};

export type TrainerExamItem = {
  id: string;
  item_number: number;
  title: string;
  description: string | null;
  max_points: number;
  sort_order: number;
};

export type TrainerExamUploadResult = {
  batchId: string;
  rowsImported: number;
  attemptsReviewed: number;
  status: string;
};

export type TrainerExamAttempt = {
  attempt: {
    id: string;
    exam_id: string;
    dog_id: string;
    attempt_number: number;
    status: string;
    presented_at: string;
  };
  exam: {
    id: string;
    code: string;
    title: string;
    exam_date: string | null;
  };
  dog: {
    id: string;
    name: string;
    owner_name: string;
  };
  items: Array<{
    id: string;
    exam_id: string;
    item_number: number;
    title: string;
    description: string | null;
    max_points: number;
    sort_order: number;
  }>;
  results: Array<{
    attempt_id: string;
    exam_item_id: string;
    points_awarded: number;
    evaluator_note: string | null;
  }>;
};

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function tomorrowKey(date = new Date()) {
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12, 0, 0, 0));
}

export function currentMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
  return { startDate: localDateKey(start), endDate: localDateKey(end) };
}

export async function getStaffClassSummary(dateKey: string): Promise<StaffClassSummaryRow[]> {
  const { data, error } = await supabase.rpc('get_staff_class_rsvp_summary', { p_class_date: dateKey });
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

export async function getStaffClassRoster(dateKey: string): Promise<StaffRosterRow[]> {
  const { data, error } = await supabase.rpc('get_staff_class_roster', { p_class_date: dateKey });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    scheduleId: row.schedule_id,
    programCode: row.program_code,
    programName: row.program_name,
    programLevel: row.program_level,
    scheduleName: row.schedule_name,
    startTime: String(row.start_time ?? '').slice(0, 5),
    enrollmentId: row.enrollment_id,
    userId: row.user_id,
    clientName: row.client_name,
    dogId: row.dog_id ?? null,
    dogName: row.dog_name,
    rsvpResponse: row.rsvp_response === 'yes' || row.rsvp_response === 'no' ? row.rsvp_response : null,
    attended: Boolean(row.attended),
    absent: Boolean(row.absent),
    safetySeverity: row.safety_severity === 'high' || row.safety_severity === 'caution' ? row.safety_severity : null,
    safetyNote: row.safety_note ?? null,
  }));
}

export async function getStaffPreregisteredRoster(dateKey: string): Promise<StaffPreregisteredRosterRow[]> {
  const { data, error } = await supabase.rpc('get_staff_preregistered_class_roster', {
    p_class_date: dateKey,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    intakeProgramId: row.intake_program_id,
    scheduleId: row.schedule_id,
    programCode: row.program_code,
    programLevel: row.program_level,
    scheduleName: row.schedule_name,
    startTime: String(row.start_time).slice(0, 5),
    dogName: row.dog_name,
    ownerName: row.owner_name,
    attended: Boolean(row.attended),
    cardStatus: row.card_status as StaffPreregisteredRosterRow['cardStatus'],
    totalAttendances: row.total_attendances,
  }));
}

export async function registerStaffPreregisteredAttendance(input: {
  intakeProgramId: string;
  attendanceDate: string;
}) {
  const { data, error } = await supabase.rpc('staff_register_preregistered_attendance', {
    p_intake_program_id: input.intakeProgramId,
    p_attendance_date: input.attendanceDate,
  });
  if (error) throw error;
  return data;
}

export async function registerStaffAttendance(input: {
  enrollmentId: string;
  attendanceDate: string;
  scheduleId: string;
  notes?: string | null;
}) {
  const { data, error } = await supabase.rpc('staff_register_program_attendance', {
    p_enrollment_id: input.enrollmentId,
    p_attendance_date: input.attendanceDate,
    p_schedule_id: input.scheduleId,
    p_notes: input.notes?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function markStaffAbsence(input: {
  enrollmentId: string;
  attendanceDate: string;
  scheduleId: string;
  notes?: string | null;
}) {
  const { data, error } = await supabase.rpc('staff_mark_program_absence', {
    p_enrollment_id: input.enrollmentId,
    p_attendance_date: input.attendanceDate,
    p_schedule_id: input.scheduleId,
    p_notes: input.notes?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function requestMembershipReviewFromStaff(userId: string, note?: string | null) {
  const { data, error } = await supabase.rpc('staff_request_membership_review', {
    p_user_id: userId,
    p_note: note?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function getStaffDogNotes(dogId: string): Promise<StaffDogNote[]> {
  const { data, error } = await supabase.rpc('get_staff_dog_notes', { p_dog_id: dogId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    dogId: row.dog_id,
    noteType: row.note_type as StaffDogNote['noteType'],
    severity: row.severity as StaffDogNote['severity'],
    note: row.note,
    happenedOn: row.happened_on,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    resolvedAt: row.resolved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function addStaffDogNote(input: {
  dogId: string;
  noteType: StaffDogNote['noteType'];
  severity: StaffDogNote['severity'];
  note: string;
  happenedOn?: string | null;
}) {
  const { data, error } = await supabase.rpc('staff_add_dog_note', {
    p_dog_id: input.dogId,
    p_note_type: input.noteType,
    p_severity: input.severity,
    p_note: input.note.trim(),
    p_happened_on: input.happenedOn || undefined,
  });
  if (error) throw error;
  return data;
}

export async function updateStaffDogNote(input: {
  noteId: string;
  noteType: StaffDogNote['noteType'];
  severity: StaffDogNote['severity'];
  note: string;
  happenedOn: string;
}) {
  const { data, error } = await supabase.rpc('staff_update_dog_note', {
    p_note_id: input.noteId,
    p_note_type: input.noteType,
    p_severity: input.severity,
    p_note: input.note.trim(),
    p_happened_on: input.happenedOn,
  });
  if (error) throw error;
  return data;
}

export async function resolveStaffDogNote(noteId: string, resolved = true) {
  const { data, error } = await supabase.rpc('staff_resolve_dog_note', {
    p_note_id: noteId,
    p_resolved: resolved,
  });
  if (error) throw error;
  return data;
}


export async function getStaffDogOperationalProfile(dogId: string): Promise<StaffDogOperationalProfile | null> {
  const { data, error } = await supabase.rpc('get_staff_dog_operational_profile', {
    p_dog_id: dogId,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    dogId: row.dog_id,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    breed: row.breed ?? null,
    sex: row.sex ?? null,
    birthDate: row.birth_date ?? null,
    weightKg: row.weight_kg === null || row.weight_kg === undefined ? null : Number(row.weight_kg),
    allergies: row.allergies ?? null,
    medications: row.medications ?? null,
    feedingNotes: row.feeding_notes ?? null,
    behaviorNotes: row.behavior_notes ?? null,
    veterinarianName: row.veterinarian_name ?? null,
    veterinarianPhone: row.veterinarian_phone ?? null,
    emergencyContactName: row.emergency_contact_name ?? null,
    emergencyContactPhone: row.emergency_contact_phone ?? null,
  };
}

export async function createTrainerExamDraft(input: {
  code: string;
  title: string;
  examDate?: string | null;
  items: TrainerExamDraftItem[];
}) {
  const { data, error } = await supabase.rpc('trainer_create_ucapsa_exam_draft', {
    p_code: input.code.trim(),
    p_title: input.title.trim(),
    // La fecha es opcional en el contrato SQL; los tipos generados no reflejan
    // correctamente la nulabilidad del argumento de una función PostgreSQL.
    p_exam_date: (input.examDate || null) as string,
    p_items: input.items,
  });
  if (error) throw error;
  return data;
}

export async function publishTrainerExam(examId: string) {
  const { data, error } = await supabase.rpc('staff_publish_ucapsa_exam', {
    p_exam_id: examId,
  });
  if (error) throw error;
  return data;
}

export async function getStaffTrainingReport(startDate: string, endDate: string): Promise<StaffTrainingReportRow[]> {
  const { data, error } = await supabase.rpc('get_staff_training_report', {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    classDate: row.class_date,
    scheduleId: row.schedule_id,
    programCode: row.program_code,
    programName: row.program_name,
    programLevel: row.program_level,
    startTime: String(row.start_time ?? '').slice(0, 5),
    enrollmentId: row.enrollment_id,
    userId: row.user_id,
    dogId: row.dog_id ?? null,
    clientName: row.client_name,
    dogName: row.dog_name,
    rsvpResponse: row.rsvp_response === 'yes' || row.rsvp_response === 'no' ? row.rsvp_response : null,
    attended: Boolean(row.attended),
    absent: Boolean(row.absent),
  }));
}

/** Registros reales, separados de las sesiones esperadas por programación. */
export async function getStaffRecordedAttendance(
  startDate: string,
  endDate: string,
): Promise<StaffRecordedAttendanceRow[]> {
  const { data, error } = await supabase.rpc('get_staff_recorded_attendance', {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    attendanceId: row.attendance_id,
    classDate: row.class_date,
    programCode: row.program_code,
    programName: row.program_name,
    programLevel: row.program_level,
    enrollmentStatus: row.enrollment_status,
    scheduleId: row.schedule_id,
    scheduleTime: row.schedule_time ? String(row.schedule_time).slice(0, 5) : null,
    enrollmentId: row.enrollment_id,
    clientName: row.client_name,
    dogName: row.dog_name,
    attendanceSource: row.attendance_source ?? null,
    outsideWindow: Boolean(row.outside_window),
    scheduleMatchStatus: row.schedule_match_status,
  }));
}

export async function getStaffExamDrafts(): Promise<TrainerExamDraftRow[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_drafts');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    examId: row.exam_id,
    examCode: row.exam_code,
    examTitle: row.exam_title,
    examDate: row.exam_date ?? null,
    seasonName: row.season_name,
    itemCount: Number(row.item_count ?? 0),
    maxPoints: Number(row.max_points ?? 0),
    createdAt: row.created_at,
  }));
}

export async function getTrainerExamCatalog(): Promise<TrainerExamCatalogRow[]> {
  const { data, error } = await supabase.rpc('get_trainer_exam_catalog');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    examId: row.exam_id,
    examCode: row.exam_code,
    examTitle: row.exam_title,
    examDate: row.exam_date ?? null,
    seasonId: row.season_id,
    seasonName: row.season_name,
    seasonStatus: row.season_status,
    itemCount: Number(row.item_count ?? 0),
    maxPoints: Number(row.max_points ?? 0),
  }));
}

export async function getTrainerExamDogs(): Promise<TrainerExamDog[]> {
  const { data, error } = await supabase.rpc('get_trainer_exam_dogs');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    dogId: row.dog_id,
    dogName: row.dog_name,
    ownerName: row.owner_name,
  }));
}

export async function getTrainerExamItems(examId: string): Promise<TrainerExamItem[]> {
  const { data, error } = await supabase.rpc('get_trainer_exam_items', {
    p_exam_id: examId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    item_number: Number(row.item_number),
    title: row.title,
    description: row.description ?? null,
    max_points: Number(row.max_points),
    sort_order: Number(row.sort_order),
  }));
}

export async function uploadTrainerExamResults(input: {
  examId: string;
  fileName: string;
  rows: Array<{
    member_number: string;
    dog_name: string;
    scores: Record<string, number | string>;
  }>;
}): Promise<TrainerExamUploadResult> {
  const { data, error } = await supabase.rpc('trainer_import_ucapsa_exam_results', {
    p_exam_id: input.examId,
    p_file_name: input.fileName,
    p_rows: input.rows,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('UCAPSA devolvió un resultado de importación inválido.');
  }

  const result = data as Record<string, unknown>;
  return {
    batchId: String(result.batch_id ?? ''),
    rowsImported: Number(result.rows_imported ?? 0),
    attemptsReviewed: Number(result.attempts_reviewed ?? 0),
    status: String(result.status ?? ''),
  };
}

export async function createTrainerExamAttempt(examId: string, dogId: string) {
  const { data, error } = await supabase.rpc('trainer_create_ucapsa_exam_attempt', {
    p_exam_id: examId,
    p_dog_id: dogId,
  });
  if (error) throw error;
  return data;
}

export async function getTrainerExamAttempt(attemptId: string): Promise<TrainerExamAttempt> {
  const { data, error } = await supabase.rpc('get_trainer_exam_attempt', { p_attempt_id: attemptId });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Intento de examen inválido.');
  return data as unknown as TrainerExamAttempt;
}

export async function saveTrainerExamResult(input: {
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

export async function reviewTrainerExamAttempt(attemptId: string) {
  const { data, error } = await supabase.rpc('trainer_review_ucapsa_exam_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return data;
}
