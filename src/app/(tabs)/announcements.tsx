import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { clientReadKeys, readClientResource, writeClientResource } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';
import type { Announcement } from '../../types/app.types';

const mark = require('../../../assets/images/brand/ucapsa-mark.png');

export default function AnnouncementsScreen() {
  const { user, role, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [user, role, isAdmin]);
  const isPremium = format.key === 'member';

  const cacheScope = user?.id ?? 'public';

  const loadAnnouncements = useCallback(async () => {
    setError(null);
    setUsingSavedData(false);

    const cached = await readClientResource<Announcement[]>(cacheScope, clientReadKeys.announcements);
    if (cached) {
      setAnnouncements(cached.data);
      setSavedAt(cached.saved_at);
      setLoading(false);
    }

    try {
      const rows = await withOperationTimeout(getVisibleAnnouncements(), DEFAULT_READ_TIMEOUT_MS, 'announcements');
      setAnnouncements(rows);
      const stored = await writeClientResource(cacheScope, clientReadKeys.announcements, rows);
      setSavedAt(stored.saved_at);
      setUsingSavedData(false);
    } catch {
      if (cached) {
        setUsingSavedData(true);
      } else {
        setError(friendlyReadError('No se pudieron cargar los anuncios.'));
      }
    } finally {
      setLoading(false);
    }
  }, [cacheScope]);

  useFocusEffect(
    useCallback(() => {
      void loadAnnouncements();
      return undefined;
    }, [loadAnnouncements]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadAnnouncements();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: format.background }]} edges={['top']}>
      <ScrollView
        style={[styles.container, { backgroundColor: format.background }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ucapsaBrand.colors.red} />}
      >
        <View style={[styles.header, { backgroundColor: format.surface, borderColor: format.border }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.kicker, { color: format.accentDark }]}>Anuncios</Text>
              <Text style={[styles.title, { color: format.text }]}>Comunicacion oficial</Text>
            </View>
            <View style={[styles.markCircle, { backgroundColor: format.accentSoft }]}><Image source={mark} style={styles.mark} resizeMode="contain" /></View>
          </View>
        </View>

        {isAdmin ? (
          <Pressable style={[styles.adminButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/admin/announcements' as never)}>
            <MaterialIcons name="admin-panel-settings" size={18} color={ucapsaBrand.colors.surface} />
            <Text style={styles.adminButtonText}>Administrar anuncios</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionKicker, { color: isPremium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.muted }]}>Lista</Text>
            <Text style={[styles.sectionTitle, { color: isPremium ? ucapsaBrand.colors.surface : ucapsaBrand.colors.text }]}>Avisos publicados</Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: format.pillBackground }]}><Text style={[styles.countText, { color: format.pillText }]}>{announcements.length}</Text></View>
        </View>

        {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void onRefresh()} premium={isPremium} /> : null}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={format.accent} />
            <Text style={[styles.muted, { color: format.muted }]}>Cargando anuncios...</Text>
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
          <View style={[styles.emptyBox, { backgroundColor: isPremium ? withAlpha(ucapsaBrand.colors.surface, 0.08) : ucapsaBrand.colors.surface, borderColor: isPremium ? withAlpha(ucapsaBrand.colors.gold, 0.24) : ucapsaBrand.colors.border }]}>
            <Text style={[styles.emptyTitle, { color: isPremium ? ucapsaBrand.colors.surface : ucapsaBrand.colors.text }]}>Sin anuncios publicados</Text>
            <Text style={[styles.muted, { color: format.muted }]}>Cuando UCAPSA publique avisos, apareceran aqui.</Text>
          </View>
        ) : null}

        {announcements.map((announcement) => (
          <View key={announcement.id} style={styles.announcementWrap}>
            <AnnouncementCard
              announcement={announcement}
              onPress={isAdmin ? () => router.push(`/admin/announcements?announcementId=${announcement.id}` as never) : () => setSelectedAnnouncement(announcement)}
              onOpenEvent={announcement.event ? () => router.push('/calendar' as never) : undefined}
            />
          </View>
        ))}
      </ScrollView>

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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ucapsaBrand.colors.background },
  container: { flex: 1 },
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  header: { padding: 20, borderRadius: 28, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900', marginTop: 4 },
  markCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  mark: { width: 28, height: 28 },
  adminButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 18, backgroundColor: ucapsaBrand.colors.red },
  adminButtonText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionKicker: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900', marginTop: 3 },
  countPill: { minWidth: 36, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  countText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  centerBox: { gap: 10, alignItems: 'center', padding: 24 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  errorBox: { gap: 10, padding: 16, borderRadius: 18, backgroundColor: ucapsaBrand.colors.dangerSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder },
  errorTitle: { color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '900' },
  errorText: { color: ucapsaBrand.colors.redDark, fontSize: 14 },
  secondaryButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface },
  secondaryButtonText: { color: ucapsaBrand.colors.red, fontWeight: '900' },
  emptyBox: { gap: 6, padding: 18, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  announcementWrap: { position: 'relative' },
});
