import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { useSession } from '../../hooks/useSession';
import { listVisibleAnnouncements } from '../../services/announcements.service';
import type { Announcement } from '../../types/app.types';

export default function HomeScreen() {
  const { user, profile, role, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const rows = await listVisibleAnnouncements();
      setAnnouncements(rows.slice(0, 2));
    } catch {
      setAnnouncements([]);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const displayName = profile?.full_name || user?.email || 'Visitante';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Universidad Canina</Text>
          <Text style={styles.title}>Hola, {displayName}</Text>
          <Text style={styles.subtitle}>
            Accede a comunicados, calendario y tu informacion de UCAPSA desde un solo lugar.
          </Text>

          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>Rol actual: {role ?? 'visitante'}</Text>
          </View>
        </View>

        <View style={styles.quickGrid}>
          <Pressable style={styles.quickCard} onPress={() => router.push('/announcements' as never)}>
            <Text style={styles.quickIcon}>ðŸ“£</Text>
            <Text style={styles.quickTitle}>Anuncios</Text>
            <Text style={styles.quickText}>Avisos oficiales y novedades.</Text>
          </Pressable>

          <Pressable style={styles.quickCard} onPress={() => router.push('/calendar' as never)}>
            <Text style={styles.quickIcon}>ðŸ“…</Text>
            <Text style={styles.quickTitle}>Calendario</Text>
            <Text style={styles.quickText}>Eventos y fechas relevantes.</Text>
          </Pressable>

          <Pressable style={styles.quickCard} onPress={() => router.push('/membership' as never)}>
            <Text style={styles.quickIcon}>ðŸªª</Text>
            <Text style={styles.quickTitle}>Mi UCAPSA</Text>
            <Text style={styles.quickText}>Membresia, pagos y credencial.</Text>
          </Pressable>

          {isAdmin ? (
            <Pressable style={styles.quickCard} onPress={() => router.push('/admin' as never)}>
              <Text style={styles.quickIcon}>âš™ï¸</Text>
              <Text style={styles.quickTitle}>Admin</Text>
              <Text style={styles.quickText}>Gestion de contenido y socios.</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Anuncios recientes</Text>
          <Pressable onPress={() => router.push('/announcements' as never)}>
            <Text style={styles.sectionLink}>Ver todos</Text>
          </Pressable>
        </View>

        <View style={styles.list}>
          {announcements.length > 0 ? (
            announcements.map((announcement) => (
              <AnnouncementCard key={announcement.id} announcement={announcement} />
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Sin anuncios por ahora</Text>
              <Text style={styles.emptyText}>Cuando UCAPSA publique algo importante, lo veras aqui.</Text>
            </View>
          )}
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
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  hero: {
    gap: 10,
    padding: 20,
    borderRadius: 28,
    backgroundColor: '#0f766e',
  },
  eyebrow: {
    color: '#ccfbf1',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#e0f2f1',
    fontSize: 15,
    lineHeight: 22,
  },
  rolePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  rolePillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    width: '47%',
    minHeight: 132,
    gap: 8,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickIcon: {
    fontSize: 24,
  },
  quickTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  quickText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  sectionLink: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '900',
  },
  list: {
    gap: 12,
  },
  emptyBox: {
    gap: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
});
