import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminCompetitionRankingOverview,
  type AdminCompetitionRankingOverview,
  type CompetitionLeaderboardRow,
} from '../../services/ucapsa-competition.service';

const emptyOverview: AdminCompetitionRankingOverview = {
  seasons: [],
  selectedSeason: null,
  rows: [],
};

function seasonStatusLabel(status: string) {
  if (status === 'active') return 'Activa';
  if (status === 'reopened') return 'Reabierta';
  if (status === 'closed') return 'Cerrada';
  return status;
}

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

export default function AdminCompetitionRankingScreen() {
  const params = useLocalSearchParams<{ seasonId?: string | string[] }>();
  const requestedSeasonId = Array.isArray(params.seasonId) ? params.seasonId[0] ?? null : params.seasonId ?? null;

  const [overview, setOverview] = useState<AdminCompetitionRankingOverview>(emptyOverview);
  const [seasonId, setSeasonId] = useState<string | null>(requestedSeasonId);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextSeasonId?: string | null) => {
    setError(null);
    try {
      const next = await getAdminCompetitionRankingOverview(nextSeasonId ?? seasonId ?? requestedSeasonId);
      setOverview(next);
      setSeasonId(next.selectedSeason?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el Ranking.');
    } finally {
      setLoading(false);
    }
  }, [requestedSeasonId, seasonId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function selectSeason(nextSeasonId: string) {
    if (nextSeasonId === seasonId) return;
    setSeasonId(nextSeasonId);
    setLoading(true);
    await load(nextSeasonId);
  }

  const visibleRows = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    if (!clean) return overview.rows;
    return overview.rows.filter((row) => row.dog_name?.toLocaleLowerCase('es-MX').includes(clean));
  }, [overview.rows, query]);

  const podium = overview.rows.slice(0, 3);

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>Ranking</Text>
        <Text style={styles.subtitle}>Sólo perros elegibles. Orden: puntaje total, Comandos, puntos de Exámenes y dog_id como desempate técnico.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando Ranking…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error ? (
        <>
          {overview.seasons.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Temporada</Text>
              <View style={styles.pills}>
                {overview.seasons.map((season) => {
                  const selected = season.id === seasonId;
                  return (
                    <Pressable key={season.id} style={[styles.pill, selected && styles.pillSelected]} onPress={() => void selectSeason(season.id)}>
                      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{season.name} · {seasonStatusLabel(season.status)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {!overview.selectedSeason ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No hay temporadas consultables</Text>
              <Text style={styles.muted}>Activa una temporada para empezar a clasificar perros.</Text>
            </View>
          ) : overview.rows.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="leaderboard" size={25} color={ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>Todavía no hay perros elegibles</Text>
                <Text style={styles.muted}>Un perro entra al Ranking cuando completa todos los exámenes obligatorios oficiales.</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Podio</Text>
              <View style={styles.podiumRow}>
                {podium.map((row) => <PodiumCard key={row.dog_id ?? String(row.ranking_position)} row={row} />)}
              </View>

              <View style={styles.ruleCard}>
                <MaterialIcons name="rule" size={19} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.ruleText}>Desempate: más asistencias a Comandos → más puntos de Exámenes → dog_id técnico. No hay dos #1 efectivos.</Text>
              </View>

              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar perro"
                  placeholderTextColor={ucapsaBrand.colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.list}>
                {visibleRows.map((row) => <RankingRow key={row.dog_id ?? String(row.ranking_position)} row={row} />)}
              </View>
            </>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function PodiumCard({ row }: { row: CompetitionLeaderboardRow }) {
  const position = Number(row.ranking_position ?? 0);
  return (
    <View style={styles.podiumCard}>
      <Text style={styles.medal}>{medal(position)}</Text>
      <Text numberOfLines={1} style={styles.podiumName}>{row.dog_name || 'Perro'}</Text>
      <Text style={styles.podiumScore}>{numberLabel(row.competitive_score)} pts</Text>
      <Text style={styles.podiumRange}>{row.range_name || 'Cobre'}</Text>
    </View>
  );
}

function RankingRow({ row }: { row: CompetitionLeaderboardRow }) {
  const position = Number(row.ranking_position ?? 0);
  return (
    <View style={styles.rankRow}>
      <View style={styles.positionBox}>
        <Text style={styles.positionText}>{position}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={styles.dogName}>{row.dog_name || 'Perro'}</Text>
          <View style={styles.rangePill}><Text style={styles.rangePillText}>{row.range_name || 'Cobre'}</Text></View>
        </View>
        <Text style={styles.score}>{numberLabel(row.competitive_score)} pts</Text>
        <Text style={styles.muted}>{Number(row.command_attendances_count ?? 0)} Comandos · {numberLabel(row.exam_points)} pts Exámenes</Text>
      </View>
      {position <= 3 ? <Text style={styles.rowMedal}>{medal(position)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  pillSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  pillText: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  pillTextSelected: { color: ucapsaBrand.colors.redDark },
  podiumRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  podiumCard: { flex: 1, minWidth: 0, alignItems: 'center', borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  medal: { fontSize: 25, marginBottom: 4 },
  podiumName: { width: '100%', color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  podiumScore: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 3 },
  podiumRange: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '800', marginTop: 2 },
  ruleCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginBottom: 10 },
  ruleText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  list: { gap: 8 },
  rankRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  positionBox: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  positionText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  rangePill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.graySoft, paddingHorizontal: 6, paddingVertical: 2 },
  rangePillText: { color: ucapsaBrand.colors.grayDark, fontSize: 8, fontWeight: '900' },
  score: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', marginTop: 2 },
  rowMedal: { fontSize: 20 },
});
