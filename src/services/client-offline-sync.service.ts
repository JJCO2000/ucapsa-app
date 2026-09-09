import type { Announcement, Membership, MyPaymentOverview, ProgramEnrollmentWithDetails } from '../types/app.types';
import { getVisibleAnnouncements } from './announcements.service';
import { clientReadKeys, createMembershipOfflineSummary, createPaymentOfflineSummary, sanitizeProgramRowsForCache, writeClientResource } from './client-read-cache.service';
import { getMyDogs, type BasicDog } from './dogs.service';
import { createHomeCacheSource, mergeHomeCache, type HomeProgramSummary } from './home-cache.service';
import { getMyMembership } from './memberships.service';
import { getMyPaymentOverview } from './payments.service';
import { getMyProgramEnrollments } from './programs.service';

export type OfflineWarmResult = {
  announcements: boolean;
  dogs: boolean;
  programs: boolean;
  membership: boolean;
  payments: boolean;
};

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

async function cacheDogs(userId: string): Promise<BasicDog[]> {
  const rows = await getMyDogs();
  await writeClientResource(userId, clientReadKeys.dogs, rows);
  return rows;
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

/**
 * Prepara una instantánea local completa después de recuperar una sesión válida.
 *
 * La interfaz nunca debe esperar esta función: cada recurso se sincroniza de forma
 * independiente y conserva el último valor válido si una petición falla.
 */
export async function warmClientOfflineData(userId: string): Promise<OfflineWarmResult> {
  const result: OfflineWarmResult = {
    announcements: false,
    dogs: false,
    programs: false,
    membership: false,
    payments: false,
  };

  const tasks = [
    cacheAnnouncements(userId).then(() => { result.announcements = true; }),
    cacheDogs(userId).then(() => { result.dogs = true; }),
    cachePrograms(userId).then(() => { result.programs = true; }),
    cacheMembership(userId).then(() => { result.membership = true; }),
    cachePayments(userId).then(() => { result.payments = true; }),
  ];

  await Promise.allSettled(tasks);
  return result;
}
