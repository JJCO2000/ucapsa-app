import { supabase } from '../lib/supabase';
import type { TableInsert, TableUpdate } from '../types/database.helpers';
import type {
  Profile,
  ProgramAttendance,
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  ProgramEnrollmentWithDetails,
  ProgramLevel,
  ProgramClassCancellation,
  ProgramSchedule,
  ProgramScheduleVersion,
  UcapsaProgram,
  AttendanceQrCode,
  AttendanceQrProgramCode,
  ProgramCode,
  ProgramDogLink,
} from '../types/app.types';

export type CreateProgramEnrollmentInput = {
  userId: string;
  programId: string;
  scheduleId: string;
  dogId?: string | null;
  dogName: string;
  physicalCardNumber?: string | null;
  programLevel?: ProgramLevel;
  notes?: string | null;
};

export type UpdateProgramEnrollmentInput = {
  programId?: string;
  scheduleId?: string;
  dogId?: string | null;
  dogName?: string;
  physicalCardNumber?: string | null;
  attendancesCount?: number;
  programLevel?: ProgramLevel;
  status?: ProgramEnrollmentStatus;
  notes?: string | null;
};

export type UpdateProgramScheduleInput = {
  name?: string;
  dayOfWeek?: number;
  startTime?: string;
  repeatType?: 'weekly' | 'biweekly';
  cycleStartDate?: string | null;
  sequenceOrder?: number;
  isActive?: boolean;
};

export type RegisterProgramAttendanceInput = {
  enrollmentId: string;
  attendanceDate: string;
  scheduleId?: string | null;
  notes?: string | null;
};

export type CorrectProgramAttendanceInput = {
  attendanceId: string;
  attendanceDate: string;
  scheduleId: string;
  notes?: string | null;
};

export type RegisterAttendanceFromQrResult = {
  attendance_id: string | null;
  session_id: string | null;
  result: 'registered' | 'already_registered' | 'invalid_qr' | 'not_owner' | 'inactive_enrollment' | 'card_dates_missing' | 'card_not_valid' | 'wrong_program' | 'schedule_not_found' | 'wrong_day' | 'wrong_cycle' | 'cancelled' | 'outside_window_confirmation_required' | string;
  message: string;
};

export function buildOfficialAttendanceQrValue(programCode: AttendanceQrProgramCode, token: string) {
  return `ucapsa-attendance:${programCode}:${token.trim()}`;
}

export function parseOfficialAttendanceQrValue(value: string): { programCode: AttendanceQrProgramCode; token: string } | null {
  const raw = value.trim();
  const match = /^ucapsa-attendance:(puppy|comandos|member):(.+)$/i.exec(raw);
  if (!match) return null;
  const programCode = match[1].toLowerCase() as AttendanceQrProgramCode;
  const token = match[2].trim();
  if (!token) return null;
  return { programCode, token };
}

export type CreateProgramClassCancellationInput = {
  scheduleId: string;
  cancellationDate: string;
  reason?: string | null;
  createAnnouncement?: boolean;
};

export type CreateProgramDayCancellationsInput = {
  scheduleIds: string[];
  cancellationDate: string;
  reason?: string | null;
  createAnnouncement?: boolean;
};

const dayLabels = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

export const programLevelOptions: Array<{ value: ProgramLevel; label: string }> = [
  { value: 'principiante', label: 'Básico' },
  { value: 'medio', label: 'Medio' },
  { value: 'avanzado', label: 'Avanzado' },
];

function createQrToken() {
  const randomA = Math.random().toString(36).slice(2, 12);
  const randomB = Math.random().toString(36).slice(2, 12);
  return `program_${Date.now()}_${randomA}${randomB}`;
}

function normalizeProgram(row: unknown): UcapsaProgram {
  return row as UcapsaProgram;
}

function normalizeSchedule(row: unknown): ProgramSchedule {
  return row as ProgramSchedule;
}

function normalizeScheduleVersion(row: unknown): ProgramScheduleVersion {
  return row as ProgramScheduleVersion;
}

function localTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isVersionEffectiveOnDate(version: ProgramScheduleVersion, dateKey: string) {
  if (version.retired_at) return false;
  if (version.effective_from > dateKey) return false;
  if (version.effective_to && version.effective_to < dateKey) return false;
  return true;
}

