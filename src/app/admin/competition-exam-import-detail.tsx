import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  commitCompetitionExamImportBatch,
  getAdminCompetitionExamImportDetail,
  publishCompetitionExamImportBatch,
  revertCompetitionExamImportBatch,
  reviewCompetitionExamImportBatch,
  validateCompetitionExamImportBatch,
  type AdminCompetitionExamImportDetail,
  type CompetitionExamImportPreviewRow,
} from '../../services/ucapsa-competition.service';
import { pickAndParseUcapsaExamXlsx } from '../../services/ucapsa-exam-xlsx';

function dateTimeLabel(value: string | null) {
  if (!value) return '—';
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

function jsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validationMessages(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.flatMap((entry) => {
    const object = jsonObject(entry);
    const message = object.message;
    return typeof message === 'string' && message.trim() ? [message.trim()] : [];
  });
}

function rowScoreLabel(row: CompetitionExamImportPreviewRow, items: AdminCompetitionExamImportDetail['items']) {
  const scores = jsonObject(row.scores);
  return items
    .map((item) => {
      const value = scores[String(item.item_number)];
      return `${item.item_number}: ${value ?? '—'}`;
    })
    .join(' · ');
}

function derivedStage(detail: AdminCompetitionExamImportDetail) {
  if (detail.batch.status === 'reverted') return 'Revertido';
  if (detail.batch.status === 'draft') return 'Borrador';
  if (detail.batch.status === 'validated') {
    return detail.rowsInvalid > 0 ? 'Validado con errores' : 'Validado';
  }
  if (detail.batch.status === 'committed') {
    if (detail.attempts.length > 0 && detail.publishedAttempts === detail.attempts.length) return 'Publicado';
    if (
      detail.attempts.length > 0
      && detail.draftAttempts === 0
      && detail.voidedAttempts === 0
      && detail.reviewedAttempts + detail.publishedAttempts === detail.attempts.length
    ) return 'Revisado';
    return 'Confirmado';
  }
  return detail.batch.status;
}

export default function AdminCompetitionExamImportDetailScreen() {
  const { batchId: batchIdParam } = useLocalSearchParams<{ batchId?: string | string[] }>();
  const batchId = Array.isArray(batchIdParam) ? batchIdParam[0] ?? '' : batchIdParam ?? '';

  const [detail, setDetail] = useState<AdminCompetitionExamImportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!batchId) {
      setError('Falta el lote de importación.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setDetail(await getAdminCompetitionExamImportDetail(batchId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el lote.');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const stage = detail ? derivedStage(detail) : '';
  const seasonClosed = detail?.season?.status === 'closed';
  const attemptsTotal = detail?.attempts.length ?? 0;

  const canRevalidate = Boolean(
    detail
    && !seasonClosed
    && detail.exam.status === 'published'
    && ['draft', 'validated'].includes(detail.batch.status),
  );

  const canCommit = Boolean(
    detail
    && !seasonClosed
    && detail.batch.status === 'validated'
    && detail.rowsTotal > 0
    && detail.rowsInvalid === 0
    && detail.rowsValid === detail.rowsTotal
    && attemptsTotal === 0,
  );

  const canReview = Boolean(
    detail
    && !seasonClosed
    && detail.batch.status === 'committed'
    && detail.draftAttempts > 0
    && detail.voidedAttempts === 0,
  );

  const canPublish = Boolean(
    detail
    && !seasonClosed
    && detail.batch.status === 'committed'
    && attemptsTotal > 0
    && detail.draftAttempts === 0
    && detail.voidedAttempts === 0
    && detail.reviewedAttempts > 0
    && detail.reviewedAttempts + detail.publishedAttempts === attemptsTotal,
  );

  const canRevert = Boolean(
    detail
    && !seasonClosed
    && detail.batch.status === 'committed'
    && detail.publishedAttempts === 0
    && detail.officialAttempts === 0,
  );

  async function revalidate() {
    if (!detail || !canRevalidate || working) return;
    setWorking(true);
    try {
      const picked = await pickAndParseUcapsaExamXlsx(detail.items);
      if (!picked) return;

      const expected = detail.batch.file_name?.trim();
      if (expected && picked.fileName.toLocaleLowerCase('es-MX') !== expected.toLocaleLowerCase('es-MX')) {
        Alert.alert(
          'Nombre de archivo distinto',
          `Este lote pertenece a “${expected}”. Corrige ese mismo archivo o crea un lote nuevo.`,
        );
        return;
      }

      await validateCompetitionExamImportBatch({
        batchId: detail.batch.id,
        rows: picked.rows,
      });
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo revalidar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmCommit() {
    if (!detail || !canCommit || working) return;
    Alert.alert(
      'Confirmar importación',
      `Se crearán ${detail.rowsValid} intentos en borrador con sus resultados por ejercicio. Todavía no se publicarán.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => void runCommit() },
      ],
    );
  }

  async function runCommit() {
    if (!detail || working) return;
    setWorking(true);
    try {
      await commitCompetitionExamImportBatch(detail.batch.id);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo confirmar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  async function runReview() {
    if (!detail || !canReview || working) return;
    setWorking(true);
    try {
      await reviewCompetitionExamImportBatch(detail.batch.id);
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
      makeOfficial ? 'Publicar como oficiales' : 'Publicar sin hacer oficiales',
      makeOfficial
        ? 'Cada intento del lote quedará publicado y sustituirá al intento oficial anterior del mismo perro/examen.'
        : 'Los intentos quedarán publicados, pero no sustituirán intentos oficiales existentes.',
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
      await publishCompetitionExamImportBatch({
        batchId: detail.batch.id,
        makeOfficial,
      });
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo publicar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmRevert() {
    if (!detail || !canRevert || working) return;
    Alert.alert(
      'Revertir lote',
      'Se eliminarán los intentos creados por este lote mientras ninguno esté publicado u oficial. El lote quedará marcado como revertido.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Revertir', style: 'destructive', onPress: () => void runRevert() },
      ],
    );
  }

  async function runRevert() {
    if (!detail || working) return;
    setWorking(true);
    try {
      await revertCompetitionExamImportBatch(detail.batch.id);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo revertir', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  const invalidRows = useMemo(
    () => (detail?.preview ?? []).filter((row) => row.validation_status === 'invalid').length,
    [detail?.preview],
  );

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando lote…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && detail ? (
        <>
          <View style={styles.header}>
            <Text style={styles.kicker}>{detail.exam.code}</Text>
            <Text style={styles.title}>{detail.batch.file_name || 'Lote Excel'}</Text>
            <Text style={styles.subtitle}>{detail.exam.title} · {detail.season?.name || 'Temporada no disponible'}</Text>
          </View>

          <View style={styles.stageCard}>
            <View>
              <Text style={styles.stageLabel}>ETAPA</Text>
              <Text style={styles.stageValue}>{stage}</Text>
            </View>
            <Text style={styles.stageDate}>{dateTimeLabel(detail.batch.created_at)}</Text>
          </View>

          <View style={styles.metricsRow}>
            <Metric value={detail.rowsTotal} label="filas" />
            <Metric value={detail.rowsValid} label="válidas" />
            <Metric value={detail.rowsInvalid} label="errores" warning={detail.rowsInvalid > 0} />
          </View>

          {attemptsTotal > 0 ? (
            <View style={styles.metricsRow}>
              <Metric value={attemptsTotal} label="intentos" />
              <Metric value={detail.reviewedAttempts} label="revisados" />
              <Metric value={detail.publishedAttempts} label="publicados" />
            </View>
          ) : null}

          {seasonClosed ? (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>La temporada está cerrada. Reábrela antes de cambiar este lote.</Text>
            </View>
          ) : null}

          {detail.batch.status === 'validated' && detail.rowsInvalid > 0 ? (
            <View style={styles.warningCard}>
              <MaterialIcons name="warning-amber" size={19} color={ucapsaBrand.colors.warningDark} />
              <Text style={styles.warningText}>Hay {invalidRows} filas con error. Este Admin no permite importaciones parciales: corrige el archivo y revalida antes de confirmar.</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            {canRevalidate ? (
              <Pressable disabled={working} style={styles.secondaryButton} onPress={() => void revalidate()}>
                <MaterialIcons name="refresh" size={18} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.secondaryButtonText}>Revalidar archivo</Text>
              </Pressable>
            ) : null}

            {canCommit ? (
              <Pressable disabled={working} style={styles.primaryButton} onPress={confirmCommit}>
                <MaterialIcons name="check" size={18} color={ucapsaBrand.colors.surface} />
                <Text style={styles.primaryButtonText}>Confirmar importación</Text>
              </Pressable>
            ) : null}

            {canReview ? (
              <Pressable disabled={working} style={styles.secondaryButton} onPress={() => void runReview()}>
                <MaterialIcons name="fact-check" size={18} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.secondaryButtonText}>Revisar lote</Text>
              </Pressable>
            ) : null}

            {canPublish ? (
              <>
                <Pressable disabled={working} style={styles.primaryButton} onPress={() => confirmPublish(true)}>
                  <MaterialIcons name="publish" size={18} color={ucapsaBrand.colors.surface} />
                  <Text style={styles.primaryButtonText}>Publicar oficiales</Text>
                </Pressable>
                <Pressable disabled={working} style={styles.secondaryButton} onPress={() => confirmPublish(false)}>
                  <Text style={styles.secondaryButtonText}>Publicar sin oficial</Text>
                </Pressable>
              </>
            ) : null}

            {canRevert ? (
              <Pressable disabled={working} style={styles.dangerButton} onPress={confirmRevert}>
                <MaterialIcons name="undo" size={18} color={ucapsaBrand.colors.danger} />
                <Text style={styles.dangerButtonText}>Revertir lote</Text>
              </Pressable>
            ) : null}
          </View>

          {attemptsTotal > 0 ? (
            <Pressable
              style={styles.linkButton}
              onPress={() => router.push(`/admin/competition-exam-attempts?examId=${encodeURIComponent(detail.exam.id)}` as never)}
            >
              <Text style={styles.linkButtonText}>Ver intentos del examen</Text>
              <MaterialIcons name="chevron-right" size={19} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          ) : null}

          <Text style={styles.sectionTitle}>Preview</Text>

          {detail.preview.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin preview</Text>
              <Text style={styles.muted}>Selecciona y valida el archivo antes de confirmar la importación.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {detail.preview.map((row) => {
                const messages = validationMessages(row.validation_errors);
                const valid = row.validation_status === 'valid';
                return (
                  <View key={row.import_row_id ?? `row-${row.row_number}`} style={[styles.previewRow, !valid && styles.previewRowInvalid]}>
                    <View style={[styles.rowNumber, !valid && styles.rowNumberInvalid]}>
                      <Text style={[styles.rowNumberText, !valid && styles.rowNumberTextInvalid]}>{row.row_number ?? '—'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleLine}>
                        <Text numberOfLines={1} style={styles.dogName}>{row.dog_name || 'Perro sin nombre'}</Text>
                        <Text style={[styles.validationPill, !valid && styles.validationPillInvalid]}>{valid ? 'Válida' : 'Error'}</Text>
                      </View>
                      <Text style={styles.muted}>ID: {row.member_number || '—'}{row.resolved_dog_name ? ` · ${row.resolved_dog_name}` : ''}</Text>
                      <Text style={styles.scoreLine}>{rowScoreLabel(row, detail.items)}</Text>
                      <Text style={styles.totalLine}>{Number(row.total_points_awarded ?? 0)} / {Number(row.max_points ?? 0)} pts</Text>
                      {messages.map((message, index) => (
                        <Text key={`${row.import_row_id}-error-${index}`} style={styles.errorMessage}>• {message}</Text>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {working ? (
            <View style={styles.workingRow}>
              <ActivityIndicator color={ucapsaBrand.colors.red} />
              <Text style={styles.muted}>Aplicando cambio…</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Metric({ value, label, warning = false }: { value: number; label: string; warning?: boolean }) {
  return (
    <View style={[styles.metric, warning && styles.metricWarning]}>
      <Text style={[styles.metricValue, warning && styles.metricValueWarning]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  header: { gap: 3, marginBottom: 12 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { color: ucapsaBrand.colors.text, fontSize: 25, lineHeight: 31, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  stageCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13, marginBottom: 9 },
  stageLabel: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  stageValue: { color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '900', marginTop: 2 },
  stageDate: { flexShrink: 1, color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '700', textAlign: 'right' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metric: { flex: 1, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  metricWarning: { borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900' },
  metricValueWarning: { color: ucapsaBrand.colors.warningDark },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '800', marginTop: 2 },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginBottom: 9 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 11, marginBottom: 9 },
  warningText: { flex: 1, color: ucapsaBrand.colors.warningDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  primaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 11 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 10, fontWeight: '900' },
  secondaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  dangerButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, paddingHorizontal: 11 },
  dangerButtonText: { color: ucapsaBrand.colors.danger, fontSize: 10, fontWeight: '900' },
  linkButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 12, marginBottom: 12 },
  linkButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 8 },
  emptyCard: { gap: 4, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  list: { gap: 8 },
  previewRow: { minHeight: 84, flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  previewRowInvalid: { borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft },
  rowNumber: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowNumberInvalid: { backgroundColor: ucapsaBrand.colors.surface },
  rowNumberText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  rowNumberTextInvalid: { color: ucapsaBrand.colors.warningDark },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  validationPill: { color: ucapsaBrand.colors.successDark, backgroundColor: ucapsaBrand.colors.successSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  validationPillInvalid: { color: ucapsaBrand.colors.warningDark, backgroundColor: ucapsaBrand.colors.surface },
  scoreLine: { color: ucapsaBrand.colors.text, fontSize: 9, lineHeight: 14, fontWeight: '800', marginTop: 3 },
  totalLine: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 2 },
  errorMessage: { color: ucapsaBrand.colors.warningDark, fontSize: 9, lineHeight: 14, fontWeight: '800', marginTop: 2 },
  workingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
});
