import type { Announcement, Membership, MyPaymentOverview, ProgramEnrollmentWithDetails } from '../types/app.types';
import { getVisibleAnnouncements } from './announcements.service';
import { flushPendingAttendanceOperations } from './attendance-outbox.service';
import { getMyMemberVisits } from './client-activity.service';
import { refreshCompetitionLeaderboard, refreshMyDogCompetition } from './client-competition.service';
import {
  clientReadKeys,
  createMembershipOfflineSummary,
  createPaymentOfflineSummary,
  sanitizeProgramRowsForCache,
  writeClientResource,
  type CalendarClassesOfflineSnapshot,
} from './client-read-cache.service';
import { getMyDogs, type BasicDog } from './dogs.service';
import { getVisibleEvents } from './events.service';
import { createHomeCacheSource, mergeHomeCache, type HomeProgramSummary } from './home-cache.service';
import { getMyMembership } from './memberships.service';
import { getMyPaymentOverview } from './payments.service';
import { flushPendingPracticeSessions, getMyPracticeActivity } from './practice.service';
import {
  getMyProgramEnrollments,
  getProgramClassCancellations,
  getProgramScheduleTimeline,
  getPrograms,
} from './programs.service';

export type OfflineWarmResult = {
  announcements: boolean;
  calendar: boolean;
  dogs: boolean;
  competition: boolean;
  programs: boolean;
  membership: boolean;
  payments: boolean;
  memberVisits: boolean;
  practiceActivity: boolean;
  attendanceOutbox: boolean;
  practiceOutbox: boolean;
};

export type OfflineWriteFlushResult = Pick<OfflineWarmResult, 'attendanceOutbox' | 'practiceOutbox'>;

function toHomeProgramSummary(rows: ProgramEnrollmentWithDetails[]): HomeProgramSummary[] {
  return rows.map((item) => ({
    enrollment_id: item.enrollment.id,
    enrollment_status: item.enrollment.status,
    program_code: item.program.code,
    program_name: item.program.name,
    required_attendances: item.program.required_attendances,
    attendances_count: item.attendances.length,
    dog_id: item.enrollment.dog_id,
    dog_name: item.enrollment.dog_name,
    schedule: item.schedule,
  }));
}

async function cacheAnnouncements(userId: string): Promise<Announcement[]> {
  const rows = await getVisibleAnnouncements();
  await Promise.all([
    writeClientResource(userId, clientReadKeys.announcements, rows),
    mergeHomeCache(userId, { announcements: createHomeCacheSource(rows) }),
  ]);
  return rows;
}

async function cacheCalendar(userId: string): Promise<void> {
  const [events, programs, schedules, cancellations] = await Promise.all([
    getVisibleEvents(),
    getPrograms(),
    getProgramScheduleTimeline(),
    getProgramClassCancellations(),
  ]);
  const classes: CalendarClassesOfflineSnapshot = { programs, schedules, cancellations };
  await Promise.all([
    writeClientResource(userId, clientReadKeys.calendarEvents, events),
    writeClientResource(userId, clientReadKeys.calendarClasses, classes),
  ]);
}

async function cacheDogs(userId: string): Promise<BasicDog[]> {
  const rows = await getMyDogs();
  await writeClientResource(userId, clientReadKeys.dogs, rows);
  return rows;
}

async function cacheCompetition(userId: string, dogs: BasicDog[]): Promise<void> {
  const dogResults = await Promise.allSettled(
    dogs.map((dog) => refreshMyDogCompetition(userId, dog.id)),
  );

  const seasonIds = new Set<string>();
  for (const result of dogResults) {
    if (result.status !== 'fulfilled') continue;
    for (const season of result.value.data.seasons) {
      if (season.season_id) seasonIds.add(season.season_id);
    }
  }

  const leaderboardResults = await Promise.allSettled(
    [...seasonIds].map((seasonId) => refreshCompetitionLeaderboard(userId, seasonId)),
  );

  const failedDog = dogResults.find((result) => result.status === 'rejected');
  if (failedDog?.status === 'rejected') throw failedDog.reason;

  const failedLeaderboard = leaderboardResults.find((result) => result.status === 'rejected');
  if (failedLeaderboard?.status === 'rejected') throw failedLeaderboard.reason;
}

