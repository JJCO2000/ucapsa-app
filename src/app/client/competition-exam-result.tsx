import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import {
  getCachedMyOfficialExamDetail,
  refreshMyOfficialExamDetail,
  type ClientOfficialExamDetail,
} from '../../services/client-competition.service';

function numberLabel(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

export default function ClientCompetitionExamResultScreen() {
  const params = useLocalSearchParams<{
    dogId?: string | string[];
    attemptId?: string | string[];
  }>();
  const dogId = Array.isArray(params.dogId) ? params.dogId[0] ?? '' : params.dogId ?? '';
  const attemptId = Array.isArray(params.attemptId) ? params.attemptId[0] ?? '' : params.attemptId ?? '';

  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const userId = user?.id ?? '';
  const resultKey = !isAdmin && userId && dogId && attemptId
    ? [userId, dogId, attemptId].join(':') : '';
  const activeResultKeyRef = useRef(resultKey);
  activeResultKeyRef.current = resultKey;
  const loadRunRef = useRef(0);
  const [storedDetail, setStoredDetail] = useState<ClientOfficialExamDetail | null>(null);
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);
  const [readyForKey, setReadyForKey] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Even on the first render after a route/account change, never paint old results.
  const detail = resultKey && loadedForKey === resultKey ? storedDetail : null;
  const localReady = readyForKey === resultKey;

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => loadRunRef.current === runId
      && activeResultKeyRef.current === resultKey;
    if (!userId || isAdmin) return;

    setStoredDetail(null);
    setLoadedForKey(null);
    setReadyForKey(null);
    setError(null);
    setUsingSavedData(false);
    setSavedAt(null);

    if (!dogId || !attemptId) {
      setError('Falta identificar el examen oficial solicitado.');
      setReadyForKey(resultKey);
      return;
    }

    let cached: Awaited<ReturnType<typeof getCachedMyOfficialExamDetail>> = null;
    try {
      cached = await getCachedMyOfficialExamDetail(userId, dogId, attemptId);
    } catch (cause) {
      devWarn('client-exam-result: local cache could not be read.', cause);
    }
    if (!isCurrentRun()) return;
    if (cached) {
      setStoredDetail(cached.data);
      setLoadedForKey(resultKey);
      setSavedAt(cached.saved_at);
    }

    try {
      const fresh = await refreshMyOfficialExamDetail(userId, dogId, attemptId);
      if (!isCurrentRun()) return;
      setStoredDetail(fresh.data);
      setLoadedForKey(resultKey);
      setSavedAt(fresh.saved_at);
      setUsingSavedData(false);
    } catch (cause) {
      if (!isCurrentRun()) return;
      if (cached) {
        setUsingSavedData(true);
        setSavedAt(cached.saved_at);
      } else {
        setStoredDetail(null);
        setLoadedForKey(null);
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el examen.');
      }
    } finally {
      if (isCurrentRun()) setReadyForKey(resultKey);
    }
  }, [attemptId, dogId, isAdmin, resultKey, userId]);

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

  const resultByItem = new Map((detail?.results ?? []).map((result) => [result.exam_item_id, result]));

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>RESULTADO OFICIAL</Text>
        <Text style={[styles.title, { color: format.cardText }]}>{detail?.official.exam_title || detail?.official.exam_code || 'Examen UCAPSA'}</Text>
        <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{detail?.dog_name || 'Tu perro'}</Text>
      </View>

      {usingSavedData && detail ? (
        <OfflineDataNotice
          savedAt={savedAt}
          onRetry={() => void refresh()}
          premium={premium}
          label="Mostrando resultado guardado"
        />
      ) : null}

      {!localReady ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cargando resultado…</Text>
        </View>
      ) : null}

      {error && localReady ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>No pudimos cargar el resultado</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Conéctate una vez para guardar este detalle en el dispositivo.</Text>
        </View>
      ) : null}

      {localReady && !error && detail ? (
        <>
          <View style={[styles.scoreCard, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <View style={[styles.scoreIcon, { backgroundColor: format.pillBackground }]}>
              <MaterialIcons name="assignment-turned-in" size={24} color={format.pillText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.scoreLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>PUNTAJE OFICIAL</Text>
              <Text style={[styles.scoreValue, { color: format.cardText }]}>{numberLabel(detail.official.total_points_awarded)} / {numberLabel(detail.official.max_points)}</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                {detail.official.is_required_for_ranking ? 'Examen obligatorio' : 'Examen opcional'}
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: format.cardText }]}>Ejercicio por ejercicio</Text>

          {detail.items.length === 0 ? (
            <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: format.cardText }]}>Sin ejercicios disponibles</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>No encontramos el desglose de este examen.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {detail.items.map((item) => {
                const result = resultByItem.get(item.id) ?? null;
                return (
                  <View key={item.id} style={[styles.itemRow, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
                    <View style={[styles.numberBox, { backgroundColor: format.pillBackground }]}>
                      <Text style={[styles.numberText, { color: format.pillText }]}>{item.item_number}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.itemTitle, { color: format.cardText }]}>{item.title}</Text>
                      {item.description ? <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{item.description}</Text> : null}
                    </View>
                    <Text style={[styles.itemScore, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>
                      {result ? numberLabel(result.points_awarded) : '—'} / {numberLabel(item.max_points)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={[styles.noteCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
            <MaterialIcons name="info-outline" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            <Text style={[styles.noteText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>El total mostrado arriba es el resultado oficial publicado por UCAPSA; esta pantalla no recalcula otro total.</Text>
          </View>
        </>
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
  muted: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  card: { gap: 7, borderRadius: 19, borderWidth: 1, padding: 14, marginBottom: 11 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 14 },
  scoreIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  scoreLabel: { fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 0.7 },
  scoreValue: { fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: 1 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', marginBottom: 8 },
  list: { gap: 8 },
  itemRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, padding: 11 },
  numberBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 12, fontWeight: '900' },
  itemTitle: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  itemScore: { fontSize: 12, fontWeight: '900' },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, borderWidth: 1, padding: 11, marginTop: 12 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '800' },
});
