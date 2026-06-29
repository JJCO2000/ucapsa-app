import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { EventCard } from '../../components/domain/EventCard';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import type { Announcement, EventOccurrence, UcapsaEvent } from '../../types/app.types';
import { expandEventOccurrences, formatDateKey, getUpcomingOccurrences, toDateKey, todayKey } from '../../utils/events.utils';

function announcementDateKey(announcement: Announcement): string | null {
  if (announcement.event?.start_date) return toDateKey(announcement.event.start_date);
  return toDateKey(announcement.created_at);
}

export default function CalendarScreen() {
  const { isAdmin } = useSession();
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCalendarData() {
    setError(null);
    const [eventResult, announcementResult] = await Promise.all([
      getVisibleEvents(),
      getVisibleAnnouncements(),
    ]);

    setEvents(eventResult);
    setAnnouncements(announcementResult);
  }

  useEffect(() => {
    loadCalendarData()
      .catch((err) => setError(err.message ?? 'No se pudo cargar el calendario.'))
      .finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadCalendarData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el calendario.');
    } finally {
      setRefreshing(false);
    }
  }

  const occurrences = useMemo(() => expandEventOccurrences(events), [events]);

  const selectedEvents = useMemo(
    () => occurrences.filter((occurrence) => toDateKey(occurrence.start_date) === selectedDate),
    [occurrences, selectedDate],
  );

  const selectedAnnouncements = useMemo(
    () => announcements.filter((announcement) => announcementDateKey(announcement) === selectedDate),
    [announcements, selectedDate],
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    for (const occurrence of occurrences) {
      const key = toDateKey(occurrence.start_date);
      if (!key) continue;

      const existingDots = marks[key]?.dots ?? [];
      const hasEventDot = existingDots.some((dot: { key: string }) => dot.key === 'events');

      marks[key] = {
        ...marks[key],
        dots: hasEventDot ? existingDots : [...existingDots, { key: 'events', color: '#0f766e' }],
      };
    }

    for (const announcement of announcements) {
      const key = announcementDateKey(announcement);
      if (!key) continue;

      const existingDots = marks[key]?.dots ?? [];
      const hasAnnouncementDot = existingDots.some((dot: { key: string }) => dot.key === 'announcements');

      marks[key] = {
        ...marks[key],
        dots: hasAnnouncementDot
          ? existingDots
          : [...existingDots, { key: 'announcements', color: '#2563eb' }],
      };
    }

    marks[selectedDate] = {
      ...(marks[selectedDate] ?? {}),
      selected: true,
      selectedColor: '#0f766e',
      selectedTextColor: '#ffffff',
    };

    return marks;
  }, [announcements, occurrences, selectedDate]);

  const upcomingEvents: EventOccurrence[] = useMemo(() => getUpcomingOccurrences(events, 3), [events]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="event" size={28} color="#0f766e" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Calendario UCAPSA</Text>
            <Text style={styles.title}>Eventos y comunicados por fecha</Text>
            <Text style={styles.subtitle}>Selecciona un día para ver eventos y anuncios oficiales.</Text>
          </View>
        </View>

        {isAdmin ? (
          <Pressable style={styles.adminButton} onPress={() => router.push('/admin/events' as never)}>
            <MaterialIcons name="admin-panel-settings" size={20} color="#ffffff" />
            <Text style={styles.adminButtonText}>Administrar eventos</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
            <Text style={styles.muted}>Cargando calendario...</Text>
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

        {!loading && !error ? (
          <>
            <View style={styles.calendarCard}>
              <Calendar
                current={selectedDate}
                onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
                markingType="multi-dot"
                markedDates={markedDates}
                firstDay={1}
                enableSwipeMonths
                theme={{
                  calendarBackground: '#ffffff',
                  textSectionTitleColor: '#64748b',
                  selectedDayBackgroundColor: '#0f766e',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#0f766e',
                  dayTextColor: '#0f172a',
                  monthTextColor: '#0f172a',
                  arrowColor: '#0f766e',
                  textDayFontWeight: '700',
                  textMonthFontWeight: '900',
                  textDayHeaderFontWeight: '800',
                }}
              />
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.eventDot]} />
                  <Text style={styles.legendText}>Eventos</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.announcementDot]} />
                  <Text style={styles.legendText}>Anuncios</Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Agenda del día</Text>
                <Text style={styles.sectionSubtitle}>{formatDateKey(selectedDate)}</Text>
              </View>
              <Text style={styles.sectionCount}>{selectedEvents.length + selectedAnnouncements.length}</Text>
            </View>

            {selectedEvents.length === 0 && selectedAnnouncements.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Sin actividad este día</Text>
                <Text style={styles.muted}>Selecciona otro dia marcado en el calendario.</Text>
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
                onOpenEvent={
                  announcement.event?.start_date
                    ? () => setSelectedDate(toDateKey(announcement.event?.start_date) ?? selectedDate)
                    : undefined
                }
              />
            ))}

            {upcomingEvents.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Próximos eventos</Text>
                    <Text style={styles.sectionSubtitle}>Máximo 3 visibles aqui</Text>
                  </View>
                </View>
                {upcomingEvents.map((occurrence) => (
                  <EventCard
                    key={`upcoming-${occurrence.id}`}
                    event={occurrence.event}
                    startDateOverride={occurrence.start_date}
                    occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
                    onPress={isAdmin ? () => router.push(`/admin/events?eventId=${occurrence.event.id}` as never) : () => setSelectedDate(toDateKey(occurrence.start_date) ?? selectedDate)}
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, padding: 20, paddingBottom: 110 },
  hero: {
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#0f172a',
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ccfbf1',
  },
  heroText: { flex: 1, gap: 6 },
  kicker: { color: '#5eead4', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#0f766e',
  },
  adminButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  calendarCard: {
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 12 },
  legendDot: { width: 9, height: 9, borderRadius: 999 },
  eventDot: { backgroundColor: '#0f766e' },
  announcementDot: { backgroundColor: '#2563eb' },
  legendText: { color: '#64748b', fontSize: 12, fontWeight: '800' },
  centerBox: { gap: 10, alignItems: 'center', padding: 24 },
  muted: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  errorBox: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorTitle: { color: '#991b1b', fontSize: 16, fontWeight: '900' },
  errorText: { color: '#7f1d1d', fontSize: 14 },
  secondaryButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#ffffff' },
  secondaryButtonText: { color: '#0f766e', fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: '#64748b', fontSize: 12, fontWeight: '700', marginTop: 2 },
  sectionCount: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    color: '#0f766e',
    backgroundColor: '#ccfbf1',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyBox: {
    gap: 6,
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
});
