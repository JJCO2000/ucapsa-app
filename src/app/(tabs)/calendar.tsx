import { ucapsaBrand, ucapsaColorKeyPalette, withAlpha } from '../../constants/brand';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import { devWarn } from '../../lib/client-diagnostics';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ContextualHelpTip } from '../../components/ui/ContextualHelpTip';
import { CalendarActivityRing } from '../../components/calendar/CalendarActivityRing';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { useMemberAppearance } from '../../hooks/useMemberAppearance';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEventOccurrenceCancellations } from '../../services/event-occurrence-cancellations.service';
import { getVisibleEvents } from '../../services/events.service';
import { clientReadKeys, readClientResource, writeClientResource, type CalendarClassesOfflineSnapshot } from '../../services/client-read-cache.service';
import { formatProgramScheduleDetailLabel, formatProgramScheduleName, getAdminProgramRows, getProgramClassCancellations, getProgramScheduleTimeline, getPrograms, isProgramScheduleActiveOnDate } from '../../services/programs.service';
import { getMyDogs, type BasicDog } from '../../services/dogs.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import { getMyClassRsvp, setMyClassRsvp, type ClassRsvpResponse } from '../../services/class-rsvp.service';
import { getMyIntroAgendaPlans, isSaturdayIntroClass, saveMyIntroAgendaPlan, type IntroAgendaPlan, type IntroAgendaStatus } from '../../services/intro-class-agenda.service';
import { syncIntroAgendaLocalReminder } from '../../services/intro-class-reminder.service';
import { getCachedMyPracticeActivity, getMyPracticeActivity, type PracticeActivityEntry } from '../../services/practice.service';
import {
  adminRosterLevelLabel,
  filterAdminClassRoster,
  getAdminClassRosterRows,
  getAdminCommandLevelCounts,
  type AdminRosterLevel,
} from '../../services/admin-class-roster.service';
import type { Announcement, EventOccurrence, EventOccurrenceCancellation, ProgramClassCancellation, ProgramEnrollmentWithDetails, ProgramSchedule, UcapsaEvent, UcapsaProgram } from '../../types/app.types';
import { expandEventOccurrences, formatDateKey, toDateKey, todayKey } from '../../utils/events.utils';
import { buildCalendarServiceKinds, selectCalendarAnnouncementColors } from '../../utils/calendar-service-rings.utils';
import { calendarMonthDateKeys } from '../../utils/calendar-date-window.utils';
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

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCancellationKey(scheduleId: string, dateKey: string) {
  return `${scheduleId}:${dateKey}`;
}

function expandClassOccurrences(
  schedules: ProgramSchedule[],
  programs: UcapsaProgram[],
  dateKeys: readonly string[],
  cancellations: ProgramClassCancellation[] = [],
): ClassOccurrence[] {
  const programById = new Map(programs.map((program) => [program.id, program]));
  const cancellationByKey = new Map(
    cancellations.filter((item) => !item.restored_at)
      .map((item) => [getCancellationKey(item.schedule_id, item.cancellation_date), item]),
  );
  const items: ClassOccurrence[] = [];
  for (const dateKey of dateKeys) {
    for (const schedule of schedules) {
      // Canonical business rule from programs.domain, also used by Admin.
      if (!isProgramScheduleActiveOnDate(schedule, dateKey)) continue;
      items.push({
        id: `${schedule.id}-${dateKey}`,
        schedule,
        program: programById.get(schedule.program_id) ?? null,
        dateKey,
        cancellation: cancellationByKey.get(getCancellationKey(schedule.id, dateKey)) ?? null,
      });
    }
  }
  return items;
}

function getColorTone(colorKey: UcapsaProgram['color_key'] | Announcement['color_key'] | UcapsaEvent['color_key'] | null | undefined) {
  return ucapsaColorKeyPalette[colorKey ?? 'red'] ?? ucapsaColorKeyPalette.red;
}

