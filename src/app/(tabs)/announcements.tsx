import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { clientReadKeys, readClientResource, writeClientResource } from '../../services/client-read-cache.service';
import { readHomeCache } from '../../services/home-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import type { Announcement } from '../../types/app.types';

const mark = require('../../../assets/images/brand/ucapsa-mark.png');

export default function AnnouncementsScreen() {
  const { user, role, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [offlineEmpty, setOfflineEmpty] = useState(false);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [user, role, isAdmin]);
  const isPremium = format.key === 'member';

  const cacheScope = user?.id ?? 'public';

  const loadAnnouncements = useCallback(async () => {
    setUsingSavedData(false);
    setOfflineEmpty(false);

    const [cached, homeCache] = await Promise.all([
      readClientResource<Announcement[]>(cacheScope, clientReadKeys.announcements),
      readHomeCache(cacheScope),
    ]);

    const localAnnouncements = cached?.data ?? homeCache?.announcements?.data ?? null;
    const localSavedAt = cached?.saved_at ?? homeCache?.announcements?.saved_at ?? null;

    if (localAnnouncements) {
      setAnnouncements(localAnnouncements);
      setSavedAt(localSavedAt);
    }
    setLocalReady(true);

    try {
      const rows = await withOperationTimeout(getVisibleAnnouncements(), DEFAULT_READ_TIMEOUT_MS, 'announcements');
      setAnnouncements(rows);
      const stored = await writeClientResource(cacheScope, clientReadKeys.announcements, rows);
      setSavedAt(stored.saved_at);
      setUsingSavedData(false);
      setOfflineEmpty(false);
    } catch {
      if (localAnnouncements) {
        setUsingSavedData(true);
      } else {
        setOfflineEmpty(true);
      }
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={format.accent} />}
      >
        <View style={[styles.header, { backgroundColor: format.surface, borderColor: format.border }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.kicker, { color: format.accentDark }]}>Anuncios</Text>
              <Text style={[styles.title, { color: format.text }]}>Comunicación oficial</Text>
            </View>
            <View style={[styles.markCircle, { backgroundColor: format.accentSoft }]}>
              <Image source={mark} style={styles.mark} resizeMode="contain" />
            </View>
          </View>
        </View>

        {isAdmin ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Administrar anuncios"
            style={[styles.adminButton, { backgroundColor: format.primaryButton }]}
            onPress={() => router.push('/admin/announcements' as never)}
          >
            <MaterialIcons name="admin-panel-settings" size={18} color={format.primaryButtonText} />
            <Text style={[styles.adminButtonText, { color: format.primaryButtonText }]}>Administrar anuncios</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={[styles.sectionKicker, { color: isPremium ? ucapsaBrand.colors.premiumAction : format.muted }]}>Lista</Text>
            <Text style={[styles.sectionTitle, { color: format.text }]}>Avisos publicados</Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: format.pillBackground }]}>
            <Text style={[styles.countText, { color: format.pillText }]}>{announcements.length}</Text>
          </View>
        </View>

        {usingSavedData ? (
          <OfflineDataNotice savedAt={savedAt} onRetry={() => void onRefresh()} premium={isPremium} label="Mostrando anuncios guardados" />
        ) : null}

        {localReady && announcements.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <MaterialIcons name={offlineEmpty ? 'cloud-off' : 'campaign'} size={24} color={format.accentDark} />
            <View style={styles.emptyCopy}>
              <Text style={[styles.emptyTitle, { color: format.cardText }]}>
                {offlineEmpty ? 'Sin anuncios guardados' : 'Sin anuncios publicados'}
              </Text>
              <Text style={[styles.muted, { color: format.muted }]}>
                {offlineEmpty
                  ? 'Esta pantalla funciona sin conexión después de la primera sincronización. Vuelve a intentar cuando tengas internet.'
                  : 'Cuando UCAPSA publique avisos, aparecerán aquí.'}
              </Text>
            </View>
            {offlineEmpty ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reintentar sincronización de anuncios"
                style={[styles.secondaryButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
                onPress={() => void onRefresh()}
              >
                <MaterialIcons name="refresh" size={20} color={format.secondaryButtonText} />
                <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Reintentar</Text>
              </Pressable>
            ) : null}
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
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  header: { padding: 20, borderRadius: 28, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, lineHeight: 34, fontWeight: '900', marginTop: 4 },
  markCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  mark: { width: 28, height: 28 },
  adminButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 18, backgroundColor: ucapsaBrand.colors.red },
  adminButtonText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionKicker: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 22, lineHeight: 28, fontWeight: '900', marginTop: 3 },
  countPill: { minWidth: 40, minHeight: 40, borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  countText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  emptyBox: { gap: 12, padding: 18, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyCopy: { gap: 4 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  secondaryButton: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1 },
  secondaryButtonText: { fontSize: 14, fontWeight: '900' },
  announcementWrap: { position: 'relative' },
});
