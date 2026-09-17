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

  const [detail, setDetail] = useState<ClientOfficialExamDetail | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin || !dogId || !attemptId) {
      setLocalReady(true);
      return;
    }

    setError(null);
    setUsingSavedData(false);

    const cached = await getCachedMyOfficialExamDetail(user.id, dogId, attemptId);
    if (cached) {
      setDetail(cached.data);
      setSavedAt(cached.saved_at);
      setLocalReady(true);
    }

    try {
      const fresh = await refreshMyOfficialExamDetail(user.id, dogId, attemptId);
      setDetail(fresh.data);
      setSavedAt(fresh.saved_at);
      setUsingSavedData(false);
      setLocalReady(true);
    } catch (cause) {
      setLocalReady(true);
      if (cached) {
        setUsingSavedData(true);
        setSavedAt(cached.saved_at);
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el examen.');
      }
    }
  }, [attemptId, dogId, isAdmin, user]);

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

      {usingSavedData ? (
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

      {error ? (
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
