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