function overlayScheduleVersion(schedule: ProgramSchedule, version: ProgramScheduleVersion | null): ProgramSchedule {
  if (!version) return schedule;
  return {
    ...schedule,
    name: version.name,
    day_of_week: version.day_of_week,
    start_time: version.start_time,
    repeat_type: version.repeat_type,
    cycle_start_date: version.cycle_start_date,
    sequence_order: version.sequence_order,
    is_active: version.is_active,
    version_id: version.id,
    effective_from: version.effective_from,
    effective_to: version.effective_to,
    change_note: version.change_note,
  };
}

function effectiveVersionForDate(versions: ProgramScheduleVersion[], scheduleId: string, dateKey: string) {
  return versions
    .filter((version) => version.schedule_id === scheduleId && isVersionEffectiveOnDate(version, dateKey))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at))[0] ?? null;
}

async function loadScheduleBasesAndVersions(scheduleIds?: string[]): Promise<{ schedules: ProgramSchedule[]; versions: ProgramScheduleVersion[] }> {
  let scheduleQuery = supabase.from('program_schedules').select('*');
  let versionQuery = supabase.from('program_schedule_versions').select('*').is('retired_at', null);

  if (scheduleIds && scheduleIds.length > 0) {
    scheduleQuery = scheduleQuery.in('id', scheduleIds);
    versionQuery = versionQuery.in('schedule_id', scheduleIds);
  }

  const [scheduleResult, versionResult] = await Promise.all([scheduleQuery, versionQuery]);
  if (scheduleResult.error) throw scheduleResult.error;
  if (versionResult.error) throw versionResult.error;

  return {
    schedules: (scheduleResult.data ?? []).map(normalizeSchedule),
    versions: (versionResult.data ?? []).map(normalizeScheduleVersion),
  };
}

function normalizeEnrollment(row: unknown): ProgramEnrollment {
  return row as ProgramEnrollment;
}

function normalizeAttendance(row: unknown): ProgramAttendance {
  return row as ProgramAttendance;
}

function normalizeClassCancellation(row: unknown): ProgramClassCancellation {
  return row as ProgramClassCancellation;
}

export function getProgramStatusLabel(status: ProgramEnrollmentStatus) {
  const labels: Record<ProgramEnrollmentStatus, string> = {
    active: 'Activo',
    completed: 'Completado',
    cancelled: 'Cancelado',
  };

  return labels[status] ?? status;
}

export function getProgramCodeLabel(code: string | null | undefined) {
  if (code === 'puppy') return 'Puppy';
  if (code === 'comandos') return 'Comandos';
  return 'Programa';
}

export function getProgramLevelLabel(level: ProgramLevel | null | undefined) {
  if (level === 'principiante') return 'Básico';
  if (level === 'medio') return 'Medio';
  if (level === 'avanzado') return 'Avanzado';
  return 'Base';
}

export function getProgramLevelDisplayLabel(
  programCode: ProgramCode | string | null | undefined,
  level: ProgramLevel | null | undefined,
) {
  if (programCode !== 'comandos') return null;
  return getProgramLevelLabel(level);
}

export function getDefaultProgramLevel(program: Pick<UcapsaProgram, 'code'> | null | undefined): ProgramLevel {
  return program?.code === 'comandos' ? 'principiante' : 'base';
}

export function getNextProgramLevel(level: ProgramLevel | null | undefined): ProgramLevel {
  if (level === 'principiante') return 'medio';
  if (level === 'medio') return 'avanzado';
  if (level === 'avanzado') return 'avanzado';
  return 'base';
}

export function sortProgramSchedules(schedules: ProgramSchedule[]) {
  return [...schedules].sort((a, b) => {
    const orderDiff = (a.sequence_order ?? 999) - (b.sequence_order ?? 999);
    if (orderDiff !== 0) return orderDiff;
    const dayDiff = a.day_of_week - b.day_of_week;
    if (dayDiff !== 0) return dayDiff;
    return String(a.start_time).localeCompare(String(b.start_time));
  });
}

export function formatProgramScheduleDetailLabel(schedule: ProgramSchedule | null | undefined) {
  if (!schedule) return 'Sin horario';
  const repeatLabel = schedule.repeat_type === 'biweekly' ? 'cada 2 semanas' : 'semanal';
  const time = String(schedule.start_time ?? '').slice(0, 5);
  return `${dayLabels[schedule.day_of_week] ?? 'Dia'} ${time || '--:--'} - ${repeatLabel}`;
}