function getClassTheme(program: UcapsaProgram | null | undefined) {
  const tone = getColorTone(program?.color_key);
  return {
    background: tone.soft,
    border: tone.accent,
    iconBackground: tone.soft,
    accent: tone.text,
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
  const calendarScrollRef = useRef<ScrollView>(null);
  const calendarCardYRef = useRef(0);
  const agendaYRef = useRef(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (active) setReduceMotion(enabled); })
      .catch((cause) => { devWarn('calendar: reduce motion preference unavailable, defaulting to no animation', cause); if (active) setReduceMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [eventCancellations, setEventCancellations] = useState<EventOccurrenceCancellation[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [programs, setPrograms] = useState<UcapsaProgram[]>([]);
  const [programSchedules, setProgramSchedules] = useState<ProgramSchedule[]>([]);
  const [classCancellations, setClassCancellations] = useState<ProgramClassCancellation[]>([]);
  const [adminProgramRows, setAdminProgramRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [clientDogs, setClientDogs] = useState<BasicDog[]>([]);
  const [clientEnrollments, setClientEnrollments] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [introPlans, setIntroPlans] = useState<IntroAgendaPlan[]>([]);
  const [clientClassReady, setClientClassReady] = useState(false);
  const [clientClassError, setClientClassError] = useState<string | null>(null);
  const [openClientClassId, setOpenClientClassId] = useState<string | null>(null);
  const [selectedClientDogId, setSelectedClientDogId] = useState<string | null>(null);
  const [classActionBusy, setClassActionBusy] = useState(false);
  const [classResponses, setClassResponses] = useState<Record<string, ClassRsvpResponse | null>>({});

  const [practiceActivity, setPracticeActivity] = useState<PracticeActivityEntry[]>([]);
  const [practiceLoadWarning, setPracticeLoadWarning] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [visibleMonth, setVisibleMonth] = useState(() => todayKey().slice(0, 7));
  // These flags track whether an absence of offerings is actually verifiable.
  // If a source has not loaded, "grey = no service" would be an incorrect claim.
  const [calendarSources, setCalendarSources] = useState({
    classes: false,
    events: false,
    eventCancellations: false,
    announcements: false,
  });
  const [openRoster, setOpenRoster] = useState<{ occurrenceId: string; level: AdminRosterLevel } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classLoadWarning, setClassLoadWarning] = useState<string | null>(null);
  const [adminRosterWarning, setAdminRosterWarning] = useState<string | null>(null);
  const [partialLoadWarning, setPartialLoadWarning] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const { memberTheme } = useMemberAppearance();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, memberTheme }), [memberTheme, user, role, isAdmin]);
  const isPremium = format.key === 'member';

  useEffect(() => {
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setSelectedDate(requestedDate);
      setVisibleMonth(requestedDate.slice(0, 7));
    }
  }, [requestedDate]);

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

    setCalendarSources({
      events: Boolean(eventCache),
      eventCancellations: Boolean(eventCancellationCache),
      classes: Boolean(classCache),
      announcements: Boolean(announcementCache),
    });
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
      setCalendarSources((current) => ({ ...current, events: true }));
      setEvents(eventResult.value);
      const stored = await writeClientResource(cacheScope, clientReadKeys.calendarEvents, eventResult.value);
      setSavedAt(stored.saved_at);
    }
    if (eventCancellationResult.status === 'fulfilled') {
      setCalendarSources((current) => ({ ...current, eventCancellations: true }));
      setEventCancellations(eventCancellationResult.value);
      await writeClientResource(
        cacheScope,
        clientReadKeys.calendarEventCancellations,
        eventCancellationResult.value,
      );
    }
    if (announcementResult.status === 'fulfilled') {
      setCalendarSources((current) => ({ ...current, announcements: true }));
      setAnnouncements(announcementResult.value);
      await writeClientResource(cacheScope, clientReadKeys.announcements, announcementResult.value);
    }
    if (classResult.status === 'fulfilled') {
      setCalendarSources((current) => ({ ...current, classes: true }));
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

  const loadClientClassContext = useCallback(async () => {
    if (!user || isAdmin) {
      setClientClassReady(false);
      return;
    }
    setClientClassReady(false);
    setClientClassError(null);
    try {
      const [dogs, enrollments, plans] = await Promise.all([
        getMyDogs(),
        getMyProgramEnrollments(),
        getMyIntroAgendaPlans(user.id, todayKey(), toLocalDateKey(new Date(Date.now() + 120 * 86400000))),
      ]);
      setClientDogs(dogs.filter(dog => dog.is_active));
      setClientEnrollments(enrollments);
      setIntroPlans(plans);
      setSelectedClientDogId(current => dogs.some(dog => dog.id === current && dog.is_active)
        ? current : dogs.find(dog => dog.is_active)?.id ?? null);
      setClientClassReady(true);
    } catch (cause) {
      setClientDogs([]);
      setClientEnrollments([]);
      setIntroPlans([]);
      setClientClassError('No pudimos comprobar las inscripciones. Reintenta antes de agendar.');
      devWarn('calendar: failed to load client class context', cause);
    }
  }, [isAdmin, user?.id]);

  useFocusEffect(useCallback(() => {
    void loadClientClassContext();
    return undefined;
  }, [loadClientClassContext]));

  async function saveIntroClassChoice(classDate: string, status: IntroAgendaStatus) {
    if (!user || !selectedClientDogId || classActionBusy) return;
    setClassActionBusy(true);
    try {
      const saved = await saveMyIntroAgendaPlan(selectedClientDogId, classDate, status);
      const next = [...introPlans.filter(p => p.id !== saved.id), saved];
      setIntroPlans(next);
      const reminder = await syncIntroAgendaLocalReminder(user.id, classDate, next);
      Alert.alert(
        status === 'cancelled' ? 'Visita retirada' : 'Agenda actualizada',
        status === 'cancelled'
          ? 'Quitamos esta visita de tu agenda.'
          : status === 'planned'
            ? 'Guardamos tu visita inicial. No es una inscripción ni registra asistencia.'
            : 'Guardamos tu respuesta para el equipo UCAPSA. La asistencia real se registra el día de la clase.'
          ,
      );
      if (status !== 'cancelled' && reminder === 'unsupported') {
        Alert.alert('Aviso de recordatorio', 'Tu visita quedó guardada, pero no pudimos activar el aviso en este dispositivo. Revisa los permisos y las preferencias de notificación.');
      }
    } catch (cause) {
      Alert.alert('No se guardó', cause instanceof Error ? cause.message : 'Revisa tu conexión e intenta nuevamente.');
    } finally {
      setClassActionBusy(false);
    }
  }

  async function confirmEnrolledClass(enrollmentId: string, classDate: string, response: ClassRsvpResponse) {
    if (classActionBusy) return;
    setClassActionBusy(true);
    try {
      await setMyClassRsvp(enrollmentId, classDate, response);
      setClassResponses(current => ({ ...current, [`${enrollmentId}:${classDate}`]: response }));
      Alert.alert('Respuesta guardada', 'El Entrenador verá tu respuesta. Esto no registra asistencia real.');
    } catch (cause) {
      Alert.alert('No se pudo confirmar', cause instanceof Error ? cause.message : 'Revisa tu conexión.');
    } finally {
      setClassActionBusy(false);
    }
  }

  function toggleClientClass(occurrence: ClassOccurrence) {
    if (openClientClassId === occurrence.id) { setOpenClientClassId(null); return; }
    setOpenClientClassId(occurrence.id);
    const enrollment = clientEnrollments.find(row =>
      row.enrollment.schedule_id === occurrence.schedule.id
      && row.enrollment.dog_id === selectedClientDogId
      && row.enrollment.status === 'active');
    if (enrollment) {
      void getMyClassRsvp(enrollment.enrollment.id, occurrence.dateKey)
        .then(response => setClassResponses(current => ({
          ...current, [`${enrollment.enrollment.id}:${occurrence.dateKey}`]: response?.response ?? null,
        })))
        .catch(cause => devWarn('calendar: unable to read RSVP state', cause));
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([loadCalendarData(), loadClientClassContext()]);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setOpenRoster(null);
    setOpenClientClassId(null);
  }, [selectedDate]);

  const occurrences = useMemo(
    () => expandEventOccurrences(events, eventCancellations),
    [eventCancellations, events],
  );
  const visibleDateKeys = useMemo(
    () => calendarMonthDateKeys(visibleMonth, selectedDate),
    [visibleMonth, selectedDate],
  );
  const classOccurrences = useMemo(
    () => expandClassOccurrences(programSchedules, programs, visibleDateKeys, classCancellations),
    [classCancellations, programSchedules, programs, visibleDateKeys],
  );

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

  useEffect(() => {
    if (!openClientClassId || !selectedClientDogId || !clientClassReady) return;
    const occurrence = selectedClasses.find(item => item.id === openClientClassId);
    const enrollment = occurrence && clientEnrollments.find(row =>
      row.enrollment.dog_id === selectedClientDogId
      && row.enrollment.schedule_id === occurrence.schedule.id
      && row.enrollment.status === 'active');
    if (!enrollment || !occurrence) return;
    let active = true;
    void getMyClassRsvp(enrollment.enrollment.id, occurrence.dateKey)
      .then(response => {
        if (active) setClassResponses(current => ({
          ...current, [`${enrollment.enrollment.id}:${occurrence.dateKey}`]: response?.response ?? null,
        }));
      })
      .catch(cause => devWarn('calendar: could not refresh class RSVP state', cause));
    return () => { active = false; };
  }, [clientClassReady, clientEnrollments, openClientClassId, selectedClasses, selectedClientDogId]);

  const selectedPractices = useMemo(
    () => practiceActivity.filter((item) => toLocalDateKey(new Date(item.completedAt)) === selectedDate),
    [practiceActivity, selectedDate],
  );

  // Only actual non-cancelled classes and events mark an offered service.
  // Announcements and private practice entries never imply a class is available.
  const calendarDataIncomplete = !calendarSources.classes || !calendarSources.events || !calendarSources.eventCancellations || !calendarSources.announcements;
  const servicesByDate = useMemo(() => buildCalendarServiceKinds(
    classOccurrences.map((occurrence) => ({
      dateKey: occurrence.dateKey,
      programCode: occurrence.program?.code,
      cancelled: Boolean(occurrence.cancellation),
    })),
    occurrences
      .map((occurrence) => toDateKey(occurrence.start_date))
      .filter((dateKey): dateKey is string => Boolean(dateKey)),
  ), [classOccurrences, occurrences]);

  const announcementColorsByDate = useMemo(() => selectCalendarAnnouncementColors(
    announcements.map((announcement) => ({
      dateKey: announcementDateKey(announcement) ?? '',
      colorKey: announcement.color_key ?? 'red',
      priority: announcement.priority,
      isPinned: announcement.is_pinned,
      createdAt: announcement.created_at,
    })),
  ), [announcements]);

  type DayAgendaItem = {
    id: string;
    kind: 'class' | 'event' | 'announcement' | 'practice';
    timeLabel: string;
    sortMinutes: number;
    title: string;
    detail: string;
    cancelled?: boolean;
    colorKey?: UcapsaProgram['color_key'] | Announcement['color_key'] | UcapsaEvent['color_key'] | null;
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
        colorKey: announcement.color_key,
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
        colorKey: occurrence.event.color_key,
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
        colorKey: occurrence.program?.color_key,
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
  const hasClientSyncWarning = usingSavedData || Boolean(partialLoadWarning || classLoadWarning || practiceLoadWarning);

  function selectCalendarDay(dateKey: string) {
    setSelectedDate(dateKey);
    setVisibleMonth(dateKey.slice(0, 7));
    requestAnimationFrame(() => {
      calendarScrollRef.current?.scrollTo({
        y: Math.max(0, calendarCardYRef.current + agendaYRef.current - 16),
        animated: !reduceMotion,
      });
    });
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: format.background }]} edges={['top']}>
      <ScrollView
        ref={calendarScrollRef}
        style={[styles.container, { backgroundColor: format.background }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.pageHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.pageEyebrow, { color: format.accentDark }]}>UCAPSA</Text>
            <Text style={[styles.pageTitle, { color: format.text }]}>Agenda</Text>
            <Text style={[styles.pageSubtitle, { color: format.muted }]}>Selecciona un día y revisa su horario.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir avisos"
            style={[styles.noticeShortcut, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}
            onPress={() => router.push('/announcements' as never)}
          >
            <MaterialIcons name="campaign" size={19} color={format.accentDark} />
            <Text style={[styles.noticeShortcutText, { color: format.accentDark }]}>Avisos</Text>
          </Pressable>
        </View>
        {!isAdmin && user ? <ContextualHelpTip tab="calendar" userId={user.id} format={format} /> : null}

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

        {!isAdmin && hasClientSyncWarning ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void onRefresh()} premium={isPremium} /> : null}

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

        {isAdmin && adminRosterWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Inscritos no disponibles</Text>
            <Text style={styles.warningText}>{adminRosterWarning}</Text>
          </View>
        ) : null}

        {!error ? (
          <>
            <View onLayout={(e) => { calendarCardYRef.current = e.nativeEvent.layout.y; }} style={[styles.calendarCard, { borderColor: isPremium ? ucapsaBrand.colors.premiumBorderStrong : format.cardBorder }]}>
              <View style={styles.agendaTopBar}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.agendaDateEyebrow, { color: format.accentDark }]}>AGENDA</Text>
                  <Text style={[styles.agendaDateTitle, { color: format.cardText }]}>{formatDateKey(selectedDate)}</Text>
                </View>
                {selectedDate !== todayKey() ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Ir a hoy" style={[styles.compactAction, { borderColor: format.cardBorder }]} onPress={() => {
                      setSelectedDate(todayKey());
                      setVisibleMonth(todayKey().slice(0, 7));
                    }}>
                    <Text style={[styles.compactActionText, { color: format.accentDark }]}>Hoy</Text>
                  </Pressable>
                ) : null}
              </View>

              <Calendar
                current={selectedDate}
                onMonthChange={(month: DateData) => {
                  const nextMonth = month.dateString.slice(0, 7);
                  setVisibleMonth(nextMonth);
                  setSelectedDate((current) =>
                    current.slice(0, 7) === nextMonth ? current : month.dateString,
                  );
                }}
                onDayPress={(day: DateData) => selectCalendarDay(day.dateString)}
                dayComponent={({ date, state }) => {
                  if (!date?.dateString) return null;
                  const dateKey = date.dateString;
                  return (
                    <CalendarActivityRing
                      dateLabel={formatDateKey(dateKey)}
                      dayNumber={date.day}
                      kinds={servicesByDate[dateKey] ?? []}
                      announcementColor={announcementColorsByDate[dateKey] ?? null}
                      selected={selectedDate === dateKey}
                      today={todayKey() === dateKey}
                      outsideMonth={state === 'disabled'}
                      dataIncomplete={calendarDataIncomplete}
                      onPress={() => selectCalendarDay(dateKey)}
                    />
                  );
                }}
                firstDay={1}
                enableSwipeMonths
                theme={{
                  calendarBackground: ucapsaBrand.colors.surface,
                  textSectionTitleColor: ucapsaBrand.colors.muted,
                  todayTextColor: ucapsaBrand.colors.redDark,
                  monthTextColor: ucapsaBrand.colors.text,
                  arrowColor: ucapsaBrand.colors.red,
                  textMonthFontWeight: '900',
                  textDayHeaderFontWeight: '800',
                }}
              />
              <View style={styles.ringLegend}>
                {([
                  { label: 'Sin actividad', color: ucapsaBrand.colors.adminBorder },
                  { label: 'Puppy', color: ucapsaBrand.colors.gold },
                  { label: 'Comandos', color: ucapsaBrand.colors.blue },
                  { label: 'Otras actividades', color: ucapsaBrand.colors.red },
                  { label: 'Avisos', color: ucapsaColorKeyPalette[announcementColorsByDate[selectedDate] ?? 'gray'].accent },
                ]).map((item) => (
                  <View key={item.label} style={styles.ringLegendItem}>
                    <View style={[styles.ringLegendCircle, { borderColor: item.color }]} />
                    <Text style={[styles.ringLegendText, { color: format.muted }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
              {calendarDataIncomplete ? (
                <View style={styles.calendarDataWarning}>
                  <MaterialIcons name="cloud-off" size={16} color={ucapsaBrand.colors.warning} />
                  <Text style={[styles.calendarDataWarningText, { color: ucapsaBrand.colors.warning }]}>
                    Disponibilidad sin verificar: pueden faltar clases, eventos, cancelaciones o noticias. Los anillos punteados no significan día libre.
                  </Text>
                </View>
              ) : null}

              <View onLayout={(e) => { agendaYRef.current = e.nativeEvent.layout.y; }} style={[styles.daySchedule, { borderTopColor: format.cardBorder }]}>
                  {dayAgendaItems.length === 0 ? (
                    <View style={styles.dayEmpty}>
                      <MaterialIcons name="event-available" size={24} color={format.muted} />
                      <Text style={[styles.dayEmptyTitle, { color: format.cardText }]}>
                        {calendarDataIncomplete ? 'Agenda sin confirmar' : 'Día libre'}
                      </Text>
                      <Text style={[styles.dayEmptyText, { color: format.muted }]}>
                        {calendarDataIncomplete
                          ? 'No pudimos comprobar todas las clases, noticias y actividades de este día. Reintenta la sincronización.'
                          : 'No hay actividad registrada para este día.'}
                      </Text>
                    </View>
                  ) : dayAgendaItems.map((item) => {
                    const configuredTone = getColorTone(item.colorKey);
                    const accent = item.cancelled
                      ? ucapsaBrand.colors.red
                      : item.kind === 'practice'
                        ? ucapsaBrand.colors.green
                        : configuredTone.accent;
                    const icon = item.kind === 'class'
                      ? 'school'
                      : item.kind === 'event'
                        ? 'event'
                        : item.kind === 'announcement'
                          ? 'campaign'
                          : 'local-fire-department';
                    const pressable = item.kind === 'announcement' || (isAdmin && (item.kind === 'class' || item.kind === 'event')) || (!isAdmin && Boolean(user) && item.kind === 'class');

                    const onItemPress = () => {
                      if (item.kind === 'announcement') {
                        const announcement = item.source as Announcement;
                        router.push(isAdmin ? `/admin/announcements?announcementId=${announcement.id}` as never : '/announcements' as never);
                      } else if (item.kind === 'event' && isAdmin) {
                        const occurrence = item.source as EventOccurrence;
                        router.push(`/admin/events?eventId=${occurrence.event.id}` as never);
                      } else if (item.kind === 'class' && isAdmin) {
                        router.push(`/admin/class-cancellations?date=${selectedDate}` as never);
                      } else if (item.kind === 'class' && user) {
                        toggleClientClass(item.source as ClassOccurrence);
                      }
                    };

                    const occurrence = item.kind === 'class' ? item.source as ClassOccurrence : null;
                    const introClass = occurrence && isSaturdayIntroClass({
                      programCode: occurrence.program?.code,
                      dayOfWeek: occurrence.schedule.day_of_week,
                      time: occurrence.schedule.start_time,
                      sequenceOrder: occurrence.schedule.sequence_order,
                    });
                    const enrolled = occurrence ? clientEnrollments.find(row =>
                      row.enrollment.dog_id === selectedClientDogId
                      && row.enrollment.schedule_id === occurrence.schedule.id
                      && row.enrollment.status === 'active'
                      && (row.enrollment.access_mode === 'membership' || (
                        Boolean(row.enrollment.card_started_on) && Boolean(row.enrollment.card_expires_on)
                        && occurrence.dateKey >= String(row.enrollment.card_started_on)
                        && occurrence.dateKey <= String(row.enrollment.card_expires_on)
                      ))
                    ) : null;
                    const plan = occurrence ? introPlans.find(row => row.dog_id === selectedClientDogId
                      && row.schedule_id === occurrence.schedule.id && row.class_date === occurrence.dateKey) : null;
                    const available = clientClassReady && !classActionBusy && occurrence !== null
                      && occurrence.dateKey >= todayKey() && !item.cancelled;
                    const expanded = Boolean(occurrence && openClientClassId === occurrence.id && user && !isAdmin);
                    return (
                      <View key={item.id}>
                      <Pressable
                        accessibilityState={item.kind === 'class' && !isAdmin ? { expanded } : undefined}
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
                      {expanded && occurrence ? (
                        <View style={styles.clientClassActions}>
                          <Text style={styles.clientClassTitle}>Agenda de esta clase</Text>
                          <Text style={styles.clientClassHint}>Agendar y confirmar no registra asistencia real.</Text>
                          {clientClassError ? <Text style={styles.clientClassWarning}>{clientClassError}</Text> : null}
                          {!clientClassReady && !clientClassError ? <Text style={styles.clientClassHint}>Comprobando inscripciones…</Text> : null}
                          {clientClassReady && clientDogs.length === 0 ? (
                            <Pressable accessibilityRole="button" style={styles.clientActionButton}
                              onPress={() => router.push('/dog' as never)}>
                              <Text style={styles.clientActionText}>Primero agrega tu perro</Text>
                            </Pressable>
                          ) : null}
                          {clientClassReady && clientDogs.length > 0 ? (
                            <>
                              <Text style={styles.clientClassHint}>¿Con qué perro?</Text>
                              <View style={styles.clientDogChoices}>
                                {clientDogs.map(dog => (
                                  <Pressable key={dog.id} accessibilityRole="button"
                                    accessibilityState={{ selected: dog.id === selectedClientDogId }}
                                    style={[styles.clientDogChip, dog.id === selectedClientDogId && styles.clientDogChipSelected]}
                                    onPress={() => { setSelectedClientDogId(dog.id); }}>
                                    <Text style={styles.clientDogText}>{dog.name}</Text>
                                  </Pressable>
                                ))}
                              </View>
                              {enrolled ? (
                                <>
                                  <Text style={styles.clientClassHint}>Esta clase ya está en tu programa. El recordatorio oficial llega un día antes si activaste notificaciones.</Text>
                                  <Text style={styles.clientClassHint}>Respuesta: {classResponses[`${enrolled.enrollment.id}:${occurrence.dateKey}`] === 'yes'
                                    ? 'Sí asistiré' : classResponses[`${enrolled.enrollment.id}:${occurrence.dateKey}`] === 'no'
                                      ? 'No asistiré' : 'Sin respuesta'}</Text>
                                  <View style={styles.clientChoiceRow}>
                                    <Pressable accessibilityRole="button" disabled={!available} style={[styles.clientActionButton, !available && styles.clientDisabled]}
                                      onPress={() => void confirmEnrolledClass(enrolled.enrollment.id, occurrence.dateKey, 'yes')}>
                                      <Text style={styles.clientActionText}>Sí asistiré</Text>
                                    </Pressable>
                                    <Pressable accessibilityRole="button" disabled={!available} style={[styles.clientActionButton, !available && styles.clientDisabled]}
                                      onPress={() => void confirmEnrolledClass(enrolled.enrollment.id, occurrence.dateKey, 'no')}>
                                      <Text style={styles.clientActionText}>No asistiré</Text>
                                    </Pressable>
                                  </View>
                                </>
                              ) : introClass ? (
                                <>
                                  <Text style={styles.clientClassHint}>Puppy inicial · sábado 10:00. Disponible sin inscripción; no otorga pase ni asistencia.</Text>
                                  <Text style={styles.clientClassHint}>Estado: {plan?.status === 'planned' ? 'Agendada, sin confirmar'
                                    : plan?.status === 'yes' ? 'Sí asistiré' : plan?.status === 'no' ? 'No asistiré' : 'No agendada'}</Text>
                                  <Pressable accessibilityRole="button" disabled={!available} style={[styles.clientActionButton, !available && styles.clientDisabled]}
                                    onPress={() => void saveIntroClassChoice(occurrence.dateKey, plan && plan.status !== 'cancelled' ? 'cancelled' : 'planned')}>
                                    <Text style={styles.clientActionText}>{plan && plan.status !== 'cancelled' ? 'Quitar de mi agenda' : 'Agendar visita'}</Text>
                                  </Pressable>
                                  {plan && plan.status !== 'cancelled' ? (
                                    <View style={styles.clientChoiceRow}>
                                      <Pressable accessibilityRole="button" disabled={!available} style={[styles.clientActionButton, !available && styles.clientDisabled]}
                                        onPress={() => void saveIntroClassChoice(occurrence.dateKey, 'yes')}>
                                        <Text style={styles.clientActionText}>Sí asistiré</Text>
                                      </Pressable>
                                      <Pressable accessibilityRole="button" disabled={!available} style={[styles.clientActionButton, !available && styles.clientDisabled]}
                                        onPress={() => void saveIntroClassChoice(occurrence.dateKey, 'no')}>
                                        <Text style={styles.clientActionText}>No asistiré</Text>
                                      </Pressable>
                                    </View>
                                  ) : null}
                                </>
                              ) : (
                                <View style={[styles.clientActionButton, styles.clientDisabled]}>
                                  <Text style={styles.clientActionText}>Sin inscripción: no disponible para agendar</Text>
                                </View>
                              )}
                            </>
                          ) : null}
                          {item.cancelled ? <Text style={styles.clientClassWarning}>Clase cancelada.</Text> : null}
                        </View>
                      ) : null}
                      </View>
                    );
                  })}
                </View>
            </View>

            {isAdmin && selectedClasses.length > 0 ? (
              <View style={[styles.adminClassesCard, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
                <View style={styles.adminClassesHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.adminClassesKicker, { color: format.accentDark }]}>CLASES DEL DÍA</Text>
                    <Text style={[styles.adminClassesTitle, { color: format.cardText }]}>{selectedClasses.length} clase{selectedClasses.length === 1 ? '' : 's'} · {formatDateKey(selectedDate)}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.manageDateButton, { borderColor: format.cardBorder }]}
                    onPress={() => router.push(`/admin/class-cancellations?date=${selectedDate}` as never)}
                  >
                    <MaterialIcons name="event-note" size={16} color={ucapsaBrand.colors.redDark} />
                    <Text style={styles.manageDateText}>Administrar fecha</Text>
                  </Pressable>
                </View>

                {selectedClasses.map((occurrence) => {
                  const theme = getClassTheme(occurrence.program);
                  const isCancelled = Boolean(occurrence.cancellation);
                  const title = formatProgramScheduleName(occurrence.schedule, occurrence.program);
                  const detail = formatProgramScheduleDetailLabel(occurrence.schedule);
                  const rosterRows = getAdminClassRosterRows(adminProgramRows, occurrence.schedule.id, occurrence.dateKey);
                  const commandCounts = getAdminCommandLevelCounts(rosterRows);
                  const rosterState = openRoster?.occurrenceId === occurrence.id ? openRoster : null;
                  const visibleRoster = rosterState ? filterAdminClassRoster(rosterRows, rosterState.level) : [];

                  return (
                    <View key={`admin-class-${occurrence.id}`} style={styles.adminClassItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: Boolean(rosterState) }}
                        style={[
                          styles.classChildCard,
                          { backgroundColor: isCancelled ? ucapsaBrand.colors.graySoft : theme.background, borderColor: isCancelled ? ucapsaBrand.colors.redBorder : theme.border },
                        ]}
                        onPress={() => setOpenRoster((current) =>
                          current?.occurrenceId === occurrence.id
                            ? null
                            : { occurrenceId: occurrence.id, level: 'all' },
                        )}
                      >
                        <View style={[styles.classIconSmall, { backgroundColor: isCancelled ? ucapsaBrand.colors.premiumMuted : theme.iconBackground }]}>
                          <MaterialIcons name={isCancelled ? 'event-busy' : 'school'} size={18} color={isCancelled ? ucapsaBrand.colors.red : theme.accent} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.classTitle, { color: isCancelled ? ucapsaBrand.colors.mutedNeutral : theme.title, textDecorationLine: isCancelled ? 'line-through' : 'none' }]}>{title}</Text>
                          <Text style={[styles.classText, { color: isCancelled ? ucapsaBrand.colors.mutedNeutral : theme.text }]}>{detail}</Text>
                          {isCancelled ? <Text style={styles.cancelledText}>Clase cancelada{occurrence.cancellation?.reason ? ` · ${occurrence.cancellation.reason}` : ''}</Text> : null}
                          <Text style={styles.rosterCount}>{rosterRows.length} inscrito{rosterRows.length === 1 ? '' : 's'} para esta clase</Text>
                          <Text style={[styles.classHint, { color: isCancelled ? ucapsaBrand.colors.red : theme.accent }]}>{rosterState ? 'Ocultar inscritos' : 'Ver inscritos'}</Text>
                        </View>
                        <MaterialIcons name={rosterState ? 'expand-less' : 'expand-more'} size={22} color={isCancelled ? ucapsaBrand.colors.red : theme.accent} />
                      </Pressable>

                      {occurrence.program?.code === 'comandos' ? (
                        <View style={styles.levelSummary}>
                          {(['all', 'basic', 'intermediate', 'advanced'] as AdminRosterLevel[]).map((level) => {
                            const count = commandCounts[level];
                            const active = rosterState?.level === level;
                            return (
                              <Pressable
                                key={level}
                                style={[styles.levelChip, active && styles.levelChipActive]}
                                onPress={() => setOpenRoster({ occurrenceId: occurrence.id, level })}
                              >
                                <Text style={[styles.levelChipText, active && styles.levelChipTextActive]}>
                                  {adminRosterLevelLabel(level)} {count}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}

                      {rosterState ? (
                        <View style={styles.rosterPanel}>
                          <Text style={styles.rosterHeading}>
                            {occurrence.program?.code === 'comandos'
                              ? `${adminRosterLevelLabel(rosterState.level)} · ${visibleRoster.length}`
                              : `Inscritos · ${visibleRoster.length}`}
                          </Text>
                          {visibleRoster.length === 0 ? (
                            <Text style={styles.rosterEmpty}>No hay perros en este grupo para la fecha seleccionada.</Text>
                          ) : visibleRoster.map((row) => (
                            <Pressable
                              key={row.enrollmentId}
                              style={styles.rosterRow}
                              onPress={() => router.push(`/admin/customer?userId=${encodeURIComponent(row.userId)}` as never)}
                            >
                              <View style={styles.rosterAvatar}>
                                <MaterialIcons name="pets" size={17} color={ucapsaBrand.colors.redDark} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.rosterName}>{row.clientName}</Text>
                                <Text style={styles.rosterDog}>{row.dogName}</Text>
                                <Text style={styles.rosterMeta}>
                                  Última asistencia: {row.lastAttendanceDate ? formatDateKey(row.lastAttendanceDate) : 'sin asistencia'}
                                  {` · ${row.attendanceCount} registrada${row.attendanceCount === 1 ? '' : 's'}`}
                                </Text>
                                {row.phone || row.email ? <Text style={styles.rosterContact} numberOfLines={1}>{row.phone || row.email}</Text> : null}
                              </View>
                              <MaterialIcons name="chevron-right" size={20} color={ucapsaBrand.colors.redDark} />
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
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
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2, paddingVertical: 4 },
  pageEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1 },
  pageTitle: { marginTop: 1, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  pageSubtitle: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  noticeShortcut: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11 },
  noticeShortcutText: { fontSize: 11, lineHeight: 14, fontWeight: '900' },
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
  adminClassesCard: { gap: 10, borderWidth: 1, borderRadius: 20, padding: 13 },
  adminClassesHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  adminClassesKicker: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
  adminClassesTitle: { marginTop: 2, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  adminClassItem: { gap: 7 },
    agendaTopBar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  agendaDateEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  ringLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 8 },
  ringLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ringLegendCircle: { width: 15, height: 15, borderRadius: 999, borderWidth: 3 },
  ringLegendText: { fontSize: 10, fontWeight: '800' },
  calendarHint: { fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingBottom: 12 },
  calendarDataWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 14, marginBottom: 12, padding: 9, backgroundColor: ucapsaBrand.colors.warningSoft, borderRadius: 12 },
  calendarDataWarningText: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  agendaDateTitle: { marginTop: 2, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  compactAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10 },
  compactActionText: { fontSize: 11, fontWeight: '900' },
  weekNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 5 },
  weekNavArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  weekNavLabel: { flex: 1, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  weekDayCompact: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 16, paddingVertical: 7 },
  activityDot: { width: 5, height: 5, borderRadius: 999, marginTop: 2 },
  clientClassActions: { marginLeft: 38, marginBottom: 14, marginRight: 4, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 14, padding: 12, gap: 8 },
  clientClassTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  clientClassHint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  clientClassWarning: { color: ucapsaBrand.colors.danger, fontSize: 12, fontWeight: '800' },
  clientDogChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clientDogChip: { minHeight: 44, borderRadius: 11, backgroundColor: ucapsaBrand.colors.graySoft, paddingHorizontal: 12, justifyContent: 'center' },
  clientDogChipSelected: { borderWidth: 1, borderColor: ucapsaBrand.colors.redDark, backgroundColor: ucapsaBrand.colors.redSoft },
  clientDogText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800' },
  clientChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clientActionButton: { flexGrow: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  clientActionText: { color: ucapsaBrand.colors.redDark, fontSize: 12, textAlign: 'center', fontWeight: '900' },
  clientDisabled: { opacity: 0.4, backgroundColor: ucapsaBrand.colors.graySoft },
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
