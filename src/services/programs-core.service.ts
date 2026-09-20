import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import {
  effectiveVersionForDate,
  localTodayKey,
  normalizeEnrollment,
  normalizeProgram,
  normalizeSchedule,
  normalizeScheduleVersion,
  overlayScheduleVersion,
  sortProgramSchedules,
} from './programs.domain';

export {
  buildOfficialAttendanceQrValue,
  formatNextProgramClassLabel,
  formatProgramScheduleDetailLabel,
  formatProgramScheduleDisplayLabel,
  formatProgramScheduleName,
  formatScheduleLabel,
  getDefaultProgramLevel,
  getNextProgramLevel,
  getNextProgramScheduleDate,
  getProgramCodeLabel,
  getProgramLevelDisplayLabel,
  getProgramLevelLabel,
  getProgramSchedulesForDate,
  getProgramStatusLabel,
  getRecommendedScheduleId,
  isProgramScheduleActiveOnDate,
  parseOfficialAttendanceQrValue,
  programLevelOptions,
  sortProgramSchedules,
} from './programs.domain';

import type {
  Profile,
  ProgramAttendance,
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  ProgramEnrollmentWithDetails,
  ProgramLevel,
  ProgramSchedule,
  ProgramScheduleVersion,
  UcapsaProgram,
  AttendanceQrCode,
  ProgramDogLink,
} from '../types/app.types';
import { getProgramServiceCurrentUserId } from './programs-session.internal';

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

export async function getProgramSessionScheduleMap(sessionIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(sessionIds.map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('program_sessions')
    .select('id, schedule_id')
    .in('id', ids);

  if (error) throw error;
  return Object.fromEntries((data ?? []).map((item) => [item.id, item.schedule_id]));
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
  const userId = await getProgramServiceCurrentUserId();
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
