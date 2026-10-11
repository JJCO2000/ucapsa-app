import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { activityAchievementDefinitions, activityAchievementValue, type ActivityAchievementMetric } from '../../constants/activityAchievements';
import { ucapsaBrand, ucapsaColorKeyPalette } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useReturnToProfile } from '../../hooks/useReturnToProfile';
import { useSession } from '../../hooks/useSession';
import {
  getCachedMyClientActivityFacts,
  getMyClientActivityFacts,
  type ClientActivityFacts,
} from '../../services/client-activity.service';

const categoryMeta: Record<ActivityAchievementMetric, { title: string; icon: keyof typeof MaterialIcons.glyphMap; tone: keyof typeof ucapsaColorKeyPalette }> = {
  attendance: { title: 'Asistencias', icon: 'school', tone: 'yellow' },
  practice: { title: 'Práctica', icon: 'pets', tone: 'green' },
  visits: { title: 'Visitas de socio', icon: 'badge', tone: 'blue' },
  streak: { title: 'Rachas', icon: 'local-fire-department', tone: 'purple' },
};

export default function ActivityAchievementsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const fromProfile = (Array.isArray(from) ? from[0] : from) === 'profile';
  const backToProfile = useReturnToProfile(fromProfile);
  const { user, role, isAdmin } = useSession();
  const [facts, setFacts] = useState<ClientActivityFacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadRunRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    if (!user || isAdmin) return;

    setError(null);
    setUsingSavedData(false);

    const cached = await getCachedMyClientActivityFacts(user.id);
    if (!isCurrentRun()) return;
    if (cached) {
      setFacts(cached.data);
      setSavedAt(cached.saved_at);
      setLoading(false);
    }

    try {
      const fresh = await getMyClientActivityFacts(user.id);
      if (!isCurrentRun()) return;
      setFacts(fresh);
      setUsingSavedData(false);
      setError(null);
    } catch {
      if (!isCurrentRun()) return;
      if (cached) {
        setFacts(cached.data);
        setUsingSavedData(true);
      } else {
        setFacts(null);
        setError('No pudimos calcular tus insignias de actividad.');
      }
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, user]);

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
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="home" />

      {fromProfile ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver a Perfil" style={[styles.backButton, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={backToProfile}>
          <MaterialIcons name="arrow-back" size={21} color={format.accentDark} />
          <Text style={[styles.backText, { color: format.accentDark }]}>Perfil</Text>
        </Pressable>
      ) : null}

      {usingSavedData ? (
        <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando insignias guardadas" />
      ) : null}

      {loading && !facts ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Calculando insignias...</Text></View> : null}
      {error && !facts ? <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.stateTitle, { color: format.cardText }]}>{error}</Text></View> : null}

      {facts ? ((premium ? ['attendance', 'practice', 'visits', 'streak'] : ['attendance', 'practice', 'streak']) as ActivityAchievementMetric[]).map((metric) => (
        <AchievementCategory key={metric} metric={metric} facts={facts} format={format} premium={premium} />
      )) : null}
    </KeyboardAwareScreen>
  );
}

