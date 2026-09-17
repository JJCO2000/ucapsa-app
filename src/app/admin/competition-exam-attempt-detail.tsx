import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminCompetitionExamAttemptDetail,
  publishCompetitionExamAttempt,
  reviewCompetitionExamAttempt,
  setCompetitionExamOfficialAttempt,
  voidCompetitionExamAttempt,
  type AdminCompetitionExamAttemptDetail,
} from '../../services/ucapsa-competition.service';

function statusLabel(status: string) {
  if (status === 'draft') return 'Borrador';
  if (status === 'reviewed') return 'Revisado';
  if (status === 'published') return 'Publicado';
  if (status === 'voided') return 'Anulado';
  return status;
}

function dateTimeLabel(value: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function numberLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function AdminCompetitionExamAttemptDetailScreen() {
  const { attemptId: attemptIdParam } = useLocalSearchParams<{ attemptId?: string | string[] }>();
  const attemptId = Array.isArray(attemptIdParam) ? attemptIdParam[0] ?? '' : attemptIdParam ?? '';
  const [detail, setDetail] = useState<AdminCompetitionExamAttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!attemptId) {
      setError('Falta el intento.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setDetail(await getAdminCompetitionExamAttemptDetail(attemptId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el intento.');
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const resultByItem = useMemo(
    () => new Map((detail?.results ?? []).map((result) => [result.exam_item_id, result])),
    [detail?.results],
  );

  const imported = Boolean(detail?.attempt.import_batch_id);
  const seasonClosed = detail?.season?.status === 'closed';
  const voided = detail?.attempt.status === 'voided';
  const manuallyMutable = Boolean(detail && !imported && !seasonClosed && !voided);
  const canReview = Boolean(detail && manuallyMutable && detail.attempt.status === 'draft' && detail.isComplete);
  const canPublish = Boolean(detail && manuallyMutable && detail.attempt.status === 'reviewed' && detail.isComplete);
  const canSetOfficial = Boolean(detail && manuallyMutable && detail.attempt.status === 'published' && !detail.attempt.is_official);
  const canVoid = Boolean(detail && manuallyMutable && !voided);

  async function runReview() {
    if (!detail || !canReview || working) return;
    setWorking(true);
    try {
      await reviewCompetitionExamAttempt(detail.attempt.id);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo revisar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmPublish(makeOfficial: boolean) {
    if (!detail || !canPublish || working) return;
    Alert.alert(
      makeOfficial ? 'Publicar como oficial' : 'Publicar intento',
      makeOfficial
        ? 'Este intento quedará publicado y será el oficial para este perro y examen. Si había otro oficial, dejará de serlo.'
        : 'El intento quedará publicado, pero no sustituirá al intento oficial actual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Publicar', onPress: () => void runPublish(makeOfficial) },
      ],
    );
  }

  async function runPublish(makeOfficial: boolean) {
    if (!detail || working) return;
    setWorking(true);
    try {
      await publishCompetitionExamAttempt({ attemptId: detail.attempt.id, makeOfficial });
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo publicar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmOfficial() {
    if (!detail || !canSetOfficial || working) return;
    Alert.alert(
      'Usar como intento oficial',
      'Este intento sustituirá al intento oficial actual de este perro para el mismo examen.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Hacer oficial', onPress: () => void runOfficial() },
      ],
    );
  }

  async function runOfficial() {
    if (!detail || working) return;
    setWorking(true);
    try {
      await setCompetitionExamOfficialAttempt(detail.attempt.id);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo cambiar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmVoid() {
    if (!detail || !canVoid || working) return;
    Alert.alert(
      'Anular intento',
      detail.attempt.is_official
        ? 'El intento oficial quedará anulado y dejará de ser oficial. Esta acción no elimina el registro.'
        : 'El intento quedará anulado. Esta acción no elimina el registro.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Anular', style: 'destructive', onPress: () => void runVoid() },
      ],
    );
  }

  async function runVoid() {
    if (!detail || working) return;
    setWorking(true);
    try {
      await voidCompetitionExamAttempt(detail.attempt.id);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo anular', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando intento…</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error && detail ? (
        <>
          <View style={styles.header}>
            <View style={styles.headerIcon}><MaterialIcons name="fact-check" size={24} color={ucapsaBrand.colors.redDark} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.titleLine}>
                <Text style={styles.kicker}>{detail.exam.code} · Intento {detail.attempt.attempt_number}</Text>
                {detail.attempt.is_official ? <Text style={styles.officialPill}>Oficial</Text> : null}
                {imported ? <Text style={styles.importPill}>Importado</Text> : null}
              </View>
              <Text style={styles.title}>{detail.dog.name}</Text>
              <Text style={styles.muted}>{detail.dog.ownerName || 'Dueño sin nombre'} · {dateTimeLabel(detail.attempt.presented_at)}</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{numberLabel(detail.totalPointsAwarded)}</Text>
              <Text style={styles.metricLabel}>de {numberLabel(detail.maxPoints)} puntos</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{detail.results.length}/{detail.items.length}</Text>
              <Text style={styles.metricLabel}>ejercicios calificados</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <InfoRow label="Estado" value={statusLabel(detail.attempt.status)} />
            <InfoRow label="Completitud" value={detail.isComplete ? 'Completo' : 'Incompleto'} />
            <InfoRow label="Temporada" value={detail.season?.name || 'No disponible'} />
            {detail.attempt.reviewed_at ? <InfoRow label="Revisado" value={dateTimeLabel(detail.attempt.reviewed_at)} /> : null}
            {detail.attempt.published_at ? <InfoRow label="Publicado" value={dateTimeLabel(detail.attempt.published_at)} /> : null}
          </View>

          {imported ? (
            <View style={styles.lockCard}>
              <MaterialIcons name="table-view" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>Este intento pertenece a una importación Excel. Se muestra aquí como referencia, pero sus acciones se administrarán desde el lote de importación.</Text>
            </View>
          ) : seasonClosed ? (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>La temporada está cerrada. Reábrela antes de corregir resultados o cambiar el estado del intento.</Text>
            </View>
          ) : detail.attempt.status === 'reviewed' && !detail.isComplete ? (
            <View style={styles.warningCard}>
              <MaterialIcons name="warning-amber" size={19} color={ucapsaBrand.colors.warningDark} />
              <Text style={styles.warningText}>Este intento fue marcado como revisado estando incompleto. El backend ya no permite agregar filas faltantes; la salida segura es anularlo y capturar uno nuevo.</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            {canReview ? (
              <Pressable disabled={working} style={styles.secondaryButton} onPress={() => void runReview()}>
                <MaterialIcons name="fact-check" size={18} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.secondaryButtonText}>Marcar revisado</Text>
              </Pressable>
            ) : null}
            {canPublish ? (
              <>
                <Pressable disabled={working} style={styles.primaryAction} onPress={() => confirmPublish(true)}>
                  <MaterialIcons name="publish" size={18} color={ucapsaBrand.colors.surface} />
                  <Text style={styles.primaryActionText}>Publicar oficial</Text>
                </Pressable>
                <Pressable disabled={working} style={styles.secondaryButton} onPress={() => confirmPublish(false)}>
                  <Text style={styles.secondaryButtonText}>Publicar sin oficial</Text>
                </Pressable>
              </>
            ) : null}
            {canSetOfficial ? (
              <Pressable disabled={working} style={styles.secondaryButton} onPress={confirmOfficial}>
                <MaterialIcons name="workspace-premium" size={18} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.secondaryButtonText}>Hacer oficial</Text>
              </Pressable>
            ) : null}
            {canVoid ? (
              <Pressable disabled={working} style={styles.dangerButton} onPress={confirmVoid}>
                <MaterialIcons name="block" size={18} color={ucapsaBrand.colors.danger} />
                <Text style={styles.dangerButtonText}>Anular</Text>
              </Pressable>
            ) : null}
          </View>

          {detail.attempt.status === 'draft' && !detail.isComplete && manuallyMutable ? (
            <View style={styles.hintCard}>
              <MaterialIcons name="info-outline" size={18} color={ucapsaBrand.colors.warningDark} />
              <Text style={styles.hintText}>Completa todos los ejercicios antes de marcar el intento como revisado. Un 0 es una calificación válida; lo que no puede faltar es la fila del resultado.</Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Resultados por ejercicio</Text>
              <Text style={styles.muted}>Cada puntuación debe estar entre 0 y su máximo.</Text>
            </View>
          </View>

          <View style={styles.list}>
            {detail.items.map((item) => {
              const result = resultByItem.get(item.id) ?? null;
              const canCreateMissing = manuallyMutable && detail.attempt.status === 'draft';
              const canEditExisting = manuallyMutable && Boolean(result) && ['draft', 'reviewed', 'published'].includes(detail.attempt.status);
              const canOpen = result ? canEditExisting : canCreateMissing;
              return (
                <Pressable
                  key={item.id}
                  disabled={!canOpen}
                  style={[styles.resultRow, !canOpen && styles.resultRowDisabled]}
                  onPress={() => router.push(
                    `/admin/competition-exam-result-form?attemptId=${encodeURIComponent(detail.attempt.id)}&itemId=${encodeURIComponent(item.id)}` as never,
                  )}
                >
                  <View style={styles.numberBox}><Text style={styles.numberText}>{item.item_number}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.scoreText}>{result ? `${numberLabel(Number(result.points_awarded))} / ${numberLabel(Number(item.max_points))} pts` : `Sin calificar · máx. ${numberLabel(Number(item.max_points))}`}</Text>
                    {result?.evaluator_note ? <Text style={styles.muted}>{result.evaluator_note}</Text> : null}
                  </View>
                  {canOpen ? <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} /> : <MaterialIcons name="lock-outline" size={18} color={ucapsaBrand.colors.muted} />}
                </Pressable>
              );
            })}
          </View>

          {working ? <View style={styles.workingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Aplicando cambio…</Text></View> : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 11 },
  headerIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  title: { color: ucapsaBrand.colors.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 2 },
  officialPill: { color: ucapsaBrand.colors.successDark, backgroundColor: ucapsaBrand.colors.successSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  importPill: { color: ucapsaBrand.colors.warningDark, backgroundColor: ucapsaBrand.colors.warningSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  metricsRow: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  metric: { flex: 1, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '800', marginTop: 2 },
  infoCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 10 },
  infoRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  infoLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  infoValue: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900', textAlign: 'right' },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginBottom: 10 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 11, marginBottom: 10 },
  warningText: { flex: 1, color: ucapsaBrand.colors.warningDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  secondaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  primaryAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 11 },
  primaryActionText: { color: ucapsaBrand.colors.surface, fontSize: 10, fontWeight: '900' },
  dangerButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, paddingHorizontal: 11 },
  dangerButtonText: { color: ucapsaBrand.colors.danger, fontSize: 10, fontWeight: '900' },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 14, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 10, marginBottom: 10 },
  hintText: { flex: 1, color: ucapsaBrand.colors.warningDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  sectionHeader: { marginTop: 5, marginBottom: 9 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  list: { gap: 8 },
  resultRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  resultRowDisabled: { opacity: 0.7 },
  numberBox: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  numberText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  itemTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  scoreText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 2 },
  workingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
});
