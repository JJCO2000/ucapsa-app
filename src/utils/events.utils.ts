import type { EventOccurrence, EventOccurrenceCancellation, EventRepeatType, UcapsaEvent } from '../types/app.types';

function dateKeyParts(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;

  return [year, month, day];
}

export function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;

  // A civil date such as 2026-09-21 is not an instant in UTC. Parsing it with
  // new Date('YYYY-MM-DD') can shift it to the previous local day in Mexico.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return dateKeyParts(value) ? value : null;
  }

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
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;

  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function parseDateKey(dateKey: string): Date | null {
  const parts = dateKeyParts(dateKey);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
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

function addRepeatOffset(
  baseDate: Date,
  repeatType: EventRepeatType,
  index: number,
  customIntervalDays: number,
): Date {
  const date = new Date(baseDate);

  if (repeatType === 'daily') date.setDate(date.getDate() + index);
  if (repeatType === 'weekly') date.setDate(date.getDate() + index * 7);
  if (repeatType === 'biweekly') date.setDate(date.getDate() + index * 14);
  if (repeatType === 'monthly') {
    // Date#setMonth overflows for dates such as Jan 31 (it can land in March).
    // Anchor on day 1 and clamp to the target month's last valid day instead.
    const baseDay = baseDate.getDate();
    date.setDate(1);
    date.setMonth(baseDate.getMonth() + index);
    const daysInTargetMonth = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();
    date.setDate(Math.min(baseDay, daysInTargetMonth));
  }
  if (repeatType === 'custom_days') {
    date.setDate(date.getDate() + index * customIntervalDays);
  }

  return date;
}

function shiftIsoDate(
  value: string | null,
  baseStart: Date,
  occurrenceStart: Date,
): string | null {
  if (!value) return null;

  const original = new Date(value);
  if (Number.isNaN(original.getTime())) return null;

  const diffMs = original.getTime() - baseStart.getTime();
  return new Date(occurrenceStart.getTime() + diffMs).toISOString();
}

export function getEventRepeatLabel(
  event: Pick<UcapsaEvent, 'repeat_type' | 'repeat_interval_days'>,
): string | null {
  if (event.repeat_type === 'none') return null;
  if (event.repeat_type === 'daily') return 'Repite diario';
  if (event.repeat_type === 'weekly') return 'Repite semanal';
  if (event.repeat_type === 'biweekly') return 'Repite cada 2 semanas';
  if (event.repeat_type === 'monthly') return 'Repite mensual';
  return `Repite cada ${event.repeat_interval_days ?? 'X'} dias`;
}

function occurrenceCancellationKey(eventId: string, occurrenceStart: string) {
  const date = new Date(occurrenceStart);
  return Number.isNaN(date.getTime()) ? null : `${eventId}:${date.toISOString()}`;
}

export function expandEventOccurrences(
  events: UcapsaEvent[],
  cancellations: EventOccurrenceCancellation[] = [],
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = [];
  const activeCancellationKeys = new Set(
    cancellations
      .filter((item) => !item.restored_at)
      .map((item) => occurrenceCancellationKey(item.event_id, item.occurrence_start))
      .filter((key): key is string => Boolean(key)),
  );

  for (const event of events) {
    const baseStart = new Date(event.start_date);
    if (Number.isNaN(baseStart.getTime())) continue;

    const repeatType = event.repeat_type ?? 'none';
    const repeatLimit = repeatType === 'none'
      ? 1
      : Math.min(Math.max(event.repeat_limit ?? 10, 1), 10);
    const customIntervalDays = Math.min(
      Math.max(event.repeat_interval_days ?? 1, 1),
      365,
    );
    const repeatLabel = getEventRepeatLabel(event);

    for (let index = 0; index < repeatLimit; index += 1) {
      const occurrenceStart = addRepeatOffset(
        baseStart,
        repeatType,
        index,
        customIntervalDays,
      );
      const occurrenceStartIso = occurrenceStart.toISOString();
      const occurrenceEndIso = shiftIsoDate(
        event.end_date,
        baseStart,
        occurrenceStart,
      );

      const cancellationKey = occurrenceCancellationKey(event.id, occurrenceStartIso);
      if (cancellationKey && activeCancellationKeys.has(cancellationKey)) continue;

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

  return occurrences.sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );
}

export function getUpcomingOccurrences(
  events: UcapsaEvent[],
  limit: number,
  cancellations: EventOccurrenceCancellation[] = [],
): EventOccurrence[] {
  const now = Date.now();

  return expandEventOccurrences(events, cancellations)
    .filter((occurrence) => new Date(occurrence.start_date).getTime() >= now)
    .slice(0, limit);
}
