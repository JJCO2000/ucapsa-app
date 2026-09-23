
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import {
  getAccountCompetitionSeasons,
  getCachedCompetitionLeaderboard,
  getCachedMyCompetitionAccount,
  refreshCompetitionLeaderboard,
  refreshMyCompetitionAccount,
  type ClientAccountCompetitionSnapshot,
  type ClientCompetitionLeaderboardRow,
} from '../../services/client-competition.service';
import { recordValueExposure } from '../../services/continuity-evidence.service';

function statusLabel(status: string | null | undefined) {
  if (status === 'active') return 'Activa';
  if (status === 'reopened') return 'Reabierta';
  if (status === 'closed') return 'Cerrada';
  return status || 'Temporada';
}

export default function ClientCompetitionScreen() {
  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const [snapshot, setSnapshot] = useState<ClientAccountCompetitionSnapshot | null>(null);
  const [rows, setRows] = useState<ClientCompetitionLeaderboardRow[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [rankingReady, setRankingReady] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);

  const applySnapshot = useCallback((next: ClientAccountCompetitionSnapshot) => {
    setSnapshot(next);
    const seasons = getAccountCompetitionSeasons(next);
    setSelectedSeasonId((current) => {
      if (current && seasons.some((season) => season.season_id === current)) return current;
      return seasons.find((season) => season.season_status === 'active')?.season_id
        ?? seasons.find((season) => season.season_status === 'reopened')?.season_id
        ?? seasons[0]?.season_id
        ?? null;
    });
  }, []);

  const loadAccount = useCallback(async () => {
    if (!user || isAdmin) {
      setLocalReady(true);
      return;
    }

    setError(null);
    setUsingSavedData(false);

    const cached = await getCachedMyCompetitionAccount(user.id);
    if (cached) {
      applySnapshot(cached.data);
      setSavedAt(cached.saved_at);
      setLocalReady(true);
    }

    try {
      const fresh = await refreshMyCompetitionAccount(user.id);
      applySnapshot(fresh.data);
      setSavedAt(fresh.saved_at);
      setUsingSavedData(false);
      setLocalReady(true);
    } catch (cause) {
      setLocalReady(true);
      if (cached) {
        setUsingSavedData(true);
        setSavedAt(cached.saved_at);
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar la competencia.');
      }
    }
  }, [applySnapshot, isAdmin, user]);

  const loadRanking = useCallback(async (seasonId: string) => {
    if (!user || isAdmin || !seasonId) {
      setRows([]);
      setRankingReady(true);
      return;
    }

    setRankingReady(false);
    const cached = await getCachedCompetitionLeaderboard(user.id, seasonId);
    if (cached) {
      setRows(cached.data);
      setRankingReady(true);
    }

    try {
      const fresh = await refreshCompetitionLeaderboard(user.id, seasonId);
      setRows(fresh.data);
      setRankingReady(true);
    } catch {
      setRankingReady(true);
      if (!cached) setRows([]);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    void loadAccount();
    return () => setScreenFocused(false);
  }, [loadAccount]));

  useEffect(() => {
    if (!selectedSeasonId) {
      setRows([]);
      setRankingReady(true);
      return;
    }
    void loadRanking(selectedSeasonId);
  }, [loadRanking, selectedSeasonId]);

  async function refresh() {
    setRefreshing(true);
    try {
      await loadAccount();
      if (selectedSeasonId) await loadRanking(selectedSeasonId);
    } finally {
      setRefreshing(false);
    }
  }

  const seasons = useMemo(() => snapshot ? getAccountCompetitionSeasons(snapshot) : [], [snapshot]);
  const selectedSeason = seasons.find((season) => season.season_id === selectedSeasonId) ?? null;
  const myDogIds = useMemo(() => new Set((snapshot?.dogs ?? []).map((dog) => dog.dog_id)), [snapshot]);
  const myRankingRows = useMemo(
    () => rows.filter((row) => row.dog_id && myDogIds.has(row.dog_id)),
    [myDogIds, rows],
  );
  const rankingByDogId = useMemo(
    () => new Map(myRankingRows.filter((row) => row.dog_id).map((row) => [row.dog_id as string, row])),
    [myRankingRows],
  );

  useEffect(() => {
    if (!user || isAdmin || !screenFocused || !localReady || error || !selectedSeasonId || !snapshot) return;
    const visibleDogIds = snapshot.dogs
      .filter((dog) => dog.seasons.some((season) => season.season_id === selectedSeasonId))
      .map((dog) => dog.dog_id);
    if (visibleDogIds.length === 0) return;

    const timer = setTimeout(() => {
      void Promise.allSettled(
        visibleDogIds.map((dogId) =>
          recordValueExposure(user.id, dogId, selectedSeasonId, 'constancy_summary'),
        ),
      ).catch((cause) => devWarn('Could not persist account competition value exposure.', cause));
    }, 750);

    return () => clearTimeout(timer);
  }, [error, isAdmin, localReady, screenFocused, selectedSeasonId, snapshot, user]);

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>COMPETENCIA UCAPSA</Text>
        <Text style={[styles.title, { color: format.cardText }]}>Tus perros</Text>
        <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
          Revisa en un solo lugar cómo van tus perros y entra al Ranking sin recorrer varias pantallas.
        </Text>
      </View>

      {usingSavedData ? (
        <OfflineDataNotice
          savedAt={savedAt}
          onRetry={() => void refresh()}
          premium={premium}
          label="Mostrando competencia guardada"
        />
      ) : null}

      {!localReady ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cargando competencia…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>No pudimos cargar la competencia</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
            Conéctate una vez para guardar esta información en el dispositivo.
          </Text>
        </View>
      ) : null}

      {localReady && !error && snapshot ? (
        snapshot.dogs.length === 0 ? (
          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <MaterialIcons name="pets" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            <Text style={[styles.cardTitle, { color: format.cardText }]}>Primero registra un perro</Text>
            <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cuando tengas perros activos, aquí aparecerá su competencia.</Text>
          </View>
        ) : (
          <>
            {seasons.length > 0 ? (
              <View style={styles.pills}>
                {seasons.map((season) => {
                  const selected = season.season_id === selectedSeasonId;
                  return (
                    <Pressable
                      key={season.season_id ?? season.season_code ?? 'season'}
                      style={[
                        styles.pill,
                        {
                          borderColor: selected ? format.accent : format.cardBorder,
                          backgroundColor: selected ? format.pillBackground : format.cardBackground,
                        },
                      ]}
                      onPress={() => setSelectedSeasonId(season.season_id)}
                    >
                      <Text style={[styles.pillText, { color: selected ? format.pillText : format.cardText }]}>
                        {(season.season_name || 'Temporada') + ' · ' + statusLabel(season.season_status)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {!selectedSeason ? (
              <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
                <Text style={[styles.cardTitle, { color: format.cardText }]}>Sin temporada competitiva</Text>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cuando UCAPSA active una temporada aparecerá aquí.</Text>
              </View>
            ) : (
              <>
                <Pressable
                  style={[
                    styles.rankingCard,
                    {
                      backgroundColor: premium ? ucapsaBrand.colors.premiumHero : format.accent,
                      borderColor: premium ? ucapsaBrand.colors.premiumBorderStrong : format.accent,
                    },
                  ]}
                  onPress={() => {
                    if (!selectedSeason.season_id) return;
                    router.push(('/client/competition-ranking?seasonId=' + encodeURIComponent(selectedSeason.season_id)) as never);
                  }}
                >
                  <View style={styles.rankingTop}>
                    <View style={[styles.rankingIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.cardBackground }]}>
                      <MaterialIcons name="emoji-events" size={25} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rankingEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.primaryButtonText }]}>RANKING UCAPSA</Text>
                      <Text style={[styles.rankingTitle, { color: premium ? ucapsaBrand.colors.premiumText : format.primaryButtonText }]}>Ver clasificación completa</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.primaryButtonText} />
                  </View>

                  <View style={styles.myPositions}>
                    {!rankingReady ? (
                      <Text style={[styles.rankingMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.primaryButtonText }]}>Actualizando posiciones…</Text>
                    ) : myRankingRows.length > 0 ? (
                      myRankingRows.map((row) => (
                        <View key={row.dog_id ?? String(row.ranking_position)} style={[styles.positionPill, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.cardBackground }]}>
                          <Text style={[styles.positionName, { color: premium ? ucapsaBrand.colors.premiumText : format.cardText }]}>{row.dog_name || 'Tu perro'}</Text>
                          <Text style={[styles.positionValue, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>#{Number(row.ranking_position ?? 0)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.rankingMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.primaryButtonText }]}>Tus perros aún no ocupan una posición oficial.</Text>
                    )}
                  </View>
                </Pressable>

                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Tus perros esta temporada</Text>
                <View style={styles.dogList}>
                  {snapshot.dogs.map((dog) => {
                    const season = dog.seasons.find((item) => item.season_id === selectedSeasonId) ?? null;
                    const ranking = rankingByDogId.get(dog.dog_id) ?? null;
                    const officialExams = dog.official_exams.filter((exam) => exam.season_id === selectedSeasonId);

                    return (
                      <View key={dog.dog_id} style={[styles.dogCard, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
                        <View style={styles.dogTop}>
                          <View style={[styles.dogIcon, { backgroundColor: format.pillBackground }]}>
                            <MaterialIcons name="pets" size={21} color={format.pillText} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.dogName, { color: format.cardText }]}>{dog.dog_name}</Text>
                            <Text style={[styles.dogMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                              {ranking
                                ? ('#' + Number(ranking.ranking_position ?? 0) + ' en Ranking · ' + (ranking.range_name || season?.range_name || 'Cobre'))
                                : season
                                  ? ((season.range_name || 'Cobre') + ' · aún sin posición oficial')
                                  : 'Sin actividad en esta temporada'}
                            </Text>
                          </View>
                          {ranking ? (
                            <View style={[styles.rankBadge, { backgroundColor: format.accentSoft }]}>
                              <Text style={[styles.rankBadgeText, { color: format.accentDark }]}>#{Number(ranking.ranking_position ?? 0)}</Text>
                            </View>
                          ) : null}
                        </View>

                        {season ? (
                          <View style={styles.dogStats}>
                            <Stat label="Actividades" value={String(Number(season.constancy_events_count ?? 0))} />
                            <Stat label="Exámenes" value={String(officialExams.length)} />
                            <Stat label="Pendientes" value={String(Number(season.missing_required_exams_count ?? 0))} />
                          </View>
                        ) : null}

                        <Pressable
                          style={[styles.detailButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
                          onPress={() => router.push(('/client/competition-dog?dogId=' + encodeURIComponent(dog.dog_id)) as never)}
                        >
                          <Text style={[styles.detailButtonText, { color: format.secondaryButtonText }]}>Ver constancia y exámenes</Text>
                          <MaterialIcons name="chevron-right" size={19} color={format.secondaryButtonText} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 14 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  card: { gap: 9, borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 11 },
  cardTitle: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 11 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  pillText: { fontSize: 9, fontWeight: '900' },
  rankingCard: { borderRadius: 22, borderWidth: 1, padding: 14, marginBottom: 16, gap: 11 },
  rankingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankingIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rankingEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, opacity: 0.9 },
  rankingTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', marginTop: 1 },
  rankingMeta: { fontSize: 11, lineHeight: 16, fontWeight: '800' },
  myPositions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  positionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  positionName: { fontSize: 10, fontWeight: '900' },
  positionValue: { fontSize: 10, fontWeight: '900' },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', marginBottom: 8 },
  dogList: { gap: 9 },
  dogCard: { borderRadius: 20, borderWidth: 1, padding: 13, gap: 10 },
  dogTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dogIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dogName: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  dogMeta: { fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  rankBadge: { minWidth: 40, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  rankBadgeText: { fontSize: 11, fontWeight: '900' },
  dogStats: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: ucapsaBrand.colors.surfaceSubtle, paddingVertical: 8, paddingHorizontal: 5 },
  statValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  statLabel: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '800', marginTop: 1 },
  detailButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 13, borderWidth: 1, paddingHorizontal: 10 },
  detailButtonText: { fontSize: 11, fontWeight: '900' },
});