export function formatProgramScheduleName(schedule: ProgramSchedule | null | undefined, program?: Pick<UcapsaProgram, 'code' | 'name'> | null) {
  if (!schedule) return 'Clase';
  if (program?.code === 'comandos') return 'Comandos';
  if (program?.code === 'puppy') return `Clase ${Math.max(1, Number(schedule.sequence_order || 1))}`;
  return schedule.name?.trim() || program?.name || 'Clase';
}

export function formatProgramScheduleDisplayLabel(schedule: ProgramSchedule | null | undefined, program?: Pick<UcapsaProgram, 'code' | 'name'> | null) {
  return `${formatProgramScheduleName(schedule, program)} - ${formatProgramScheduleDetailLabel(schedule)}`;
}

export function formatScheduleLabel(schedule: ProgramSchedule | null | undefined) {
  return formatProgramScheduleDetailLabel(schedule);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

export function getNextProgramScheduleDate(schedule: ProgramSchedule | null | undefined, fromDate = new Date()) {
  if (!schedule) return null;
  const start = startOfLocalDay(fromDate);
  const base = schedule.cycle_start_date ? startOfLocalDay(new Date(`${schedule.cycle_start_date}T12:00:00`)) : start;
  const searchStart = start > base ? start : base;

  for (let offset = 0; offset <= 370; offset += 1) {
    const candidate = new Date(searchStart);
    candidate.setDate(searchStart.getDate() + offset);
    const candidateKey = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
    if (schedule.effective_from && candidateKey < schedule.effective_from) continue;
    if (schedule.effective_to && candidateKey > schedule.effective_to) return null;
    if (candidate.getDay() !== schedule.day_of_week) continue;

    if (schedule.repeat_type === 'biweekly') {
      const diffDays = Math.floor((candidate.getTime() - base.getTime()) / 86_400_000);
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks % 2 !== 0) continue;
    }

    return candidate;
  }

  return null;
}

export function formatNextProgramClassLabel(schedule: ProgramSchedule | null | undefined) {
  const date = getNextProgramScheduleDate(schedule);
  if (!date) return 'Proxima clase pendiente';
  const time = String(schedule?.start_time ?? '').slice(0, 5);
  const dateLabel = date.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' });
  return `Proxima: ${dateLabel}${time ? `, ${time}` : ''}`;
}

export function getRecommendedScheduleId(programId: string, schedules: ProgramSchedule[], attendanceCount: number) {
  const activeSchedules = sortProgramSchedules(schedules.filter((schedule) => schedule.program_id === programId && schedule.is_active));
  if (activeSchedules.length === 0) return '';
  const index = Math.min(Math.max(0, attendanceCount), activeSchedules.length - 1);
  return activeSchedules[index]?.id ?? activeSchedules[0].id;
}


function parseDateKeyAsLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function isProgramScheduleActiveOnDate(schedule: ProgramSchedule, dateKey: string) {
  if (!schedule.is_active) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  if (schedule.effective_from && dateKey < schedule.effective_from) return false;
  if (schedule.effective_to && dateKey > schedule.effective_to) return false;

  const date = parseDateKeyAsLocalDate(dateKey);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getDay() !== schedule.day_of_week) return false;

  if (schedule.repeat_type !== 'biweekly') return true;

  const base = parseDateKeyAsLocalDate(schedule.cycle_start_date || dateKey);
  const diffDays = Math.floor((date.getTime() - base.getTime()) / 86_400_000);
  if (diffDays < 0) return false;
  const diffWeeks = Math.floor(diffDays / 7);
  return diffWeeks % 2 === 0;
}

