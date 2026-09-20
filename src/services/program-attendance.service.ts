import { supabase } from '../lib/supabase';
import type { AttendanceQrCode } from '../types/app.types';

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
  result:
    | 'registered'
    | 'already_registered'
    | 'invalid_qr'
    | 'not_owner'
    | 'inactive_enrollment'
    | 'card_dates_missing'
    | 'card_not_valid'
    | 'wrong_program'
    | 'schedule_not_found'
    | 'wrong_day'
    | 'wrong_cycle'
    | 'cancelled'
    | 'outside_window_confirmation_required'
    | string;
  message: string;
};

export async function getProgramSessionScheduleMap(
  sessionIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(sessionIds.map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('program_sessions')
    .select('id, schedule_id')
    .in('id', ids);

  if (error) throw error;
  return Object.fromEntries((data ?? []).map((item) => [item.id, item.schedule_id]));
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

export async function registerMyProgramAttendanceFromQr(input: {
  token: string;
  enrollmentId: string;
  confirmOutsideWindow?: boolean;
}): Promise<RegisterAttendanceFromQrResult> {
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

export async function registerProgramAttendance(
  input: RegisterProgramAttendanceInput,
): Promise<void> {
  const { error } = await supabase.rpc('register_program_attendance_admin', {
    p_enrollment_id: input.enrollmentId,
    p_attendance_date: input.attendanceDate,
    p_schedule_id: input.scheduleId ?? undefined,
    p_notes: input.notes?.trim() || undefined,
  });

  if (error) throw error;
}

export async function correctProgramAttendance(
  input: CorrectProgramAttendanceInput,
): Promise<void> {
  const { error } = await supabase.rpc('correct_program_attendance_admin', {
    p_attendance_id: input.attendanceId,
    p_attendance_date: input.attendanceDate,
    p_schedule_id: input.scheduleId,
    p_notes: input.notes?.trim() || undefined,
  });

  if (error) throw error;
}

export async function deleteProgramAttendance(
  attendanceId: string,
  _enrollmentId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_program_attendance_admin', {
    p_attendance_id: attendanceId,
  });
  if (error) throw error;
}

export async function setProgramEnrollmentAttendanceCount(
  enrollmentId: string,
  targetCount: number,
  _attendanceDate: string,
  _notes?: string | null,
): Promise<void> {
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
