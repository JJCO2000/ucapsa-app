import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import {
  recordValueExposureDurably,
  type ValueExposureSurface,
} from './value-exposure-outbox.service';

export type { ValueExposureSurface };
export type ContinuityObservation = Database['public']['Views']['ucapsa_continuity_observations']['Row'];
export type ContinuityWindowDays = 7 | 30 | 60 | 90;

export type ContinuitySummary = {
  observedCustomers: number;
  exposedCustomers: number;
  activityAfterExposure: number;
  anyPaymentAfterExposure: number;
  membershipPaymentAfterExposure: number;
  deleteRequestAfterExposure: number;
};

export type ContinuityWindowSummary = {
  windowDays: ContinuityWindowDays;
  exposedCustomers: number;
  activityCustomers: number;
  anyPaymentCustomers: number;
  membershipPaymentCustomers: number;
};

export type ContinuityCohortGroup = {
  customers: number;
  activityCustomers: number;
  anyPaymentCustomers: number;
  membershipPaymentCustomers: number;
};

export type ContinuityCohortSummary = {
  eligibleCustomers: number;
  earlyExposure: ContinuityCohortGroup;
  noEarlyExposure: ContinuityCohortGroup;
};

export async function recordValueExposure(
  userId: string,
  dogId: string,
  seasonId: string,
  surface: ValueExposureSurface,
): Promise<void> {
  const cleanUserId = userId.trim();
  const cleanDogId = dogId.trim();
  const cleanSeasonId = seasonId.trim();
  if (!cleanUserId || !cleanDogId || !cleanSeasonId) return;

  await recordValueExposureDurably({
    userId: cleanUserId,
    dogId: cleanDogId,
    seasonId: cleanSeasonId,
    surface,
  });
}

export async function getAdminContinuityObservations(): Promise<ContinuityObservation[]> {
  const { data, error } = await supabase.rpc('get_ucapsa_continuity_observations');
  if (error) throw error;
  return data ?? [];
}

export function summarizeContinuity(
  rows: ContinuityObservation[],
): ContinuitySummary {
  const exposedRows = rows.filter((row) => row.has_value_exposure === true);

  return {
    observedCustomers: rows.length,
    exposedCustomers: exposedRows.length,
    activityAfterExposure: exposedRows.filter(
      (row) => Number(row.activity_events_after_exposure ?? 0) > 0,
    ).length,
    anyPaymentAfterExposure: exposedRows.filter(
      (row) => Number(row.paid_payments_after_exposure ?? 0) > 0,
    ).length,
    membershipPaymentAfterExposure: exposedRows.filter(
      (row) => Number(row.membership_paid_payments_after_exposure ?? 0) > 0,
    ).length,
    deleteRequestAfterExposure: exposedRows.filter(
      (row) => row.delete_request_after_exposure === true,
    ).length,
  };
}

function windowValue(
  row: ContinuityObservation,
  prefix: 'activity' | 'any_payment' | 'membership_payment',
  windowDays: ContinuityWindowDays,
) {
  const key = `${prefix}_within_${windowDays}d_after_exposure` as keyof ContinuityObservation;
  return Number(row[key] ?? 0);
}

export function summarizeContinuityWindow(
  rows: ContinuityObservation[],
  windowDays: ContinuityWindowDays,
): ContinuityWindowSummary {
  const exposedRows = rows.filter((row) => row.has_value_exposure === true);
  return {
    windowDays,
    exposedCustomers: exposedRows.length,
    activityCustomers: exposedRows.filter((row) => windowValue(row, 'activity', windowDays) > 0).length,
    anyPaymentCustomers: exposedRows.filter((row) => windowValue(row, 'any_payment', windowDays) > 0).length,
    membershipPaymentCustomers: exposedRows.filter(
      (row) => windowValue(row, 'membership_payment', windowDays) > 0,
    ).length,
  };
}

function summarizeCohortGroup(rows: ContinuityObservation[]): ContinuityCohortGroup {
  return {
    customers: rows.length,
    activityCustomers: rows.filter((row) => Number(row.cohort_activity_events_30d ?? 0) > 0).length,
    anyPaymentCustomers: rows.filter((row) => Number(row.cohort_any_payments_30d ?? 0) > 0).length,
    membershipPaymentCustomers: rows.filter(
      (row) => Number(row.cohort_membership_payments_30d ?? 0) > 0,
    ).length,
  };
}

export function summarizeContinuityCohort30(
  rows: ContinuityObservation[],
): ContinuityCohortSummary {
  const eligible = rows.filter((row) => row.cohort_followup_complete === true);
  const early = eligible.filter((row) => row.early_value_exposure === true);
  const notEarly = eligible.filter((row) => row.early_value_exposure !== true);

  return {
    eligibleCustomers: eligible.length,
    earlyExposure: summarizeCohortGroup(early),
    noEarlyExposure: summarizeCohortGroup(notEarly),
  };
}
