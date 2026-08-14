import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AchievementBadgeGrid, AchievementDetailModal, AchievementSummary } from '../components/domain/AchievementBadgeGrid';
import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { resolveUcapsaFormat } from '../constants/ucapsaFormats';
import { useSession } from '../hooks/useSession';
import { getMyAchievements, type AchievementWithState } from '../services/achievements.service';

export default function AchievementsScreen() {
  const { loading: sessionLoading, user, role, isAdmin } = useSession();
  const [achievements, setAchievements] = useState<AchievementWithState[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [user, role, isAdmin]);
  const premium = format.key === 'member' && !isAdmin;

  const loadAchievements = useCallback(async () => {
    if (!user) {
      setAchievements([]);
      setLoading(false);
      return;
    }

    setError(null);
    try {
      setAchievements(await getMyAchievements());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los logros.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadAchievements(); }, [loadAchievements]);
  useFocusEffect(useCallback(() => { void loadAchievements(); return undefined; }, [loadAchievements]));

  async function refresh() {
    setRefreshing(true);
    try {
      await loadAchievements();
    } finally {
      setRefreshing(false);
    }
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

  return (
    <KeyboardAwareScreen
      style={{ backgroundColor: premium ? '#270711' : format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <View style={[styles.hero, { backgroundColor: premium ? '#6D0817' : format.surface, borderColor: premium ? 'rgba(250,204,21,0.42)' : format.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: premium ? '#FFE8B5' : format.accentSoft }]}>
          <MaterialCommunityIcons name="medal" size={34} color={premium ? '#7A1020' : format.accent} />
        </View>
        <Text style={[styles.eyebrow, { color: premium ? '#FFE8B5' : format.accent }]}>Perfil</Text>
        <Text style={[styles.title, { color: premium ? '#FFFFFF' : format.text }]}>Logros UCAPSA</Text>
        <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>Medallas desbloqueadas por completar Puppy y Comandos.</Text>
      </View>

      <AchievementSummary items={achievements} premium={premium} onPress={() => undefined} />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>Cargando logros...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorBox, premium && styles.errorBoxPremium]}>
          <Text style={[styles.errorTitle, premium && styles.errorTitlePremium]}>No se pudo cargar</Text>
          <Text style={[styles.errorText, premium && styles.errorTextPremium]}>{error}</Text>
          <Text style={[styles.errorText, premium && styles.errorTextPremium]}>Revisa que ya ejecutaste el SQL de Cambio 3.1.</Text>
        </View>
      ) : null}

      {!error ? <AchievementBadgeGrid items={achievements} premium={premium} onSelect={setSelectedAchievement} /> : null}

      <Pressable style={[styles.secondaryButton, premium && styles.secondaryButtonPremium]} onPress={() => router.push('/home' as never)}>
        <Text style={[styles.secondaryButtonText, premium && styles.secondaryButtonTextPremium]}>Volver a Inicio</Text>
      </Pressable>

      <AchievementDetailModal item={selectedAchievement} premium={premium} onClose={() => setSelectedAchievement(null)} />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: '#270711' },
  hero: { gap: 8, padding: 22, borderRadius: 30, backgroundColor: '#fff', borderWidth: 1 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 31, fontWeight: '900' },
  muted: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loadingBox: { gap: 10, alignItems: 'center', padding: 20 },
  errorBox: { gap: 6, padding: 16, borderRadius: 20, backgroundColor: '#FFF3F5', borderWidth: 1, borderColor: '#F7CAD2' },
  errorBoxPremium: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(250,204,21,0.26)' },
  errorTitle: { color: '#991b1b', fontSize: 16, fontWeight: '900' },
  errorTitlePremium: { color: '#FFE8B5' },
  errorText: { color: '#7f1d1d', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorTextPremium: { color: '#FFE3E8' },
  primaryButton: { alignItems: 'center', borderRadius: 18, paddingVertical: 14, marginTop: 8 },
  primaryButtonText: { fontSize: 15, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  secondaryButtonPremium: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(250,204,21,0.26)' },
  secondaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  secondaryButtonTextPremium: { color: '#FFE8B5' },
});