async function cachePrograms(userId: string): Promise<ProgramEnrollmentWithDetails[]> {
  const rows = await getMyProgramEnrollments();
  const sanitized = sanitizeProgramRowsForCache(rows);
  await Promise.all([
    writeClientResource(userId, clientReadKeys.programs, sanitized),
    mergeHomeCache(userId, { programs: createHomeCacheSource(toHomeProgramSummary(sanitized)) }),
  ]);
  return sanitized;
}

async function cacheMembership(userId: string): Promise<Membership | null> {
  const membership = await getMyMembership();
  await Promise.all([
    writeClientResource(userId, clientReadKeys.membership, createMembershipOfflineSummary(membership)),
    mergeHomeCache(userId, { membership_status: createHomeCacheSource(membership?.status ?? null) }),
  ]);
  return membership;
}

async function cachePayments(userId: string): Promise<MyPaymentOverview> {
  const overview = await getMyPaymentOverview();
  await Promise.all([
    writeClientResource(userId, clientReadKeys.paymentSummary, createPaymentOfflineSummary(overview)),
    mergeHomeCache(userId, {
      payments: createHomeCacheSource({
        attention_total: overview.attention_total,
        legacy_membership_pending: overview.legacy_membership_pending,
      }),
    }),
  ]);
  return overview;
}

async function cachePracticeActivity(userId: string): Promise<void> {
  // `getMyPracticeActivity` mantiene su propia caché y mezcla cualquier práctica
  // pendiente durable. Se ejecuta después del flush para evitar dos reintentos
  // concurrentes sobre la misma cola.
  await getMyPracticeActivity(userId);
}

/**
 * Reintenta todas las escrituras locales durables. Cada cola es independiente:
 * un fallo de red o servidor en una no impide intentar la otra.
 */
export async function flushPendingClientWrites(userId: string): Promise<OfflineWriteFlushResult> {
  const result: OfflineWriteFlushResult = {
    attendanceOutbox: false,
    practiceOutbox: false,
  };

  await Promise.allSettled([
    flushPendingAttendanceOperations(userId).then(() => { result.attendanceOutbox = true; }),
    flushPendingPracticeSessions(userId).then(() => { result.practiceOutbox = true; }),
  ]);

  return result;
}

/**
 * Prepara las lecturas críticas para uso offline después de recuperar una sesión
 * válida y aprovecha ese mismo momento para vaciar escrituras locales pendientes.
 *
 * La interfaz nunca debe esperar esta función: cada recurso se sincroniza de forma
 * independiente y conserva el último valor válido si una petición falla.
 */
export async function warmClientOfflineData(userId: string): Promise<OfflineWarmResult> {
  const result: OfflineWarmResult = {
    announcements: false,
    calendar: false,
    dogs: false,
    competition: false,
    programs: false,
    membership: false,
    payments: false,
    memberVisits: false,
    practiceActivity: false,
    attendanceOutbox: false,
    practiceOutbox: false,
  };

  const dogsTask = cacheDogs(userId);

  const tasks = [
    cacheAnnouncements(userId).then(() => { result.announcements = true; }),
    cacheCalendar(userId).then(() => { result.calendar = true; }),
    dogsTask.then(() => { result.dogs = true; }),
    dogsTask
      .then((dogs) => cacheCompetition(userId, dogs))
      .then(() => { result.competition = true; }),
    cachePrograms(userId).then(() => { result.programs = true; }),
    cacheMembership(userId).then(() => { result.membership = true; }),
    cachePayments(userId).then(() => { result.payments = true; }),
    getMyMemberVisits(userId, 500).then(() => { result.memberVisits = true; }),
    flushPendingClientWrites(userId).then(async (flushResult) => {
      result.attendanceOutbox = flushResult.attendanceOutbox;
      result.practiceOutbox = flushResult.practiceOutbox;
      await cachePracticeActivity(userId);
      result.practiceActivity = true;
    }),
  ];

  await Promise.allSettled(tasks);
  return result;
}