function AchievementCategory({ metric, facts, format, premium }: { metric: ActivityAchievementMetric; facts: ClientActivityFacts; format: ReturnType<typeof resolveUcapsaFormat>; premium: boolean }) {
  const meta = categoryMeta[metric];
  const tone = ucapsaColorKeyPalette[meta.tone];
  const value = activityAchievementValue(metric, facts);
  const definitions = activityAchievementDefinitions.filter((item) => item.metric === metric);
  const unlocked = definitions.filter((item) => value >= item.threshold).length;
  const nextIndex = definitions.findIndex((item) => value < item.threshold);

  return (
    <View style={[styles.categoryCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <View style={styles.categoryHeader}>
        <View style={[styles.categoryIcon, { backgroundColor: tone.soft }]}>
          <MaterialIcons name={meta.icon} size={24} color={tone.text} />
        </View>
        <Text style={[styles.categoryTitle, { color: format.cardText }]}>{meta.title}</Text>
        <View style={[styles.categoryValuePill, { backgroundColor: tone.soft }]}>
          <Text style={[styles.categoryValue, { color: tone.text }]}>{value}</Text>
        </View>
      </View>

      <View style={styles.roadmap}>
        <View style={[styles.roadmapRail, { backgroundColor: premium ? ucapsaBrand.colors.premiumBorder : format.border }]} />
        {definitions.map((definition, index) => {
          const isUnlocked = value >= definition.threshold;
          const isNext = !isUnlocked && index === nextIndex;
          const isTopTier = index === definitions.length - 1;
          const position = index % 4 === 0 ? 'center' : index % 4 === 1 ? 'right' : index % 4 === 2 ? 'center' : 'left';
          const alignStyle = position === 'left'
            ? styles.roadmapStepLeft
            : position === 'right'
              ? styles.roadmapStepRight
              : styles.roadmapStepCenter;

          return (
            <View key={definition.code} style={[styles.roadmapStep, alignStyle]}>
              <View
                accessibilityLabel={`${definition.title}. ${isUnlocked ? 'Conseguido' : isNext ? 'Siguiente objetivo' : 'Bloqueado'}. ${definition.threshold}`}
                style={[
                  styles.roadmapNode,
                  isTopTier && styles.roadmapNodeTop,
                  {
                    backgroundColor: isUnlocked ? tone.accent : isNext ? tone.soft : format.surfaceAlt,
                    borderColor: isUnlocked || isNext ? tone.accent : format.cardBorder,
                  },
                  isNext && styles.roadmapNodeNext,
                ]}
              >
                <MaterialIcons
                  name={definition.icon}
                  size={isTopTier ? 31 : 27}
                  color={isUnlocked ? ucapsaBrand.colors.surface : isNext ? tone.text : format.muted}
                />
                {isUnlocked ? (
                  <View style={[styles.roadmapCheck, { backgroundColor: ucapsaBrand.colors.surface }]}>
                    <MaterialIcons name="check" size={12} color={tone.text} />
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={2}
                style={[
                  styles.roadmapTitle,
                  { color: isUnlocked || isNext ? format.cardText : format.muted },
                  isNext && { color: tone.text },
                ]}
              >
                {definition.title}
              </Text>
              <Text style={[styles.roadmapThreshold, { color: isUnlocked || isNext ? tone.text : format.muted }]}>
                {definition.threshold}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.categoryFooter, { backgroundColor: tone.soft }]}>
        <MaterialIcons name={unlocked === definitions.length ? 'verified' : 'flag'} size={17} color={tone.text} />
        <Text style={[styles.categoryFooterText, { color: tone.text }]}>
          {unlocked === definitions.length
            ? 'Ruta completada'
            : `${unlocked}/${definitions.length} · siguiente en ${definitions[nextIndex]?.threshold ?? value}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  backButton: { alignSelf: 'flex-start', minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, marginBottom: 12 },
  backText: { fontSize: 13, fontWeight: '900' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  stateCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  stateTitle: { fontSize: 17, fontWeight: '900' },
  categoryCard: { gap: 14, borderWidth: 1, borderRadius: 25, padding: 15, marginBottom: 15 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { flex: 1, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  categoryValuePill: { minWidth: 48, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 11 },
  categoryValue: { fontSize: 16, lineHeight: 20, fontWeight: '900' },
  roadmap: { position: 'relative', gap: 3, paddingVertical: 4 },
  roadmapRail: { position: 'absolute', top: 38, bottom: 38, left: '50%', width: 4, marginLeft: -2, borderRadius: 999 },
  roadmapStep: { minHeight: 122, width: '100%', alignItems: 'center', justifyContent: 'center' },
  roadmapStepLeft: { paddingRight: '45%' },
  roadmapStepCenter: { paddingHorizontal: '22%' },
  roadmapStepRight: { paddingLeft: '45%' },
  roadmapNode: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  roadmapNodeTop: { width: 78, height: 78, borderRadius: 39 },
  roadmapNodeNext: { transform: [{ scale: 1.07 }] },
  roadmapCheck: { position: 'absolute', right: -5, top: -5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  roadmapTitle: { maxWidth: 128, marginTop: 7, textAlign: 'center', fontSize: 11, lineHeight: 15, fontWeight: '900' },
  roadmapThreshold: { marginTop: 1, fontSize: 10, lineHeight: 13, fontWeight: '900' },
  categoryFooter: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 10 },
  categoryFooterText: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
});
