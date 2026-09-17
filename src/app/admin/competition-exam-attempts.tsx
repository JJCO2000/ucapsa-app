import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminCompetitionExamAttemptsWorkspace,
  type AdminCompetitionExamAttemptsWorkspace,
} from '../../services/ucapsa-competition.service';

function statusLabel(status: string | null) {
  if (status === 'draft') return 'Borrador';
  if (status === 'reviewed') return 'Revisado';
  if (status === 'published') return 'Publicado';
  if (status === 'voided') return 'Anulado';
  return status || 'Sin estado';
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

function scoreLabel(value: number | null, max: number | null) {
  return `${Number(value ?? 0)} / ${Number(max ?? 0)} pts`;
}

export default function AdminCompetitionExamAttemptsScreen() {
  const { examId: examIdParam } = useLocalSearchParams<{ examId?: string | string[] }>();
  const examId = Array.isArray(examIdParam) ? examIdParam[0] ?? '' : examIdParam ?? '';
  const [workspace, setWorkspace] = useState<AdminCompetitionExamAttemptsWorkspace | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!examId) {
      setError('Falta el examen.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setWorkspace(await getAdminCompetitionExamAttemptsWorkspace(examId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los intentos.');
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

  const visibleAttempts = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    if (!clean) return workspace?.attempts ?? [];
    return (workspace?.attempts ?? []).filter((row) =>
      [row.dogName, row.ownerName, row.summary.attempt_status]
        .some((value) => value?.toLocaleLowerCase('es-MX').includes(clean)),
    );
  }, [query, workspace?.attempts]);

  const canCreate = Boolean(
    workspace
    && workspace.exam.status === 'published'
    && workspace.season?.status !== 'closed',
  );

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando intentos…</Text>
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
            <Text style={styles.title}>Intentos y resultados</Text>
            <Text style={styles.subtitle}>{workspace.exam.title} · {workspace.season?.name || 'Temporada no disponible'}</Text>
          </View>

          {canCreate ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push(`/admin/competition-exam-attempt-form?examId=${encodeURIComponent(workspace.exam.id)}` as never)}
            >
              <MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} />
              <Text style={styles.primaryButtonText}>Nuevo intento</Text>
            </Pressable>
          ) : (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>
                {workspace.season?.status === 'closed'
                  ? 'La temporada está cerrada. Reábrela antes de capturar nuevos intentos.'
                  : 'El examen debe estar publicado antes de capturar intentos.'}
              </Text>
            </View>
          )}

          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar perro, dueño o estado"
              placeholderTextColor={ucapsaBrand.colors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>

          {visibleAttempts.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="fact-check" size={26} color={ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>{query.trim() ? 'Sin coincidencias' : 'Todavía no hay intentos'}</Text>
                <Text style={styles.muted}>Los intentos manuales o importados aparecerán aquí.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {visibleAttempts.map((row) => {
                const summary = row.summary;
                const imported = Boolean(row.attempt.import_batch_id);
                const official = Boolean(summary.is_official);
                return (
                  <Pressable
                    key={row.attempt.id}
                    style={styles.attemptRow}
                    onPress={() => router.push(`/admin/competition-exam-attempt-detail?attemptId=${encodeURIComponent(row.attempt.id)}` as never)}
                  >
                    <View style={styles.numberBox}>
                      <Text style={styles.numberText}>{summary.attempt_number ?? row.attempt.attempt_number}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleLine}>
                        <Text numberOfLines={1} style={styles.dogName}>{row.dogName}</Text>
                        {official ? <Text style={styles.officialPill}>Oficial</Text> : null}
                        {imported ? <Text style={styles.importPill}>Importado</Text> : null}
                      </View>
                      <Text numberOfLines={1} style={styles.muted}>{row.ownerName || 'Dueño sin nombre'}</Text>
                      <Text style={styles.meta}>{statusLabel(summary.attempt_status)} · {dateTimeLabel(summary.presented_at)}</Text>
                      <Text style={styles.score}>{scoreLabel(summary.total_points_awarded, summary.max_points)} · {summary.graded_items_count ?? 0}/{summary.items_count ?? 0} ejercicios</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.auditNote}>
            <MaterialIcons name="info-outline" size={18} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.auditText}>Los intentos importados se muestran aquí, pero se administrarán desde el flujo de importación Excel para conservar la integridad del lote.</Text>
          </View>
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
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginBottom: 11 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginBottom: 11 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 11 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 8 },
  attemptRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  numberBox: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  numberText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  officialPill: { color: ucapsaBrand.colors.successDark, backgroundColor: ucapsaBrand.colors.successSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  importPill: { color: ucapsaBrand.colors.warningDark, backgroundColor: ucapsaBrand.colors.warningSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.text, fontSize: 10, lineHeight: 15, fontWeight: '800', marginTop: 2 },
  score: { color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '900', marginTop: 2 },
  auditNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginTop: 12 },
  auditText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
});
