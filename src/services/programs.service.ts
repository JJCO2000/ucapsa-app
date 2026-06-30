import { supabase } from '../lib/supabase';
import type {
  Profile,
  ProgramAttendance,
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  ProgramEnrollmentWithDetails,
  ProgramLevel,
  ProgramClassCancellation,
  ProgramSchedule,
  UcapsaProgram,
} from '../types/app.types';

export type CreateProgramEnrollmentInput = {
  userId: string;
  programId: string;
  scheduleId: string;
  dogName: string;
  physicalCardNumber?: string | null;
  programLevel?: ProgramLevel;
  notes?: string | null;
};

export type UpdateProgramEnrollmentInput = {
  programId?: string;
  scheduleId?: string;
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
  notes?: string | null;
};

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
  { value: 'principiante', label: 'Principiante' },
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
  if (level === 'principiante') return 'Principiante';
  if (level === 'medio') return 'Medio';
  if (level === 'avanzado') return 'Avanzado';
  return 'Base';
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

  const [programsResult, schedulesResult, profilesResult, attendancesResult] = await Promise.all([
    supabase.from('programs').select('*').in('id', programIds),
    supabase.from('program_schedules').select('*').in('id', scheduleIds),
    supabase.from('profiles').select('*').in('user_id', userIds),
    supabase.from('program_attendances').select('*').in('enrollment_id', enrollmentIds).order('attendance_date', { ascending: false }),
  ]);

  if (programsResult.error) throw programsResult.error;
  if (schedulesResult.error) throw schedulesResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (attendancesResult.error) throw attendancesResult.error;

  const programs = ((programsResult.data ?? []) as UcapsaProgram[]).reduce<Record<string, UcapsaProgram>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const schedules = ((schedulesResult.data ?? []) as ProgramSchedule[]).reduce<Record<string, ProgramSchedule>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const profiles = ((profilesResult.data ?? []) as Profile[]).reduce<Record<string, Profile>>((acc, item) => {
    acc[item.user_id] = item;
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
        attendances: attendances[enrollment.id] ?? [],
      } satisfies ProgramEnrollmentWithDetails;
    })
    .filter(Boolean) as ProgramEnrollmentWithDetails[];
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

export async function getProgramSchedules(): Promise<ProgramSchedule[]> {
  const { data, error } = await supabase
    .from('program_schedules')
    .select('*')
    .order('sequence_order', { ascending: true })
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeSchedule);
}

export async function updateProgramSchedule(scheduleId: string, input: UpdateProgramScheduleInput): Promise<void> {
  const payload: Record<string, string | number | boolean | null> = { updated_at: new Date().toISOString() };
  if ('name' in input) payload.name = input.name?.trim() || 'Horario';
  if ('dayOfWeek' in input) payload.day_of_week = Math.max(0, Math.min(6, Number(input.dayOfWeek ?? 0)));
  if ('startTime' in input) payload.start_time = input.startTime || '10:00';
  if ('repeatType' in input) payload.repeat_type = input.repeatType ?? 'weekly';
  if ('cycleStartDate' in input) payload.cycle_start_date = input.cycleStartDate || null;
  if ('sequenceOrder' in input) payload.sequence_order = Math.max(1, Number(input.sequenceOrder ?? 1));
  if ('isActive' in input) payload.is_active = Boolean(input.isActive);

  const { error } = await supabase.from('program_schedules').update(payload).eq('id', scheduleId);
  if (error) throw error;
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

  const { error } = await supabase.from('program_enrollments').update(payload).eq('id', enrollmentId);
  if (error) throw error;
}

async function recalculateEnrollmentProgress(enrollmentId: string): Promise<void> {
  const enrollmentResult = await supabase.from('program_enrollments').select('*').eq('id', enrollmentId).single();
  if (enrollmentResult.error) throw enrollmentResult.error;
  const enrollment = normalizeEnrollment(enrollmentResult.data);

  const [programResult, schedulesResult, countResult, latestResult] = await Promise.all([
    supabase.from('programs').select('*').eq('id', enrollment.program_id).single(),
    supabase.from('program_schedules').select('*').eq('program_id', enrollment.program_id).eq('is_active', true),
    supabase.from('program_attendances').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollmentId),
    supabase.from('program_attendances').select('*').eq('enrollment_id', enrollmentId).order('attendance_date', { ascending: false }).limit(1),
  ]);

  if (programResult.error) throw programResult.error;
  if (schedulesResult.error) throw schedulesResult.error;
  if (countResult.error) throw countResult.error;
  if (latestResult.error) throw latestResult.error;

  const program = normalizeProgram(programResult.data);
  const schedules = (schedulesResult.data ?? []).map(normalizeSchedule);
  const nextCount = countResult.count ?? 0;
  const completed = nextCount >= Math.max(1, program.required_attendances);
  const nextScheduleId = completed ? enrollment.schedule_id : getRecommendedScheduleId(program.id, schedules, nextCount) || enrollment.schedule_id;
  const latestAttendance = (latestResult.data?.[0] ? normalizeAttendance(latestResult.data[0]) : null);

  const { error } = await supabase
    .from('program_enrollments')
    .update({
      attendances_count: nextCount,
      schedule_id: nextScheduleId,
      status: completed ? 'completed' : 'active',
      completed_at: completed ? new Date().toISOString() : null,
      cancelled_at: null,
      last_attendance_at: latestAttendance?.attendance_date ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId);

  if (error) throw error;
}

