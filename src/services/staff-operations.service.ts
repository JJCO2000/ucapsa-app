import { supabase } from '../lib/supabase';
import type { Json } from '../types/database.generated';

export type StaffClassRosterRow = {
  enrollmentId: string;
  scheduleId: string;
  classDate: string;
  startTime: string;
  programCode: 'puppy' | 'comandos' | string;
  programName: string;
  programLevel: string;
  customerName: string;
  dogId: string | null;
  dogName: string;
  rsvpResponse: 'yes' | 'no' | null;
};

export type StaffDogDirectoryRow = {
  dogId: string;
  dogName: string;
  ownerName: string;
  programCode: string | null;
  programLevel: string | null;
  isMember: boolean;
  importantNotes: number;
  watchNotes: number;
};

export type StaffDogNote = {
  id: string;
  dogId: string;
  category: 'behavior' | 'incident' | 'training' | 'care' | 'general' | string;
  severity: 'info' | 'watch' | 'important' | string;
  note: string;
  createdBy: string;
  authorName: string;
  createdAt: string;
  archivedAt: string | null;
};

export type StaffDogProfile = {
  dog_id: string;
  name: string;
  owner_name: string;
  breed: string | null;
  birth_date: string | null;
  sex: string | null;
  weight_kg: number | null;
  allergies: string | null;
  medications: string | null;
  feeding_notes: string | null;
  behavior_notes: string | null;
  veterinarian_name: string | null;
  veterinarian_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_member: boolean;
  active_training: Array<{
    enrollment_id: string;
    program_code: string;
    program_name: string;
    program_level: string;
    attendance_count: number;
  }> | null;
};

export type StaffExamCatalogRow = {
  examId: string;
  examCode: string;
  examTitle: string;
  examDate: string | null;
  seasonId: string;
  seasonName: string;
};

export type StaffExamWorkspace = {
  exam: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    exam_date: string | null;
    status: string;
    season_id: string;
    season_name: string;
    season_status: string;
  };
  items: Array<{
    id: string;
    item_number: number;
    title: string;
    description: string | null;
    max_points: number;
    sort_order: number;
  }>;
  dogs: Array<{ id: string; name: string; owner_name: string }>;
  attempts: Array<{
    id: string;
    dog_id: string;
    dog_name: string;
    attempt_number: number;
    status: string;
    presented_at: string;
    is_official: boolean;
  }>;
};

export type StaffExamAttemptDetail = {
  attempt: {
    id: string;
    exam_id: string;
    dog_id: string;
    attempt_number: number;
    status: string;
    is_official: boolean;
    presented_at: string;
  };
  exam: { id: string; code: string; title: string; status: string };
  dog: { id: string; name: string; owner_name: string };
  items: StaffExamWorkspace['items'];
  results: Array<{
    id: string;
    exam_item_id: string;
    points_awarded: number;
    evaluator_note: string | null;
  }>;
};

export type AdminPeriodReport = {
  from: string;
  to: string;
  generated_at: string;
  attendances: Array<Record<string, Json>>;
  rsvps: Array<Record<string, Json>>;
  member_visits: Array<Record<string, Json>>;
  payments: Array<Record<string, Json>>;
  exams: Array<Record<string, Json>>;
};

function asObject<T>(value: Json | null): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('UCAPSA devolvió datos operativos inválidos.');
  }
  return value as unknown as T;
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addLocalDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day + days, 12, 0, 0, 0);
  return localDateKey(date);
}

export async function getStaffClassRoster(classDate: string): Promise<StaffClassRosterRow[]> {
  const { data, error } = await supabase.rpc('get_staff_class_roster', { p_class_date: classDate });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    enrollmentId: row.enrollment_id,
    scheduleId: row.schedule_id,
    classDate: row.class_date,
    startTime: String(row.start_time ?? '').slice(0, 5),
    programCode: row.program_code,
    programName: row.program_name,
    programLevel: row.program_level,
    customerName: row.customer_name,
    dogId: row.dog_id ?? null,
    dogName: row.dog_name,
    rsvpResponse: row.rsvp_response === 'yes' || row.rsvp_response === 'no' ? row.rsvp_response : null,
  }));
}

