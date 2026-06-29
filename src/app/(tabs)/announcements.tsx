import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import type { Announcement } from '../../types/app.types';

export default function AnnouncementsScreen() {
  const { isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    setError(null);
    const rows = await getVisibleAnnouncements();
    setAnnouncements(rows);
  }, []);

  useEffect(() => {
    loadAnnouncements()
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los anuncios.'))
      .finally(() => setLoading(false));
  }, [loadAnnouncements]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los anuncios.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="campaign" size={28} color="#0f766e" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Comunicacion oficial</Text>
            <Text style={styles.title}>Anuncios UCAPSA</Text>
            <Text style={styles.subtitle}>Avisos importantes para visitantes, clientes, socios y administradores.</Text>
          </View>
        </View>

        {isAdmin ? (
          <Pressable style={styles.adminButton} onPress={() => router.push('/admin/announcements' as never)}>
            <MaterialIcons name="admin-panel-settings" size={20} color="#ffffff" />
            <Text style={styles.adminButtonText}>Administrar anuncios</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
            <Text style={styles.muted}>Cargando anuncios...</Text>
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

        {!loading && !error && announcements.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Sin anuncios publicados</Text>
            <Text style={styles.muted}>Cuando UCAPSA publique avisos, apareceran aqui.</Text>
          </View>
        ) : null}

        {!error ? announcements.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            onPress={isAdmin ? () => router.push(`/admin/announcements?announcementId=${announcement.id}` as never) : undefined}
            onOpenEvent={announcement.event ? () => router.push('/calendar' as never) : undefined}
          />
        )) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 110 },
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
