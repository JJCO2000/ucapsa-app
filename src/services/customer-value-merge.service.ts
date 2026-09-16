import type { CustomerValueSnapshot, CustomerValueSourceKey } from './customer-value.service';

function sourceFailed(snapshot: CustomerValueSnapshot, key: CustomerValueSourceKey) {
  return snapshot.sourceStatus[key] === 'error';
}

/**
 * Combina una lectura parcial remota con la ultima instantanea local valida.
 *
 * Regla offline-first: un fallo aislado nunca debe tirar datos frescos de otras
 * fuentes. Solo se recupera desde cache la porcion cuya fuente fallo.
 */
export function mergeCustomerValueSnapshotWithCache(
  remote: CustomerValueSnapshot,
  cached: CustomerValueSnapshot | null | undefined,
): CustomerValueSnapshot {
  if (!cached || cached.userId !== remote.userId || cached.version !== remote.version) return remote;

  const programsFailed = sourceFailed(remote, 'programs');
  const membershipFailed = sourceFailed(remote, 'membership');
  const paymentsFailed = sourceFailed(remote, 'payments');
  const visitsFailed = sourceFailed(remote, 'member_visits');
  const achievementsFailed = sourceFailed(remote, 'achievements');
  const practiceFailed = sourceFailed(remote, 'practice');
  const eventsFailed = sourceFailed(remote, 'events');
  const classInputsFailed = programsFailed || sourceFailed(remote, 'schedules') || sourceFailed(remote, 'cancellations');
  const fallbackSources = (Object.keys(remote.sourceStatus) as CustomerValueSourceKey[])
    .filter((key) => sourceFailed(remote, key));

  return {
    ...remote,
    identity: sourceFailed(remote, 'profile') ? cached.identity : remote.identity,
    whatIHave: {
      membership: membershipFailed ? cached.whatIHave.membership : remote.whatIHave.membership,
      programs: programsFailed ? cached.whatIHave.programs : remote.whatIHave.programs,
    },
    whatIUsed: {
      attendanceTotal: programsFailed ? cached.whatIUsed.attendanceTotal : remote.whatIUsed.attendanceTotal,
      memberVisitsTotal: visitsFailed ? cached.whatIUsed.memberVisitsTotal : remote.whatIUsed.memberVisitsTotal,
      memberVisitsThisMonth: visitsFailed ? cached.whatIUsed.memberVisitsThisMonth : remote.whatIUsed.memberVisitsThisMonth,
      lastMemberVisitAt: visitsFailed ? cached.whatIUsed.lastMemberVisitAt : remote.whatIUsed.lastMemberVisitAt,
      practice: practiceFailed ? cached.whatIUsed.practice : remote.whatIUsed.practice,
    },
    whatIAchieved: {
      completedPrograms: programsFailed ? cached.whatIAchieved.completedPrograms : remote.whatIAchieved.completedPrograms,
      attendanceRequirementsMet: programsFailed
        ? cached.whatIAchieved.attendanceRequirementsMet
        : remote.whatIAchieved.attendanceRequirementsMet,
      achievements: achievementsFailed ? cached.whatIAchieved.achievements : remote.whatIAchieved.achievements,
    },
    whatIsNext: {
      nextClass: classInputsFailed ? cached.whatIsNext.nextClass : remote.whatIsNext.nextClass,
      nextEvent: eventsFailed ? cached.whatIsNext.nextEvent : remote.whatIsNext.nextEvent,
      nextPayment: paymentsFailed ? cached.whatIsNext.nextPayment : remote.whatIsNext.nextPayment,
      legacyMembershipPaymentPending: paymentsFailed
        ? cached.whatIsNext.legacyMembershipPaymentPending
        : remote.whatIsNext.legacyMembershipPaymentPending,
      membershipEndDate: membershipFailed ? cached.whatIsNext.membershipEndDate : remote.whatIsNext.membershipEndDate,
    },
    warnings: [
      ...remote.warnings,
      ...fallbackSources.map((source) => `cached_fallback:${source}`),
    ],
  };
}
