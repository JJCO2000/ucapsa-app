import type {
  AttendanceQrProgramCode,
  ProgramClassCancellation,
  ProgramCode,
  ProgramEnrollment,
  ProgramEnrollmentWithDetails,
  ProgramEnrollmentStatus,
  ProgramLevel,
  ProgramSchedule,
  ProgramScheduleVersion,
  UcapsaProgram,
} from '../types/app.types';

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

const dayLabels = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

export const programLevelOptions: Array<{ value: ProgramLevel; label: string }> = [
  { value: 'principiante', label: 'Básico' },
  { value: 'medio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
];

// Internal normalization helpers shared by program services.
export function normalizeProgram(row: unknown): UcapsaProgram {
  return row as UcapsaProgram;
}

export function normalizeSchedule(row: unknown): ProgramSchedule {
  return row as ProgramSchedule;
}

export function normalizeScheduleVersion(row: unknown): ProgramScheduleVersion {
  return row as ProgramScheduleVersion;
}

export function localTodayKey() {
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

export function overlayScheduleVersion(schedule: ProgramSchedule, version: ProgramScheduleVersion | null): ProgramSchedule {
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

export function effectiveVersionForDate(versions: ProgramScheduleVersion[], scheduleId: string, dateKey: string) {
  return versions
    .filter((version) => version.schedule_id === scheduleId && isVersionEffectiveOnDate(version, dateKey))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function normalizeEnrollment(row: unknown): ProgramEnrollment {
  return row as ProgramEnrollment;
}

export function normalizeClassCancellation(row: unknown): ProgramClassCancellation {
  return row as ProgramClassCancellation;
}

export function getProgramEnrollmentDogName(item: ProgramEnrollmentWithDetails | null | undefined) {
  return item?.dog?.name?.trim() || item?.enrollment.dog_name?.trim() || item?.profile?.dog_name?.trim() || 'Perro';
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
  if (level === 'medio') return 'Intermedio';
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

export function formatProgramScheduleName(
  schedule: ProgramSchedule | null | undefined,
  program?: Pick<UcapsaProgram, 'code' | 'name'> | null,
) {
  if (!schedule) return 'Clase';
  if (program?.code === 'comandos') return 'Comandos';
  if (program?.code === 'puppy') return `Clase ${Math.max(1, Number(schedule.sequence_order || 1))}`;
  return schedule.name?.trim() || program?.name || 'Clase';
}

export function formatProgramScheduleDisplayLabel(
  schedule: ProgramSchedule | null | undefined,
  program?: Pick<UcapsaProgram, 'code' | 'name'> | null,
) {
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
  const activeSchedules = sortProgramSchedules(
    schedules.filter((schedule) => schedule.program_id === programId && schedule.is_active),
  );
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
