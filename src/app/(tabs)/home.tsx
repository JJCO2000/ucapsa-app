import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { EventCard } from '../../components/domain/EventCard';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import type { Announcement, EventOccurrence } from '../../types/app.types';
import { getUpcomingOccurrences } from '../../utils/events.utils';

export default function HomeScreen() {
  const { user, profile, role, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getVisibleAnnouncements(3), getVisibleEvents()])
      .then(([announcementResult, eventResult]) => {
        setAnnouncements(announcementResult.slice(0, 3));
        setEvents(getUpcomingOccurrences(eventResult, 3));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>UCAPSA App</Text>
          <Text style={styles.title}>{user ? `Hola${profile?.full_name ? `, ${profile.full_name}` : ''}` : 'Bienvenido a UCAPSA'}</Text>
          <Text style={styles.subtitle}>Comunicación oficial, calendario, socios y pagos manuales en una sola aplicación.</Text>

          <View style={styles.statusRow}>
            <Text style={styles.statusPill}>{user ? `Rol: ${role ?? 'client'}` : 'Visitante'}</Text>
            {isAdmin ? <Text style={styles.adminPill}>Admin</Text> : null}
          </View>
        </View>

        <View style={styles.quickGrid}>
          <Pressable style={styles.quickButton} onPress={() => router.push('/announcements' as never)}>
            <MaterialIcons name="campaign" size={24} color="#0f766e" />
            <Text style={styles.quickTitle}>Anuncios</Text>
            <Text style={styles.quickText}>Avisos oficiales</Text>
          </Pressable>

          <Pressable style={styles.quickButton} onPress={() => router.push('/calendar' as never)}>
            <MaterialIcons name="event" size={24} color="#0f766e" />
            <Text style={styles.quickTitle}>Calendario</Text>
            <Text style={styles.quickText}>Vista mensual</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
            <Text style={styles.muted}>Cargando información...</Text>
          </View>
        ) : null}

        {!loading ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Anuncios recientes</Text>
              <Pressable onPress={() => router.push('/announcements' as never)}>
                <Text style={styles.sectionLink}>Ver todos</Text>
              </Pressable>
            </View>

            {announcements.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Sin anuncios</Text>
                <Text style={styles.muted}>Los comunicados publicados apareceran aqui.</Text>
              </View>
            ) : (
              announcements.map((announcement) => (
                <AnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  onPress={isAdmin ? () => router.push(`/admin/announcements?announcementId=${announcement.id}` as never) : () => router.push('/announcements' as never)}
                  onOpenEvent={announcement.event ? () => router.push('/calendar' as never) : undefined}
                />
              ))
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Próximos eventos</Text>
              <Pressable onPress={() => router.push('/calendar' as never)}>
                <Text style={styles.sectionLink}>Ver calendario</Text>
              </Pressable>
            </View>

            {events.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Sin eventos próximos</Text>
                <Text style={styles.muted}>Cuando UCAPSA publique eventos, apareceran aqui.</Text>
              </View>
            ) : (
              events.map((occurrence) => (
                <EventCard
                  key={occurrence.id}
                  event={occurrence.event}
                  startDateOverride={occurrence.start_date}
                  occurrenceIndex={occurrence.is_recurring ? occurrence.occurrence_index : undefined}
                  onPress={isAdmin ? () => router.push(`/admin/events?eventId=${occurrence.event.id}` as never) : () => router.push('/calendar' as never)}
                />
              ))
            )}
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
  hero: { gap: 12, padding: 22, borderRadius: 26, backgroundColor: '#0f172a' },
  kicker: { color: '#5eead4', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: { overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, color: '#ffffff', backgroundColor: '#334155', fontWeight: '800' },
  adminPill: { overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, color: '#134e4a', backgroundColor: '#99f6e4', fontWeight: '900' },
  quickGrid: { flexDirection: 'row', gap: 12 },
  quickButton: { flex: 1, gap: 8, padding: 16, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  quickTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  quickText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  centerBox: { gap: 10, alignItems: 'center', padding: 24 },
  muted: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  sectionLink: { color: '#0f766e', fontSize: 13, fontWeight: '900' },
  emptyBox: { gap: 6, padding: 18, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
});
