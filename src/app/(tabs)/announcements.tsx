import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { useSession } from '../../hooks/useSession';
import { listVisibleAnnouncements } from '../../services/announcements.service';
import type { Announcement } from '../../types/app.types';

export default function AnnouncementsScreen() {
  const { isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    try {
      setError(null);
      const rows = await listVisibleAnnouncements();
      setAnnouncements(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los anuncios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAnnouncements} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Comunicacion oficial</Text>
          <Text style={styles.title}>Anuncios</Text>
          <Text style={styles.subtitle}>
            Avisos importantes de UCAPSA para visitantes, clientes y socios.
          </Text>
        </View>

        {isAdmin ? (
          <Pressable style={styles.adminButton} onPress={() => router.push('/admin/announcements' as never)}>
            <Text style={styles.adminButtonText}>Administrar anuncios</Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageTitle}>Algo fallo</Text>
            <Text style={styles.messageText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={loadAnnouncements}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {!error && !loading && announcements.length === 0 ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageTitle}>No hay anuncios publicados</Text>
            <Text style={styles.messageText}>
              Cuando UCAPSA publique avisos, apareceran aqui.
            </Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {announcements.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '900',
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  adminButton: {
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#0f766e',
  },
  adminButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  messageBox: {
    gap: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  messageText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#0f766e',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    gap: 12,
  },
});
