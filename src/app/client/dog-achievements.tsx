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
import { getNewlyAwardedAchievement } from '../../services/achievement-celebration.domain';
import {
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
  const userId = user?.id ?? '';
  const scopeKey = !isAdmin && userId && dogId ? userId + ':' + dogId : '';
  const activeScopeKeyRef = useRef(scopeKey);
  activeScopeKeyRef.current = scopeKey;
  const loadRunRef = useRef(0);
  const [storedItems, setItems] = useState<AchievementWithState[]>([]);
  const [storedDogName, setDogName] = useState<string | null>(null);
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);
  const [readyForKey, setReadyForKey] = useState<string | null>(null);
  const [selectedAward, setSelectedAchievement] = useState<{
    key: string; item: AchievementWithState;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Render-time guard: switching account or dog never paints previous private achievements.
  const items = loadedForKey === scopeKey ? storedItems : [];
  const dogName = loadedForKey === scopeKey ? storedDogName : null;
  const selectedAchievement = selectedAward?.key === scopeKey ? selectedAward.item : null;
  const ready = Boolean(scopeKey) && readyForKey === scopeKey;

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => loadRunRef.current === runId
      && activeScopeKeyRef.current === scopeKey;
    if (!scopeKey || !dogId || !userId || isAdmin) return;

    setItems([]);
    setDogName(null);
    setLoadedForKey(null);
    setReadyForKey(null);
    setError(null);
    setUsingSavedData(false);
    setSelectedAchievement(null);

    // Offline cache failure should never suppress a successful official refresh.
    const [achievementResult, dogResult] = await Promise.allSettled([
      getCachedAchievementsForDog(userId, dogId),
      readClientResource<BasicDog[]>(userId, clientReadKeys.dogs),
    ]);
    if (!isCurrentRun()) return;
    const cachedAchievements = achievementResult.status === 'fulfilled'
      ? achievementResult.value : null;
    const dogCache = dogResult.status === 'fulfilled' ? dogResult.value : null;
    const cachedDog = dogCache?.data.find((dog) => dog.id === dogId) ?? null;
    setDogName(cachedDog?.name ?? null);
    if (cachedAchievements) {
      setItems(cachedAchievements);
      setLoadedForKey(scopeKey);
      setReadyForKey(scopeKey);
    }

    try {
      const fresh = await getMyDogAchievements(dogId, {
        userId,
        forceRefresh: true,
        allowCachedOnError: false,
      });
      if (!isCurrentRun()) return;
      setItems(fresh);
      setLoadedForKey(scopeKey);
      const newAward = getNewlyAwardedAchievement(cachedAchievements, fresh);
      if (newAward) setSelectedAchievement((selected) => selected?.key === scopeKey
        ? selected : { key: scopeKey, item: newAward });
      setUsingSavedData(false);
    } catch {
      if (!isCurrentRun()) return;
      if (cachedAchievements) {
        setItems(cachedAchievements);
        setLoadedForKey(scopeKey);
        setUsingSavedData(true);
      } else {
        setItems([]);
        setLoadedForKey(null);
        setError('No pudimos cargar los logros de este perro.');
      }
    } finally {
      if (isCurrentRun()) setReadyForKey(scopeKey);
    }
  }, [dogId, isAdmin, scopeKey, userId]);

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
        <View style={[styles.headerIcon, { backgroundColor: ucapsaBrand.colors.goldPale }]}>
          <MaterialIcons name="emoji-events" size={23} color={ucapsaBrand.colors.goldDark} />
        </View>
        <Text style={[styles.title, { color: format.cardText }]}>Logros{dogName ? ` ${dogName}` : ''}</Text>
      </View>

      {usingSavedData && ready && items.length > 0 ? (
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
        <AchievementBadgeGrid items={items} premium={premium} onSelect={(item) => setSelectedAchievement({ key: scopeKey, item })} />
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
  stateCard: { gap: 9, borderWidth: 1, borderRadius: 20, padding: 16 },
  stateTitle: { fontSize: 16, lineHeight: 22, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { fontSize: 12, fontWeight: '900' },
});