export async function getStaffDogDirectory(query = ''): Promise<StaffDogDirectoryRow[]> {
  const { data, error } = await supabase.rpc('get_staff_dog_directory', { p_query: query.trim() || undefined });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    dogId: row.dog_id,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    programCode: row.program_code ?? null,
    programLevel: row.program_level ?? null,
    isMember: Boolean(row.is_member),
    importantNotes: Number(row.important_notes ?? 0),
    watchNotes: Number(row.watch_notes ?? 0),
  }));
}

export async function getStaffDogProfile(dogId: string): Promise<StaffDogProfile> {
  const { data, error } = await supabase.rpc('get_staff_dog_profile', { p_dog_id: dogId });
  if (error) throw error;
  return asObject<StaffDogProfile>(data);
}

export async function getStaffDogNotes(dogId: string): Promise<StaffDogNote[]> {
  const { data, error } = await supabase.rpc('get_staff_dog_notes', { p_dog_id: dogId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    dogId: row.dog_id,
    category: row.category,
    severity: row.severity,
    note: row.note,
    createdBy: row.created_by,
    authorName: row.author_name,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }));
}

export async function addStaffDogNote(input: {
  dogId: string;
  category: StaffDogNote['category'];
  severity: StaffDogNote['severity'];
  note: string;
}) {
  const { data, error } = await supabase.rpc('add_staff_dog_note', {
    p_dog_id: input.dogId,
    p_category: input.category,
    p_severity: input.severity,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

export async function archiveStaffDogNote(noteId: string) {
  const { data, error } = await supabase.rpc('archive_staff_dog_note', { p_note_id: noteId });
  if (error) throw error;
  return data;
}

export async function getStaffExamCatalog(): Promise<StaffExamCatalogRow[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_catalog');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    examId: row.exam_id,
    examCode: row.exam_code,
    examTitle: row.exam_title,
    examDate: row.exam_date ?? null,
    seasonId: row.season_id,
    seasonName: row.season_name,
  }));
}

export async function getStaffExamWorkspace(examId: string): Promise<StaffExamWorkspace> {
  const { data, error } = await supabase.rpc('get_staff_exam_workspace', { p_exam_id: examId });
  if (error) throw error;
  return asObject<StaffExamWorkspace>(data);
}

export async function getStaffExamAttemptDetail(attemptId: string): Promise<StaffExamAttemptDetail> {
  const { data, error } = await supabase.rpc('get_staff_exam_attempt_detail', { p_attempt_id: attemptId });
  if (error) throw error;
  return asObject<StaffExamAttemptDetail>(data);
}

export async function createStaffExamAttempt(input: { examId: string; dogId: string; presentedAt?: string }) {
  const { data, error } = await supabase.rpc('staff_create_ucapsa_exam_attempt', {
    p_exam_id: input.examId,
    p_dog_id: input.dogId,
    p_presented_at: input.presentedAt || undefined,
  });
  if (error) throw error;
  return data;
}

export async function saveStaffExamItemResult(input: {
  attemptId: string;
  itemId: string;
  points: number;
  note?: string;
}) {
  const { data, error } = await supabase.rpc('staff_upsert_ucapsa_exam_item_result', {
    p_attempt_id: input.attemptId,
    p_exam_item_id: input.itemId,
    p_points_awarded: input.points,
    p_evaluator_note: input.note?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function reviewStaffExamAttempt(attemptId: string) {
  const { data, error } = await supabase.rpc('staff_review_ucapsa_exam_attempt', { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}

export async function setTrainerRole(userId: string, enabled: boolean) {
  const { data, error } = await supabase.rpc('super_admin_set_trainer_role', {
    p_user_id: userId,
    p_enabled: enabled,
  });
  if (error) throw error;
  return data;
}

export async function getAdminPeriodReport(from: string, to: string): Promise<AdminPeriodReport> {
  const { data, error } = await supabase.rpc('get_admin_period_report', {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return asObject<AdminPeriodReport>(data);
}
