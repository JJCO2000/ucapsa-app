import { ucapsaBrand, withAlpha } from '../../constants/brand';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { EventCard } from '../../components/domain/EventCard';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import { clientReadKeys, readClientResource, writeClientResource, type CalendarClassesOfflineSnapshot } from '../../services/client-read-cache.service';
import { formatProgramScheduleDetailLabel, formatProgramScheduleName, getProgramClassCancellations, getProgramScheduleTimeline, getPrograms, isProgramScheduleActiveOnDate } from '../../services/programs.service';
import { getCachedMyPracticeActivity, getMyPracticeActivity, type PracticeActivityEntry } from '../../services/practice.service';
import type { Announcement, EventOccurrence, ProgramClassCancellation, ProgramSchedule, UcapsaEvent, UcapsaProgram } from '../../types/app.types';
import { expandEventOccurrences, formatDateKey, getUpcomingOccurrences, toDateKey, todayKey } from '../../utils/events.utils';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type ClassOccurrence = {
  id: string;
  schedule: ProgramSchedule;
  program: UcapsaProgram | null;
  dateKey: string;
  cancellation?: ProgramClassCancellation | null;
};

type CalendarDot = {
  key: string;
  color: string;
};

const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

function announcementDateKey(announcement: Announcement): string | null {
  if (announcement.event?.start_date) return toDateKey(announcement.event.start_date);
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

function getWeekDates(dateKey: string) {
  const selected = parseLocalDate(dateKey);
  const selectedWeekday = selected.getDay();
  const daysFromMonday = selectedWeekday === 0 ? 6 : selectedWeekday - 1;
  const monday = addDays(selected, -daysFromMonday);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    return {
      dateKey: toLocalDateKey(date),
      label: WEEKDAY_SHORT[index],
      day: date.getDate(),
      sameMonth: date.getMonth() === selected.getMonth(),
    };
  });
}

