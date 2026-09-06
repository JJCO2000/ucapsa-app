import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { activityAchievementDefinitions, activityAchievementValue, type ActivityAchievementMetric } from '../../constants/activityAchievements';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyClientActivityFacts, type ClientActivityFacts } from '../../services/client-activity.service';

const categoryMeta: Record<ActivityAchievementMetric, { title: string; subtitle: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  attendance: { title: 'Asistencias', subtitle: 'Clases registradas en UCAPSA', icon: 'school' },
  practice: { title: 'Práctica', subtitle: 'Entrenamiento registrado fuera de clase', icon: 'pets' },
  visits: { title: 'Visitas de socio', subtitle: 'Entradas registradas con tu acceso', icon: 'badge' },
  streak: { title: 'Rachas', subtitle: 'Tu mejor constancia de práctica', icon: 'local-fire-department' },
};

export default function ActivityAchievementsScreen() {
  const { user, role, isAdmin } = useSession();
  const [facts, setFacts] = useState<ClientActivityFacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    try {
      setFacts(await getMyClientActivityFacts(user.id));
    } catch {
      setError('No pudimos calcular tus insignias de actividad.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="home" />
      <ClientPageHeader
        format={format}
        eyebrow="Logros secundarios"
        title="Insignias de actividad"
        subtitle="Reconocen constancia real. No reemplazan tus 4 medallas principales de Puppy y Comandos."
        icon="stars"
      />

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Calculando insignias...</Text></View> : null}
      {error ? <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.stateTitle, { color: format.cardText }]}>{error}</Text></View> : null}

      {facts ? ((premium ? ['attendance', 'practice', 'visits', 'streak'] : ['attendance', 'practice', 'streak']) as ActivityAchievementMetric[]).map((metric) => (
        <AchievementCategory key={metric} metric={metric} facts={facts} format={format} premium={premium} />
      )) : null}
    </KeyboardAwareScreen>
  );
}

function AchievementCategory({ metric, facts, format, premium }: { metric: ActivityAchievementMetric; facts: ClientActivityFacts; format: ReturnType<typeof resolveUcapsaFormat>; premium: boolean }) {
  const meta = categoryMeta[metric];
  const value = activityAchievementValue(metric, facts);
  const definitions = activityAchievementDefinitions.filter((item) => item.metric === metric);
  const unlocked = definitions.filter((item) => value >= item.threshold).length;
  const next = definitions.find((item) => value < item.threshold) ?? null;
  const previousThreshold = [...definitions].reverse().find((item) => value >= item.threshold)?.threshold ?? 0;
  const progress = next ? Math.max(0, Math.min(1, (value - previousThreshold) / Math.max(1, next.threshold - previousThreshold))) : 1;

  return (
    <View style={[styles.categoryCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <View style={styles.categoryHeader}>
        <View style={[styles.categoryIcon, { backgroundColor: format.accentSoft }]}><MaterialIcons name={meta.icon} size={22} color={format.accentDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.categoryTitle, { color: format.cardText }]}>{meta.title}</Text>
          <Text style={[styles.categorySubtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{meta.subtitle}</Text>
        </View>
        <Text style={[styles.categoryCount, { color: format.accentDark }]}>{unlocked}/{definitions.length}</Text>
      </View>

      <View style={styles.progressHeader}>
        <Text style={[styles.progressValue, { color: format.cardText }]}>{value}</Text>
        <Text style={[styles.progressLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{next ? `Siguiente: ${next.title} · ${next.threshold}` : 'Todas desbloqueadas'}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: format.secondaryButton }]}><View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: format.accent }]} /></View>

      <View style={styles.badgesGrid}>
        {definitions.map((definition) => {
          const isUnlocked = value >= definition.threshold;
          return (
            <View key={definition.code} style={[styles.badge, { borderColor: isUnlocked ? format.accent : format.cardBorder, backgroundColor: isUnlocked ? format.accentSoft : format.surfaceAlt }]}>
              <View style={[styles.badgeSeal, { backgroundColor: isUnlocked ? format.accent : format.secondaryButton }]}><MaterialIcons name={definition.icon} size={18} color={isUnlocked ? format.primaryButtonText : format.muted} /></View>
              <Text numberOfLines={2} style={[styles.badgeTitle, { color: isUnlocked ? format.cardText : format.muted }]}>{definition.title}</Text>
              <Text style={[styles.badgeThreshold, { color: isUnlocked ? format.accentDark : format.muted }]}>{definition.threshold}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  stateCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  stateTitle: { fontSize: 17, fontWeight: '900' },
  categoryCard: { gap: 13, borderWidth: 1, borderRadius: 25, padding: 15, marginBottom: 13 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { fontSize: 17, lineHeight: 21, fontWeight: '900' },
  categorySubtitle: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  categoryCount: { fontSize: 14, fontWeight: '900' },
  progressHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  progressValue: { fontSize: 27, lineHeight: 30, fontWeight: '900' },
  progressLabel: { flex: 1, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { width: '31.5%', minHeight: 108, alignItems: 'center', justifyContent: 'space-between', gap: 6, borderWidth: 1, borderRadius: 17, padding: 9 },
  badgeSeal: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeTitle: { minHeight: 30, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '900' },
  badgeThreshold: { fontSize: 11, fontWeight: '900' },
});
