import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  createCompetitionExamImportBatch,
  getAdminCompetitionExamImportWorkspace,
  validateCompetitionExamImportBatch,
  type AdminCompetitionExamImportBatchRow,
  type AdminCompetitionExamImportWorkspace,
} from '../../services/ucapsa-competition.service';
import { pickAndParseUcapsaExamXlsx } from '../../services/ucapsa-exam-xlsx';

function stageLabel(row: AdminCompetitionExamImportBatchRow) {
  if (row.batch.status === 'reverted') return 'Revertido';
  if (row.batch.status === 'draft') return 'Borrador';
  if (row.batch.status === 'validated') {
    return row.rowsInvalid > 0 ? 'Validado con errores' : 'Validado';
  }
  if (row.batch.status === 'committed') {
    if (row.attemptsTotal > 0 && row.publishedAttempts === row.attemptsTotal) return 'Publicado';
    if (
      row.attemptsTotal > 0
      && row.draftAttempts === 0
      && row.voidedAttempts === 0
      && row.reviewedAttempts + row.publishedAttempts === row.attemptsTotal
    ) return 'Revisado';
    return 'Confirmado';
  }
  return row.batch.status;
}

function dateTimeLabel(value: string) {
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

export default function AdminCompetitionExamImportsScreen() {
  const { examId: examIdParam } = useLocalSearchParams<{ examId?: string | string[] }>();
  const examId = Array.isArray(examIdParam) ? examIdParam[0] ?? '' : examIdParam ?? '';

  const [workspace, setWorkspace] = useState<AdminCompetitionExamImportWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!examId) {
      setError('Falta el examen.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setWorkspace(await getAdminCompetitionExamImportWorkspace(examId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las importaciones.');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const canImport = Boolean(
    workspace
    && workspace.exam.status === 'published'
    && workspace.season?.status !== 'closed'
    && workspace.items.length > 0,
  );

  async function startImport() {
    if (!workspace || !canImport || working) return;
    setWorking(true);
    let batchId: string | null = null;

    try {
      const picked = await pickAndParseUcapsaExamXlsx(workspace.items);
      if (!picked) return;

      batchId = await createCompetitionExamImportBatch({
        examId: workspace.exam.id,
        fileName: picked.fileName,
      });

      await validateCompetitionExamImportBatch({
        batchId,
        rows: picked.rows,
      });

      router.push(`/admin/competition-exam-import-detail?batchId=${encodeURIComponent(batchId)}` as never);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : 'No se pudo preparar la importación.';
      if (batchId) {
        Alert.alert('El lote quedó en borrador', message, [
          { text: 'Cerrar', style: 'cancel' },
          {
            text: 'Ver lote',
            onPress: () => router.push(`/admin/competition-exam-import-detail?batchId=${encodeURIComponent(batchId ?? '')}` as never),
          },
        ]);
      } else {
        Alert.alert('No se pudo leer el Excel', message);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando importaciones…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && workspace ? (
        <>
          <View style={styles.header}>
            <Text style={styles.kicker}>{workspace.exam.code}</Text>
            <Text style={styles.title}>Importar Excel</Text>
            <Text style={styles.subtitle}>{workspace.exam.title} · {workspace.season?.name || 'Temporada no disponible'}</Text>
          </View>

          <View style={styles.instructionsCard}>
            <MaterialIcons name="table-view" size={22} color={ucapsaBrand.colors.redDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.instructionsTitle}>Plantilla canónica</Text>
              <Text style={styles.muted}>Fila 1: Identificador · Perro · una columna por ejercicio. Los máximos vienen del examen, nunca del archivo.</Text>
            </View>
          </View>

          {canImport ? (
            <Pressable disabled={working} style={[styles.primaryButton, working && styles.disabled]} onPress={() => void startImport()}>
              {working ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="upload-file" size={20} color={ucapsaBrand.colors.surface} />}
              <Text style={styles.primaryButtonText}>{working ? 'Leyendo y validando…' : 'Seleccionar archivo .xlsx'}</Text>
            </Pressable>
          ) : (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>
                {workspace.season?.status === 'closed'
                  ? 'La temporada está cerrada. Reábrela antes de importar.'
                  : workspace.exam.status !== 'published'
                    ? 'El examen debe estar publicado antes de importar resultados.'
                    : 'El examen necesita ejercicios configurados antes de importar.'}
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Lotes</Text>

          {workspace.batches.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Todavía no hay importaciones</Text>
              <Text style={styles.muted}>Cada archivo crea un lote auditable con preview y acciones separadas.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {workspace.batches.map((row) => {
                const stage = stageLabel(row);
                const hasErrors = row.rowsInvalid > 0;
                return (
                  <Pressable
                    key={row.batch.id}
                    style={styles.batchRow}
                    onPress={() => router.push(`/admin/competition-exam-import-detail?batchId=${encodeURIComponent(row.batch.id)}` as never)}
                  >
                    <View style={[styles.batchIcon, hasErrors && styles.batchIconWarning]}>
                      <MaterialIcons name={hasErrors ? 'warning-amber' : 'table-view'} size={21} color={hasErrors ? ucapsaBrand.colors.warningDark : ucapsaBrand.colors.redDark} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleLine}>
                        <Text numberOfLines={1} style={styles.fileName}>{row.batch.file_name || 'Archivo sin nombre'}</Text>
                        <Text style={[styles.stagePill, hasErrors && styles.stagePillWarning]}>{stage}</Text>
                      </View>
                      <Text style={styles.muted}>{dateTimeLabel(row.batch.created_at)}</Text>
                      <Text style={styles.meta}>
                        {row.rowsTotal} filas · {row.rowsValid} válidas · {row.rowsInvalid} con error
                      </Text>
                      {row.attemptsTotal > 0 ? (
                        <Text style={styles.meta}>
                          {row.attemptsTotal} intentos · {row.reviewedAttempts} revisados · {row.publishedAttempts} publicados
                        </Text>
                      ) : null}
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  header: { gap: 3, marginBottom: 13 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  instructionsCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12, marginBottom: 10 },
  instructionsTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginBottom: 2 },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginBottom: 12 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginBottom: 12 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 9 },
  emptyCard: { gap: 4, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 8 },
  batchRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  batchIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  batchIconWarning: { backgroundColor: ucapsaBrand.colors.warningSoft },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  fileName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  stagePill: { color: ucapsaBrand.colors.redDark, backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  stagePillWarning: { color: ucapsaBrand.colors.warningDark, backgroundColor: ucapsaBrand.colors.warningSoft },
  meta: { color: ucapsaBrand.colors.text, fontSize: 10, lineHeight: 15, fontWeight: '800', marginTop: 2 },
});
