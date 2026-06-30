import { supabase } from '../lib/supabase';
import type {
  Profile,
  ProgramAttendance,
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  ProgramEnrollmentWithDetails,
  ProgramLevel,
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

export function formatScheduleLabel(schedule: ProgramSchedule | null | undefined) {
  if (!schedule) return 'Sin horario';
  const repeatLabel = schedule.repeat_type === 'biweekly' ? 'cada 2 semanas' : 'semanal';
  const time = String(schedule.start_time ?? '').slice(0, 5);
  const section = schedule.sequence_order ? `Seccion ${schedule.sequence_order} · ` : '';
  return `${section}${dayLabels[schedule.day_of_week] ?? 'Dia'} ${time || '--:--'} · ${repeatLabel}`;
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
