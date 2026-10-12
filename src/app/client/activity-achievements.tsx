import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { activityAchievementDefinitions, buildActivityAchievementCollections, type ActivityAchievementCollection, type ActivityAchievementMetric } from '../../constants/activityAchievements';
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
  const [selectedMetric, setSelectedMetric] = useState<ActivityAchievementMetric | null>(
    activityAchievementDefinitions.find((item) => item.code === deepLinkedCode)?.metric ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadRunRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';
  // El deep link antiguo (?code=attendance_5) abre la categoría de ese nivel.
  useEffect(() => {
    setSelectedMetric(activityAchievementDefinitions.find((item) => item.code === deepLinkedCode)?.metric ?? null);
  }, [deepLinkedCode]);

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

  const collections = useMemo(
    () => facts ? buildActivityAchievementCollections(facts, { includeMemberVisits: premium && !scopedDogId }) : [],
    [facts, premium, scopedDogId],
  );
  const selectedCollection = collections.find((item) => item.metric === selectedMetric) ?? null;

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
        <>
          <View style={[styles.collectionCard, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.collectionEyebrow, { color: format.accentDark }]}>COLECCIÓN UCAPSA</Text>
              <Text style={[styles.collectionTitle, { color: format.cardText }]}>Tus insignias</Text>
            </View>
            <View style={[styles.collectionCount, { backgroundColor: format.secondaryButton }]}>
              <MaterialIcons name="military-tech" size={22} color={format.accentDark} />
              <Text style={[styles.collectionTotal, { color: format.cardText }]}>{collections.length}</Text>
            </View>
          </View>

          <View style={styles.badgeGrid}>
            {collections.map((collection) => {
              const tone = ucapsaColorKeyPalette[collection.tone];
              return (
                <Pressable
                  key={collection.metric}
                  accessibilityRole="button"
                  accessibilityLabel={`${collection.title}, nivel ${collection.currentLevel} de ${collection.totalLevels}. Ver detalle`}
                  style={[styles.badgeCell, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}
                  onPress={() => setSelectedMetric(collection.metric)}
                >
                  <View style={[styles.badgeShield, { backgroundColor: collection.currentLevel ? tone.soft : format.surfaceAlt, borderColor: collection.currentLevel ? tone.accent : format.cardBorder }]}>
                    <MaterialIcons
                      name={collection.icon}
                      size={39}
                      color={collection.currentLevel ? tone.text : format.muted}
                    />
                    {collection.currentLevel > 0 ? (
                      <View style={[styles.badgeLevelDot, { backgroundColor: tone.accent }]}>
                        <Text style={styles.badgeLevelDotText}>{collection.currentLevel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text numberOfLines={2} style={[styles.badgeName, { color: format.cardText }]}>{collection.title}</Text>
                  <Text style={[styles.badgeLevel, { color: collection.currentLevel ? tone.text : format.muted }]}>
                    Nivel {collection.currentLevel} de {collection.totalLevels}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Modal visible={Boolean(selectedCollection)} animationType="slide" onRequestClose={() => setSelectedMetric(null)}>
        <SafeAreaView style={styles.detailPage}>
          <View style={styles.detailHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalle de insignia" onPress={() => setSelectedMetric(null)} style={styles.detailBack}>
              <MaterialIcons name="close" size={28} color={ucapsaBrand.colors.surface} />
            </Pressable>
            <Text style={styles.detailHeaderTitle}>Colección UCAPSA</Text>
            <View style={styles.detailBack} />
          </View>
          {selectedCollection ? (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              <AchievementCollectionDetail collection={selectedCollection} />
              <Pressable accessibilityRole="button" style={styles.detailCloseButton} onPress={() => setSelectedMetric(null)}>
                <Text style={styles.detailCloseText}>VER MIS INSIGNIAS</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </KeyboardAwareScreen>
  );
}

function AchievementCollectionDetail({ collection }: { collection: ActivityAchievementCollection }) {
  const tone = ucapsaColorKeyPalette[collection.tone];
  const next = collection.nextDefinition;
  const reachedMax = collection.currentLevel === collection.totalLevels;
  const progress = next ? Math.min(100, Math.round(collection.value / next.threshold * 100)) : 100;
  return (
    <View style={styles.detailContent}>
      <View style={[styles.detailGlow, { backgroundColor: tone.soft }]}>
        <View style={[styles.detailMedal, { backgroundColor: collection.currentLevel ? tone.accent : ucapsaBrand.colors.gray, borderColor: tone.text }]}>
          <MaterialIcons name={collection.icon} size={86} color={ucapsaBrand.colors.surface} />
        </View>
      </View>
      <Text style={styles.detailTitle}>{collection.title}</Text>
      <Text style={styles.detailLevel}>Nivel {collection.currentLevel} de {collection.totalLevels}</Text>
      <Text style={styles.detailDescription}>
        {collection.earnedDefinition?.description ?? 'Consigue tu primer nivel para desbloquear esta insignia.'}
      </Text>
      <View style={styles.detailStats}>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatValue}>{collection.value}</Text>
          <Text style={styles.detailStatLabel}>Acumulado</Text>
        </View>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatValue}>{next ? next.threshold : '✓'}</Text>
          <Text style={styles.detailStatLabel}>{next ? 'Próxima meta' : 'Completada'}</Text>
        </View>
      </View>
      <View style={styles.detailProgressTrack}>
        <View style={[styles.detailProgressFill, { width: `${progress}%` as const, backgroundColor: tone.accent }]} />
      </View>
      <Text style={styles.detailHint}>
        {reachedMax ? '¡Alcanzaste el nivel máximo!' : `Faltan ${Math.max(0, next!.threshold - collection.value)} para el nivel ${collection.currentLevel + 1}.`}
      </Text>
      <Text style={styles.detailSectionTitle}>Todos los niveles</Text>
      {collection.levels.map((level, index) => {
        const unlocked = index < collection.currentLevel;
        return (
          <View key={level.code} style={styles.detailMilestone}>
            <View style={[styles.detailMilestoneIcon, { backgroundColor: unlocked ? tone.soft : ucapsaBrand.colors.graySoft }]}>
              <MaterialIcons name={unlocked ? 'check-circle' : 'lock-outline'} size={19} color={unlocked ? tone.text : ucapsaBrand.colors.gray} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMilestoneTitle}>Nivel {index + 1} · {level.title}</Text>
              <Text style={styles.detailMilestoneDescription}>{level.description}</Text>
            </View>
            <Text style={styles.detailMilestoneThreshold}>{level.threshold}</Text>
          </View>
        );
      })}
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
  collectionCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  collectionEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  collectionTitle: { fontSize: 25, fontWeight: '900', marginTop: 4 },
  collectionCount: { minWidth: 63, minHeight: 55, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  collectionTotal: { fontSize: 16, fontWeight: '900' },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 24 },
  badgeCell: { width: '31%', minWidth: 0, alignItems: 'center', borderRadius: 17, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 2, minHeight: 166 },
  badgeShield: { width: 77, height: 78, borderRadius: 27, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  badgeLevelDot: { position: 'absolute', right: -6, top: -7, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeLevelDotText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  badgeName: { fontSize: 12, fontWeight: '900', textAlign: 'center', marginTop: 13, minHeight: 32, lineHeight: 16 },
  badgeLevel: { fontSize: 10, fontWeight: '900', marginTop: 6, textAlign: 'center' },
  detailPage: { flex: 1, backgroundColor: ucapsaBrand.colors.redDeeper, paddingHorizontal: 20 },
  detailHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailBack: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { fontSize: 14, fontWeight: '900', color: ucapsaBrand.colors.surface },
  detailScroll: { flexGrow: 1, paddingBottom: 26 },
  detailContent: { alignItems: 'center', gap: 12 },
  detailGlow: { width: 166, height: 166, borderRadius: 62, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  detailMedal: { width: 140, height: 140, borderRadius: 49, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { color: ucapsaBrand.colors.surface, fontSize: 27, lineHeight: 33, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  detailLevel: { color: ucapsaBrand.colors.goldSoft, fontSize: 16, fontWeight: '900' },
  detailDescription: { color: ucapsaBrand.colors.redSoft, fontSize: 13, lineHeight: 19, textAlign: 'center', fontWeight: '700' },
  detailStats: { flexDirection: 'row', alignSelf: 'stretch', gap: 10, marginTop: 9 },
  detailStat: { flex: 1, minHeight: 65, backgroundColor: ucapsaBrand.colors.redDark, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 8 },
  detailStatValue: { fontSize: 21, fontWeight: '900', color: ucapsaBrand.colors.surface },
  detailStatLabel: { fontSize: 10, color: ucapsaBrand.colors.redSoft, fontWeight: '700' },
  detailProgressTrack: { height: 12, alignSelf: 'stretch', borderRadius: 8, overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redDark, marginTop: 5 },
  detailProgressFill: { height: '100%', borderRadius: 8 },
  detailHint: { fontSize: 12, fontWeight: '800', color: ucapsaBrand.colors.surface },
  detailSectionTitle: { color: ucapsaBrand.colors.surface, fontSize: 17, fontWeight: '900', marginTop: 16, alignSelf: 'flex-start', marginBottom: 2 },
  detailMilestone: { width: '100%', flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: ucapsaBrand.colors.redDark, paddingVertical: 10, gap: 9 },
  detailMilestoneIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  detailMilestoneTitle: { fontSize: 12, fontWeight: '900', color: ucapsaBrand.colors.surface },
  detailMilestoneDescription: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: ucapsaBrand.colors.redSoft, marginTop: 3 },
  detailMilestoneThreshold: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 13 },
  detailCloseButton: { minHeight: 53, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: ucapsaBrand.colors.surface, marginTop: 24 },
  detailCloseText: { color: ucapsaBrand.colors.redDeep, fontSize: 13, fontWeight: '900' },
});
