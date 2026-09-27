import type { ProgramEnrollmentWithDetails, ProgramLevel } from '../types/app.types';

export type AdminRosterLevel = 'all' | 'basic' | 'intermediate' | 'advanced';

export type AdminClassRosterRow = {
  enrollmentId: string;
  userId: string;
  dogId: string | null;
  clientName: string;
  email: string | null;
  phone: string | null;
  dogName: string;
  programCode: string;
  programLevel: ProgramLevel;
  levelKey: Exclude<AdminRosterLevel, 'all'> | null;
  lastAttendanceDate: string | null;
  attendanceCount: number;
};

function dateKey(value: string | null | undefined) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function latestAttendanceDate(row: ProgramEnrollmentWithDetails) {
  const explicit = dateKey(row.enrollment.last_attendance_at);
  if (explicit) return explicit;

  return row.attendances
    .map((item) => dateKey(item.attendance_date))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function clientName(row: ProgramEnrollmentWithDetails) {
  return row.profile?.full_name?.trim()
    || row.profile?.email?.trim()
    || 'Cliente UCAPSA';
}

function dogName(row: ProgramEnrollmentWithDetails) {
  return row.dog?.name?.trim()
    || row.enrollment.dog_name?.trim()
    || row.profile?.dog_name?.trim()
    || 'Perro';
}

export function adminRosterLevelKey(level: ProgramLevel): Exclude<AdminRosterLevel, 'all'> | null {
  if (level === 'base' || level === 'principiante') return 'basic';
  if (level === 'medio') return 'intermediate';
  if (level === 'avanzado') return 'advanced';
  return null;
}

export function adminRosterLevelLabel(level: AdminRosterLevel) {
  if (level === 'basic') return 'Básico';
  if (level === 'intermediate') return 'Intermedio';
  if (level === 'advanced') return 'Avanzado';
  return 'Todos';
}

export function enrollmentAppliesOnDate(
  row: ProgramEnrollmentWithDetails,
  scheduleId: string,
  selectedDate: string,
) {
  if (row.enrollment.status !== 'active') return false;
  if (row.schedule.id !== scheduleId) return false;

  const startedOn = dateKey(
    row.enrollment.card_started_on
      ?? row.enrollment.started_at
      ?? row.enrollment.created_at,
  );
  const expiresOn = dateKey(row.enrollment.card_expires_on);

  if (startedOn && selectedDate < startedOn) return false;
  if (expiresOn && selectedDate > expiresOn) return false;
  return true;
}

export function getAdminClassRosterRows(
  rows: ProgramEnrollmentWithDetails[],
  scheduleId: string,
  selectedDate: string,
): AdminClassRosterRow[] {
  return rows
    .filter((row) => enrollmentAppliesOnDate(row, scheduleId, selectedDate))
    .map((row) => ({
      enrollmentId: row.enrollment.id,
      userId: row.enrollment.user_id,
      dogId: row.enrollment.dog_id ?? null,
      clientName: clientName(row),
      email: row.profile?.email ?? null,
      phone: row.profile?.phone ?? null,
      dogName: dogName(row),
      programCode: row.program.code,
      programLevel: row.enrollment.program_level,
      levelKey: row.program.code === 'comandos'
        ? adminRosterLevelKey(row.enrollment.program_level)
        : null,
      lastAttendanceDate: latestAttendanceDate(row),
      attendanceCount: row.attendances.length,
    }))
    .sort((a, b) =>
      a.clientName.localeCompare(b.clientName, 'es-MX', { sensitivity: 'base', numeric: true })
      || a.dogName.localeCompare(b.dogName, 'es-MX', { sensitivity: 'base', numeric: true }),
    );
}

export function getAdminCommandLevelCounts(rows: AdminClassRosterRow[]) {
  return {
    all: rows.length,
    basic: rows.filter((row) => row.levelKey === 'basic').length,
    intermediate: rows.filter((row) => row.levelKey === 'intermediate').length,
    advanced: rows.filter((row) => row.levelKey === 'advanced').length,
  };
}

export function filterAdminClassRoster(
  rows: AdminClassRosterRow[],
  level: AdminRosterLevel,
) {
  if (level === 'all') return rows;
  return rows.filter((row) => row.levelKey === level);
}
