import { supabase } from '../lib/supabase';
import type { EventOccurrenceCancellation } from '../types/app.types';

function normalizeCancellation(row: unknown): EventOccurrenceCancellation {
  return row as EventOccurrenceCancellation;
}

function normalizeOccurrenceStart(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('La ocurrencia del evento no tiene una fecha válida.');
  }
  return date.toISOString();
}

export async function getVisibleEventOccurrenceCancellations(): Promise<EventOccurrenceCancellation[]> {
  const { data, error } = await supabase
    .from('event_occurrence_cancellations')
    .select('*')
    .is('restored_at', null)
    .order('occurrence_start', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeCancellation);
}

export async function getAdminEventOccurrenceCancellations(): Promise<EventOccurrenceCancellation[]> {
  const { data, error } = await supabase
    .from('event_occurrence_cancellations')
    .select('*')
    .order('occurrence_start', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeCancellation);
}

export async function cancelEventOccurrences(
  eventId: string,
  occurrenceStarts: string[],
  reason?: string | null,
): Promise<EventOccurrenceCancellation[]> {
  const normalizedStarts = [...new Set(occurrenceStarts.map(normalizeOccurrenceStart))];
  if (normalizedStarts.length === 0) return [];

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userResult.user?.id;
  if (!userId) throw new Error('No hay sesión administrativa activa.');

  const now = new Date().toISOString();
  const payload = normalizedStarts.map((occurrenceStart) => ({
    event_id: eventId,
    occurrence_start: occurrenceStart,
    reason: reason?.trim() || null,
    cancelled_by: userId,
    cancelled_at: now,
    restored_at: null,
    restored_by: null,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from('event_occurrence_cancellations')
    .upsert(payload, { onConflict: 'event_id,occurrence_start' })
    .select('*');

  if (error) throw error;
  return (data ?? []).map(normalizeCancellation);
}

export async function restoreEventOccurrenceCancellation(
  cancellationId: string,
): Promise<EventOccurrenceCancellation> {
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userResult.user?.id;
  if (!userId) throw new Error('No hay sesión administrativa activa.');

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('event_occurrence_cancellations')
    .update({
      restored_at: now,
      restored_by: userId,
      updated_at: now,
    })
    .eq('id', cancellationId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeCancellation(data);
}
