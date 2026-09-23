import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import {
  getCachedCompetitionLeaderboard,
  getCachedMyCompetitionAccount,
  refreshCompetitionLeaderboard,
  refreshMyCompetitionAccount,
  type ClientCompetitionLeaderboardRow,
} from '../../services/client-competition.service';

function numberLabel(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function medal(position: number) {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return null;
}

export default function ClientCompetitionRankingScreen() {
  const params = useLocalSearchParams<{ seasonId?: string | string[] }>();
  const seasonId = Array.isArray(params.seasonId) ? params.seasonId[0] ?? '' : params.seasonId ?? '';

  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const [rows, setRows] = useState<ClientCompetitionLeaderboardRow[]>([]);
  const [myDogIds, setMyDogIds] = useState<Set<string>>(new Set());
  const [localReady, setLocalReady] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin || !seasonId) {
      setLocalReady(true);
      return;
    }

    setError(null);
    setUsingSavedData(false);

    const [cachedRanking, cachedAccount] = await Promise.all([
      getCachedCompetitionLeaderboard(user.id, seasonId),
      getCachedMyCompetitionAccount(user.id),
    ]);
    if (cachedRanking) {
      setRows(cachedRanking.data);
      setSavedAt(cachedRanking.saved_at);
      setLocalReady(true);
    }
    if (cachedAccount) {
      setMyDogIds(new Set(cachedAccount.data.dogs.map((dog) => dog.dog_id)));
    }

    const [rankingResult, accountResult] = await Promise.allSettled([
      refreshCompetitionLeaderboard(user.id, seasonId),
      refreshMyCompetitionAccount(user.id),
    ]);

    if (accountResult.status === 'fulfilled') {
      setMyDogIds(new Set(accountResult.value.data.dogs.map((dog) => dog.dog_id)));
    }

    if (rankingResult.status === 'fulfilled') {
      setRows(rankingResult.value.data);
      setSavedAt(rankingResult.value.saved_at);
      setUsingSavedData(false);
      setLocalReady(true);
      return;
    }

    setLocalReady(true);
    if (cachedRanking) {
      setUsingSavedData(true);
      setSavedAt(cachedRanking.saved_at);
    } else {
      const cause = rankingResult.reason;
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el Ranking.');
    }
  }, [isAdmin, seasonId, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const podium = rows.slice(0, 3);
  const myRows = rows.filter((row) => row.dog_id && myDogIds.has(row.dog_id));
  const seasonName = rows[0]?.season_name || 'Temporada UCAPSA';

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>RANKING UCAPSA</Text>
        <Text style={[styles.title, { color: format.cardText }]}>{seasonName}</Text>
        <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Sólo perros elegibles. El Podio son las posiciones 1, 2 y 3 de esta misma tabla.</Text>
      </View>

      {usingSavedData ? (
        <OfflineDataNotice
          savedAt={savedAt}
          onRetry={() => void refresh()}
          premium={premium}
          label="Mostrando Ranking guardado"
        />
      ) : null}

      {!localReady ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cargando Ranking…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>No pudimos cargar el Ranking</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Conéctate una vez para guardar esta clasificación en el dispositivo.</Text>
        </View>
      ) : null}

      {localReady && !error ? (
        rows.length === 0 ? (
          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: format.cardText }]}>Todavía no hay perros elegibles</Text>
            <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>El Ranking aparecerá cuando haya perros con todos los exámenes obligatorios oficiales.</Text>
          </View>
        ) : (
          <>
            {myRows.length > 0 ? (
              <View style={styles.myDogsBlock}>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Tus perros</Text>
                {myRows.map((row) => (
                  <View key={row.dog_id ?? String(row.ranking_position)} style={[styles.myCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
                    <View style={[styles.positionCircle, { backgroundColor: format.pillBackground }]}>
                      <Text style={[styles.positionText, { color: format.pillText }]}>#{Number(row.ranking_position ?? 0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.myLabel, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>TU PERRO</Text>
                      <Text style={[styles.cardTitle, { color: format.cardText }]}>{row.dog_name || 'Tu perro'} · {numberLabel(row.competitive_score)} pts</Text>
                      <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{row.range_name || 'Cobre'} · {Number(row.command_attendances_count ?? 0)} Comandos</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.noteCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
                <MaterialIcons name="info-outline" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                <Text style={[styles.noteText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tus perros todavía no ocupan posición porque no cumplen todos los exámenes obligatorios.</Text>
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Podio</Text>
            <View style={styles.podiumRow}>
              {podium.map((row) => (
                <View
                  key={row.dog_id ?? String(row.ranking_position)}
                  style={[
                    styles.podiumCard,
                    {
                      backgroundColor: row.dog_id && myDogIds.has(row.dog_id) ? format.secondaryButton : format.cardBackground,
                      borderColor: row.dog_id && myDogIds.has(row.dog_id) ? format.accent : format.cardBorder,
                    },
                  ]}
                >
                  <Text style={styles.medal}>{medal(Number(row.ranking_position ?? 0))}</Text>
                  <Text numberOfLines={1} style={[styles.podiumName, { color: format.cardText }]}>{row.dog_name || 'Perro'}</Text>
                  <Text style={[styles.podiumScore, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>{numberLabel(row.competitive_score)} pts</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Clasificación</Text>
            <View style={styles.list}>
              {rows.map((row) => {
                const mine = Boolean(row.dog_id && myDogIds.has(row.dog_id));
                const position = Number(row.ranking_position ?? 0);
                return (
                  <View
                    key={row.dog_id ?? String(row.ranking_position)}
                    style={[
                      styles.rankRow,
                      { backgroundColor: mine ? format.secondaryButton : format.cardBackground, borderColor: mine ? format.accent : format.cardBorder },
                    ]}
                  >
                    <View style={[styles.rankBox, { backgroundColor: format.pillBackground }]}>
                      <Text style={[styles.rankText, { color: format.pillText }]}>{position}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleLine}>
                        <Text numberOfLines={1} style={[styles.dogName, { color: format.cardText }]}>{row.dog_name || 'Perro'}</Text>
                        {mine ? <Text style={[styles.minePill, { color: premium ? ucapsaBrand.colors.premiumActionText : format.accentDark }]}>Tuyo</Text> : null}
                      </View>
                      <Text style={[styles.score, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>{numberLabel(row.competitive_score)} pts · {row.range_name || 'Cobre'}</Text>
                      <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{Number(row.command_attendances_count ?? 0)} Comandos · {numberLabel(row.exam_points)} pts Exámenes</Text>
                    </View>
                    {position <= 3 ? <Text style={styles.rowMedal}>{medal(position)}</Text> : null}
                  </View>
                );
              })}
            </View>

            <View style={[styles.noteCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
              <MaterialIcons name="rule" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              <Text style={[styles.noteText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Desempate: puntaje total → Comandos → puntos de Exámenes → dog_id técnico.</Text>
            </View>
          </>
        )
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 14 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { fontSize: 10, lineHeight: 15, fontWeight: '700' },
  card: { gap: 7, borderRadius: 19, borderWidth: 1, padding: 14, marginBottom: 11 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  myDogsBlock: { gap: 8, marginBottom: 13 },
  myCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 12 },
  positionCircle: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  positionText: { fontSize: 14, fontWeight: '900' },
  myLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', marginBottom: 8 },
  podiumRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  podiumCard: { flex: 1, minWidth: 0, alignItems: 'center', borderRadius: 17, borderWidth: 1, padding: 10 },
  medal: { fontSize: 24, marginBottom: 3 },
  podiumName: { width: '100%', textAlign: 'center', fontSize: 10, fontWeight: '900' },
  podiumScore: { fontSize: 9, fontWeight: '900', marginTop: 3 },
  list: { gap: 8 },
  rankRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, padding: 10 },
  rankBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '900' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dogName: { flexShrink: 1, fontSize: 12, fontWeight: '900' },
  minePill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  score: { fontSize: 10, fontWeight: '900', marginTop: 2 },
  rowMedal: { fontSize: 19 },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, borderWidth: 1, padding: 11, marginTop: 12, marginBottom: 12 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '800' },
});
