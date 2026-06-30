import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { EventCard } from '../../components/domain/EventCard';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import type { Announcement, EventOccurrence, UcapsaColorKey, UcapsaEvent } from '../../types/app.types';
import { expandEventOccurrences, formatDateKey, getUpcomingOccurrences, toDateKey, todayKey } from '../../utils/events.utils';

function getColorHex(color: UcapsaColorKey | null | undefined, fallback: string) {
  const map: Record<UcapsaColorKey, string> = {
    red: ucapsaBrand.colors.red,
    blue: ucapsaBrand.colors.blue,
    yellow: '#EAB308',
    green: ucapsaBrand.colors.success,
    purple: '#7C3AED',
    gray: '#64748b',
  };

  return map[color ?? 'gray'] ?? fallback;
}

function announcementDateKey(announcement: Announcement): string | null {
  if (announcement.announcement_date) return toDateKey(announcement.announcement_date);
  if (announcement.event?.start_date) return toDateKey(announcement.event.start_date);
  return toDateKey(announcement.created_at);
}

export default function CalendarScreen() {
  const { isAdmin } = useSession();
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedEvent, setSelectedEvent] = useState<EventOccurrence | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showUpcomingEvents, setShowUpcomingEvents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCalendarData() {
    setError(null);
    const [eventResult, announcementResult] = await Promise.all([getVisibleEvents(), getVisibleAnnouncements()]);
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
  const selectedEvents = useMemo(() => occurrences.filter((occurrence) => toDateKey(occurrence.start_date) === selectedDate), [occurrences, selectedDate]);
  const selectedAnnouncements = useMemo(() => announcements.filter((announcement) => announcementDateKey(announcement) === selectedDate), [announcements, selectedDate]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    for (const occurrence of occurrences) {
      const key = toDateKey(occurrence.start_date);
      if (!key) continue;
      const existingDots = marks[key]?.dots ?? [];
      const hasEventDot = existingDots.some((dot: { key: string }) => dot.key === 'events');
      marks[key] = { ...marks[key], dots: hasEventDot ? existingDots : [...existingDots, { key: 'events', color: getColorHex(occurrence.event.color_key, ucapsaBrand.colors.red) }] };
    }

    for (const announcement of announcements) {
      const key = announcementDateKey(announcement);
      if (!key) continue;
      const existingDots = marks[key]?.dots ?? [];
      const hasAnnouncementDot = existingDots.some((dot: { key: string }) => dot.key === 'announcements');
      marks[key] = { ...marks[key], dots: hasAnnouncementDot ? existingDots : [...existingDots, { key: 'announcements', color: getColorHex(announcement.color_key, ucapsaBrand.colors.blue) }] };
    }

    marks[selectedDate] = { ...(marks[selectedDate] ?? {}), selected: true, selectedColor: ucapsaBrand.colors.red, selectedTextColor: '#ffffff' };
    return marks;
  }, [announcements, occurrences, selectedDate]);

  const upcomingEvents: EventOccurrence[] = useMemo(() => getUpcomingOccurrences(events, 3), [events]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ucapsaBrand.colors.red} />}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Calendario</Text>
            <Text style={styles.title}>Agenda UCAPSA</Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color={ucapsaBrand.colors.red} label="Eventos" />
            <LegendDot color={ucapsaBrand.colors.blue} label="Anuncios" />
          </View>
        </View>

        {isAdmin ? (
          <Pressable style={styles.adminButton} onPress={() => router.push('/admin/events' as never)}>
            <MaterialIcons name="admin-panel-settings" size={18} color="#fff" />
            <Text style={styles.adminButtonText}>Administrar eventos</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={ucapsaBrand.colors.red} />
            <Text style={styles.muted}>Cargando calendario...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>No se pudo cargar</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.secondaryButton} onPress={onRefresh}><Text style={styles.secondaryButtonText}>Intentar otra vez</Text></Pressable>
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
                  textSectionTitleColor: ucapsaBrand.colors.muted,
                  selectedDayBackgroundColor: ucapsaBrand.colors.red,
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: ucapsaBrand.colors.red,
                  dayTextColor: ucapsaBrand.colors.text,
                  monthTextColor: ucapsaBrand.colors.text,
                  arrowColor: ucapsaBrand.colors.red,
                  textDayFontWeight: '700',
                  textMonthFontWeight: '900',
                  textDayHeaderFontWeight: '800',
                }}
              />
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionKicker}>Día seleccionado</Text>
                <Text style={styles.sectionTitle}>{formatDateKey(selectedDate)}</Text>
              </View>
              <View style={styles.counterPill}><Text style={styles.counterPillText}>{selectedEvents.length + selectedAnnouncements.length}</Text></View>
            </View>

            {selectedEvents.length === 0 && selectedAnnouncements.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Sin actividad este día</Text>
                <Text style={styles.muted}>Selecciona otro día marcado en el calendario.</Text>
              </View>
            ) : null}

            {selectedEvents.map((occurrence) => (
              <View key={`event-${occurrence.id}`} style={styles.typeWrap}>
                <EventCard
                  event={occurrence.event}
                  startDateOverride={occurrence.start_date}
                  occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
                  onPress={isAdmin ? () => router.push(`/admin/events?eventId=${occurrence.event.id}` as never) : () => setSelectedEvent(occurrence)}
                />
              </View>
            ))}

            {selectedAnnouncements.map((announcement) => (
              <View key={`announcement-${announcement.id}`} style={styles.typeWrap}>
                <AnnouncementCard
                  announcement={announcement}
                  onPress={isAdmin ? () => router.push(`/admin/announcements?announcementId=${announcement.id}` as never) : () => setSelectedAnnouncement(announcement)}
                  onOpenEvent={announcement.event?.start_date ? () => setSelectedDate(toDateKey(announcement.event?.start_date) ?? selectedDate) : undefined}
                />
              </View>
            ))}

            {upcomingEvents.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionKicker}>Eventos</Text>
                    <Text style={styles.sectionTitle}>Próximos</Text>
                  </View>
                  <Pressable style={styles.toggleButton} onPress={() => setShowUpcomingEvents((current) => !current)}>
                    <Text style={styles.toggleButtonText}>{showUpcomingEvents ? 'Ocultar' : `Mostrar ${upcomingEvents.length}`}</Text>
                  </Pressable>
                </View>
                {showUpcomingEvents ? upcomingEvents.map((occurrence) => (
                  <View key={`upcoming-${occurrence.id}`} style={styles.typeWrap}>
                    <EventCard
                      event={occurrence.event}
                      startDateOverride={occurrence.start_date}
                      occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
                      onPress={isAdmin ? () => router.push(`/admin/events?eventId=${occurrence.event.id}` as never) : () => setSelectedEvent(occurrence)}
                    />
                  </View>
                )) : (
                  <View style={styles.minimizedBox}>
                    <Text style={styles.muted}>Ocultos para no saturar la agenda. Toca Mostrar para verlos.</Text>
                  </View>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <UcapsaDetailModal
        visible={Boolean(selectedEvent)}
        type="event"
        title={selectedEvent?.event.title ?? ''}
        body={selectedEvent?.event.description}
        dateLabel={selectedEvent ? new Date(selectedEvent.start_date).toLocaleString('es-MX') : null}
        location={selectedEvent?.event.location}
        repeatLabel={selectedEvent?.repeat_label}
        onClose={() => setSelectedEvent(null)}
      />

      <UcapsaDetailModal
        visible={Boolean(selectedAnnouncement)}
        type="announcement"
        title={selectedAnnouncement?.title ?? ''}
        body={selectedAnnouncement?.content}
        dateLabel={selectedAnnouncement?.announcement_date ? new Date(selectedAnnouncement.announcement_date).toLocaleDateString('es-MX') : null}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </SafeAreaView>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ucapsaBrand.colors.background },
  container: { flex: 1 },
  content: { gap: 16, padding: 20, paddingBottom: 120 },
  header: { gap: 12, padding: 20, borderRadius: 28, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  kicker: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900', marginTop: 4 },
  legendRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: ucapsaBrand.colors.surfaceAlt },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  adminButton: { flexDirection: 'row', gap: 8, padding: 15, borderRadius: 18, backgroundColor: ucapsaBrand.colors.red, justifyContent: 'center', alignItems: 'center' },
  adminButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  calendarCard: { overflow: 'hidden', borderRadius: 26, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  centerBox: { gap: 10, alignItems: 'center', padding: 24 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  errorBox: { gap: 10, padding: 16, borderRadius: 18, backgroundColor: '#FFF3F5', borderWidth: 1, borderColor: '#F7CAD2' },
  errorTitle: { color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '900' },
  errorText: { color: ucapsaBrand.colors.redDark, fontSize: 14 },
  secondaryButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#fff' },
  secondaryButtonText: { color: ucapsaBrand.colors.red, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 },
  sectionKicker: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900', marginTop: 4 },
  counterPill: { minWidth: 38, borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  counterPillText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  toggleButton: { alignItems: 'center', borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 12, paddingVertical: 8 },
  toggleButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  minimizedBox: { padding: 14, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyBox: { gap: 6, padding: 18, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  typeWrap: { position: 'relative' },
});