function formatMonthYear(dateKey: string) {
  const date = parseLocalDate(dateKey);
  const rawMonth = date.toLocaleDateString('es-MX', { month: 'long' });
  const month = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  return `${month} ${date.getFullYear()}`;
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
  const { user, role, isAdmin } = useSession();
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [programs, setPrograms] = useState<UcapsaProgram[]>([]);
  const [programSchedules, setProgramSchedules] = useState<ProgramSchedule[]>([]);
  const [classCancellations, setClassCancellations] = useState<ProgramClassCancellation[]>([]);
  const [practiceActivity, setPracticeActivity] = useState<PracticeActivityEntry[]>([]);
  const [practiceLoadWarning, setPracticeLoadWarning] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [calendarCollapsed, setCalendarCollapsed] = useState(false);
  const [classesExpanded, setClassesExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classLoadWarning, setClassLoadWarning] = useState<string | null>(null);
  const [partialLoadWarning, setPartialLoadWarning] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const agendaY = useRef(0);
  const agendaAnim = useRef(new Animated.Value(1)).current;
  const selectedDayScale = useRef(new Animated.Value(1)).current;
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [user, role, isAdmin]);
  const isPremium = format.key === 'member';

  const cacheScope = user?.id ?? 'public';

  const loadCalendarData = useCallback(async () => {
    setError(null);
    setClassLoadWarning(null);
    setPartialLoadWarning(null);
    setPracticeLoadWarning(null);
    setUsingSavedData(false);

    const [eventCache, announcementCache, classCache, localPracticeActivity] = await Promise.all([
      readClientResource<UcapsaEvent[]>(cacheScope, clientReadKeys.calendarEvents),
      readClientResource<Announcement[]>(cacheScope, clientReadKeys.announcements),
      readClientResource<CalendarClassesOfflineSnapshot>(cacheScope, clientReadKeys.calendarClasses),
      user && !isAdmin ? getCachedMyPracticeActivity(user.id) : Promise.resolve(null),
    ]);

    if (eventCache) setEvents(eventCache.data);
    if (announcementCache) setAnnouncements(announcementCache.data);
    if (classCache) {
      setPrograms(classCache.data.programs);
      setProgramSchedules(classCache.data.schedules);
      setClassCancellations(classCache.data.cancellations);
    }
    if (localPracticeActivity) setPracticeActivity(localPracticeActivity.entries);
    if (eventCache || announcementCache || classCache || localPracticeActivity) {
      setSavedAt(eventCache?.saved_at ?? announcementCache?.saved_at ?? classCache?.saved_at ?? localPracticeActivity?.savedAt ?? null);
      setLoading(false);
    }

    const [eventResult, announcementResult, classResult, practiceResult] = await Promise.allSettled([
      withOperationTimeout(getVisibleEvents(), DEFAULT_READ_TIMEOUT_MS, 'calendar-events'),
      withOperationTimeout(getVisibleAnnouncements(), DEFAULT_READ_TIMEOUT_MS, 'calendar-announcements'),
      withOperationTimeout(
        Promise.all([getPrograms(), getProgramScheduleTimeline(), getProgramClassCancellations()]),
        DEFAULT_READ_TIMEOUT_MS,
        'calendar-classes',
      ),
      user && !isAdmin
        ? withOperationTimeout(getMyPracticeActivity(user.id), DEFAULT_READ_TIMEOUT_MS, 'calendar-practice')
        : Promise.resolve(null),
    ]);

    if (eventResult.status === 'fulfilled') {
      setEvents(eventResult.value);
      const stored = await writeClientResource(cacheScope, clientReadKeys.calendarEvents, eventResult.value);
      setSavedAt(stored.saved_at);
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
      if (eventFailed || announcementFailed) setPartialLoadWarning('Algunos eventos o anuncios no se pudieron actualizar.');

      const staleSource =
        eventFailed && eventCache
          ? eventCache
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
  }, [selectedDate]);

  const occurrences = useMemo(() => expandEventOccurrences(events), [events]);
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

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    for (const occurrence of occurrences) {
      const key = toDateKey(occurrence.start_date);
      if (!key) continue;
      const existingDots = marks[key]?.dots ?? [];
      const hasEventDot = existingDots.some((dot: { key: string }) => dot.key === 'events');
      marks[key] = { ...marks[key], dots: hasEventDot ? existingDots : [...existingDots, { key: 'events', color: ucapsaBrand.colors.redDark }] };
    }

    for (const occurrence of classOccurrences) {
      const existingDots = marks[occurrence.dateKey]?.dots ?? [];
      const hasClassDot = existingDots.some((dot: { key: string }) => dot.key === 'classes');
      marks[occurrence.dateKey] = { ...marks[occurrence.dateKey], dots: hasClassDot ? existingDots : [...existingDots, { key: 'classes', color: occurrence.cancellation ? ucapsaBrand.colors.red : ucapsaBrand.colors.red }] };
    }

    for (const announcement of announcements) {
      const key = announcementDateKey(announcement);
      if (!key) continue;
      const existingDots = marks[key]?.dots ?? [];
      const hasAnnouncementDot = existingDots.some((dot: { key: string }) => dot.key === 'announcements');
      marks[key] = { ...marks[key], dots: hasAnnouncementDot ? existingDots : [...existingDots, { key: 'announcements', color: ucapsaBrand.colors.gold }] };
    }

    for (const practice of practiceActivity) {
      const key = toLocalDateKey(new Date(practice.completedAt));
      if (!key) continue;
      const existingDots = marks[key]?.dots ?? [];
      const hasPracticeDot = existingDots.some((dot: { key: string }) => dot.key === 'practice');
      marks[key] = {
        ...marks[key],
        selected: true,
        selectedColor: format.accentSoft,
        selectedTextColor: format.accentDark,
        dots: hasPracticeDot ? existingDots : [...existingDots, { key: 'practice', color: ucapsaBrand.colors.redDark }],
      };
    }

    marks[selectedDate] = { ...(marks[selectedDate] ?? {}), selected: true, selectedColor: ucapsaBrand.colors.red, selectedTextColor: ucapsaBrand.colors.surface };
    return marks;
  }, [announcements, classOccurrences, format.accentDark, format.accentSoft, occurrences, practiceActivity, selectedDate]);

  const selectedWeek = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const upcomingEvents: EventOccurrence[] = useMemo(() => getUpcomingOccurrences(events, 3), [events]);
  const allSelectedClassesCancelled = selectedClasses.length > 0 && selectedClasses.every((occurrence) => Boolean(occurrence.cancellation));
  const cancelledClassesCount = selectedClasses.filter((occurrence) => Boolean(occurrence.cancellation)).length;
  const activeClassesCount = selectedClasses.length - cancelledClassesCount;
  const dayCount = selectedEvents.length + (selectedClasses.length > 0 ? 1 : 0) + selectedAnnouncements.length + selectedPractices.length;

  const runDayFocusAnimation = useCallback(() => {
    agendaAnim.setValue(0);
    selectedDayScale.setValue(0.92);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(selectedDayScale, {
          toValue: 1.08,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(selectedDayScale, {
          toValue: 1,
          duration: 110,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(agendaAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [agendaAnim, selectedDayScale]);

  const selectDate = useCallback((dateString: string, collapseCalendar = true) => {
    setSelectedDate(dateString);
    if (collapseCalendar) setCalendarCollapsed(true);
    runDayFocusAnimation();

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, agendaY.current - 12),
          animated: true,
        });
      }, 180);
    });
  }, [runDayFocusAnimation]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: format.background }]} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={[styles.container, { backgroundColor: format.background }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={[styles.hero, { backgroundColor: format.heroBackground }]}>
          <View style={[styles.heroIcon, { backgroundColor: format.pillBackground }]}>
            <MaterialIcons name="event" size={28} color={format.pillText} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.kicker, { color: format.heroMuted }]}>Calendario UCAPSA</Text>
            <Text style={[styles.title, { color: format.heroText }]}>Eventos, clases y comunicados</Text>
            <Text style={[styles.subtitle, { color: format.heroMuted }]}>Selecciona un dia para ver la agenda oficial.</Text>
          </View>
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

        {practiceLoadWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Actividad sin actualizar</Text>
            <Text style={styles.warningText}>{practiceLoadWarning}</Text>
          </View>
        ) : null}

        {!error ? (
          <>
            <View style={styles.calendarCard}>
              {calendarCollapsed ? (
                <>
                  <Pressable
                    style={styles.calendarCollapsedHeader}
                    onPress={() => setCalendarCollapsed(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Ver calendario mensual"
                  >
                    <Text style={styles.calendarCollapsedTitle}>{formatMonthYear(selectedDate)}</Text>
                    <View style={styles.calendarExpandAction}>
                      <Text style={styles.calendarExpandText}>Ver mes</Text>
                      <MaterialIcons name="expand-more" size={22} color={ucapsaBrand.colors.red} />
                    </View>
                  </Pressable>

                  <View style={styles.weekRow}>
                    {selectedWeek.map((item) => {
                      const isSelected = item.dateKey === selectedDate;
                      const dots = (markedDates[item.dateKey]?.dots ?? []) as CalendarDot[];

                      return (
                        <Pressable
                          key={item.dateKey}
                          style={styles.weekDayButton}
                          onPress={() => selectDate(item.dateKey)}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.label}, ${formatDateKey(item.dateKey)}`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text style={[styles.weekDayLabel, isSelected && styles.weekDayLabelSelected]}>{item.label}</Text>
                          <Animated.View
                            style={[
                              styles.weekDayCircle,
                              isSelected && styles.weekDayCircleSelected,
                              isSelected ? { transform: [{ scale: selectedDayScale }] } : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.weekDayNumber,
                                !item.sameMonth && !isSelected && styles.weekDayNumberOutside,
                                isSelected && styles.weekDayNumberSelected,
                              ]}
                            >
                              {item.day}
                            </Text>
                          </Animated.View>
                          <View style={styles.weekDots}>
                            {dots.slice(0, 4).map((dot) => (
                              <View key={dot.key} style={[styles.weekDot, { backgroundColor: dot.color }]} />
                            ))}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : (
                <Calendar
                  current={selectedDate}
                  onDayPress={(day: DateData) => selectDate(day.dateString)}
                  markingType="multi-dot"
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
              )}
              <View style={styles.legendRow}>
                {user && !isAdmin ? <Legend label="Práctica" style={styles.practiceDot} /> : null}
                <Legend label="Eventos" style={styles.eventDot} />
                <Legend label="Clases" style={styles.classDot} />
                <Legend label="Anuncios" style={styles.announcementDot} />
              </View>
            </View>

            <Animated.View
              style={[
                styles.agendaBlock,
                {
                  opacity: agendaAnim,
                  transform: [
                    {
                      translateY: agendaAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
              onLayout={(event) => {
                agendaY.current = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionTitle, { color: isPremium ? ucapsaBrand.colors.surface : ucapsaBrand.colors.cameraDark }]}>Agenda del dia</Text>
                  <Text style={[styles.sectionSubtitle, { color: isPremium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.mutedNeutral }]}>{formatDateKey(selectedDate)}</Text>
                </View>
                <Text style={styles.sectionCount}>{dayCount} actividad{dayCount === 1 ? '' : 'es'}</Text>
              </View>

              {dayCount === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: isPremium ? withAlpha(ucapsaBrand.colors.surface, 0.08) : ucapsaBrand.colors.surface, borderColor: isPremium ? withAlpha(ucapsaBrand.colors.gold, 0.24) : ucapsaBrand.colors.borderNeutral }]}>
                  <Text style={[styles.emptyTitle, { color: isPremium ? ucapsaBrand.colors.surface : ucapsaBrand.colors.cameraDark }]}>Sin actividad este dia</Text>
                  <Text style={[styles.muted, { color: isPremium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.mutedNeutral }]}>Selecciona otro dia marcado en el calendario.</Text>
                </View>
              ) : null}

              {selectedPractices.length > 0 && user && !isAdmin ? (
                <View style={[styles.practiceDayCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
                  <View style={styles.practiceDayHeader}>
                    <View style={[styles.practiceDayIcon, { backgroundColor: format.accentSoft }]}>
                      <MaterialIcons name="local-fire-department" size={21} color={format.accentDark} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.practiceDayKicker, { color: format.accentDark }]}>Tu entrenamiento</Text>
                      <Text style={[styles.practiceDayTitle, { color: format.cardText }]}>{selectedPractices.length} práctica{selectedPractices.length === 1 ? '' : 's'} completada{selectedPractices.length === 1 ? '' : 's'}</Text>
                    </View>
                  </View>
                  <View style={styles.practiceDayList}>
                    {selectedPractices.map((practice) => (
                      <View key={practice.id} style={[styles.practiceDayRow, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.practiceDayDog, { color: format.cardText }]}>Práctica con {practice.dogName || 'tu perro'}</Text>
                          <Text style={[styles.practiceDayMeta, { color: format.muted }]}>{practiceDifficultyLabel(practice.difficulty)}{practiceTimeLabel(practice.completedAt) ? ` · ${practiceTimeLabel(practice.completedAt)}` : ''}</Text>
                          {practice.note ? <Text style={[styles.practiceDayNote, { color: format.muted }]} numberOfLines={2}>{practice.note}</Text> : null}
                        </View>
                        {practice.syncStatus === 'pending' ? <Text style={[styles.practicePending, { color: format.accentDark, backgroundColor: format.accentSoft }]}>Pendiente</Text> : <MaterialIcons name="check-circle" size={20} color={format.accentDark} />}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {selectedClasses.length > 0 ? (
                <View style={[styles.classGroupCard, allSelectedClassesCancelled && styles.classGroupCardCancelled]}>
                  <Pressable style={styles.classGroupHeader} onPress={() => setClassesExpanded((value) => !value)}>
                    <View style={[styles.classGroupIcon, allSelectedClassesCancelled && styles.classGroupIconCancelled]}>
                      <MaterialIcons name={allSelectedClassesCancelled ? 'event-busy' : 'school'} size={22} color={allSelectedClassesCancelled ? ucapsaBrand.colors.red : ucapsaBrand.colors.red} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.classKicker, allSelectedClassesCancelled && styles.classKickerCancelled]}>Clases</Text>
                      <Text style={[styles.classGroupTitle, allSelectedClassesCancelled && styles.classGroupTitleCancelled]}>Clases</Text>
                      <Text style={[styles.classGroupText, allSelectedClassesCancelled && styles.classGroupTextCancelled]}>
                        {allSelectedClassesCancelled
                          ? `Dia cancelado - ${selectedClasses.length} clase${selectedClasses.length === 1 ? '' : 's'} cancelada${selectedClasses.length === 1 ? '' : 's'}.`
                          : `${activeClassesCount} activa${activeClassesCount === 1 ? '' : 's'}${cancelledClassesCount > 0 ? `, ${cancelledClassesCount} cancelada${cancelledClassesCount === 1 ? '' : 's'}` : ''}.`}
                      </Text>
                      {allSelectedClassesCancelled ? <Text style={styles.dayCancelledText}>Dia cancelado</Text> : null}
                    </View>
                    <View style={[styles.classGroupPill, allSelectedClassesCancelled && styles.classGroupPillCancelled]}>
                      <Text style={styles.classGroupPillText}>{selectedClasses.length}</Text>
                    </View>
                    <MaterialIcons name={classesExpanded ? 'expand-less' : 'expand-more'} size={24} color={allSelectedClassesCancelled ? ucapsaBrand.colors.red : ucapsaBrand.colors.red} />
                  </Pressable>

                  {classesExpanded ? (
                    <View style={styles.classList}>
                      {selectedClasses.map((occurrence) => {
                        const theme = getClassTheme(occurrence.program?.code);
                        const isCancelled = Boolean(occurrence.cancellation);
                        const title = formatProgramScheduleName(occurrence.schedule, occurrence.program);
                        const detail = formatProgramScheduleDetailLabel(occurrence.schedule);

                        return (
                          <Pressable
                            key={`class-${occurrence.id}`}
                            disabled={!isAdmin}
                            style={[
                              styles.classChildCard,
                              { backgroundColor: isCancelled ? ucapsaBrand.colors.graySoft : theme.background, borderColor: isCancelled ? ucapsaBrand.colors.redBorder : theme.border },
                            ]}
                            onPress={isAdmin ? () => router.push(`/admin/class-cancellations?date=${occurrence.dateKey}` as never) : undefined}
                          >
                            <View style={[styles.classIconSmall, { backgroundColor: isCancelled ? ucapsaBrand.colors.premiumMuted : theme.iconBackground }]}>
                              <MaterialIcons name={isCancelled ? 'event-busy' : 'event-note'} size={18} color={isCancelled ? ucapsaBrand.colors.red : theme.accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.classTitle, { color: isCancelled ? ucapsaBrand.colors.mutedNeutral : theme.title, textDecorationLine: isCancelled ? 'line-through' : 'none' }]}>{title}</Text>
                              <Text style={[styles.classText, { color: isCancelled ? ucapsaBrand.colors.mutedNeutral : theme.text }]}>{occurrence.program?.name ?? 'Clase'} - {detail}</Text>
                              {isCancelled ? <Text style={styles.cancelledText}>Clase cancelada{occurrence.cancellation?.reason ? ` - ${occurrence.cancellation.reason}` : ''}</Text> : null}
                              {isAdmin ? <Text style={[styles.classHint, { color: isCancelled ? ucapsaBrand.colors.red : theme.accent }]}>{isCancelled ? 'Tocar para ver cancelaciones' : 'Tocar para cancelar o administrar esta fecha'}</Text> : null}
                            </View>
                            {isAdmin ? <MaterialIcons name="chevron-right" size={22} color={isCancelled ? ucapsaBrand.colors.red : theme.accent} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {selectedEvents.map((occurrence) => (
                <EventCard
                  key={`event-${occurrence.id}`}
                  event={occurrence.event}
                  startDateOverride={occurrence.start_date}
                  occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
                  onPress={isAdmin ? () => router.push(`/admin/events?eventId=${occurrence.event.id}` as never) : undefined}
                />
              ))}

              {selectedAnnouncements.map((announcement) => (
                <AnnouncementCard
                  key={`announcement-${announcement.id}`}
                  announcement={announcement}
                  onPress={isAdmin ? () => router.push(`/admin/announcements?announcementId=${announcement.id}` as never) : undefined}
                  onOpenEvent={announcement.event?.start_date ? () => selectDate(toDateKey(announcement.event?.start_date) ?? selectedDate) : undefined}
                />
              ))}
            </Animated.View>

            {upcomingEvents.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: isPremium ? ucapsaBrand.colors.surface : ucapsaBrand.colors.cameraDark }]}>Proximos eventos</Text>
                    <Text style={[styles.sectionSubtitle, { color: isPremium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.mutedNeutral }]}>Maximo 3 visibles aqui</Text>
                  </View>
                </View>
                {upcomingEvents.map((occurrence) => (
                  <EventCard
                    key={`upcoming-${occurrence.id}`}
                    event={occurrence.event}
                    startDateOverride={occurrence.start_date}
                    occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
                    onPress={isAdmin ? () => router.push(`/admin/events?eventId=${occurrence.event.id}` as never) : () => selectDate(toDateKey(occurrence.start_date) ?? selectedDate)}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ label, style }: { label: string; style: object }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, style]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ucapsaBrand.colors.redPale },
  container: { flex: 1, backgroundColor: ucapsaBrand.colors.redPale },
  content: { gap: 16, padding: 20, paddingBottom: 110 },
  hero: { flexDirection: 'row', gap: 14, padding: 18, borderRadius: 24, backgroundColor: ucapsaBrand.colors.redDeep },
  heroIcon: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  heroText: { flex: 1, gap: 6 },
  kicker: { color: ucapsaBrand.colors.redSoftStrong, fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.surface, fontSize: 22, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.textLight, fontSize: 14, lineHeight: 20 },
  adminRow: { flexDirection: 'row', gap: 10 },
  adminButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 18, backgroundColor: ucapsaBrand.colors.red },
  adminButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  adminButtonAlt: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 18, backgroundColor: ucapsaBrand.colors.redSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder },
  adminButtonAltText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  calendarCard: { overflow: 'hidden', borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  calendarCollapsedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  calendarCollapsedTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  calendarExpandAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  calendarExpandText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  weekRow: { flexDirection: 'row', paddingHorizontal: 9, paddingTop: 4, paddingBottom: 10 },
  weekDayButton: { flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'flex-start', gap: 3 },
  weekDayLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '800' },
  weekDayLabelSelected: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  weekDayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weekDayCircleSelected: { backgroundColor: ucapsaBrand.colors.red },
  weekDayNumber: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '800' },
  weekDayNumberOutside: { color: ucapsaBrand.colors.borderNeutral },
  weekDayNumberSelected: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  weekDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 5 },
  weekDot: { width: 4, height: 4, borderRadius: 999 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.graySoft },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 12 },
  legendDot: { width: 9, height: 9, borderRadius: 999 },
  eventDot: { backgroundColor: ucapsaBrand.colors.red },
  classDot: { backgroundColor: ucapsaBrand.colors.red },
  announcementDot: { backgroundColor: ucapsaBrand.colors.gold },
  practiceDot: { backgroundColor: ucapsaBrand.colors.redDark },
  legendText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  agendaBlock: { gap: 16 },
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
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
  cancelledText: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', marginTop: 4 },
  dayCancelledText: { alignSelf: 'flex-start', overflow: 'hidden', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: ucapsaBrand.colors.premiumMuted, color: ucapsaBrand.colors.danger, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
});
