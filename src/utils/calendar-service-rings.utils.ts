/**
 * Fechas con servicios efectivamente ofrecidos por UCAPSA.
 * No incluir anuncios ni prácticas individuales: no significan disponibilidad
 * de una clase o actividad para los demás clientes.
 */
export type CalendarServiceKind = 'puppy' | 'comandos' | 'activity';

export type ScheduledCalendarClass = {
  dateKey: string;
  programCode: string | null | undefined;
  cancelled: boolean;
};

export const CALENDAR_SERVICE_ORDER: readonly CalendarServiceKind[] = [
  'puppy', 'comandos', 'activity',
];

export function buildCalendarServiceKinds(
  scheduledClasses: readonly ScheduledCalendarClass[],
  datedEvents: readonly string[],
): Record<string, CalendarServiceKind[]> {
  const byDate = new Map<string, Set<CalendarServiceKind>>();

  function add(dateKey: string, kind: CalendarServiceKind) {
    if (!dateKey) return;
    const kinds = byDate.get(dateKey) ?? new Set<CalendarServiceKind>();
    kinds.add(kind);
    byDate.set(dateKey, kinds);
  }

  for (const item of scheduledClasses) {
    if (item.cancelled) continue;
    add(item.dateKey, item.programCode === 'puppy'
      ? 'puppy'
      : item.programCode === 'comandos'
        ? 'comandos'
        : 'activity');
  }
  for (const dateKey of datedEvents) add(dateKey, 'activity');

  return Object.fromEntries(
    [...byDate].map(([dateKey, kinds]) => [
      dateKey,
      CALENDAR_SERVICE_ORDER.filter((kind) => kinds.has(kind)),
    ]),
  );
}

/** Un único color de noticias por día: prioridad primero, fijadas como desempate.
 * Nunca crea ni modifica disponibilidad de clases; solo añade un sector visual.
 */
export type CalendarAnnouncementColor = 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'gray';
export type CalendarAnnouncementMarker = {
  dateKey: string;
  colorKey: CalendarAnnouncementColor;
  priority?: 'urgent' | 'high' | 'normal' | 'low' | null;
  isPinned?: boolean;
  createdAt?: string;
};

export function selectCalendarAnnouncementColors(
  markers: readonly CalendarAnnouncementMarker[],
): Record<string, CalendarAnnouncementColor> {
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const result: Record<string, CalendarAnnouncementColor> = {};
  const ordered = [...markers].sort((a, b) =>
    rank[a.priority ?? 'normal'] - rank[b.priority ?? 'normal'] ||
    Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) ||
    (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
    a.colorKey.localeCompare(b.colorKey),
  );
  for (const marker of ordered) {
    if (marker.dateKey && !result[marker.dateKey]) result[marker.dateKey] = marker.colorKey;
  }
  return result;
}