export async function registerProgramAttendance(input: RegisterProgramAttendanceInput): Promise<void> {
  const markedBy = await getCurrentUserId();
  const { error } = await supabase
    .from('program_attendances')
    .insert({
      enrollment_id: input.enrollmentId,
      attendance_date: input.attendanceDate,
      marked_by: markedBy,
      notes: input.notes?.trim() || null,
    });

  if (error) throw error;
  await recalculateEnrollmentProgress(input.enrollmentId);
}

export async function deleteProgramAttendance(attendanceId: string, enrollmentId: string): Promise<void> {
  const { error } = await supabase.from('program_attendances').delete().eq('id', attendanceId);
  if (error) throw error;
  await recalculateEnrollmentProgress(enrollmentId);
}

export async function setProgramEnrollmentStatus(enrollmentId: string, status: ProgramEnrollmentStatus): Promise<void> {
  await updateProgramEnrollment(enrollmentId, { status });
}


function addDaysToDateKey(dateKey: string, offsetDays: number) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? new Date(`${dateKey}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

export async function setProgramEnrollmentAttendanceCount(
  enrollmentId: string,
  targetCount: number,
  attendanceDate: string,
  notes?: string | null,
): Promise<void> {
  const markedBy = await getCurrentUserId();
  const safeCount = Math.max(0, Math.floor(Number(targetCount) || 0));
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) ? attendanceDate : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('program_attendances')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('attendance_date', { ascending: true });

  if (error) throw error;

  const existing = (data ?? []).map(normalizeAttendance);

  if (existing.length > safeCount) {
    const extras = existing.slice(safeCount).map((item) => item.id);
    if (extras.length > 0) {
      const deleteResult = await supabase.from('program_attendances').delete().in('id', extras);
      if (deleteResult.error) throw deleteResult.error;
    }
  }

  if (existing.length < safeCount) {
    const usedDates = new Set(existing.map((item) => item.attendance_date));
    const rowsToInsert: Array<{ enrollment_id: string; attendance_date: string; marked_by: string | null; notes: string | null }> = [];

    for (let i = existing.length; i < safeCount; i += 1) {
      let nextDate = addDaysToDateKey(safeDate, -(safeCount - i - 1));
      while (usedDates.has(nextDate)) {
        nextDate = addDaysToDateKey(nextDate, -1);
      }
      usedDates.add(nextDate);
      rowsToInsert.push({
        enrollment_id: enrollmentId,
        attendance_date: nextDate,
        marked_by: markedBy,
        notes: notes?.trim() || 'Ajuste manual de avance.',
      });
    }

    if (rowsToInsert.length > 0) {
      const insertResult = await supabase.from('program_attendances').insert(rowsToInsert);
      if (insertResult.error) throw insertResult.error;
    }
  }

  await recalculateEnrollmentProgress(enrollmentId);
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
  return (data ?? []).map(normalizeClassCancellation);
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

  const { data: scheduleData, error: scheduleError } = await supabase
    .from('program_schedules')
    .select('*, program:programs(*)')
    .eq('id', input.scheduleId)
    .single();

  if (scheduleError) throw scheduleError;

  const schedule = normalizeSchedule(scheduleData);
  const program = (scheduleData as { program?: UcapsaProgram | null }).program ?? null;

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
        audience: 'clients',
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

  const { data: scheduleData, error: scheduleError } = await supabase
    .from('program_schedules')
    .select('*, program:programs(*)')
    .in('id', uniqueScheduleIds);

  if (scheduleError) throw scheduleError;

  const rows = (scheduleData ?? []) as Array<ProgramSchedule & { program?: UcapsaProgram | null }>;
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
        audience: 'clients',
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
    .insert(payload)
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

