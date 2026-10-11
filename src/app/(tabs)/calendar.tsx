import { ucapsaBrand, withAlpha } from '../../constants/brand';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEventOccurrenceCancellations } from '../../services/event-occurrence-cancellations.service';
import { getVisibleEvents } from '../../services/events.service';
import { clientReadKeys, readClientResource, writeClientResource, type CalendarClassesOfflineSnapshot } from '../../services/client-read-cache.service';
import { formatProgramScheduleDetailLabel, formatProgramScheduleName, getAdminProgramRows, getProgramClassCancellations, getProgramScheduleTimeline, getPrograms, isProgramScheduleActiveOnDate } from '../../services/programs.service';
import { getCachedMyPracticeActivity, getMyPracticeActivity, type PracticeActivityEntry } from '../../services/practice.service';
import {
  adminRosterLevelLabel,
  filterAdminClassRoster,
  getAdminClassRosterRows,
  getAdminCommandLevelCounts,
  type AdminRosterLevel,
} from '../../services/admin-class-roster.service';
import type { Announcement, EventOccurrence, EventOccurrenceCancellation, ProgramClassCancellation, ProgramEnrollmentWithDetails, ProgramSchedule, UcapsaEvent, UcapsaProgram } from '../../types/app.types';
import { expandEventOccurrences, formatDateKey , toDateKey, todayKey } from '../../utils/events.utils';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type ClassOccurrence = {
  id: string;
  schedule: ProgramSchedule;
  program: UcapsaProgram | null;
  dateKey: string;
  cancellation?: ProgramClassCancellation | null;
};

function announcementDateKey(announcement: Announcement): string | null {
  if (announcement.event?.start_date) return toDateKey(announcement.event.start_date);
  if (announcement.announcement_date) return toDateKey(announcement.announcement_date);
  return toDateKey(announcement.created_at);
}

function parseLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDateKeys(dateKey: string) {
  const selected = parseLocalDate(dateKey);
  const day = selected.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(selected, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => toLocalDateKey(addDays(monday, index)));
}

function shortWeekday(dateKey: string) {
  return parseLocalDate(dateKey).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
}

function dayNumber(dateKey: string) {
  return String(parseLocalDate(dateKey).getDate());
}

function getCancellationKey(scheduleId: string, dateKey: string) {
  return `${scheduleId}:${dateKey}`;
}

function getActiveCancellationKeys(cancellations: ProgramClassCancellation[]) {
  return new Set(
    cancellations
      .filter((item) => !item.restored_at)
      .map((item) => getCancellationKey(item.schedule_id, item.cancellation_date)),
  );
}

function expandClassOccurrences(schedules: ProgramSchedule[], programs: UcapsaProgram[], daysAhead = 120, cancellations: ProgramClassCancellation[] = []): ClassOccurrence[] {
  const programById = new Map(programs.map((program) => [program.id, program]));
  const activeCancellations = cancellations.filter((item) => !item.restored_at);
  const cancellationByKey = new Map(activeCancellations.map((item) => [getCancellationKey(item.schedule_id, item.cancellation_date), item]));
  const start = parseLocalDate(todayKey());
  const items: ClassOccurrence[] = [];

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const current = addDays(start, offset);
    const dateKey = toLocalDateKey(current);

    for (const schedule of schedules) {
      if (!isProgramScheduleActiveOnDate(schedule, dateKey)) continue;
      const cancellation = cancellationByKey.get(getCancellationKey(schedule.id, dateKey)) ?? null;
      items.push({
        id: `${schedule.id}-${dateKey}`,
        schedule,
        program: programById.get(schedule.program_id) ?? null,
        dateKey,
        cancellation,
      });
    }
  }

  return items;
}


function getClassTheme(programCode: string | null | undefined) {
  if (programCode === 'puppy') {
    return {
      background: ucapsaBrand.colors.goldPale,
      border: ucapsaBrand.colors.gold,
      iconBackground: ucapsaBrand.colors.goldSoft,
      accent: ucapsaBrand.colors.goldDark,
      title: ucapsaBrand.colors.text,
      text: ucapsaBrand.colors.muted,
    };
  }

  if (programCode === 'comandos') {
    return {
      background: ucapsaBrand.colors.redSoftMuted,
      border: ucapsaBrand.colors.redBorder,
      iconBackground: ucapsaBrand.colors.redSoft,
      accent: ucapsaBrand.colors.red,
      title: ucapsaBrand.colors.text,
      text: ucapsaBrand.colors.muted,
    };
  }

  return {
    background: ucapsaBrand.colors.surface,
    border: ucapsaBrand.colors.dangerBorder,
    iconBackground: ucapsaBrand.colors.redSoftMuted,
    accent: ucapsaBrand.colors.red,
    title: ucapsaBrand.colors.text,
    text: ucapsaBrand.colors.muted,
  };
}

