import type { CustomerValueSnapshot, CustomerValueSourceKey } from './customer-value.service';

function sourceFailed(snapshot: CustomerValueSnapshot, key: CustomerValueSourceKey) {
  return snapshot.sourceStatus[key] === 'error';
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Las membresías activas de UCAPSA no vencen por fecha. Si aparece una fecha de
 * fin en datos históricos, se ignora para acceso/presentación. Una fecha de
 * inicio futura sí se conserva como programada.
 */
export function normalizeLifetimeMembershipSnapshot(snapshot: CustomerValueSnapshot): CustomerValueSnapshot {
  const membership = snapshot.whatIHave.membership;
  if (!membership || membership.status !== 'active' || !membership.endDate) return snapshot;

  const today = localDateKey();
  const startDate = membership.startDate?.slice(0, 10) ?? null;
  if (startDate && startDate > today) return snapshot;

  return {
    ...snapshot,
    whatIHave: {
      ...snapshot.whatIHave,
      membership: {
        ...membership,
        endDate: null,
        isValidToday: true,
      },
    },
    whatIsNext: {
      ...snapshot.whatIsNext,
      membershipEndDate: null,
    },
    warnings: snapshot.warnings.includes('membership_lifetime_normalized')
      ? snapshot.warnings
      : [...snapshot.warnings, 'membership_lifetime_normalized'],
  };
}

/**
 * Combina una lectura parcial remota con la última instantánea local válida.
 *
 * Regla offline-first: un fallo aislado nunca debe tirar datos frescos de otras
 * fuentes. Solo se recupera desde caché la porción cuya fuente falló.
 */
export function mergeCustomerValueSnapshotWithCache(
  remote: CustomerValueSnapshot,
  cached: CustomerValueSnapshot | null | undefined,
): CustomerValueSnapshot {
  const normalizedRemote = normalizeLifetimeMembershipSnapshot(remote);
  const normalizedCached = cached ? normalizeLifetimeMembershipSnapshot(cached) : null;

  if (!normalizedCached || normalizedCached.userId !== normalizedRemote.userId || normalizedCached.version !== normalizedRemote.version) {
    return normalizedRemote;
  }

  const programsFailed = sourceFailed(normalizedRemote, 'programs');
  const membershipFailed = sourceFailed(normalizedRemote, 'membership');
  const paymentsFailed = sourceFailed(normalizedRemote, 'payments');
  const visitsFailed = sourceFailed(normalizedRemote, 'member_visits');
  const achievementsFailed = sourceFailed(normalizedRemote, 'achievements');
  const practiceFailed = sourceFailed(normalizedRemote, 'practice');
  const eventsFailed = sourceFailed(normalizedRemote, 'events');
  const classInputsFailed = programsFailed || sourceFailed(normalizedRemote, 'schedules') || sourceFailed(normalizedRemote, 'cancellations');
  const fallbackSources = (Object.keys(normalizedRemote.sourceStatus) as CustomerValueSourceKey[])
    .filter((key) => sourceFailed(normalizedRemote, key));

  return normalizeLifetimeMembershipSnapshot({
    ...normalizedRemote,
    identity: sourceFailed(normalizedRemote, 'profile') ? normalizedCached.identity : normalizedRemote.identity,
    whatIHave: {
      membership: membershipFailed ? normalizedCached.whatIHave.membership : normalizedRemote.whatIHave.membership,
      programs: programsFailed ? normalizedCached.whatIHave.programs : normalizedRemote.whatIHave.programs,
    },
    whatIUsed: {
      attendanceTotal: programsFailed ? normalizedCached.whatIUsed.attendanceTotal : normalizedRemote.whatIUsed.attendanceTotal,
      memberVisitsTotal: visitsFailed ? normalizedCached.whatIUsed.memberVisitsTotal : normalizedRemote.whatIUsed.memberVisitsTotal,
      memberVisitsThisMonth: visitsFailed ? normalizedCached.whatIUsed.memberVisitsThisMonth : normalizedRemote.whatIUsed.memberVisitsThisMonth,
      lastMemberVisitAt: visitsFailed ? normalizedCached.whatIUsed.lastMemberVisitAt : normalizedRemote.whatIUsed.lastMemberVisitAt,
      practice: practiceFailed ? normalizedCached.whatIUsed.practice : normalizedRemote.whatIUsed.practice,
    },
    whatIAchieved: {
      completedPrograms: programsFailed ? normalizedCached.whatIAchieved.completedPrograms : normalizedRemote.whatIAchieved.completedPrograms,
      attendanceRequirementsMet: programsFailed
        ? normalizedCached.whatIAchieved.attendanceRequirementsMet
        : normalizedRemote.whatIAchieved.attendanceRequirementsMet,
      achievements: achievementsFailed ? normalizedCached.whatIAchieved.achievements : normalizedRemote.whatIAchieved.achievements,
    },
    whatIsNext: {
      nextClass: classInputsFailed ? normalizedCached.whatIsNext.nextClass : normalizedRemote.whatIsNext.nextClass,
      nextEvent: eventsFailed ? normalizedCached.whatIsNext.nextEvent : normalizedRemote.whatIsNext.nextEvent,
      nextPayment: paymentsFailed ? normalizedCached.whatIsNext.nextPayment : normalizedRemote.whatIsNext.nextPayment,
      legacyMembershipPaymentPending: paymentsFailed
        ? normalizedCached.whatIsNext.legacyMembershipPaymentPending
        : normalizedRemote.whatIsNext.legacyMembershipPaymentPending,
      membershipEndDate: membershipFailed ? normalizedCached.whatIsNext.membershipEndDate : normalizedRemote.whatIsNext.membershipEndDate,
    },
    warnings: [
      ...normalizedRemote.warnings,
      ...fallbackSources.map((source) => `cached_fallback:${source}`),
    ],
  });
}
