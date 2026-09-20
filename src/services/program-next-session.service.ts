import type { ProgramClassCancellation, ProgramEnrollmentWithDetails, ProgramSchedule } from '../types/app.types';
import { getProgramClassCancellations } from './program-cancellations.service';
import {
  getProgramScheduleFromTimeline,
  getProgramScheduleTimeline,
} from './program-schedules.service';
import { isProgramScheduleActiveOnDate } from './programs.domain';

export type ProgramNextSession = {
  enrollmentId: string;
  scheduleId: string;
  scheduleName: string;
  dateKey: string;
  startTime: string;
};

export type ProgramSessionContext = {
  timeline: ProgramSchedule[];
  cancellations: ProgramClassCancellation[];
};

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateKeyIsWithinRange(dateKey: string, startDate: string | null | undefined, endDate: string | null | undefined) {
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

function parseStartTime(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!match) return { hours: 0, minutes: 0 };
  return {
    hours: Math.max(0, Math.min(23, Number(match[1]))),
    minutes: Math.max(0, Math.min(59, Number(match[2]))),
  };
}

function sessionStartsAt(session: ProgramNextSession) {
  const [year, month, day] = session.dateKey.split('-').map(Number);
  const time = parseStartTime(session.startTime);
  return new Date(year, month - 1, day, time.hours, time.minutes, 0, 0).getTime();
}

export function resolveNextProgramSession(
  item: ProgramEnrollmentWithDetails,
  context: ProgramSessionContext,
  fromDate = new Date(),
): ProgramNextSession | null {
  if (item.enrollment.status !== 'active') return null;
  if (!item.enrollment.card_started_on || !item.enrollment.card_expires_on) return null;

  const cancelled = new Set(
    context.cancellations
      .filter((entry) => !entry.restored_at)
      .map((entry) => `${entry.schedule_id}|${entry.cancellation_date}`),
  );

  for (let offset = 0; offset <= 370; offset += 1) {
    const day = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + offset, 12, 0, 0, 0);
    const dateKey = localDateKey(day);
    if (!dateKeyIsWithinRange(dateKey, item.enrollment.card_started_on, item.enrollment.card_expires_on)) continue;

    const schedule = getProgramScheduleFromTimeline(context.timeline, item.enrollment.schedule_id, dateKey);
    if (!schedule || schedule.program_id !== item.enrollment.program_id) continue;
    if (!isProgramScheduleActiveOnDate(schedule, dateKey)) continue;
    if (cancelled.has(`${schedule.id}|${dateKey}`)) continue;

    const time = parseStartTime(schedule.start_time);
    const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes, 0, 0).getTime();
    if (startsAt < fromDate.getTime()) continue;

    return {
      enrollmentId: item.enrollment.id,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      dateKey,
      startTime: String(schedule.start_time ?? '').slice(0, 5),
    };
  }

  return null;
}

export function resolveNextProgramSessions(
  rows: ProgramEnrollmentWithDetails[],
  context: ProgramSessionContext,
  fromDate = new Date(),
) {
  const result: Record<string, ProgramNextSession> = {};
  for (const item of rows) {
    const session = resolveNextProgramSession(item, context, fromDate);
    if (session) result[item.enrollment.id] = session;
  }
  return result;
}

export function resolveNextProgramSessionAcrossEnrollments(
  rows: ProgramEnrollmentWithDetails[],
  context: ProgramSessionContext,
  fromDate = new Date(),
): { item: ProgramEnrollmentWithDetails; session: ProgramNextSession } | null {
  const candidates = rows
    .map((item) => {
      const session = resolveNextProgramSession(item, context, fromDate);
      return session ? { item, session } : null;
    })
    .filter((entry): entry is { item: ProgramEnrollmentWithDetails; session: ProgramNextSession } => Boolean(entry))
    .sort((left, right) => sessionStartsAt(left.session) - sessionStartsAt(right.session));

  return candidates[0] ?? null;
}

export async function getProgramSessionContext(): Promise<ProgramSessionContext> {
  const [timeline, cancellations] = await Promise.all([
    getProgramScheduleTimeline(),
    getProgramClassCancellations(),
  ]);
  return { timeline, cancellations };
}

export async function getCanonicalNextProgramSessions(
  rows: ProgramEnrollmentWithDetails[],
  fromDate = new Date(),
) {
  if (rows.length === 0) return {} as Record<string, ProgramNextSession>;
  const context = await getProgramSessionContext();
  return resolveNextProgramSessions(rows, context, fromDate);
}
