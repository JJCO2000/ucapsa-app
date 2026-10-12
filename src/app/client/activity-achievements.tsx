import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { activityAchievementCategoryMeta, activityAchievementDefinitions, activityAchievementValue, type ActivityAchievementDefinition, type ActivityAchievementMetric } from '../../constants/activityAchievements';
import { ucapsaBrand, ucapsaColorKeyPalette } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useReturnToProfile } from '../../hooks/useReturnToProfile';
import { useSession } from '../../hooks/useSession';
import {
  getCachedMyClientActivityFacts,
  getCachedDogActivityFacts,
  getMyClientActivityFacts,
  getMyDogActivityFacts,
  type ClientActivityFacts,
} from '../../services/client-activity.service';


export default function ActivityAchievementsScreen() {
  const { from, dogId, code } = useLocalSearchParams<{ from?: string | string[]; dogId?: string | string[]; code?: string | string[] }>();
  const scopedDogId = typeof dogId === 'string' ? dogId : null;
  const deepLinkedCode = typeof code === 'string' ? code : null;
  const fromProfile = (Array.isArray(from) ? from[0] : from) === 'profile';
  const backToProfile = useReturnToProfile(fromProfile);
  const { user, role, isAdmin } = useSession();
  const [facts, setFacts] = useState<ClientActivityFacts | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(deepLinkedCode);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadRunRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';
  useEffect(() => { setSelectedCode(deepLinkedCode); }, [deepLinkedCode]);
  const selectedDefinition = activityAchievementDefinitions.find((item) =>
    item.code === selectedCode && (!scopedDogId || item.metric !== 'visits')
  ) ?? null;
  const selectedProgress = selectedDefinition && facts ? activityAchievementValue(selectedDefinition.metric, facts) : null;

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    if (!user || isAdmin) return;

    setError(null);
    setUsingSavedData(false);

    const cached = scopedDogId
      ? await getCachedDogActivityFacts(user.id, scopedDogId)
      : await getCachedMyClientActivityFacts(user.id);
    if (!isCurrentRun()) return;
    if (cached) {
      setFacts(cached.data);
      setSavedAt(cached.saved_at);
      setLoading(false);
    }

    try {
      const fresh = scopedDogId
        ? await getMyDogActivityFacts(user.id, scopedDogId)
        : await getMyClientActivityFacts(user.id);
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
  }, [isAdmin, scopedDogId, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const visibleMetrics: ActivityAchievementMetric[] = premium && !scopedDogId
    ? ['attendance', 'practice', 'visits', 'streak']
    : ['attendance', 'practice', 'streak'];
  const visibleDefinitions = activityAchievementDefinitions.filter((item) => visibleMetrics.includes(item.metric));
  const earnedCount = facts
    ? visibleDefinitions.filter((item) => activityAchievementValue(item.metric, facts) >= item.threshold).length
    : 0;
  const completion = visibleDefinitions.length ? (earnedCount / visibleDefinitions.length) * 100 : 0;
  const nextAchievement = facts
    ? visibleDefinitions
      .filter((item) => activityAchievementValue(item.metric, facts) < item.threshold)
      .sort((left, right) =>
        activityAchievementValue(right.metric, facts) / right.threshold
        - activityAchievementValue(left.metric, facts) / left.threshold
        || left.threshold - right.threshold,
      )[0] ?? null
    : null;

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


      {facts ? (
        <View style={[styles.collectionCard, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <View style={styles.collectionHeader}>
            <View style={styles.collectionLabelBlock}>
              <Text style={[styles.collectionEyebrow, { color: format.accentDark }]}>COLECCIÓN UCAPSA</Text>
              <Text style={[styles.collectionTitle, { color: format.cardText }]}>Tus insignias</Text>
              <Text style={[styles.collectionSubtitle, { color: format.muted }]}>Cada logro cuenta una historia.</Text>
            </View>
            <View style={[styles.collectionCount, { backgroundColor: format.secondaryButton }]}>
              <MaterialIcons name="emoji-events" size={21} color={format.accentDark} />
              <Text style={[styles.collectionNumber, { color: format.cardText }]}>{earnedCount}</Text>
              <Text style={[styles.collectionTotal, { color: format.muted }]}>de {visibleDefinitions.length}</Text>
            </View>
          </View>
          <View style={[styles.collectionTrack, { backgroundColor: format.border }]}>
            <View style={[styles.collectionFill, { width: `${completion}%` as const, backgroundColor: format.accent }]} />
          </View>
          {nextAchievement ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Siguiente insignia: ' + nextAchievement.title}
              onPress={() => setSelectedCode(nextAchievement.code)}
              style={[styles.nextCard, { backgroundColor: format.secondaryButton }]}
            >
              <MaterialIcons name={nextAchievement.icon} size={22} color={ucapsaColorKeyPalette[activityAchievementCategoryMeta[nextAchievement.metric].tone].text} />
              <View style={styles.nextCopy}>
                <Text style={[styles.nextKicker, { color: format.accentDark }]}>TU SIGUIENTE LOGRO</Text>
                <Text numberOfLines={1} style={[styles.nextTitle, { color: format.cardText }]}>{nextAchievement.title}</Text>
              </View>
              <Text style={[styles.nextProgress, { color: format.cardText }]}>
                {activityAchievementValue(nextAchievement.metric, facts)}/{nextAchievement.threshold}
              </Text>
              <MaterialIcons name="chevron-right" size={19} color={format.muted} />
            </Pressable>
          ) : (
            <View style={styles.completeRow}>
              <MaterialIcons name="verified" size={20} color={ucapsaBrand.colors.success} />
              <Text style={[styles.completeText, { color: format.cardText }]}>¡Colección completada!</Text>
            </View>
          )}
        </View>
      ) : null}

      {facts ? visibleMetrics.map((metric) => (
        <AchievementCategory key={metric} metric={metric} facts={facts} format={format} onSelect={(item) => setSelectedCode(item.code)} />
      )) : null}

      <Modal visible={Boolean(selectedDefinition)} animationType="slide" onRequestClose={() => setSelectedCode(null)}>
        <SafeAreaView style={styles.detailPage}>
          <View style={styles.detailHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar detalle de insignia"
              onPress={() => setSelectedCode(null)}
              style={styles.detailBack}
            >
              <MaterialIcons name="close" size={29} color={ucapsaBrand.colors.surface} />
            </Pressable>
            <Text style={styles.detailHeaderTitle}>Insignia UCAPSA</Text>
            <View style={styles.detailBack} />
          </View>
          {selectedDefinition ? (() => {
            const meta = activityAchievementCategoryMeta[selectedDefinition.metric];
            const tone = ucapsaColorKeyPalette[meta.tone];
            const earned = selectedProgress !== null && selectedProgress >= selectedDefinition.threshold;
            return (
              <>
                <View style={styles.detailCenter}>
                  <View style={[styles.detailGlow, { backgroundColor: tone.soft }]}>
                    <View style={[styles.detailMedal, { backgroundColor: earned ? tone.accent : ucapsaBrand.colors.gray, borderColor: tone.text }]}>
                      <MaterialIcons
                        name={selectedDefinition.icon}
                        size={94}
                        color={ucapsaBrand.colors.surface}
                      />
                      <View style={styles.detailMedalNumber}>
                        <Text style={[styles.detailMedalNumberText, { color: earned ? tone.text : ucapsaBrand.colors.grayDark }]}>
                          {selectedDefinition.threshold}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.detailState}>{earned ? 'CONSEGUIDA' : 'POR DESBLOQUEAR'}</Text>
                  <Text style={styles.detailTitle}>{selectedDefinition.title}</Text>
                  <Text style={styles.detailDescription}>{selectedDefinition.description}</Text>
                  {selectedProgress !== null ? (
                    <View style={styles.detailProgressBox}>
                      <Text style={styles.detailProgressText}>
                        {earned ? '¡Lo lograste!' : 'Tu progreso'} · {Math.min(selectedProgress, selectedDefinition.threshold)} de {selectedDefinition.threshold}
                      </Text>
                      <View style={styles.detailProgressTrack}>
                        <View style={[styles.detailProgressFill, {
                          width: `${Math.min(100, 100 * selectedProgress / selectedDefinition.threshold)}%` as const,
                          backgroundColor: tone.accent,
                        }]} />
                      </View>
                    </View>
                  ) : null}
                </View>
                <Pressable accessibilityRole="button" style={styles.detailCloseButton} onPress={() => setSelectedCode(null)}>
                  <Text style={styles.detailCloseText}>VER MIS INSIGNIAS</Text>
                </Pressable>
              </>
            );
          })() : null}
        </SafeAreaView>
      </Modal>
    </KeyboardAwareScreen>
  );
}

function AchievementCategory({ metric, facts, format, onSelect }: {
  metric: ActivityAchievementMetric;
  facts: ClientActivityFacts;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onSelect: (item: ActivityAchievementDefinition) => void;
}) {
  const meta = activityAchievementCategoryMeta[metric];
  const tone = ucapsaColorKeyPalette[meta.tone];
  const value = activityAchievementValue(metric, facts);
  const definitions = activityAchievementDefinitions.filter((item) => item.metric === metric);
  const unlocked = definitions.filter((item) => value >= item.threshold).length;
  return (
    <View style={styles.categorySection}>
      <View style={styles.categoryTop}>
        <View style={[styles.categoryIcon, { backgroundColor: tone.soft }]}>
          <MaterialIcons name={meta.icon} size={21} color={tone.text} />
        </View>
        <View style={styles.categoryNameBlock}>
          <Text style={[styles.categoryTitle, { color: format.cardText }]}>{meta.title}</Text>
          <Text style={[styles.categorySub, { color: format.muted }]}>{unlocked} de {definitions.length} conseguidas</Text>
        </View>
      </View>
      <View style={styles.badgeGrid}>
        {definitions.map((definition) => {
          const earned = value >= definition.threshold;
          const next = !earned && !definitions.some((other) => other.threshold < definition.threshold && value < other.threshold);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={definition.title + '. ' + (earned ? 'Conseguida' : 'Progreso ' + value + ' de ' + definition.threshold)}
              onPress={() => onSelect(definition)}
              key={definition.code}
              style={styles.badgeCell}
            >
              <View style={[styles.badgeShield, {
                backgroundColor: earned ? tone.soft : format.surfaceAlt,
                borderColor: earned ? tone.accent : format.cardBorder,
              }]}>
                <MaterialIcons
                  name={definition.icon}
                  size={38}
                  color={earned ? tone.text : format.muted}
                  style={!earned ? styles.lockedIcon : undefined}
                />
                <View style={[styles.badgeNumber, { backgroundColor: earned ? tone.accent : format.border }]}>
                  <Text style={[styles.badgeNumberText, { color: earned ? ucapsaBrand.colors.surface : format.muted }]}>{definition.threshold}</Text>
                </View>
                {earned ? (
                  <View style={[styles.badgeCheck, { backgroundColor: tone.accent }]}>
                    <MaterialIcons name="check" size={12} color={ucapsaBrand.colors.surface} />
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={2} style={[styles.badgeName, { color: earned || next ? format.cardText : format.muted }]}>{definition.title}</Text>
              <Text style={[styles.badgeProgress, { color: earned ? tone.text : format.muted }]}>
                {earned ? 'Conseguida' : Math.min(value, definition.threshold) + ' de ' + definition.threshold}
              </Text>
            </Pressable>
          );
        })}
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

  collectionCard: { borderWidth: 1, borderRadius: 21, padding: 17, marginBottom: 23 },
  collectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collectionLabelBlock: { flex: 1 },
  collectionEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  collectionTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: 3 },
  collectionSubtitle: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  collectionCount: { minWidth: 70, minHeight: 73, alignItems: 'center', justifyContent: 'center', borderRadius: 16, padding: 7 },
  collectionNumber: { fontSize: 21, fontWeight: '900', marginTop: 1 },
  collectionTotal: { fontSize: 10, fontWeight: '700' },
  collectionTrack: { height: 9, borderRadius: 999, overflow: 'hidden', marginTop: 15, marginBottom: 3 },
  collectionFill: { height: '100%', borderRadius: 999 },
  nextCard: { marginTop: 13, borderRadius: 14, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 },
  nextCopy: { flex: 1, minWidth: 0 },
  nextKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  nextTitle: { fontSize: 12, fontWeight: '900', marginTop: 1 },
  nextProgress: { fontSize: 12, fontWeight: '900' },
  completeRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 13 },
  completeText: { fontSize: 13, fontWeight: '900' },

  categorySection: { marginBottom: 28 },
  categoryTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  categoryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  categoryNameBlock: { flex: 1 },
  categoryTitle: { fontSize: 20, lineHeight: 24, fontWeight: '900' },
  categorySub: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 },
  badgeCell: { width: '31.5%', minHeight: 151, alignItems: 'center', justifyContent: 'flex-start' },
  badgeShield: { width: 82, height: 85, borderRadius: 27, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  lockedIcon: { opacity: 0.45 },
  badgeNumber: { position: 'absolute', bottom: -11, minWidth: 37, height: 27, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  badgeNumberText: { fontSize: 13, fontWeight: '900' },
  badgeCheck: { position: 'absolute', right: -6, top: -5, height: 22, width: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeName: { marginTop: 20, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '900', minHeight: 31 },
  badgeProgress: { marginTop: 4, textAlign: 'center', fontSize: 10, fontWeight: '800' },

  detailPage: { flex: 1, backgroundColor: ucapsaBrand.colors.redDeeper, paddingHorizontal: 24 },
  detailHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailBack: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { fontSize: 14, fontWeight: '900', color: ucapsaBrand.colors.surface },
  detailCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 17 },
  detailGlow: { width: 210, height: 222, borderRadius: 74, justifyContent: 'center', alignItems: 'center' },
  detailMedal: { width: 176, height: 184, borderRadius: 60, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  detailMedalNumber: { position: 'absolute', bottom: -23, paddingHorizontal: 18, minWidth: 75, height: 49, borderRadius: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: ucapsaBrand.colors.surface },
  detailMedalNumberText: { fontSize: 28, fontWeight: '900' },
  detailState: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: ucapsaBrand.colors.goldSoft, marginTop: 13 },
  detailTitle: { fontSize: 28, lineHeight: 35, textAlign: 'center', color: ucapsaBrand.colors.surface, fontWeight: '900' },
  detailDescription: { fontSize: 16, lineHeight: 23, color: ucapsaBrand.colors.redSoft, textAlign: 'center', fontWeight: '700' },
  detailProgressBox: { width: '100%', gap: 10, marginTop: 12 },
  detailProgressText: { textAlign: 'center', color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 14 },
  detailProgressTrack: { width: '100%', height: 13, borderRadius: 999, overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redDark },
  detailProgressFill: { height: '100%', borderRadius: 999 },
  detailCloseButton: { alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: 16, marginBottom: 20, backgroundColor: ucapsaBrand.colors.surface },
  detailCloseText: { fontSize: 14, fontWeight: '900', color: ucapsaBrand.colors.redDeep, letterSpacing: 0.4 },
});
