import type { EventOccurrence, EventRepeatType, UcapsaEvent } from '../types/app.types';

export function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);
}

export function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function parseDateKey(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function dateToKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toTimeValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function buildLocalIso(dateKey: string, timeValue: string, hasTime: boolean): string | null {
  const baseDate = parseDateKey(dateKey);
  if (!baseDate) return null;

  let hour = 0;
  let minute = 0;

  if (hasTime) {
    if (!/^\d{2}:\d{2}$/.test(timeValue.trim())) return null;
    const [rawHour, rawMinute] = timeValue.split(':').map(Number);
    hour = rawHour;
    minute = rawMinute;
    if (hour > 23 || minute > 59) return null;
  }

  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function addRepeatOffset(baseDate: Date, repeatType: EventRepeatType, index: number, customIntervalDays: number): Date {
  const date = new Date(baseDate);

  if (repeatType === 'daily') date.setDate(date.getDate() + index);
  if (repeatType === 'weekly') date.setDate(date.getDate() + index * 7);
  if (repeatType === 'biweekly') date.setDate(date.getDate() + index * 14);
  if (repeatType === 'monthly') date.setMonth(date.getMonth() + index);
  if (repeatType === 'custom_days') date.setDate(date.getDate() + index * customIntervalDays);

  return date;
}

function shiftIsoDate(value: string | null, baseStart: Date, occurrenceStart: Date): string | null {
  if (!value) return null;

  const original = new Date(value);
  if (Number.isNaN(original.getTime())) return null;

  const diffMs = original.getTime() - baseStart.getTime();
  return new Date(occurrenceStart.getTime() + diffMs).toISOString();
}

export function getEventRepeatLabel(event: Pick<UcapsaEvent, 'repeat_type' | 'repeat_interval_days'>): string | null {
  if (event.repeat_type === 'none') return null;
  if (event.repeat_type === 'daily') return 'Repite diario';
  if (event.repeat_type === 'weekly') return 'Repite semanal';
  if (event.repeat_type === 'biweekly') return 'Repite cada 2 semanas';
  if (event.repeat_type === 'monthly') return 'Repite mensual';
  return `Repite cada ${event.repeat_interval_days ?? 'X'} dias`;
}

export function expandEventOccurrences(events: UcapsaEvent[]): EventOccurrence[] {
  const occurrences: EventOccurrence[] = [];

  for (const event of events) {
    const baseStart = new Date(event.start_date);
    if (Number.isNaN(baseStart.getTime())) continue;

    const repeatType = event.repeat_type ?? 'none';
    const repeatLimit = repeatType === 'none' ? 1 : Math.min(Math.max(event.repeat_limit ?? 10, 1), 10);
    const customIntervalDays = Math.min(Math.max(event.repeat_interval_days ?? 1, 1), 365);
    const repeatLabel = getEventRepeatLabel(event);

    for (let index = 0; index < repeatLimit; index += 1) {
      const occurrenceStart = addRepeatOffset(baseStart, repeatType, index, customIntervalDays);
      const occurrenceStartIso = occurrenceStart.toISOString();
      const occurrenceEndIso = shiftIsoDate(event.end_date, baseStart, occurrenceStart);

      occurrences.push({
        id: `${event.id}:${index}`,
        event_id: event.id,
        event,
        occurrence_index: index,
        start_date: occurrenceStartIso,
        end_date: occurrenceEndIso,
        is_recurring: repeatType !== 'none',
        repeat_label: repeatLabel,
      });
    }
  }

  return occurrences.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
}

export function getUpcomingOccurrences(events: UcapsaEvent[], limit: number): EventOccurrence[] {
  const now = Date.now();

  return expandEventOccurrences(events)
    .filter((occurrence) => new Date(occurrence.start_date).getTime() >= now)
    .slice(0, limit);
}
