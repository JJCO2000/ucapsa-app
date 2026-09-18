import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

export type ValueExposureSurface = 'constancy_summary' | 'constancy_detail';
export type ContinuityObservation = Database['public']['Views']['ucapsa_continuity_observations']['Row'];

export type ContinuitySummary = {
  observedCustomers: number;
  exposedCustomers: number;
  activityAfterExposure: number;
  paymentAfterExposure: number;
  deleteRequestAfterExposure: number;
};

export async function recordValueExposure(
  dogId: string,
  seasonId: string,
  surface: ValueExposureSurface,
): Promise<void> {
  const cleanDogId = dogId.trim();
  const cleanSeasonId = seasonId.trim();
  if (!cleanDogId || !cleanSeasonId) return;

  const { error } = await supabase.rpc('record_ucapsa_value_exposure', {
    p_dog_id: cleanDogId,
    p_season_id: cleanSeasonId,
    p_surface: surface,
  });

  if (error) throw error;
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
    paymentAfterExposure: exposedRows.filter(
      (row) => Number(row.paid_payments_after_exposure ?? 0) > 0,
    ).length,
    deleteRequestAfterExposure: exposedRows.filter(
      (row) => row.delete_request_after_exposure === true,
    ).length,
  };
}
