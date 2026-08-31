import { ucapsaBrand, withAlpha } from '../constants/brand';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AchievementBadgeGrid, AchievementDetailModal, AchievementSummary } from '../components/domain/AchievementBadgeGrid';
import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { resolveUcapsaFormat } from '../constants/ucapsaFormats';
import { useSession } from '../hooks/useSession';
import {
  getCachedAchievementsForUser,
  refreshAchievementsForUser,
  type AchievementWithState,
} from '../services/achievements.service';

export default function AchievementsScreen() {
  const { loading: sessionLoading, user, role, isAdmin } = useSession();
  const [achievements, setAchievements] = useState<AchievementWithState[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [error, setError] = useState(false);
  const requestIdRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [user, role, isAdmin]);
  const premium = format.key === 'member' && !isAdmin;

  const loadAchievements = useCallback(async (showRefresh = false) => {
    const requestId = ++requestIdRef.current;

    if (!user) {
      setAchievements([]);
      setUsingCachedData(false);
      setError(false);
      setLoading(false);
      return;
    }

    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);

    const cached = await getCachedAchievementsForUser(user.id);
    if (requestId !== requestIdRef.current) return;

    if (cached) {
      setAchievements(cached);
      setUsingCachedData(true);
      setLoading(false);
    }

    try {
      const fresh = await refreshAchievementsForUser(user.id);
      if (requestId !== requestIdRef.current) return;
      setAchievements(fresh);
      setUsingCachedData(false);
      setError(false);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(true);
      setUsingCachedData(Boolean(cached));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    void loadAchievements(false);
    return () => { requestIdRef.current += 1; };
  }, [loadAchievements]));

  async function refresh() {
    await loadAchievements(true);
  }

  if (sessionLoading) {
    return (
      <KeyboardAwareScreen style={{ backgroundColor: format.background }}>
        <Text style={[styles.title, { color: format.text }]}>Logros UCAPSA</Text>
        <Text style={[styles.muted, { color: format.muted }]}>Cargando sesion...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen style={{ backgroundColor: format.background }}>
        <View style={[styles.hero, { backgroundColor: format.surface, borderColor: format.border }]}>
          <MaterialCommunityIcons name="medal" size={40} color={format.accent} />
          <Text style={[styles.title, { color: format.text }]}>Logros UCAPSA</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Inicia sesion para ver tus medallas.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/auth/login' as never)}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Iniciar sesion</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  const hasAchievements = achievements.length > 0;

  return (
    <KeyboardAwareScreen
      style={{ backgroundColor: premium ? ucapsaBrand.colors.premiumBackground : format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <View style={[styles.hero, { backgroundColor: premium ? ucapsaBrand.colors.premiumHero : format.surface, borderColor: premium ? withAlpha(ucapsaBrand.colors.gold, 0.42) : format.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumAction : format.accentSoft }]}>
          <MaterialCommunityIcons name="medal" size={34} color={premium ? ucapsaBrand.colors.premiumActionText : format.accent} />
        </View>
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accent }]}>Perfil</Text>
        <Text style={[styles.title, { color: premium ? ucapsaBrand.colors.surface : format.text }]}>Logros UCAPSA</Text>
        <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Medallas desbloqueadas por completar Puppy y Comandos.</Text>
      </View>

      {hasAchievements ? <AchievementSummary items={achievements} premium={premium} /> : null}

      {loading && !hasAchievements ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cargando logros...</Text>
        </View>
      ) : null}

      {usingCachedData && error ? (
        <View style={[styles.cacheBox, premium && styles.cacheBoxPremium]}>
          <MaterialCommunityIcons name="cloud-off-outline" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accent} />
          <Text style={[styles.cacheText, premium && styles.cacheTextPremium]}>Sin conexion. Mostrando tus logros guardados.</Text>
        </View>
      ) : null}

      {error && !hasAchievements ? (
        <View style={[styles.errorBox, premium && styles.errorBoxPremium]}>
          <Text style={[styles.errorTitle, premium && styles.errorTitlePremium]}>No pudimos cargar tus logros</Text>
          <Text style={[styles.errorText, premium && styles.errorTextPremium]}>Revisa tu conexion e intenta nuevamente.</Text>
          <Pressable style={[styles.retryButton, premium && styles.retryButtonPremium]} onPress={() => void loadAchievements(false)}>
            <Text style={[styles.retryButtonText, premium && styles.retryButtonTextPremium]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading || hasAchievements ? <AchievementBadgeGrid items={achievements} premium={premium} onSelect={setSelectedAchievement} /> : null}

      <Pressable style={[styles.secondaryButton, premium && styles.secondaryButtonPremium]} onPress={() => router.push('/home' as never)}>
        <Text style={[styles.secondaryButtonText, premium && styles.secondaryButtonTextPremium]}>Volver a Inicio</Text>
      </Pressable>

      <AchievementDetailModal item={selectedAchievement} premium={premium} onClose={() => setSelectedAchievement(null)} />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  hero: { gap: 8, padding: 22, borderRadius: 30, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 31, fontWeight: '900' },
  muted: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loadingBox: { gap: 10, alignItems: 'center', padding: 20 },
  cacheBox: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: 18, backgroundColor: ucapsaBrand.colors.redPale, borderWidth: 1, borderColor: ucapsaBrand.colors.textLight },
  cacheBoxPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.08), borderColor: withAlpha(ucapsaBrand.colors.gold, 0.26) },
  cacheText: { flex: 1, color: ucapsaBrand.colors.grayDark, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  cacheTextPremium: { color: ucapsaBrand.colors.premiumMuted },
  errorBox: { gap: 8, padding: 16, borderRadius: 20, backgroundColor: ucapsaBrand.colors.dangerSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder },
  errorBoxPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.08), borderColor: withAlpha(ucapsaBrand.colors.gold, 0.26) },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 16, fontWeight: '900' },
  errorTitlePremium: { color: ucapsaBrand.colors.premiumAction },
  errorText: { color: ucapsaBrand.colors.premiumActionText, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorTextPremium: { color: ucapsaBrand.colors.premiumMuted },
  retryButton: { alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder },
  retryButtonPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.08), borderColor: withAlpha(ucapsaBrand.colors.gold, 0.26) },
  retryButtonText: { color: ucapsaBrand.colors.danger, fontSize: 13, fontWeight: '900' },
  retryButtonTextPremium: { color: ucapsaBrand.colors.premiumAction },
  primaryButton: { alignItems: 'center', borderRadius: 18, paddingVertical: 14, marginTop: 8 },
  primaryButtonText: { fontSize: 15, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.borderNeutral },
  secondaryButtonPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.08), borderColor: withAlpha(ucapsaBrand.colors.gold, 0.26) },
  secondaryButtonText: { color: ucapsaBrand.colors.cameraDark, fontSize: 15, fontWeight: '900' },
  secondaryButtonTextPremium: { color: ucapsaBrand.colors.premiumAction },
});
