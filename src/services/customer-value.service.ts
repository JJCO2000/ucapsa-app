/**
 * UCAPSA Customer Value Core - V1 foundation.
 *
 * Product thesis:
 * TIENES -> APROVECHASTE -> CONSEGUISTE -> SIGUE.
 *
 * Rules:
 * - Attendance is usage evidence, never learning/mastery.
 * - Completed means program_enrollments.status === 'completed'.
 * - Next class must respect schedule versions and active cancellations.
 * - This loader performs reads only; it never registers attendance, practice, payments or visits.
 */

import { supabase } from '../lib/supabase';
import type { MembershipPaymentStatus, MembershipStatus, ProgramCode, ProgramEnrollmentStatus, ProgramLevel } from '../types/app.types';
import { getAchievementsForUser } from './achievements.service';
import { getVisibleEvents } from './events.service';
import { getMyMembership, isMembershipActiveToday } from './memberships.service';
import { getMyPaymentOverview } from './payments.service';
import { getCachedMyPracticeActivity } from './practice.service';
import { getProfileByUserId } from './profiles.service';
import {
  getMyProgramEnrollments,
  getProgramClassCancellations,
  getProgramEnrollmentDogName,
  getProgramScheduleFromTimeline,
  getProgramScheduleTimeline,
  isProgramScheduleActiveOnDate,
} from './programs.service';
import { getUpcomingOccurrences } from '../utils/events.utils';

export type CustomerValueSourceKey =
  | 'profile'
  | 'membership'
  | 'programs'
  | 'payments'
  | 'member_visits'
  | 'achievements'
  | 'practice'
  | 'events'
  | 'schedules'
  | 'cancellations';

export type CustomerValueSourceStatus = Record<CustomerValueSourceKey, 'ok' | 'missing' | 'error'>;

export type CustomerValueProgram = {
  enrollmentId: string;
  enrollmentStatus: ProgramEnrollmentStatus;
  programId: string;
  programCode: ProgramCode;
  programName: string;
  programLevel: ProgramLevel;
  dogId: string | null;
  dogName: string;
  requiredAttendances: number;
  attendanceCount: number;
  attendanceRemaining: number;
  attendanceRequirementsMetAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cardStartedOn: string | null;
  cardExpiresOn: string | null;
  cardIsValidToday: boolean | null;
};

export type CustomerValueNextClass = {
  enrollmentId: string;
  programId: string;
  programName: string;
  programCode: ProgramCode;
  programLevel: ProgramLevel;
  dogId: string | null;
  dogName: string;
  scheduleId: string;
  scheduleName: string;
  dateKey: string;
  startTime: string;
};

export type CustomerValuePrimaryNextAction =
  | {
      kind: 'payment';
      source: 'obligation' | 'legacy_membership';
      obligationId: string | null;
      dueDate: string | null;
      remainingAmount: number | null;
      status: 'pending' | 'partial' | 'overdue' | 'future' | 'paid';
    }
  | ({
      kind: 'class';
    } & CustomerValueNextClass)
  | {
      kind: 'event';
      eventId: string;
      occurrenceId: string;
      title: string;
      startDate: string;
      location: string | null;
    }
  | {
      kind: 'membership';
      membershipId: string;
      status: MembershipStatus;
      endDate: string | null;
    }
  | null;

export type CustomerValueSnapshot = {
  version: 1;
  generatedAt: string;
  userId: string;
  identity: {
    displayName: string;
  };
  whatIHave: {
    membership: null | {
      id: string;
      status: MembershipStatus;
      memberNumber: string | null;
      startDate: string | null;
      endDate: string | null;
      paymentStatus: MembershipPaymentStatus | null;
      isValidToday: boolean;
    };
    programs: CustomerValueProgram[];
  };
  whatIUsed: {
    attendanceTotal: number;
    memberVisitsTotal: number | null;
    memberVisitsThisMonth: number | null;
    lastMemberVisitAt: string | null;
    practice: null | {
      source: 'remote' | 'cached' | 'local';
      currentStreak: number;
      thisWeekCount: number;
      thisMonthCount: number;
      lastPracticeAt: string | null;
    };
  };
  whatIAchieved: {
    completedPrograms: CustomerValueProgram[];
    attendanceRequirementsMet: CustomerValueProgram[];
    achievements: Array<{
      code: string;
      title: string;
      unlockedTitle: string;
      awardedAt: string;
      sourceType: string | null;
      sourceId: string | null;
    }>;
  };
  whatIsNext: {
    nextClass: CustomerValueNextClass | null;
    nextEvent: null | {
      eventId: string;
      occurrenceId: string;
      title: string;
      startDate: string;
      location: string | null;
    };
    nextPayment: null | {
      obligationId: string;
      concept: string;
      dueDate: string;
      remainingAmount: number;
      status: 'pending' | 'partial' | 'overdue' | 'future' | 'paid';
    };
    legacyMembershipPaymentPending: boolean;
    membershipEndDate: string | null;
  };
  capabilities: {
    learningProgressTracked: false;
    membershipBenefitsModeled: false;
    eventAttendanceTracked: false;
    canonicalProgramLevelTable: false;
  };
  sourceStatus: CustomerValueSourceStatus;
  warnings: string[];
};