function practiceDifficultyLabel(value: PracticeActivityEntry['difficulty']) {
  if (value === 'easy') return 'Fácil';
  if (value === 'hard') return 'Difícil';
  return 'Bien';
}

function practiceTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function CalendarScreen() {
  const { date: dateParam } = useLocalSearchParams<{ date?: string | string[] }>();
  const requestedDate = Array.isArray(dateParam) ? dateParam[0] ?? null : dateParam ?? null;
  const { user, role, isAdmin } = useSession();
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [eventCancellations, setEventCancellations] = useState<EventOccurrenceCancellation[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [programs, setPrograms] = useState<UcapsaProgram[]>([]);
  const [programSchedules, setProgramSchedules] = useState<ProgramSchedule[]>([]);
  const [classCancellations, setClassCancellations] = useState<ProgramClassCancellation[]>([]);
  const [adminProgramRows, setAdminProgramRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [practiceActivity, setPracticeActivity] = useState<PracticeActivityEntry[]>([]);
  const [practiceLoadWarning, setPracticeLoadWarning] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [monthExpanded, setMonthExpanded] = useState(isAdmin);
  const [classesExpanded, setClassesExpanded] = useState(false);
  const [openRoster, setOpenRoster] = useState<{ occurrenceId: string; level: AdminRosterLevel } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classLoadWarning, setClassLoadWarning] = useState<string | null>(null);
  const [adminRosterWarning, setAdminRosterWarning] = useState<string | null>(null);
  const [partialLoadWarning, setPartialLoadWarning] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [user, role, isAdmin]);
  const isPremium = format.key === 'member';

  useEffect(() => {
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setSelectedDate(requestedDate);
    }
  }, [requestedDate]);

  useEffect(() => {
    if (isAdmin) setMonthExpanded(true);
  }, [isAdmin]);

    const cacheScope = user?.id ?? 'public';

  const loadCalendarData = useCallback(async () => {
    setError(null);
    setClassLoadWarning(null);
    setAdminRosterWarning(null);
    setPartialLoadWarning(null);
    setPracticeLoadWarning(null);
    setUsingSavedData(false);

    const [eventCache, eventCancellationCache, announcementCache, classCache, localPracticeActivity] = await Promise.all([
      readClientResource<UcapsaEvent[]>(cacheScope, clientReadKeys.calendarEvents),
      readClientResource<EventOccurrenceCancellation[]>(cacheScope, clientReadKeys.calendarEventCancellations),
      readClientResource<Announcement[]>(cacheScope, clientReadKeys.announcements),
      readClientResource<CalendarClassesOfflineSnapshot>(cacheScope, clientReadKeys.calendarClasses),
      user && !isAdmin ? getCachedMyPracticeActivity(user.id) : Promise.resolve(null),
    ]);

    if (eventCache) setEvents(eventCache.data);
    if (eventCancellationCache) setEventCancellations(eventCancellationCache.data);
    if (announcementCache) setAnnouncements(announcementCache.data);
    if (classCache) {
      setPrograms(classCache.data.programs);
      setProgramSchedules(classCache.data.schedules);
      setClassCancellations(classCache.data.cancellations);
    }
    if (localPracticeActivity) setPracticeActivity(localPracticeActivity.entries);
    if (eventCache || eventCancellationCache || announcementCache || classCache || localPracticeActivity) {
      setSavedAt(eventCache?.saved_at ?? eventCancellationCache?.saved_at ?? announcementCache?.saved_at ?? classCache?.saved_at ?? localPracticeActivity?.savedAt ?? null);
      setLoading(false);
    }

    const [eventResult, eventCancellationResult, announcementResult, classResult, practiceResult, adminRosterResult] = await Promise.allSettled([
      withOperationTimeout(getVisibleEvents(), DEFAULT_READ_TIMEOUT_MS, 'calendar-events'),
      withOperationTimeout(
        getVisibleEventOccurrenceCancellations(),
        DEFAULT_READ_TIMEOUT_MS,
        'calendar-event-cancellations',
      ),
      withOperationTimeout(getVisibleAnnouncements(), DEFAULT_READ_TIMEOUT_MS, 'calendar-announcements'),
      withOperationTimeout(
        Promise.all([getPrograms(), getProgramScheduleTimeline(), getProgramClassCancellations()]),
        DEFAULT_READ_TIMEOUT_MS,
        'calendar-classes',
      ),
      user && !isAdmin
        ? withOperationTimeout(getMyPracticeActivity(user.id), DEFAULT_READ_TIMEOUT_MS, 'calendar-practice')
        : Promise.resolve(null),
      isAdmin
        ? withOperationTimeout(getAdminProgramRows(), DEFAULT_READ_TIMEOUT_MS, 'calendar-admin-rosters')
        : Promise.resolve([] as ProgramEnrollmentWithDetails[]),
    ]);

    if (eventResult.status === 'fulfilled') {
      setEvents(eventResult.value);
      const stored = await writeClientResource(cacheScope, clientReadKeys.calendarEvents, eventResult.value);
      setSavedAt(stored.saved_at);
    }
    if (eventCancellationResult.status === 'fulfilled') {
      setEventCancellations(eventCancellationResult.value);
      await writeClientResource(
        cacheScope,
        clientReadKeys.calendarEventCancellations,
        eventCancellationResult.value,
      );
    }
    if (announcementResult.status === 'fulfilled') {
      setAnnouncements(announcementResult.value);
      await writeClientResource(cacheScope, clientReadKeys.announcements, announcementResult.value);
    }
    if (classResult.status === 'fulfilled') {
      const snapshot: CalendarClassesOfflineSnapshot = {
        programs: classResult.value[0],
        schedules: classResult.value[1],
        cancellations: classResult.value[2],
      };
      setPrograms(snapshot.programs);
      setProgramSchedules(snapshot.schedules);
      setClassCancellations(snapshot.cancellations);
      await writeClientResource(cacheScope, clientReadKeys.calendarClasses, snapshot);
    }
    if (adminRosterResult.status === 'fulfilled') {
      setAdminProgramRows(adminRosterResult.value);
    } else if (isAdmin) {
      setAdminRosterWarning('Los inscritos por clase no se pudieron actualizar.');
    }

    if (practiceResult.status === 'fulfilled' && practiceResult.value) {
      setPracticeActivity(practiceResult.value.entries);
      if (practiceResult.value.source !== 'remote' && practiceResult.value.entries.length > 0) {
        setUsingSavedData(true);
        setSavedAt(practiceResult.value.savedAt ?? localPracticeActivity?.savedAt ?? null);
      }
    } else if (practiceResult.status === 'rejected' && user && !isAdmin) {
      setPracticeLoadWarning('Tu historial de prácticas no se pudo actualizar.');
    }

    const eventFailed = eventResult.status === 'rejected';
    const eventCancellationFailed = eventCancellationResult.status === 'rejected';
    const announcementFailed = announcementResult.status === 'rejected';
    const classFailed = classResult.status === 'rejected';
    const usablePracticeEntries = practiceResult.status === 'fulfilled'
      ? (practiceResult.value?.entries.length ?? 0)
      : (localPracticeActivity?.entries.length ?? 0);
    const noUsableData =
      eventFailed && !eventCache &&
      announcementFailed && !announcementCache &&
      classFailed && !classCache &&
      usablePracticeEntries === 0;

    if (noUsableData) {
      setError(friendlyReadError('No se pudo cargar el calendario.'));
    } else {
      if (classFailed) setClassLoadWarning('Las clases no se pudieron actualizar.');
      if (eventFailed || eventCancellationFailed || announcementFailed) {
        setPartialLoadWarning('Algunos eventos, cancelaciones o anuncios no se pudieron actualizar.');
      }

      const staleSource =
        eventFailed && eventCache
          ? eventCache
          : eventCancellationFailed && eventCancellationCache
            ? eventCancellationCache
          : announcementFailed && announcementCache
            ? announcementCache
            : classFailed && classCache
              ? classCache
              : null;
      if (staleSource) {
        setUsingSavedData(true);
        setSavedAt(staleSource.saved_at);
      }
    }

    setLoading(false);
  }, [cacheScope, isAdmin, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadCalendarData();
      return undefined;
    }, [loadCalendarData]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadCalendarData();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setClassesExpanded(false);
    setOpenRoster(null);
  }, [selectedDate]);

  const occurrences = useMemo(
    () => expandEventOccurrences(events, eventCancellations),
    [eventCancellations, events],
  );
  const classOccurrences = useMemo(() => expandClassOccurrences(programSchedules, programs, 120, classCancellations), [classCancellations, programSchedules, programs]);

  const selectedEvents = useMemo(
    () => occurrences.filter((occurrence) => toDateKey(occurrence.start_date) === selectedDate),
    [occurrences, selectedDate],
  );

  const selectedClasses = useMemo(
    () => classOccurrences.filter((occurrence) => occurrence.dateKey === selectedDate),
    [classOccurrences, selectedDate],
  );

  const selectedAnnouncements = useMemo(
    () => announcements.filter((announcement) => announcementDateKey(announcement) === selectedDate),
    [announcements, selectedDate],
  );

  const selectedPractices = useMemo(
    () => practiceActivity.filter((item) => toLocalDateKey(new Date(item.completedAt)) === selectedDate),
    [practiceActivity, selectedDate],
  );

  const weekDateKeys = useMemo(() => getWeekDateKeys(selectedDate), [selectedDate]);

  const activityDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const occurrence of occurrences) {
      const key = toDateKey(occurrence.start_date);
      if (key) keys.add(key);
    }
    for (const occurrence of classOccurrences) keys.add(occurrence.dateKey);
    for (const announcement of announcements) {
      const key = announcementDateKey(announcement);
      if (key) keys.add(key);
    }
    if (user && !isAdmin) {
      for (const practice of practiceActivity) keys.add(toLocalDateKey(new Date(practice.completedAt)));
    }
    return keys;
  }, [announcements, classOccurrences, isAdmin, occurrences, practiceActivity, user]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const key of activityDateKeys) marks[key] = { marked: true, dotColor: ucapsaBrand.colors.red };
    marks[selectedDate] = {
      ...(marks[selectedDate] ?? {}),
      selected: true,
      selectedColor: ucapsaBrand.colors.red,
      selectedTextColor: ucapsaBrand.colors.surface,
    };
    return marks;
  }, [activityDateKeys, selectedDate]);

  type DayAgendaItem = {
    id: string;
    kind: 'class' | 'event' | 'announcement' | 'practice';
    timeLabel: string;
    sortMinutes: number;
    title: string;
    detail: string;
    cancelled?: boolean;
    source: ClassOccurrence | EventOccurrence | Announcement | PracticeActivityEntry;
  };

  const dayAgendaItems = useMemo<DayAgendaItem[]>(() => {
    const items: DayAgendaItem[] = [];

    for (const announcement of selectedAnnouncements) {
      items.push({
        id: `announcement-${announcement.id}`,
        kind: 'announcement',
        timeLabel: 'Todo el día',
        sortMinutes: -20,
        title: announcement.title,
        detail: announcement.content,
        source: announcement,
      });
    }

    for (const occurrence of selectedEvents) {
      const date = new Date(occurrence.start_date);
      const hasTime = occurrence.event.has_time !== false && !Number.isNaN(date.getTime());
      items.push({
        id: `event-${occurrence.id}`,
        kind: 'event',
        timeLabel: hasTime ? date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'Todo el día',
        sortMinutes: hasTime ? date.getHours() * 60 + date.getMinutes() : -10,
        title: occurrence.event.title,
        detail: occurrence.event.location || occurrence.event.description || 'Evento UCAPSA',
        source: occurrence,
      });
    }

    for (const occurrence of selectedClasses) {
      const [hour, minute] = String(occurrence.schedule.start_time || '00:00').split(':').map(Number);
      items.push({
        id: `class-${occurrence.id}`,
        kind: 'class',
        timeLabel: String(occurrence.schedule.start_time || '').slice(0, 5) || 'Clase',
        sortMinutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
        title: formatProgramScheduleName(occurrence.schedule, occurrence.program),
        detail: occurrence.cancellation
          ? `Cancelada${occurrence.cancellation.reason ? ` · ${occurrence.cancellation.reason}` : ''}`
          : formatProgramScheduleDetailLabel(occurrence.schedule),
        cancelled: Boolean(occurrence.cancellation),
        source: occurrence,
      });
    }

    if (user && !isAdmin) {
      for (const practice of selectedPractices) {
        const date = new Date(practice.completedAt);
        items.push({
          id: `practice-${practice.id}`,
          kind: 'practice',
          timeLabel: practiceTimeLabel(practice.completedAt) || 'Práctica',
          sortMinutes: Number.isNaN(date.getTime()) ? 24 * 60 : date.getHours() * 60 + date.getMinutes(),
          title: `Práctica con ${practice.dogName || 'tu perro'}`,
          detail: `${practiceDifficultyLabel(practice.difficulty)}${practice.note ? ` · ${practice.note}` : ''}`,
          source: practice,
        });
      }
    }

    return items.sort((left, right) => left.sortMinutes - right.sortMinutes || left.title.localeCompare(right.title, 'es-MX'));
  }, [isAdmin, selectedAnnouncements, selectedClasses, selectedEvents, selectedPractices, user]);
  const allSelectedClassesCancelled = selectedClasses.length > 0 && selectedClasses.every((occurrence) => Boolean(occurrence.cancellation));
  const cancelledClassesCount = selectedClasses.filter((occurrence) => Boolean(occurrence.cancellation)).length;
  const activeClassesCount = selectedClasses.length - cancelledClassesCount;
  const dayCount = dayAgendaItems.length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: format.background }]} edges={['top']}>
      <ScrollView
        style={[styles.container, { backgroundColor: format.background }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={[styles.hero, { backgroundColor: format.heroBackground }]}>
          <View style={[styles.heroIcon, { backgroundColor: format.pillBackground }]}>
            <MaterialIcons name="event" size={28} color={format.pillText} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.kicker, { color: format.heroMuted }]}>Agenda UCAPSA</Text>
            <Text style={[styles.title, { color: format.heroText }]}>Lo que pasa y lo que te toca</Text>
            <Text style={[styles.subtitle, { color: format.heroMuted }]}>Selecciona un día y revisa su horario.</Text>
          </View>
        </View>

        <View style={[styles.sectionSwitch, { borderColor: format.border, backgroundColor: format.cardBackground }]}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            style={styles.switchButton}
            onPress={() => router.push('/announcements' as never)}
          >
            <MaterialIcons name="campaign" size={18} color={format.accentDark} />
            <Text style={[styles.switchText, { color: format.accentDark }]}>Avisos</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            style={[styles.switchButton, { backgroundColor: format.primaryButton }]}
          >
            <MaterialIcons name="calendar-month" size={18} color={format.primaryButtonText} />
            <Text style={[styles.switchText, { color: format.primaryButtonText }]}>Agenda</Text>
          </Pressable>
        </View>

        {isAdmin ? (
          <View style={styles.adminRow}>
            <Pressable style={[styles.adminButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/admin/events' as never)}>
              <MaterialIcons name="admin-panel-settings" size={20} color={ucapsaBrand.colors.surface} />
              <Text style={styles.adminButtonText}>Administrar eventos</Text>
            </Pressable>
            <Pressable style={[styles.adminButtonAlt, { backgroundColor: format.secondaryButton, borderColor: format.border }]} onPress={() => router.push('/admin/classes' as never)}>
              <MaterialIcons name="school" size={20} color={format.accent} />
              <Text style={styles.adminButtonAltText}>Horarios base</Text>
            </Pressable>
          </View>
        ) : null}

        {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void onRefresh()} premium={isPremium} /> : null}

        {loading && dayCount === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
            <Text style={[styles.muted, { color: format.muted }]}>Cargando calendario...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>No se pudo cargar</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.secondaryButton} onPress={onRefresh}>
              <Text style={styles.secondaryButtonText}>Intentar otra vez</Text>
            </Pressable>
          </View>
        ) : null}

        {partialLoadWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Actualizacion parcial</Text>
            <Text style={styles.warningText}>{partialLoadWarning}</Text>
          </View>
        ) : null}

        {classLoadWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Clases no disponibles</Text>
            <Text style={styles.warningText}>{classLoadWarning}</Text>
          </View>
        ) : null}

        {adminRosterWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Inscritos no disponibles</Text>
            <Text style={styles.warningText}>{adminRosterWarning}</Text>
          </View>
        ) : null}

        {practiceLoadWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Actividad sin actualizar</Text>
            <Text style={styles.warningText}>{practiceLoadWarning}</Text>
          </View>
        ) : null}

        {!error ? (
          <>
            <View style={[styles.calendarCard, { borderColor: isPremium ? ucapsaBrand.colors.premiumBorderStrong : format.cardBorder }]}>
              <View style={styles.agendaTopBar}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.agendaDateEyebrow, { color: isPremium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>AGENDA</Text>
                  <Text style={[styles.agendaDateTitle, { color: format.cardText }]}>{formatDateKey(selectedDate)}</Text>
                </View>
                {selectedDate !== todayKey() ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" style={[styles.compactAction, { borderColor: format.cardBorder }]} onPress={() => setSelectedDate(todayKey())}>
                    <Text style={[styles.compactActionText, { color: format.accentDark }]}>Hoy</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={monthExpanded ? 'Ver semana' : 'Ver mes'} style={[styles.compactAction, { borderColor: format.cardBorder }]} onPress={() => setMonthExpanded((value) => !value)}>
                  <MaterialIcons name={monthExpanded ? 'view-week' : 'calendar-month'} size={17} color={format.accentDark} />
                  <Text style={[styles.compactActionText, { color: format.accentDark }]}>{monthExpanded ? 'Semana' : 'Mes'}</Text>
                </Pressable>
              </View>

              {monthExpanded ? (
                <Calendar
                  current={selectedDate}
                  onDayPress={(day: DateData) => {
                    setSelectedDate(day.dateString);
                    if (!isAdmin) setMonthExpanded(false);
                  }}
                  markedDates={markedDates}
                  firstDay={1}
                  enableSwipeMonths
                  theme={{
                    calendarBackground: ucapsaBrand.colors.surface,
                    textSectionTitleColor: ucapsaBrand.colors.muted,
                    selectedDayBackgroundColor: ucapsaBrand.colors.red,
                    selectedDayTextColor: ucapsaBrand.colors.surface,
                    todayTextColor: ucapsaBrand.colors.red,
                    dayTextColor: ucapsaBrand.colors.text,
                    monthTextColor: ucapsaBrand.colors.text,
                    arrowColor: ucapsaBrand.colors.red,
                    textDayFontWeight: '700',
                    textMonthFontWeight: '900',
                    textDayHeaderFontWeight: '800',
                  }}
                />
              ) : (
                <>
                  <View style={styles.weekNav}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" style={styles.weekNavArrow} onPress={() => setSelectedDate(toLocalDateKey(addDays(parseLocalDate(selectedDate), -7)))}>
                      <MaterialIcons name="chevron-left" size={21} color={format.accentDark} />
                    </Pressable>
                    <Text style={[styles.weekNavLabel, { color: format.muted }]}>{formatDateKey(weekDateKeys[0])} – {formatDateKey(weekDateKeys[6])}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Semana siguiente" style={styles.weekNavArrow} onPress={() => setSelectedDate(toLocalDateKey(addDays(parseLocalDate(selectedDate), 7)))}>
                      <MaterialIcons name="chevron-right" size={21} color={format.accentDark} />
                    </Pressable>
                  </View>
                  <View style={styles.weekStrip}>
                    {weekDateKeys.map((dateKey) => {
                      const selected = dateKey === selectedDate;
                      const isToday = dateKey === todayKey();
                      const hasActivity = activityDateKeys.has(dateKey);
                      return (
                        <Pressable
                          key={dateKey}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={formatDateKey(dateKey)}
                          style={[styles.weekDayCompact, { backgroundColor: selected ? format.primaryButton : 'transparent' }]}
                          onPress={() => setSelectedDate(dateKey)}
                        >
                          <Text style={[styles.weekDayName, { color: selected ? format.primaryButtonText : format.muted }]}>{shortWeekday(dateKey)}</Text>
                          <Text style={[styles.weekDayNumber, { color: selected ? format.primaryButtonText : isToday ? format.accentDark : format.cardText }]}>{dayNumber(dateKey)}</Text>
                          <View style={[styles.activityDot, { opacity: hasActivity ? 1 : 0, backgroundColor: selected ? format.primaryButtonText : format.accent }]} />
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {!monthExpanded ? (
                <View style={[styles.daySchedule, { borderTopColor: format.cardBorder }]}>
                  {dayAgendaItems.length === 0 ? (
                    <View style={styles.dayEmpty}>
                      <MaterialIcons name="event-available" size={24} color={format.muted} />
                      <Text style={[styles.dayEmptyTitle, { color: format.cardText }]}>Día libre</Text>
                      <Text style={[styles.dayEmptyText, { color: format.muted }]}>No hay actividad registrada para este día.</Text>
                    </View>
                  ) : dayAgendaItems.map((item) => {
                    const accent = item.cancelled
                      ? ucapsaBrand.colors.red
                      : item.kind === 'class'
                        ? ucapsaBrand.colors.blue
                        : item.kind === 'event'
                          ? ucapsaBrand.colors.red
                          : item.kind === 'announcement'
                            ? ucapsaBrand.colors.gold
                            : ucapsaBrand.colors.green;
                    const icon = item.kind === 'class'
                      ? 'school'
                      : item.kind === 'event'
                        ? 'event'
                        : item.kind === 'announcement'
                          ? 'campaign'
                          : 'local-fire-department';
                    const pressable = item.kind === 'announcement' || (isAdmin && (item.kind === 'class' || item.kind === 'event'));

                    const onItemPress = () => {
                      if (item.kind === 'announcement') {
                        const announcement = item.source as Announcement;
                        router.push(isAdmin ? `/admin/announcements?announcementId=${announcement.id}` as never : '/announcements' as never);
                      } else if (item.kind === 'event' && isAdmin) {
                        const occurrence = item.source as EventOccurrence;
                        router.push(`/admin/events?eventId=${occurrence.event.id}` as never);
                      } else if (item.kind === 'class' && isAdmin) {
                        router.push(`/admin/class-cancellations?date=${selectedDate}` as never);
                      }
                    };

                    return (
                      <Pressable
                        key={item.id}
                        disabled={!pressable}
                        accessibilityRole={pressable ? 'button' : undefined}
                        style={styles.timelineRow}
                        onPress={pressable ? onItemPress : undefined}
                      >
                        <Text style={[styles.timelineTime, { color: format.muted }]}>{item.timeLabel}</Text>
                        <View style={[styles.timelineRail, { backgroundColor: accent }]} />
                        <View style={[styles.timelineBlock, { backgroundColor: withAlpha(accent, 0.08), borderColor: withAlpha(accent, 0.28) }]}>
                          <View style={styles.timelineTitleRow}>
                            <MaterialIcons name={icon} size={17} color={accent} />
                            <Text numberOfLines={1} style={[styles.timelineTitle, { color: item.cancelled ? ucapsaBrand.colors.red : format.cardText, textDecorationLine: item.cancelled ? 'line-through' : 'none' }]}>{item.title}</Text>
                            {pressable ? <MaterialIcons name="chevron-right" size={18} color={accent} /> : null}
                          </View>
                          <Text numberOfLines={2} style={[styles.timelineDetail, { color: format.muted }]}>{item.detail}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ucapsaBrand.colors.redPale },
  container: { flex: 1, backgroundColor: ucapsaBrand.colors.redPale },
  content: { gap: 16, padding: 20, paddingBottom: 110 },
  hero: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 20, backgroundColor: ucapsaBrand.colors.redDeep },
  heroIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  heroText: { flex: 1, gap: 6 },
  kicker: { color: ucapsaBrand.colors.redSoftStrong, fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.surface, fontSize: 19, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.textLight, fontSize: 11, lineHeight: 16 },
  sectionSwitch: { flexDirection: 'row', gap: 6, borderWidth: 1, borderRadius: 18, padding: 5 },
  switchButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14 },
  switchText: { fontSize: 13, fontWeight: '900' },
  adminRow: { flexDirection: 'row', gap: 10 },
  adminButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 18, backgroundColor: ucapsaBrand.colors.red },
  adminButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  adminButtonAlt: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 18, backgroundColor: ucapsaBrand.colors.redSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder },
  adminButtonAltText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  agendaTopBar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  agendaDateEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  agendaDateTitle: { marginTop: 2, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  compactAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10 },
  compactActionText: { fontSize: 11, fontWeight: '900' },
  weekNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 5 },
  weekNavArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  weekNavLabel: { flex: 1, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  weekDayCompact: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 16, paddingVertical: 7 },
  activityDot: { width: 5, height: 5, borderRadius: 999, marginTop: 2 },
  daySchedule: { borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  dayEmpty: { alignItems: 'center', gap: 5, paddingVertical: 24, paddingHorizontal: 18 },
  dayEmptyTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  dayEmptyText: { maxWidth: 280, textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  timelineRow: { minHeight: 58, flexDirection: 'row', alignItems: 'stretch', gap: 8, paddingVertical: 4 },
  timelineTime: { width: 58, paddingTop: 10, textAlign: 'right', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  timelineRail: { width: 3, borderRadius: 999 },
  timelineBlock: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9 },
  timelineTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timelineTitle: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  timelineDetail: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
    calendarCard: { overflow: 'hidden', borderRadius: 24, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 2, borderColor: ucapsaBrand.colors.red },
  calendarLead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  calendarLeadIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  calendarLeadKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  calendarLeadTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', marginTop: 1 },
  agendaFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 14, paddingTop: 12 },
  filterChip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  filterChipText: { fontSize: 11, fontWeight: '900' },
  weekToolbar: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingTop: 12 },
  weekArrow: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '900' },
  monthToggle: { minHeight: 36, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 10 },
  monthToggleText: { fontSize: 10, fontWeight: '900' },
  weekStrip: { flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 12 },
  weekDay: { flex: 1, minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderRadius: 15, paddingVertical: 7 },
  weekDaySelected: { transform: [{ scale: 1.02 }] },
  weekDayName: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  weekDayNumber: { fontSize: 17, lineHeight: 20, fontWeight: '900' },
  weekDots: { minHeight: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  weekDot: { width: 5, height: 5, borderRadius: 999 },
    calendarLeadText: { fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  calendarToday: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 11 },
  calendarTodayText: { fontSize: 11, fontWeight: '900' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.graySoft },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 12 },
  legendDot: { width: 9, height: 9, borderRadius: 999 },
  eventDot: { backgroundColor: ucapsaBrand.colors.red },
  classDot: { backgroundColor: ucapsaBrand.colors.blue },
  announcementDot: { backgroundColor: ucapsaBrand.colors.gold },
  practiceDot: { backgroundColor: ucapsaBrand.colors.green },
  legendText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  practiceDayCard: { gap: 12, padding: 14, borderRadius: 22, borderWidth: 1 },
  practiceDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  practiceDayIcon: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  practiceDayKicker: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  practiceDayTitle: { fontSize: 17, fontWeight: '900', marginTop: 2 },
  practiceDayList: { gap: 8 },
  practiceDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, padding: 11 },
  practiceDayDog: { fontSize: 14, fontWeight: '900' },
  practiceDayMeta: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  practiceDayNote: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 4 },
  practicePending: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  warningBox: { gap: 6, padding: 16, borderRadius: 18, backgroundColor: ucapsaBrand.colors.warningSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder },
  warningTitle: { color: ucapsaBrand.colors.goldDark, fontSize: 16, fontWeight: '900' },
  warningText: { color: ucapsaBrand.colors.goldDark, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  centerBox: { gap: 10, alignItems: 'center', padding: 24 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  errorBox: { gap: 10, padding: 16, borderRadius: 18, backgroundColor: ucapsaBrand.colors.dangerSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 16, fontWeight: '900' },
  errorText: { color: ucapsaBrand.colors.premiumActionText, fontSize: 14 },
  secondaryButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 10 },
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface },
  todayButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  sectionCount: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, color: ucapsaBrand.colors.redDark, backgroundColor: ucapsaBrand.colors.redSoft, fontSize: 12, fontWeight: '900' },
  emptyBox: { gap: 6, padding: 18, borderRadius: 18, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  classGroupCard: { gap: 10, padding: 14, borderRadius: 22, backgroundColor: ucapsaBrand.colors.redSoftMuted, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder },
  classGroupCardCancelled: { backgroundColor: ucapsaBrand.colors.redPale, borderColor: ucapsaBrand.colors.redBorder },
  classGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  classGroupIcon: { width: 46, height: 46, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  classGroupIconCancelled: { backgroundColor: ucapsaBrand.colors.premiumMuted },
  classGroupTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 2 },
  classGroupTitleCancelled: { color: ucapsaBrand.colors.muted, textDecorationLine: 'line-through' },
  classGroupText: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '800', marginTop: 2, lineHeight: 18 },
  classGroupTextCancelled: { color: ucapsaBrand.colors.danger },
  classKickerCancelled: { color: ucapsaBrand.colors.red },
  classGroupPill: { minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: ucapsaBrand.colors.red },
  classGroupPillCancelled: { backgroundColor: ucapsaBrand.colors.red },
  classGroupPillText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  classList: { gap: 9, paddingTop: 2 },
  classChildCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 17, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder },
  classIcon: { width: 44, height: 44, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  classIconSmall: { width: 34, height: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoftMuted },
  classKicker: { color: ucapsaBrand.colors.red, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  classTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginTop: 2 },
  classText: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '800', marginTop: 2 },
  classHint: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', marginTop: 5 },
  rosterCount: { color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 17, fontWeight: '900', marginTop: 5 },
  levelSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, paddingHorizontal: 2 },
  levelChip: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 7 },
  levelChipActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  levelChipText: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900' },
  levelChipTextActive: { color: ucapsaBrand.colors.surface },
  rosterPanel: { gap: 8, marginTop: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 10 },
  rosterPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  rosterHeading: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  manageDateButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 9, paddingVertical: 7 },
  manageDateText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  rosterEmpty: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', paddingVertical: 6 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.premiumMuted, paddingTop: 9 },
  rosterAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rosterName: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  rosterDog: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', marginTop: 1 },
  rosterMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  rosterContact: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 1 },
  cancelledText: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', marginTop: 4 },
  dayCancelledText: { alignSelf: 'flex-start', overflow: 'hidden', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: ucapsaBrand.colors.premiumMuted, color: ucapsaBrand.colors.danger, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
});
