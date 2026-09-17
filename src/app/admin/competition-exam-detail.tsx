import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  deleteCompetitionExamItem,
  getAdminCompetitionExamDetail,
  publishCompetitionExam,
  type AdminCompetitionExamDetail,
  type CompetitionExamItem,
} from '../../services/ucapsa-competition.service';

function statusLabel(status: string) {
  if (status === 'draft') return 'Borrador';
  if (status === 'published') return 'Publicado';
  if (status === 'archived') return 'Archivado';
  return status;
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminCompetitionExamDetailScreen() {
  const { examId: examIdParam } = useLocalSearchParams<{ examId?: string | string[] }>();
  const examId = Array.isArray(examIdParam) ? examIdParam[0] ?? '' : examIdParam ?? '';
  const [detail, setDetail] = useState<AdminCompetitionExamDetail | null>(null);
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
      setDetail(await getAdminCompetitionExamDetail(examId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el examen.');
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

  const totalMax = useMemo(() => (detail?.items ?? []).reduce((sum, item) => sum + Number(item.max_points ?? 0), 0), [detail?.items]);
  const seasonClosed = detail?.season?.status === 'closed';
  const archived = detail?.exam.status === 'archived';
  const canEditMetadata = Boolean(detail && !seasonClosed && !archived);
  const canEditStructure = Boolean(detail && !seasonClosed && !archived && !detail.structureLocked);
  const canPublish = Boolean(detail && detail.exam.status === 'draft' && !seasonClosed && detail.items.length > 0);

  function confirmPublish() {
    if (!detail || !canPublish || working) return;
    Alert.alert(
      'Publicar examen',
      'El examen quedará disponible para captura de intentos. Revisa código, ejercicios y máximos antes de continuar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Publicar', onPress: () => void runPublish() },
      ],
    );
  }

  async function runPublish() {
    if (!detail || working) return;
    setWorking(true);
    try {
      await publishCompetitionExam(detail.exam.id);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo publicar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmDelete(item: CompetitionExamItem) {
    if (!canEditStructure || working) return;
    Alert.alert(
      'Eliminar ejercicio',
      `Se eliminará “${item.title}”. Esta acción sólo es válida mientras la estructura siga editable.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void runDelete(item.id) },
      ],
    );
  }

  async function runDelete(itemId: string) {
    setWorking(true);
    try {
      await deleteCompetitionExamItem(itemId);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo eliminar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando examen…</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error && detail ? (
        <>
          <View style={styles.header}>
            <View style={styles.headerIcon}><MaterialIcons name="assignment" size={25} color={ucapsaBrand.colors.redDark} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.titleLine}>
                <Text style={styles.kicker}>{detail.exam.code}</Text>
                <View style={[styles.statusPill, detail.exam.status === 'published' && styles.statusPublished]}>
                  <Text style={[styles.statusText, detail.exam.status === 'published' && styles.statusPublishedText]}>{statusLabel(detail.exam.status)}</Text>
                </View>
              </View>
              <Text style={styles.title}>{detail.exam.title}</Text>
              <Text style={styles.muted}>{detail.season?.name || 'Temporada no disponible'} · {dateLabel(detail.exam.exam_date)}</Text>
            </View>
          </View>

          {detail.exam.description ? <Text style={styles.description}>{detail.exam.description}</Text> : null}

          <View style={styles.metricsRow}>
            <View style={styles.metric}><Text style={styles.metricValue}>{detail.items.length}</Text><Text style={styles.metricLabel}>ejercicios</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{totalMax}</Text><Text style={styles.metricLabel}>puntos máximos</Text></View>
          </View>

          <View style={styles.infoCard}>
            <InfoRow label="Elegibilidad" value={detail.exam.is_required_for_ranking ? 'Obligatorio' : 'Opcional'} />
            <InfoRow label="Orden" value={String(detail.exam.sort_order)} />
            <InfoRow label="Temporada" value={detail.season?.status === 'closed' ? 'Cerrada' : detail.season?.status || 'Sin estado'} />
          </View>

          {seasonClosed ? (
            <View style={styles.lockCard}><MaterialIcons name="lock" size={20} color={ucapsaBrand.colors.redDark} /><Text style={styles.lockText}>La temporada está cerrada. Reábrela antes de modificar examen o ejercicios.</Text></View>
          ) : detail.structureLocked ? (
            <View style={styles.lockCard}><MaterialIcons name="lock-outline" size={20} color={ucapsaBrand.colors.redDark} /><Text style={styles.lockText}>La estructura está congelada porque ya existen intentos revisados o publicados. Los ejercicios no se agregan, eliminan ni reestructuran.</Text></View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push(`/admin/competition-exam-attempts?examId=${encodeURIComponent(detail.exam.id)}` as never)}
            >
              <MaterialIcons name="fact-check" size={18} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.secondaryButtonText}>Intentos y resultados</Text>
            </Pressable>
            {canEditMetadata ? (
              <Pressable style={styles.secondaryButton} onPress={() => router.push(`/admin/competition-exam-form?examId=${encodeURIComponent(detail.exam.id)}` as never)}>
                <MaterialIcons name="edit" size={18} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.secondaryButtonText}>Editar examen</Text>
              </Pressable>
            ) : null}
            {canPublish ? (
              <Pressable disabled={working} style={[styles.publishButton, working && styles.disabled]} onPress={confirmPublish}>
                {working ? <ActivityIndicator size="small" color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="publish" size={18} color={ucapsaBrand.colors.surface} />}
                <Text style={styles.publishButtonText}>Publicar</Text>
              </Pressable>
            ) : null}
          </View>

          {detail.exam.status === 'draft' && detail.items.length === 0 && !seasonClosed ? (
            <View style={styles.hintCard}><MaterialIcons name="info-outline" size={18} color={ucapsaBrand.colors.warningDark} /><Text style={styles.hintText}>Agrega al menos un ejercicio antes de publicar desde la app.</Text></View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Ejercicios</Text>
              <Text style={styles.muted}>Una sola definición canónica del máximo de puntos.</Text>
            </View>
            {canEditStructure ? (
              <Pressable style={styles.addButton} onPress={() => router.push(`/admin/competition-exam-item-form?examId=${encodeURIComponent(detail.exam.id)}` as never)}>
                <MaterialIcons name="add" size={18} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.addButtonText}>Agregar</Text>
              </Pressable>
            ) : null}
          </View>

          {detail.items.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Sin ejercicios</Text><Text style={styles.muted}>Define los componentes que serán evaluados y su puntaje máximo.</Text></View>
          ) : (
            <View style={styles.list}>
              {detail.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.numberBox}><Text style={styles.numberText}>{item.item_number}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
                    <Text style={styles.itemMeta}>{item.max_points} pts máx. · orden {item.sort_order}</Text>
                  </View>
                  {canEditStructure ? (
                    <View style={styles.itemActions}>
                      <Pressable style={styles.iconButton} onPress={() => router.push(`/admin/competition-exam-item-form?examId=${encodeURIComponent(detail.exam.id)}&itemId=${encodeURIComponent(item.id)}` as never)}>
                        <MaterialIcons name="edit" size={18} color={ucapsaBrand.colors.redDark} />
                      </Pressable>
                      <Pressable style={styles.iconButton} onPress={() => confirmDelete(item)}>
                        <MaterialIcons name="delete-outline" size={18} color={ucapsaBrand.colors.danger} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 },
  headerIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  title: { color: ucapsaBrand.colors.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 2 },
  statusPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.graySoft, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { color: ucapsaBrand.colors.grayDark, fontSize: 8, fontWeight: '900' },
  statusPublished: { backgroundColor: ucapsaBrand.colors.successSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder },
  statusPublishedText: { color: ucapsaBrand.colors.successDark },
  description: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700', marginBottom: 12 },
  metricsRow: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  metric: { flex: 1, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '800', marginTop: 2 },
  infoCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, marginBottom: 10 },
  infoRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  infoLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900' },
  infoValue: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginBottom: 10 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  secondaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  publishButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 12 },
  publishButtonText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 14, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 10, marginBottom: 10 },
  hintText: { flex: 1, color: ucapsaBrand.colors.warningDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between', marginTop: 6, marginBottom: 9 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 10, paddingVertical: 8 },
  addButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  emptyCard: { gap: 4, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 8 },
  itemRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  numberBox: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  numberText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  itemTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  itemMeta: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900', marginTop: 3 },
  itemActions: { flexDirection: 'row', gap: 5 },
  iconButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
});
