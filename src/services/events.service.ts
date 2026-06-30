import { supabase } from '../lib/supabase';
import type { AudienceType, EventRepeatType, UcapsaColorKey, UcapsaEvent, UcapsaPriority } from '../types/app.types';

export type EventFormInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  start_date: string;
  end_date?: string | null;
  audience: AudienceType;
  is_published?: boolean;
  has_time?: boolean;
  repeat_type?: EventRepeatType;
  repeat_interval_days?: number | null;
  repeat_limit?: number;
  color_key?: UcapsaColorKey | null;
  priority?: UcapsaPriority | null;
};

function normalizeEvent(event: unknown): UcapsaEvent {
  return event as UcapsaEvent;
}

export async function getVisibleEvents(limit?: number): Promise<UcapsaEvent[]> {
  let query = supabase
    .from('events')
    .select('*')
    .order('start_date', { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []).map(normalizeEvent);
}

export async function getAdminEvents(): Promise<UcapsaEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeEvent);
}

function buildPayload(input: EventFormInput, createdBy?: string | null) {
  const repeatType = input.repeat_type ?? 'none';

  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    start_date: input.start_date,
    end_date: input.end_date || null,
    audience: input.audience,
    is_published: input.is_published ?? true,
    has_time: input.has_time ?? true,
    repeat_type: repeatType,
    repeat_interval_days: repeatType === 'custom_days' ? input.repeat_interval_days ?? 1 : null,
    repeat_limit: repeatType === 'none' ? 1 : Math.min(Math.max(input.repeat_limit ?? 10, 1), 10),
    recurrence_key: null,
    recurrence_label: null,
    color_key: input.color_key ?? 'green',
    priority: input.priority ?? 'normal',
    created_by: createdBy ?? null,
  };
}

export async function createEvent(input: EventFormInput): Promise<UcapsaEvent> {
  const { data: userResult } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('events')
    .insert(buildPayload(input, userResult.user?.id ?? null))
    .select('*')
    .single();

  if (error) throw error;
  return normalizeEvent(data);
}

export async function updateEvent(eventId: string, input: Partial<EventFormInput>): Promise<UcapsaEvent> {
  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.location !== undefined) payload.location = input.location?.trim() || null;
  if (input.start_date !== undefined) payload.start_date = input.start_date;
  if (input.end_date !== undefined) payload.end_date = input.end_date || null;
  if (input.audience !== undefined) payload.audience = input.audience;
  if (input.is_published !== undefined) payload.is_published = input.is_published;
  if (input.has_time !== undefined) payload.has_time = input.has_time;
  if (input.repeat_type !== undefined) payload.repeat_type = input.repeat_type;
  if (input.repeat_interval_days !== undefined) payload.repeat_interval_days = input.repeat_type === 'custom_days' ? input.repeat_interval_days : null;
  if (input.repeat_limit !== undefined) payload.repeat_limit = Math.min(Math.max(input.repeat_limit, 1), 10);
  if (input.color_key !== undefined) payload.color_key = input.color_key ?? 'green';
  if (input.priority !== undefined) payload.priority = input.priority ?? 'normal';

  if (input.repeat_type === 'none') {
    payload.repeat_limit = 1;
    payload.repeat_interval_days = null;
  }

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', eventId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeEvent(data);
}

export async function setEventPublished(eventId: string, isPublished: boolean): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ is_published: isPublished })
    .eq('id', eventId);

  if (error) throw error;
}

export async function archiveEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) throw error;
}

export async function restoreEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ archived_at: null })
    .eq('id', eventId);

  if (error) throw error;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) throw error;
}