export function getProgramSchedulesForDate(schedules: ProgramSchedule[], dateKey: string) {
  return sortProgramSchedules(schedules.filter((schedule) => isProgramScheduleActiveOnDate(schedule, dateKey)));
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

async function hydrateEnrollments(enrollments: ProgramEnrollment[]): Promise<ProgramEnrollmentWithDetails[]> {
  if (enrollments.length === 0) return [];

  const programIds = [...new Set(enrollments.map((item) => item.program_id))];
  const scheduleIds = [...new Set(enrollments.map((item) => item.schedule_id))];
  const userIds = [...new Set(enrollments.map((item) => item.user_id))];
  const enrollmentIds = enrollments.map((item) => item.id);
  const dogIds = [...new Set(enrollments.map((item) => item.dog_id).filter((value): value is string => Boolean(value)))];

  const [programsResult, scheduleBundle, profilesResult, attendancesResult, dogsResult] = await Promise.all([
    supabase.from('programs').select('*').in('id', programIds),
    loadScheduleBasesAndVersions(scheduleIds),
    supabase.from('profiles').select('*').in('user_id', userIds),
    supabase.from('program_attendances').select('*').in('enrollment_id', enrollmentIds).order('attendance_date', { ascending: false }),
    dogIds.length > 0 ? supabase.from('dogs').select('id,name,is_active,created_at,updated_at').in('id', dogIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (programsResult.error) throw programsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (attendancesResult.error) throw attendancesResult.error;
  if (dogsResult.error) throw dogsResult.error;

  const programs = ((programsResult.data ?? []) as UcapsaProgram[]).reduce<Record<string, UcapsaProgram>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const today = localTodayKey();
  const schedules = scheduleBundle.schedules.reduce<Record<string, ProgramSchedule>>((acc, item) => {
    acc[item.id] = overlayScheduleVersion(item, effectiveVersionForDate(scheduleBundle.versions, item.id, today));
    return acc;
  }, {});

  const profiles = ((profilesResult.data ?? []) as Profile[]).reduce<Record<string, Profile>>((acc, item) => {
    acc[item.user_id] = item;
    return acc;
  }, {});

  const dogs = ((dogsResult.data ?? []) as ProgramDogLink[]).reduce<Record<string, ProgramDogLink>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const attendances = ((attendancesResult.data ?? []) as ProgramAttendance[]).reduce<Record<string, ProgramAttendance[]>>((acc, item) => {
    if (!acc[item.enrollment_id]) acc[item.enrollment_id] = [];
    acc[item.enrollment_id].push(item);
    return acc;
  }, {});

  return enrollments
    .map((enrollment) => {
      const program = programs[enrollment.program_id];
      const schedule = schedules[enrollment.schedule_id];
      if (!program || !schedule) return null;
      return {
        enrollment,
        program,
        schedule,
        profile: profiles[enrollment.user_id] ?? null,
        dog: enrollment.dog_id ? dogs[enrollment.dog_id] ?? null : null,
        attendances: attendances[enrollment.id] ?? [],
      } satisfies ProgramEnrollmentWithDetails;
    })
    .filter(Boolean) as ProgramEnrollmentWithDetails[];
}

export function getProgramEnrollmentDogName(item: ProgramEnrollmentWithDetails | null | undefined) {
  return item?.dog?.name?.trim() || item?.enrollment.dog_name?.trim() || item?.profile?.dog_name?.trim() || 'Perro';
}

export async function getPrograms(): Promise<UcapsaProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? [])
    .map(normalizeProgram)
    .sort((a, b) => (a.code === 'puppy' ? -1 : 1) - (b.code === 'puppy' ? -1 : 1));
}

export async function getProgramSchedules(dateKey = localTodayKey()): Promise<ProgramSchedule[]> {
  const bundle = await loadScheduleBasesAndVersions();
  return sortProgramSchedules(
    bundle.schedules.map((schedule) => overlayScheduleVersion(schedule, effectiveVersionForDate(bundle.versions, schedule.id, dateKey))),
  );
}

export async function getProgramScheduleTimeline(): Promise<ProgramSchedule[]> {
  const bundle = await loadScheduleBasesAndVersions();
  const bySchedule = new Map(bundle.schedules.map((schedule) => [schedule.id, schedule]));
  const rows = bundle.versions
    .filter((version) => !version.retired_at)
    .map((version) => {
      const base = bySchedule.get(version.schedule_id);
      return base ? overlayScheduleVersion(base, version) : null;
    })
    .filter(Boolean) as ProgramSchedule[];

  const versionedIds = new Set(rows.map((schedule) => schedule.id));
  for (const base of bundle.schedules) {
    if (!versionedIds.has(base.id)) rows.push(base);
  }

  return [...rows].sort((a, b) =>
    a.program_id.localeCompare(b.program_id)
    || a.sequence_order - b.sequence_order
    || String(a.effective_from ?? '').localeCompare(String(b.effective_from ?? ''))
    || a.start_time.localeCompare(b.start_time),
  );
}

export function getProgramScheduleFromTimeline(timeline: ProgramSchedule[], scheduleId: string, dateKey: string) {
  return timeline
    .filter((schedule) => schedule.id === scheduleId)
    .filter((schedule) => (!schedule.effective_from || schedule.effective_from <= dateKey) && (!schedule.effective_to || schedule.effective_to >= dateKey))
    .sort((a, b) => String(b.effective_from ?? '').localeCompare(String(a.effective_from ?? '')))[0] ?? null;
}

export async function changeProgramScheduleFromDate(
  scheduleId: string,
  effectiveFrom: string,
  input: UpdateProgramScheduleInput & { changeNote?: string | null },
): Promise<string> {
  const current = (await getProgramSchedules(effectiveFrom)).find((schedule) => schedule.id === scheduleId);
  if (!current) throw new Error('Horario no encontrado para esa fecha.');

  const dayOfWeek = 'dayOfWeek' in input ? Math.max(0, Math.min(6, Number(input.dayOfWeek ?? current.day_of_week))) : current.day_of_week;
  const repeatType = input.repeatType ?? current.repeat_type;
  const cycleStartDate = repeatType === 'biweekly' ? (input.cycleStartDate || effectiveFrom) : null;

  const { data, error } = await supabase.rpc('admin_change_program_schedule_from_date', {
    p_schedule_id: scheduleId,
    p_effective_from: effectiveFrom,
    p_name: input.name?.trim() || current.name,
    p_day_of_week: dayOfWeek,
    p_start_time: input.startTime || String(current.start_time).slice(0, 8),
    p_repeat_type: repeatType,
    p_cycle_start_date: cycleStartDate ?? undefined,
    p_sequence_order: Math.max(1, Number(input.sequenceOrder ?? current.sequence_order)),
    p_is_active: input.isActive ?? current.is_active,
    p_change_note: input.changeNote?.trim() || undefined,
  });

  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvio la nueva version del horario.');
  return String(data);
}

export async function getOfficialAttendanceQrCodes(): Promise<AttendanceQrCode[]> {
  const { data, error } = await supabase
    .from('attendance_qr_codes')
    .select('*')
    .in('program_code', ['puppy', 'comandos', 'member'])
    .order('program_code', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AttendanceQrCode[];
}

export async function registerMyProgramAttendanceFromQr(input: { token: string; enrollmentId: string; confirmOutsideWindow?: boolean }): Promise<RegisterAttendanceFromQrResult> {
  const token = input.token.trim();
  if (!token) throw new Error('QR de asistencia vacio.');

  const { data, error } = await supabase.rpc('register_program_attendance_from_qr', {
    p_qr_token: token,
    p_enrollment_id: input.enrollmentId,
    p_confirm_outside_window: input.confirmOutsideWindow ?? false,
  });

  if (error) throw error;
  const first = Array.isArray(data) ? data[0] : data;
  if (!first) throw new Error('Supabase no devolvio resultado del registro de asistencia.');
  return first as RegisterAttendanceFromQrResult;
}


export async function updateProgramSchedule(scheduleId: string, input: UpdateProgramScheduleInput): Promise<void> {
  await changeProgramScheduleFromDate(scheduleId, localTodayKey(), input);
}

export async function getMyProgramEnrollments(): Promise<ProgramEnrollmentWithDetails[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('program_enrollments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return hydrateEnrollments((data ?? []).map(normalizeEnrollment));
}

export async function getAdminProgramRows(): Promise<ProgramEnrollmentWithDetails[]> {
  const { data, error } = await supabase
    .from('program_enrollments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return hydrateEnrollments((data ?? []).map(normalizeEnrollment));
}

export async function getProgramClientProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['client', 'member'])
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function createProgramEnrollment(input: CreateProgramEnrollmentInput): Promise<ProgramEnrollment> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('program_enrollments')
    .insert({
      user_id: input.userId,
      program_id: input.programId,
      schedule_id: input.scheduleId,
      dog_id: input.dogId?.trim() || null,
      dog_name: input.dogName.trim(),
      physical_card_number: input.physicalCardNumber?.trim() || null,
      qr_token: createQrToken(),
      status: 'active',
      attendances_count: 0,
      program_level: input.programLevel ?? 'base',
      last_attendance_at: null,
      notes: input.notes?.trim() || null,
      started_at: now.slice(0, 10),
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeEnrollment(data);
}

export async function updateProgramEnrollment(enrollmentId: string, input: UpdateProgramEnrollmentInput): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, string | number | null> = { updated_at: now };

  if ('programId' in input) payload.program_id = input.programId ?? null;
  if ('scheduleId' in input) payload.schedule_id = input.scheduleId ?? null;
  if ('dogId' in input) payload.dog_id = input.dogId?.trim() || null;
  if ('dogName' in input) payload.dog_name = input.dogName?.trim() || null;
  if ('physicalCardNumber' in input) payload.physical_card_number = input.physicalCardNumber?.trim() || null;
  if ('attendancesCount' in input) payload.attendances_count = Math.max(0, Number(input.attendancesCount ?? 0));
  if ('programLevel' in input && input.programLevel) payload.program_level = input.programLevel;
  if ('status' in input && input.status) {
    payload.status = input.status;
    payload.completed_at = input.status === 'completed' ? now : null;
    payload.cancelled_at = input.status === 'cancelled' ? now : null;
  }
  if ('notes' in input) payload.notes = input.notes?.trim() || null;

  const { error } = await supabase.from('program_enrollments').update(payload as TableUpdate<'program_enrollments'>).eq('id', enrollmentId);
  if (error) throw error;
}


export async function registerProgramAttendance(input: RegisterProgramAttendanceInput): Promise<void> {
  // La asistencia manual de Admin pasa por una RPC de servidor.
  // Asi se valida una sesion real y el progreso se refresca en Supabase.
  const { error } = await supabase.rpc('register_program_attendance_admin', {
    p_enrollment_id: input.enrollmentId,
    p_attendance_date: input.attendanceDate,
    p_schedule_id: input.scheduleId ?? undefined,
    p_notes: input.notes?.trim() || undefined,
  });

  if (error) throw error;
}

export async function correctProgramAttendance(input: CorrectProgramAttendanceInput): Promise<void> {
  const { error } = await supabase.rpc('correct_program_attendance_admin', {
    p_attendance_id: input.attendanceId,
    p_attendance_date: input.attendanceDate,
    p_schedule_id: input.scheduleId,
    p_notes: input.notes?.trim() || undefined,
  });

  if (error) throw error;
}

export async function deleteProgramAttendance(attendanceId: string, _enrollmentId: string): Promise<void> {
  // La RPC valida rol Admin y refresca el progreso derivado despues del DELETE.
  const { error } = await supabase.rpc('delete_program_attendance_admin', { p_attendance_id: attendanceId });
  if (error) throw error;
}

export async function setProgramEnrollmentStatus(enrollmentId: string, status: ProgramEnrollmentStatus): Promise<void> {
  await updateProgramEnrollment(enrollmentId, { status });
}


export async function setProgramEnrollmentAttendanceCount(
  enrollmentId: string,
  targetCount: number,
  _attendanceDate: string,
  _notes?: string | null,
): Promise<void> {
  // Compatibilidad defensiva: ya no se fabrican asistencias para alcanzar un contador.
  // El avance es derivado exclusivamente de program_attendances reales.
  const safeCount = Math.max(0, Math.floor(Number(targetCount) || 0));
  const { count, error } = await supabase
    .from('program_attendances')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollmentId);

  if (error) throw error;

  const currentCount = count ?? 0;
  if (safeCount !== currentCount) {
    throw new Error(
      `El avance ya no se modifica por contador. Hay ${currentCount} asistencia${currentCount === 1 ? '' : 's'} real${currentCount === 1 ? '' : 'es'}. Registra o elimina asistencias desde el historial.`,
    );
  }
}

export async function deleteProgramEnrollment(enrollmentId: string): Promise<void> {
  const { error } = await supabase.from('program_enrollments').delete().eq('id', enrollmentId);
  if (error) throw error;
}




export async function getProgramEnrollmentByQrToken(qrToken: string): Promise<ProgramEnrollmentWithDetails | null> {
  const cleanToken = qrToken.trim();
  if (!cleanToken) return null;

  const { data, error } = await supabase
    .from('program_enrollments')
    .select('*')
    .eq('qr_token', cleanToken)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const rows = await hydrateEnrollments([normalizeEnrollment(data)]);
  return rows[0] ?? null;
}




export async function getProgramClassCancellations(includeRestored = false): Promise<ProgramClassCancellation[]> {
  let query = supabase
    .from('program_class_cancellations')
    .select('*, schedule:program_schedules(*)')
    .order('cancellation_date', { ascending: true })
    .order('created_at', { ascending: false });

  if (!includeRestored) query = query.is('restored_at', null);

  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []).map(normalizeClassCancellation);
  if (items.length === 0) return [];

  const timeline = await getProgramScheduleTimeline();
  return items.map((item) => ({
    ...item,
    schedule: getProgramScheduleFromTimeline(timeline, item.schedule_id, item.cancellation_date) ?? item.schedule ?? null,
  }));
}

export async function getProgramClassCancellationByAnnouncementId(announcementId: string): Promise<ProgramClassCancellation | null> {
  const cleanId = announcementId.trim();
  if (!cleanId) return null;

  const { data, error } = await supabase
    .from('program_class_cancellations')
    .select('*, schedule:program_schedules(*)')
    .eq('announcement_id', cleanId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeClassCancellation(data) : null;
}

async function getActiveCancellationForScheduleDate(scheduleId: string, dateKey: string): Promise<ProgramClassCancellation | null> {
  const { data, error } = await supabase
    .from('program_class_cancellations')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('cancellation_date', dateKey)
    .is('restored_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeClassCancellation(data) : null;
}

export async function createProgramClassCancellation(input: CreateProgramClassCancellationInput): Promise<ProgramClassCancellation> {
  const userId = await getCurrentUserId();
  const reason = input.reason?.trim() || 'Clase cancelada por UCAPSA.';

  const [effectiveSchedules, programs] = await Promise.all([
    getProgramSchedules(input.cancellationDate),
    getPrograms(),
  ]);
  const schedule = effectiveSchedules.find((item) => item.id === input.scheduleId) ?? null;
  if (!schedule) throw new Error('Horario no encontrado para esa fecha.');
  const program = programs.find((item) => item.id === schedule.program_id) ?? null;

  if (!isProgramScheduleActiveOnDate(schedule, input.cancellationDate)) {
    throw new Error('Este horario no tiene clase programada ese dia.');
  }

  const existingCancellation = await getActiveCancellationForScheduleDate(input.scheduleId, input.cancellationDate);
  if (existingCancellation) {
    throw new Error('Esta clase ya esta cancelada para esa fecha.');
  }

  const { data, error } = await supabase
    .from('program_class_cancellations')
    .insert({
      schedule_id: input.scheduleId,
      cancellation_date: input.cancellationDate,
      reason,
      created_by: userId,
    })
    .select('*, schedule:program_schedules(*)')
    .single();

  if (error) throw error;

  const cancellation = normalizeClassCancellation(data);

  if (input.createAnnouncement !== false) {
    const className = formatProgramScheduleName(schedule, program);
    const classDetail = formatProgramScheduleDetailLabel(schedule);
    const title = `Clase cancelada - ${className}`;
    const content = `${program?.name ?? 'Clase UCAPSA'} - ${className} (${classDetail}) del ${input.cancellationDate} queda cancelada. Motivo: ${reason}`;
    const { data: announcementData, error: announcementError } = await supabase
      .from('announcements')
      .insert({
        title,
        content,
        audience: 'public',
        is_pinned: true,
        is_published: true,
        event_id: null,
        announcement_date: input.cancellationDate,
        color_key: 'red',
        priority: 'high',
        created_by: userId,
      })
      .select('id')
      .single();

    if (announcementError) throw announcementError;

    const announcementId = (announcementData as { id: string }).id;
    const { data: updatedData, error: updateError } = await supabase
      .from('program_class_cancellations')
      .update({ announcement_id: announcementId, updated_at: new Date().toISOString() })
      .eq('id', cancellation.id)
      .select('*, schedule:program_schedules(*)')
      .single();

    if (updateError) throw updateError;
    return normalizeClassCancellation(updatedData);
  }

  return cancellation;
}


export async function createProgramDayCancellations(input: CreateProgramDayCancellationsInput): Promise<ProgramClassCancellation[]> {
  const userId = await getCurrentUserId();
  const reason = input.reason?.trim() || 'Clases canceladas por UCAPSA.';
  const uniqueScheduleIds = [...new Set(input.scheduleIds.map((item) => item.trim()).filter(Boolean))];

  if (uniqueScheduleIds.length === 0) {
    throw new Error('No hay clases disponibles para cancelar ese dia.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cancellationDate)) {
    throw new Error('La fecha debe tener formato AAAA-MM-DD.');
  }

  const [effectiveSchedules, programs] = await Promise.all([
    getProgramSchedules(input.cancellationDate),
    getPrograms(),
  ]);
  const programById = new Map(programs.map((program) => [program.id, program]));
  const rows = effectiveSchedules
    .filter((schedule) => uniqueScheduleIds.includes(schedule.id))
    .map((schedule) => ({ ...schedule, program: programById.get(schedule.program_id) ?? null }));
  const validRows = rows.filter((schedule) => isProgramScheduleActiveOnDate(schedule, input.cancellationDate));

  if (validRows.length === 0) {
    throw new Error('No hay clases programadas para cancelar ese dia.');
  }

  const { data: existingData, error: existingError } = await supabase
    .from('program_class_cancellations')
    .select('*')
    .in('schedule_id', validRows.map((schedule) => schedule.id))
    .eq('cancellation_date', input.cancellationDate)
    .is('restored_at', null);

  if (existingError) throw existingError;

  const existingScheduleIds = new Set((existingData ?? []).map((item) => normalizeClassCancellation(item).schedule_id));
  const rowsToCancel = validRows.filter((schedule) => !existingScheduleIds.has(schedule.id));

  if (rowsToCancel.length === 0) {
    throw new Error('Todas las clases de ese dia ya estan canceladas.');
  }

  let announcementId: string | null = null;

  if (input.createAnnouncement !== false) {
    const classList = rowsToCancel
      .map((schedule) => `${schedule.program?.name ?? 'Clase UCAPSA'} - ${formatProgramScheduleName(schedule, schedule.program ?? null)}`)
      .join(', ');

    const { data: announcementData, error: announcementError } = await supabase
      .from('announcements')
      .insert({
        title: 'Clases canceladas',
        content: `Las clases UCAPSA del ${input.cancellationDate} quedan canceladas. Clases: ${classList}. Motivo: ${reason}`,
        audience: 'public',
        is_pinned: true,
        is_published: true,
        event_id: null,
        announcement_date: input.cancellationDate,
        color_key: 'red',
        priority: 'high',
        created_by: userId,
      })
      .select('id')
      .single();

    if (announcementError) throw announcementError;
    announcementId = (announcementData as { id: string }).id;
  }

  const payload = rowsToCancel.map((schedule) => ({
    schedule_id: schedule.id,
    cancellation_date: input.cancellationDate,
    reason,
    announcement_id: announcementId,
    created_by: userId,
  }));

  const { data, error } = await supabase
    .from('program_class_cancellations')
    .insert(payload as TableInsert<'program_class_cancellations'>[])
    .select('*, schedule:program_schedules(*)');

  if (error) throw error;
  return (data ?? []).map(normalizeClassCancellation);
}


export async function restoreProgramClassCancellation(cancellationId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  const { data, error: loadError } = await supabase
    .from('program_class_cancellations')
    .select('*')
    .eq('id', cancellationId)
    .single();

  if (loadError) throw loadError;

  const cancellation = normalizeClassCancellation(data);

  const { error } = await supabase
    .from('program_class_cancellations')
    .update({ restored_at: now, restored_by: userId, updated_at: now })
    .eq('id', cancellationId);

  if (error) throw error;

  if (cancellation.announcement_id) {
    const { error: announcementError } = await supabase
      .from('announcements')
      .update({ is_published: false, archived_at: now })
      .eq('id', cancellation.announcement_id);

    if (announcementError) throw announcementError;
  }
}



export async function deleteProgramClassCancellation(cancellationId: string): Promise<void> {
  const { data, error: loadError } = await supabase
    .from('program_class_cancellations')
    .select('*')
    .eq('id', cancellationId)
    .single();

  if (loadError) throw loadError;

  const cancellation = normalizeClassCancellation(data);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('program_class_cancellations')
    .delete()
    .eq('id', cancellationId);

  if (error) throw error;

  if (cancellation.announcement_id) {
    const { error: announcementError } = await supabase
      .from('announcements')
      .update({ is_published: false, archived_at: now })
      .eq('id', cancellation.announcement_id);

    if (announcementError) throw announcementError;
  }
}