type SafeSource<T> = { status: 'ok'; value: T } | { status: 'error'; value: null };

async function safeSource<T>(loader: () => Promise<T>): Promise<SafeSource<T>> {
  try {
    return { status: 'ok', value: await loader() };
  } catch {
    return { status: 'error', value: null };
  }
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateKeyIsWithinRange(dateKey: string, startDate: string | null | undefined, endDate: string | null | undefined) {
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

function startOfCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function parseStartTime(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!match) return { hours: 0, minutes: 0 };
  return {
    hours: Math.max(0, Math.min(23, Number(match[1]))),
    minutes: Math.max(0, Math.min(59, Number(match[2]))),
  };
}

function toProgramValue(item: Awaited<ReturnType<typeof getMyProgramEnrollments>>[number]): CustomerValueProgram {
  const attendanceCount = item.attendances.length;
  const requiredAttendances = Math.max(0, Number(item.program.required_attendances ?? 0));
  const cardStartedOn = item.enrollment.card_started_on ?? null;
  const cardExpiresOn = item.enrollment.card_expires_on ?? null;
  const cardIsValidToday = cardStartedOn && cardExpiresOn
    ? dateKeyIsWithinRange(localDateKey(new Date()), cardStartedOn, cardExpiresOn)
    : null;
  return {
    enrollmentId: item.enrollment.id,
    enrollmentStatus: item.enrollment.status,
    programId: item.program.id,
    programCode: item.program.code,
    programName: item.program.name,
    programLevel: item.enrollment.program_level,
    dogId: item.enrollment.dog_id ?? null,
    dogName: getProgramEnrollmentDogName(item),
    requiredAttendances,
    attendanceCount,
    attendanceRemaining: Math.max(0, requiredAttendances - attendanceCount),
    attendanceRequirementsMetAt: item.enrollment.requirements_met_at ?? null,
    startedAt: item.enrollment.started_at,
    completedAt: item.enrollment.completed_at,
    cardStartedOn,
    cardExpiresOn,
    cardIsValidToday,
  };
}

async function getMyMemberVisitSummary(userId: string) {
  const monthStart = startOfCurrentMonthKey();
  const [totalResult, monthResult, latestResult] = await Promise.all([
    supabase.from('member_visits').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('member_visits').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('visit_date', monthStart),
    supabase.from('member_visits').select('visited_at').eq('user_id', userId).order('visited_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (totalResult.error) throw totalResult.error;
  if (monthResult.error) throw monthResult.error;
  if (latestResult.error) throw latestResult.error;

  return {
    total: totalResult.count ?? 0,
    thisMonth: monthResult.count ?? 0,
    lastVisitedAt: latestResult.data?.visited_at ?? null,
  };
}

function findNextClass(
  enrollments: Awaited<ReturnType<typeof getMyProgramEnrollments>>,
  timeline: Awaited<ReturnType<typeof getProgramScheduleTimeline>>,
  cancellations: Awaited<ReturnType<typeof getProgramClassCancellations>>,
  fromDate = new Date(),
): CustomerValueNextClass | null {
  const cancelled = new Set(
    cancellations
      .filter((item) => !item.restored_at)
      .map((item) => `${item.schedule_id}|${item.cancellation_date}`),
  );

  const candidates: Array<{ startsAt: number; value: CustomerValueNextClass }> = [];

  for (const item of enrollments.filter((row) => row.enrollment.status === 'active')) {
    for (let offset = 0; offset <= 370; offset += 1) {
      const day = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + offset, 12, 0, 0, 0);
      const dateKey = localDateKey(day);
      if (!item.enrollment.card_started_on || !item.enrollment.card_expires_on) continue;
      if (!dateKeyIsWithinRange(dateKey, item.enrollment.card_started_on, item.enrollment.card_expires_on)) continue;
      const schedule = getProgramScheduleFromTimeline(timeline, item.enrollment.schedule_id, dateKey);
      if (!schedule || schedule.program_id !== item.enrollment.program_id) continue;
      if (!isProgramScheduleActiveOnDate(schedule, dateKey)) continue;
      if (cancelled.has(`${schedule.id}|${dateKey}`)) continue;

      const time = parseStartTime(schedule.start_time);
      const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes, 0, 0).getTime();
      if (startsAt < fromDate.getTime()) continue;

      candidates.push({
        startsAt,
        value: {
          enrollmentId: item.enrollment.id,
          programId: item.program.id,
          programName: item.program.name,
          programCode: item.program.code,
          programLevel: item.enrollment.program_level,
          dogId: item.enrollment.dog_id ?? null,
          dogName: getProgramEnrollmentDogName(item),
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          dateKey,
          startTime: String(schedule.start_time ?? '').slice(0, 5),
        },
      });
      break;
    }
  }

  candidates.sort((a, b) => a.startsAt - b.startsAt);
  return candidates[0]?.value ?? null;
}

export function getCustomerValuePrimaryNextAction(
  snapshot: CustomerValueSnapshot,
): CustomerValuePrimaryNextAction {
  const payment = snapshot.whatIsNext.nextPayment;
  if (payment && payment.status !== 'future' && payment.status !== 'paid') {
    return {
      kind: 'payment',
      source: 'obligation',
      obligationId: payment.obligationId,
      dueDate: payment.dueDate,
      remainingAmount: payment.remainingAmount,
      status: payment.status,
    };
  }

  if (snapshot.whatIsNext.legacyMembershipPaymentPending) {
    return {
      kind: 'payment',
      source: 'legacy_membership',
      obligationId: null,
      dueDate: null,
      remainingAmount: null,
      status: 'pending',
    };
  }

  const membership = snapshot.whatIHave.membership;
  if (membership?.status === 'active' && !membership.isValidToday) {
    return {
      kind: 'membership',
      membershipId: membership.id,
      status: membership.status,
      endDate: membership.endDate,
    };
  }

  if (snapshot.whatIsNext.nextClass) {
    return {
      kind: 'class',
      ...snapshot.whatIsNext.nextClass,
    };
  }

  if (snapshot.whatIsNext.nextEvent) {
    return {
      kind: 'event',
      ...snapshot.whatIsNext.nextEvent,
    };
  }

  if (payment && payment.status !== 'paid') {
    return {
      kind: 'payment',
      source: 'obligation',
      obligationId: payment.obligationId,
      dueDate: payment.dueDate,
      remainingAmount: payment.remainingAmount,
      status: payment.status,
    };
  }

  if (membership && (membership.status === 'pending' || membership.endDate)) {
    return {
      kind: 'membership',
      membershipId: membership.id,
      status: membership.status,
      endDate: membership.endDate,
    };
  }

  return null;
}

export async function getMyCustomerValueSnapshot(): Promise<CustomerValueSnapshot> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('No hay sesion activa.');

  const [profileSource, membershipSource, programsSource, paymentsSource, visitsSource, achievementsSource, practiceSource, eventsSource, timelineSource, cancellationsSource] = await Promise.all([
    safeSource(() => getProfileByUserId(userId)),
    safeSource(() => getMyMembership()),
    safeSource(() => getMyProgramEnrollments()),
    safeSource(() => getMyPaymentOverview()),
    safeSource(() => getMyMemberVisitSummary(userId)),
    safeSource(() => getAchievementsForUser(userId)),
    safeSource(() => getCachedMyPracticeActivity(userId)),
    safeSource(() => getVisibleEvents()),
    safeSource(() => getProgramScheduleTimeline()),
    safeSource(() => getProgramClassCancellations()),
  ]);

  const programs = programsSource.value ?? [];
  const programValues = programs.map(toProgramValue);
  const membership = membershipSource.value;
  const paymentOverview = paymentsSource.value;
  const visitSummary = visitsSource.value;
  const practice = practiceSource.value;
  const achievements = achievementsSource.value ?? [];
  const events = eventsSource.value ?? [];
  const nextOccurrence = getUpcomingOccurrences(events, 1)[0] ?? null;
  const nextPayment = paymentOverview?.obligations[0] ?? null;

  const warnings: string[] = [];
  for (const item of programs) {
    if (item.enrollment.attendances_count !== item.attendances.length) {
      warnings.push(`attendance_cache_mismatch:${item.enrollment.id}`);
    }
    if (item.enrollment.status === 'active' && (!item.enrollment.card_started_on || !item.enrollment.card_expires_on)) {
      warnings.push(`program_card_dates_missing:${item.enrollment.id}`);
    }
  }

  const sourceStatus: CustomerValueSourceStatus = {
    profile: profileSource.status === 'ok' ? (profileSource.value ? 'ok' : 'missing') : 'error',
    membership: membershipSource.status === 'ok' ? (membership ? 'ok' : 'missing') : 'error',
    programs: programsSource.status,
    payments: paymentsSource.status,
    member_visits: visitsSource.status,
    achievements: achievementsSource.status,
    practice: practiceSource.status === 'ok' ? (practice ? 'ok' : 'missing') : 'error',
    events: eventsSource.status,
    schedules: timelineSource.status,
    cancellations: cancellationsSource.status,
  };

  const nextClass = timelineSource.value && cancellationsSource.value
    ? findNextClass(programs, timelineSource.value, cancellationsSource.value)
    : null;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    userId,
    identity: {
      displayName: profileSource.value?.full_name?.trim() || profileSource.value?.email?.trim() || sessionData.session?.user.email || 'Cliente UCAPSA',
    },
    whatIHave: {
      membership: membership
        ? {
            id: membership.id,
            status: membership.status,
            memberNumber: membership.member_number,
            startDate: membership.start_date,
            endDate: membership.end_date,
            paymentStatus: membership.current_payment_status ?? null,
            isValidToday: isMembershipActiveToday(membership),
          }
        : null,
      programs: programValues.filter((item) => item.enrollmentStatus === 'active'),
    },
    whatIUsed: {
      attendanceTotal: programValues.reduce((sum, item) => sum + item.attendanceCount, 0),
      memberVisitsTotal: visitSummary?.total ?? null,
      memberVisitsThisMonth: visitSummary?.thisMonth ?? null,
      lastMemberVisitAt: visitSummary?.lastVisitedAt ?? null,
      practice: practice
        ? {
            source: practice.source,
            currentStreak: practice.stats.currentStreak,
            thisWeekCount: practice.stats.thisWeekCount,
            thisMonthCount: practice.stats.thisMonthCount,
            lastPracticeAt: practice.stats.lastPracticeAt,
          }
        : null,
    },
    whatIAchieved: {
      completedPrograms: programValues.filter((item) => item.enrollmentStatus === 'completed'),
      attendanceRequirementsMet: programValues.filter((item) => Boolean(item.attendanceRequirementsMetAt)),
      achievements: achievements
        .filter((item) => item.unlocked && item.achievement)
        .map((item) => ({
          code: item.definition.code,
          title: item.definition.title,
          unlockedTitle: item.definition.unlocked_title,
          awardedAt: item.achievement?.awarded_at ?? '',
          sourceType: item.achievement?.source_type ?? null,
          sourceId: item.achievement?.source_id ?? null,
        })),
    },
    whatIsNext: {
      nextClass,
      nextEvent: nextOccurrence
        ? {
            eventId: nextOccurrence.event_id,
            occurrenceId: nextOccurrence.id,
            title: nextOccurrence.event.title,
            startDate: nextOccurrence.start_date,
            location: nextOccurrence.event.location,
          }
        : null,
      nextPayment: nextPayment
        ? {
            obligationId: nextPayment.id,
            concept: nextPayment.concept,
            dueDate: nextPayment.due_date,
            remainingAmount: nextPayment.remaining_amount,
            status: nextPayment.display_status,
          }
        : null,
      legacyMembershipPaymentPending: Boolean(paymentOverview?.legacy_membership_pending),
      membershipEndDate: membership?.end_date ?? null,
    },
    capabilities: {
      learningProgressTracked: false,
      membershipBenefitsModeled: false,
      eventAttendanceTracked: false,
      canonicalProgramLevelTable: false,
    },
    sourceStatus,
    warnings,
  };
}
