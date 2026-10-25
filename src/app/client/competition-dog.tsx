import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import {
  getCachedMyDogCompetition,
  refreshMyDogCompetition,
  type ClientDogCompetitionSnapshot,
  type ClientOfficialExamResult,
} from '../../services/client-competition.service';
import { recordValueExposure } from '../../services/continuity-evidence.service';

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

function dateLabel(value: string | null | undefined) {
  if (!value) return 'sin actividad registrada';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function constancyLevelDescription(code: string | null | undefined) {
  if (code === 'forming') return 'Todavía no hay suficiente población en la temporada para asignar un nivel comparativo.';
  if (code === 'gold') return 'Constancia destacada esta temporada.';
  if (code === 'silver') return 'Constancia sostenida esta temporada.';
  return 'Constancia en desarrollo esta temporada.';
}

export default function ClientDogCompetitionScreen() {
  const params = useLocalSearchParams<{ dogId?: string | string[] }>();
  const dogId = Array.isArray(params.dogId) ? params.dogId[0] ?? '' : params.dogId ?? '';
  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const userId = user?.id ?? '';
  const scopeKey = !isAdmin && userId && dogId ? userId + ':' + dogId : '';
  const activeScopeKeyRef = useRef(scopeKey);
  activeScopeKeyRef.current = scopeKey;
  const loadRunRef = useRef(0);
  const [storedSnapshot, setStoredSnapshot] = useState<ClientDogCompetitionSnapshot | null>(null);
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);
  const [readyForKey, setReadyForKey] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<{ key: string; id: string | null } | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [storedError, setError] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);

  // A prior account/dog response must never appear on the current detail screen.
  const snapshot = scopeKey && loadedForKey === scopeKey ? storedSnapshot : null;
  const localReady = readyForKey === scopeKey;
  const error = localReady ? storedError : null;
  const selectedSeasonId = selectedSeason?.key === scopeKey ? selectedSeason.id : null;

  const applySnapshot = useCallback((next: ClientDogCompetitionSnapshot) => {
    setStoredSnapshot(next);
    setLoadedForKey(scopeKey);
    setSelectedSeason((current) => {
      const currentId = current?.key === scopeKey ? current.id : null;
      const id = currentId && next.seasons.some((season) => season.season_id === currentId)
        ? currentId
        : next.seasons.find((season) => season.season_status === 'active')?.season_id
          ?? next.seasons.find((season) => season.season_status === 'reopened')?.season_id
          ?? next.seasons[0]?.season_id ?? null;
      return { key: scopeKey, id };
    });
  }, [scopeKey]);

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => runId === loadRunRef.current
      && activeScopeKeyRef.current === scopeKey;
    if (!userId || isAdmin) return;

    setStoredSnapshot(null);
    setLoadedForKey(null);
    setReadyForKey(null);
    setError(null);
    setUsingSavedData(false);
    setSavedAt(null);

    if (!dogId) {
      setError('No encontramos este perro.');
      setReadyForKey(scopeKey);
      return;
    }

    let cached: Awaited<ReturnType<typeof getCachedMyDogCompetition>> = null;
    try {
      cached = await getCachedMyDogCompetition(userId, dogId);
    } catch (cause) {
      devWarn('client-competition-dog: local cache failed.', cause);
    }
    if (!isCurrentRun()) return;
    if (cached) {
      applySnapshot(cached.data);
      setSavedAt(cached.saved_at);
    }

    try {
      const fresh = await refreshMyDogCompetition(userId, dogId);
      if (!isCurrentRun()) return;
      applySnapshot(fresh.data);
      setSavedAt(fresh.saved_at);
      setUsingSavedData(false);
    } catch (cause) {
      if (!isCurrentRun()) return;
      if (cached) {
        setUsingSavedData(true);
        setSavedAt(cached.saved_at);
      } else {
        setStoredSnapshot(null);
        setLoadedForKey(null);
        setError('No pudimos cargar la competencia. Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      if (isCurrentRun()) setReadyForKey(scopeKey);
    }
  }, [applySnapshot, dogId, isAdmin, scopeKey, userId]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    void load();
    return () => {
      loadRunRef.current += 1;
      setScreenFocused(false);
    };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const selectedSeason = snapshot?.seasons.find((season) => season.season_id === selectedSeasonId) ?? null;
  const officialExams = (snapshot?.official_exams ?? []).filter((exam) => exam.season_id === selectedSeasonId);

  useEffect(() => {
    if (!user || isAdmin || !screenFocused || !localReady || error || !snapshot?.dog_id || !selectedSeason?.season_id) return;

    const timer = setTimeout(() => {
      void recordValueExposure(user.id, snapshot.dog_id, selectedSeason.season_id!, 'constancy_summary')
        .catch((cause) => {
          devWarn('Could not persist constancy summary value exposure.', cause);
        });
    }, 750);

    return () => clearTimeout(timer);
  }, [error, isAdmin, localReady, screenFocused, selectedSeason?.season_id, snapshot?.dog_id, user]);

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
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>DETALLE DE COMPETENCIA</Text>
        <Text style={[styles.title, { color: format.cardText }]}>{snapshot?.dog_name || 'Tu perro'}</Text>
        <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Constancia, exámenes e historial competitivo de este perro.</Text>
      </View>

      {usingSavedData && snapshot ? (
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
          <MaterialIcons name="error-outline" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>No pudimos cargar la competencia</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>No podemos mostrar sus puntos ahora. Revisa tu conexión e intenta de nuevo.</Text>
          <Pressable accessibilityRole="button" onPress={() => void refresh()}
            style={[styles.pendingCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: format.cardText }]}>Reintentar</Text>
          </Pressable>
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
                    onPress={() => setSelectedSeason({ key: scopeKey, id: season.season_id })}
                  >
                    <Text style={[styles.pillText, { color: selected ? format.pillText : format.cardText }]}>{season.season_name || 'Temporada'} · {statusLabel(season.season_status)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!selectedSeason ? (
            <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: format.cardText }]}>Aún no hay actividad competitiva registrada</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Este perro todavía no tiene puntos, constancias ni resultados publicados. Cuando existan, se mostrarán aquí.</Text>
            </View>
          ) : (
            <>
              <Pressable
                style={[styles.pendingCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
                onPress={() => {
                  if (!selectedSeason.season_id) return;
                  router.push(`/client/competition-constancy?dogId=${encodeURIComponent(snapshot.dog_id)}&seasonId=${encodeURIComponent(selectedSeason.season_id)}` as never);
                }}
              >
                <MaterialIcons name="workspace-premium" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>NIVEL DE CONSTANCIA</Text>
                  <Text style={[styles.cardTitle, { color: format.cardText }]}>{selectedSeason.range_name || 'Cobre'}</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                    {constancyLevelDescription(selectedSeason.range_code)}
                  </Text>
                  {selectedSeason.is_constancy_outstanding ? (
                    <Text style={[styles.outstandingText, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Constancia sobresaliente</Text>
                  ) : null}
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                    {Number(selectedSeason.constancy_events_count ?? 0)} actividades registradas · última actividad {dateLabel(selectedSeason.last_event_date)}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              </Pressable>

              <Pressable
                style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}
                onPress={() => {
                  if (!selectedSeason.season_id) return;
                  router.push(`/client/competition-ranking?seasonId=${encodeURIComponent(selectedSeason.season_id)}` as never);
                }}
              >
                <View style={styles.cardTitleLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>RANKING</Text>
                    <Text style={[styles.cardTitle, { color: format.cardText }]}>{numberLabel(selectedSeason.competitive_score)} puntos acumulados</Text>
                    <Text style={[styles.cardTitle, { color: format.cardText }]}>
                      {selectedSeason.is_ranking_eligible ? 'Ver posición y Podio' : 'Ver clasificación de la temporada'}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                </View>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                  {selectedSeason.is_ranking_eligible
                    ? 'Tu perro participa en la clasificación oficial de esta temporada.'
                    : 'Sin posición oficial hasta completar los requisitos de exámenes.'}
                </Text>
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
  outstandingText: { fontSize: 10, lineHeight: 15, fontWeight: '900', marginTop: 2 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 11 },
  examList: { gap: 7 },
  examRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, borderWidth: 1, padding: 10 },
  examIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  examTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  examTitle: { flexShrink: 1, fontSize: 12, fontWeight: '900' },
  requiredPill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  examScore: { fontSize: 10, fontWeight: '900', marginTop: 2 },
});
