import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AchievementBadgeGrid, AchievementDetailModal } from '../../components/domain/AchievementBadgeGrid';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import {
  countUnlockedAchievements,
  getCachedAchievementsForDog,
  getMyDogAchievements,
  type AchievementWithState,
} from '../../services/achievements.service';
import { clientReadKeys, readClientResource } from '../../services/client-read-cache.service';
import type { BasicDog } from '../../services/dogs.service';

export default function DogAchievementsScreen() {
  const { dogId: dogIdParam } = useLocalSearchParams<{ dogId?: string | string[] }>();
  const dogId = Array.isArray(dogIdParam) ? dogIdParam[0] ?? null : dogIdParam ?? null;
  const { user, role, isAdmin } = useSession();
  const [items, setItems] = useState<AchievementWithState[]>([]);
  const [dogName, setDogName] = useState<string | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithState | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRunRef = useRef(0);

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';
  const unlockedCount = useMemo(() => countUnlockedAchievements(items), [items]);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;

    if (!user || isAdmin || !dogId) {
      setReady(true);
      return;
    }

    setError(null);
    setUsingSavedData(false);
    setSelectedAchievement(null);

    const [cachedAchievements, dogCache] = await Promise.all([
      getCachedAchievementsForDog(user.id, dogId),
      readClientResource<BasicDog[]>(user.id, clientReadKeys.dogs),
    ]);
    if (!isCurrentRun()) return;

    const cachedDog = dogCache?.data.find((dog) => dog.id === dogId) ?? null;
    setDogName(cachedDog?.name ?? null);
    if (cachedAchievements) {
      setItems(cachedAchievements);
      setReady(true);
    }

    try {
      const fresh = await getMyDogAchievements(dogId, {
        userId: user.id,
        forceRefresh: true,
        allowCachedOnError: false,
      });
      if (!isCurrentRun()) return;
      setItems(fresh);
      setUsingSavedData(false);
      setReady(true);
    } catch {
      if (!isCurrentRun()) return;
      if (cachedAchievements) {
        setItems(cachedAchievements);
        setUsingSavedData(true);
      } else {
        setItems([]);
        setError('No pudimos cargar los logros de este perro.');
      }
      setReady(true);
    }
  }, [dogId, isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: format.pillBackground }]}>
          <MaterialIcons name="emoji-events" size={23} color={format.pillText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: format.cardText }]}>Logros UCAPSA</Text>
          <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
            {dogName ? `Progresión de ${dogName}` : 'Puppy → Básico → Intermedio → Avanzado'}
          </Text>
        </View>
        {items.length > 0 ? (
          <View style={[styles.countPill, { backgroundColor: format.pillBackground }]}>
            <Text style={[styles.countText, { color: format.pillText }]}>{unlockedCount}/{items.length}</Text>
          </View>
        ) : null}
      </View>

      {usingSavedData ? (
        <OfflineDataNotice onRetry={() => void refresh()} premium={premium} label="Mostrando logros guardados" />
      ) : null}

      {!dogId ? (
        <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.stateTitle, { color: format.cardText }]}>Selecciona un perro desde Mi perro.</Text>
        </View>
      ) : null}

      {ready && dogId && error ? (
        <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.stateTitle, { color: format.cardText }]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={[styles.retryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
            onPress={() => void refresh()}
          >
            <Text style={[styles.retryText, { color: format.secondaryButtonText }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {ready && dogId && !error ? (
        <AchievementBadgeGrid items={items} premium={premium} onSelect={setSelectedAchievement} />
      ) : null}

      <AchievementDetailModal
        item={selectedAchievement}
        premium={premium}
        onClose={() => setSelectedAchievement(null)}
      />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
  headerIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, lineHeight: 28, fontWeight: '900' },
  subtitle: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  countPill: { minWidth: 48, alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  countText: { fontSize: 12, fontWeight: '900' },
  stateCard: { gap: 9, borderWidth: 1, borderRadius: 20, padding: 16 },
  stateTitle: { fontSize: 16, lineHeight: 22, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { fontSize: 12, fontWeight: '900' },
});