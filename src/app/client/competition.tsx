import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import {
  getCachedMyDogCompetition,
  refreshMyDogCompetition,
  type ClientDogCompetitionSnapshot,
  type ClientOfficialExamResult,
} from '../../services/client-competition.service';

function numberLabel(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function statusLabel(status: string | null | undefined) {
  if (status === 'active') return 'Activa';
  if (status === 'reopened') return 'Reabierta';
  if (status === 'closed') return 'Cerrada';
  return status || 'Temporada';
}

export default function ClientCompetitionScreen() {
  const params = useLocalSearchParams<{ dogId?: string | string[] }>();
  const dogId = Array.isArray(params.dogId) ? params.dogId[0] ?? '' : params.dogId ?? '';
  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const [snapshot, setSnapshot] = useState<ClientDogCompetitionSnapshot | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((next: ClientDogCompetitionSnapshot) => {
    setSnapshot(next);
    setSelectedSeasonId((current) => {
      if (current && next.seasons.some((season) => season.season_id === current)) return current;
      return next.seasons.find((season) => season.season_status === 'active')?.season_id
        ?? next.seasons.find((season) => season.season_status === 'reopened')?.season_id
        ?? next.seasons[0]?.season_id
        ?? null;
    });
  }, []);

  const load = useCallback(async () => {
    if (!user || isAdmin || !dogId) {
      setLocalReady(true);
      return;
    }

    setError(null);
    setUsingSavedData(false);

    const cached = await getCachedMyDogCompetition(user.id, dogId);
    if (cached) {
      applySnapshot(cached.data);
      setSavedAt(cached.saved_at);
      setLocalReady(true);
    }

    try {
      const fresh = await refreshMyDogCompetition(user.id, dogId);
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
  }, [applySnapshot, dogId, isAdmin, user]);

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

  const selectedSeason = snapshot?.seasons.find((season) => season.season_id === selectedSeasonId) ?? null;
  const officialExams = (snapshot?.official_exams ?? []).filter((exam) => exam.season_id === selectedSeasonId);

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>COMPETENCIA UCAPSA</Text>
        <Text style={[styles.title, { color: format.cardText }]}>{snapshot?.dog_name || 'Tu perro'}</Text>
        <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Constancia, exámenes y temporadas desde los hechos oficiales de UCAPSA.</Text>
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
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Conéctate una vez para guardar esta información en el dispositivo.</Text>
        </View>
      ) : null}

      {localReady && !error && snapshot ? (
        <>
          {snapshot.seasons.length > 0 ? (
            <View style={styles.pills}>
              {snapshot.seasons.map((season) => {
                const selected = season.season_id === selectedSeasonId;
                return (
                  <Pressable
                    key={season.season_id ?? season.season_code ?? 'season'}
                    style={[
                      styles.pill,
                      { borderColor: selected ? format.accent : format.cardBorder, backgroundColor: selected ? format.pillBackground : format.cardBackground },
                    ]}
                    onPress={() => setSelectedSeasonId(season.season_id)}
                  >
                    <Text style={[styles.pillText, { color: selected ? format.pillText : format.cardText }]}>{season.season_name || 'Temporada'} · {statusLabel(season.season_status)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!selectedSeason ? (
            <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: format.cardText }]}>Sin temporada competitiva</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cuando UCAPSA active una temporada, aparecerá aquí.</Text>
            </View>
          ) : (
            <>
              <View style={[styles.pendingCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
                <MaterialIcons name="workspace-premium" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>RANGO DE CONSTANCIA</Text>
                  <Text style={[styles.cardTitle, { color: format.cardText }]}>{selectedSeason.range_name || 'Bronce'}</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                    {Number(selectedSeason.constancy_events_count ?? 0) === 0
                      ? '0 eventos: Bronce. Tu perro sí cuenta dentro de la población de la temporada.'
                      : `Percentil desde la cima: ${Number(selectedSeason.constancy_percentile ?? 0).toFixed(2)}%.`}
                  </Text>
                </View>
              </View>

              <Pressable
                style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}
                onPress={() => {
                  if (!selectedSeason.season_id) return;
                  router.push(`/client/competition-ranking?seasonId=${encodeURIComponent(selectedSeason.season_id)}&dogId=${encodeURIComponent(snapshot.dog_id)}` as never);
                }}
              >
                <View style={styles.cardTitleLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>RANKING</Text>
                    <Text style={[styles.cardTitle, { color: format.cardText }]}>
                      {selectedSeason.is_ranking_eligible ? 'Ver posición y Podio' : 'Ver clasificación de la temporada'}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                </View>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                  Puntaje competitivo {numberLabel(selectedSeason.competitive_score)} pts · Constancia {numberLabel(selectedSeason.constancy_points)}
                  {' + '} Exámenes {numberLabel(selectedSeason.exam_points)}
                  {' + '} Ajustes {numberLabel(selectedSeason.admin_adjustment_points)}.
                </Text>
                {!selectedSeason.is_ranking_eligible ? (
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                    Tu perro aún no ocupa posición porque faltan {Number(selectedSeason.missing_required_exams_count ?? 0)} examen(es) obligatorio(s).
                  </Text>
                ) : null}
              </Pressable>

              <Pressable
                style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}
                onPress={() => {
                  if (!selectedSeason.season_id) return;
                  router.push(`/client/competition-constancy?dogId=${encodeURIComponent(snapshot.dog_id)}&seasonId=${encodeURIComponent(selectedSeason.season_id)}` as never);
                }}
              >
                <View style={styles.cardTitleLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>CONSTANCIA</Text>
                    <Text style={[styles.cardTitle, { color: format.cardText }]}>Actividad de la temporada</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                </View>
                <View style={styles.metricsRow}>
                  <Metric value={Number(selectedSeason.constancy_events_count ?? 0)} label="eventos" premium={premium} format={format} />
                  <Metric value={Number(selectedSeason.command_attendances_count ?? 0)} label="Comandos" premium={premium} format={format} />
                  <Metric value={Number(selectedSeason.member_visits_count ?? 0)} label="visitas" premium={premium} format={format} />
                </View>
              </Pressable>

              <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
                <Text style={[styles.sectionEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>EXÁMENES</Text>
                <Text style={[styles.cardTitle, { color: format.cardText }]}>Resultados oficiales</Text>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                  {selectedSeason.is_ranking_eligible
                    ? 'Todos los exámenes obligatorios publicados están completos.'
                    : Number(selectedSeason.required_exams_count ?? 0) === 0
                      ? 'UCAPSA todavía no ha publicado exámenes obligatorios para esta temporada.'
                      : `Faltan ${Number(selectedSeason.missing_required_exams_count ?? 0)} examen(es) obligatorio(s).`}
                </Text>

                {officialExams.length === 0 ? (
                  <View style={[styles.emptyRow, { backgroundColor: format.secondaryButton }]}>
                    <MaterialIcons name="assignment" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                    <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Todavía no hay resultados oficiales en esta temporada.</Text>
                  </View>
                ) : (
                  <View style={styles.examList}>
                    {officialExams.map((exam) => (
                      <ExamRow key={exam.attempt_id ?? exam.exam_id ?? exam.exam_code ?? 'exam'} dogId={snapshot.dog_id} exam={exam} premium={premium} format={format} />
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Metric({
  value,
  label,
  premium,
  format,
}: {
  value: number;
  label: string;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
}) {
  return (
    <View style={[styles.metric, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
      <Text style={[styles.metricValue, { color: format.cardText }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{label}</Text>
    </View>
  );
}

function ExamRow({
  dogId,
  exam,
  premium,
  format,
}: {
  dogId: string;
  exam: ClientOfficialExamResult;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
}) {
  const canOpen = Boolean(exam.attempt_id);
  return (
    <Pressable
      disabled={!canOpen}
      style={[styles.examRow, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
      onPress={() => {
        if (!exam.attempt_id) return;
        router.push(`/client/competition-exam-result?dogId=${encodeURIComponent(dogId)}&attemptId=${encodeURIComponent(exam.attempt_id)}` as never);
      }}
    >
      <View style={[styles.examIcon, { backgroundColor: format.pillBackground }]}>
        <MaterialIcons name="assignment-turned-in" size={19} color={format.pillText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.examTitleLine}>
          <Text numberOfLines={1} style={[styles.examTitle, { color: format.cardText }]}>{exam.exam_title || exam.exam_code || 'Examen'}</Text>
          {exam.is_required_for_ranking ? <Text style={[styles.requiredPill, { color: premium ? ucapsaBrand.colors.premiumActionText : format.accentDark }]}>Obligatorio</Text> : null}
        </View>
        <Text style={[styles.examScore, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>{numberLabel(exam.total_points_awarded)} / {numberLabel(exam.max_points)} pts</Text>
      </View>
      {canOpen ? <MaterialIcons name="chevron-right" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} /> : null}
    </Pressable>
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
  cardTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 11 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  pillText: { fontSize: 9, fontWeight: '900' },
  pendingCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 18, borderWidth: 1, padding: 13, marginBottom: 11 },
  sectionEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 10 },
  metricValue: { fontSize: 19, fontWeight: '900' },
  metricLabel: { fontSize: 9, fontWeight: '800', marginTop: 2 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 11 },
  examList: { gap: 7 },
  examRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, borderWidth: 1, padding: 10 },
  examIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  examTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  examTitle: { flexShrink: 1, fontSize: 12, fontWeight: '900' },
  requiredPill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  examScore: { fontSize: 10, fontWeight: '900', marginTop: 2 },
});
