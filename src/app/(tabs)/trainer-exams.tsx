import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  createStaffExamAttempt,
  getStaffDogs,
  getStaffExamAttempts,
  getStaffExamDrafts,
  getStaffPublishedExams,
  type StaffDogRow,
  type StaffExam,
  type StaffExamAttempt,
  type StaffExamDraft,
} from '../../services/staff-operations.service';

function statusLabel(value: string) {
  if (value === 'draft') return 'En captura';
  if (value === 'reviewed') return 'Listo para publicar';
  return value;
}

export default function TrainerExamsTab() {
  const { isStaff, isAdmin } = useSession();
  const [exams, setExams] = useState<StaffExam[]>([]);
  const [attempts, setAttempts] = useState<StaffExamAttempt[]>([]);
  const [drafts, setDrafts] = useState<StaffExamDraft[]>([]);
  const [dogs, setDogs] = useState<StaffDogRow[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingDogId, setCreatingDogId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [examRows, attemptRows, draftRows, dogRows] = await Promise.all([
        getStaffPublishedExams(),
        getStaffExamAttempts(),
        getStaffExamDrafts(),
        getStaffDogs(),
      ]);
      setExams(examRows);
      setAttempts(attemptRows);
      setDrafts(draftRows);
      setDogs(dogRows);
      setSelectedExamId((current) => current && examRows.some((item) => item.examId === current) ? current : examRows[0]?.examId ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los exámenes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return undefined;
    setLoading(true);
    void load();
    return undefined;
  }, [isStaff, load]));

  const visibleDogs = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es-MX');
    const rows = dogs.filter((dog) => Boolean(dog.programCode));
    if (!term) return rows.slice(0, 12);
    return rows.filter((dog) => [dog.dogName, dog.ownerName].some((value) => value.toLocaleLowerCase('es-MX').includes(term))).slice(0, 20);
  }, [dogs, query]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function startAttempt(dog: StaffDogRow) {
    if (!selectedExamId || creatingDogId) return;
    try {
      setCreatingDogId(dog.dogId);
      const attemptId = await createStaffExamAttempt(selectedExamId, dog.dogId);
      router.push(`/trainer/exam-attempt?attemptId=${encodeURIComponent(attemptId)}` as never);
    } catch (cause) {
      Alert.alert('No se pudo iniciar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setCreatingDogId(null);
    }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.green} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>EVALUACIÓN</Text>
        <Text style={styles.title}>Exámenes</Text>
        <Text style={styles.subtitle}>Captura resultados. Publicar el resultado oficial sigue siendo una decisión administrativa.</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={[styles.actionCard, styles.actionUpload]} onPress={() => router.push('/trainer/exam-upload' as never)}>
          <View style={[styles.actionIcon, { backgroundColor: ucapsaBrand.colors.greenSoft }]}>
            <MaterialIcons name="upload-file" size={22} color={ucapsaBrand.colors.greenDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Subir examen</Text>
            <Text style={styles.actionMeta}>Excel → borrador</Text>
          </View>
        </Pressable>

        <Pressable
          disabled={!selectedExamId}
          style={[styles.actionCard, !selectedExamId && styles.disabled]}
          onPress={() => selectedExamId && router.push(`/trainer/exam-results-import?examId=${encodeURIComponent(selectedExamId)}` as never)}
        >
          <View style={[styles.actionIcon, { backgroundColor: ucapsaBrand.colors.purpleSoft }]}>
            <MaterialIcons name="grading" size={22} color={ucapsaBrand.colors.purpleDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Subir calificaciones</Text>
            <Text style={styles.actionMeta}>{selectedExamId ? 'Excel del examen elegido' : 'Elige un examen publicado'}</Text>
          </View>
        </Pressable>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.green} /><Text style={styles.muted}>Cargando exámenes…</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!loading && !error ? (
        <>
          <Text style={styles.sectionTitle}>Examen</Text>
          <View style={styles.examList}>
            {exams.map((exam) => {
              const selected = exam.examId === selectedExamId;
              return (
                <Pressable key={exam.examId} style={[styles.examChip, selected && styles.examChipActive]} onPress={() => setSelectedExamId(exam.examId)}>
                  <Text style={[styles.examCode, selected && styles.examChipTextActive]}>{exam.examCode}</Text>
                  <Text numberOfLines={1} style={[styles.examTitle, selected && styles.examChipTextActive]}>{exam.examTitle}</Text>
                </Pressable>
              );
            })}
          </View>

          {drafts.length > 0 ? (
            <View style={styles.draftsCard}>
              <View style={styles.draftsHeader}>
                <View>
                  <Text style={styles.draftsEyebrow}>BORRADORES</Text>
                  <Text style={styles.draftsTitle}>Esperando publicación</Text>
                </View>
                <Text style={styles.draftCount}>{drafts.length}</Text>
              </View>
              {drafts.slice(0, 5).map((draft) => (
                <View key={draft.examId} style={styles.draftRow}>
                  <MaterialIcons name="description" size={18} color={ucapsaBrand.colors.goldDark} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.draftName}>{draft.examCode} · {draft.examTitle}</Text>
                    <Text style={styles.draftMeta}>{draft.itemsCount} ejercicios · cargado por {draft.createdByName}</Text>
                  </View>
                  <Text style={styles.draftStatus}>Borrador</Text>
                </View>
              ))}
            </View>
          ) : null}

          {exams.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="fact-check" size={27} color={ucapsaBrand.colors.muted} />
              <Text style={styles.emptyTitle}>No hay exámenes publicados</Text>
              <Text style={styles.muted}>Un administrador debe configurar y publicar el examen antes de capturarlo.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Iniciar evaluación</Text>
              <View style={styles.search}>
                <MaterialIcons name="search" size={19} color={ucapsaBrand.colors.muted} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Buscar perro o dueño" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.searchInput} />
              </View>

              <View style={styles.dogList}>
                {visibleDogs.map((dog) => (
                  <Pressable key={dog.dogId} disabled={Boolean(creatingDogId)} style={styles.dogRow} onPress={() => void startAttempt(dog)}>
                    <View style={styles.dogIcon}><MaterialIcons name="pets" size={20} color={ucapsaBrand.colors.greenDark} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.dogName}>{dog.dogName}</Text>
                      <Text numberOfLines={1} style={styles.owner}>{dog.ownerName}</Text>
                    </View>
                    {creatingDogId === dog.dogId ? <ActivityIndicator color={ucapsaBrand.colors.green} /> : <MaterialIcons name="add-circle" size={22} color={ucapsaBrand.colors.greenDark} />}
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={styles.pendingHeader}>
            <Text style={styles.sectionTitle}>Capturas pendientes</Text>
            <Text style={styles.pendingCount}>{attempts.length}</Text>
          </View>
          <View style={styles.attemptList}>
            {attempts.map((attempt) => (
              <Pressable key={attempt.attemptId} style={styles.attemptRow} onPress={() => router.push(`/trainer/exam-attempt?attemptId=${encodeURIComponent(attempt.attemptId)}` as never)}>
                <View style={[styles.attemptIcon, { backgroundColor: attempt.attemptStatus === 'reviewed' ? ucapsaBrand.colors.successSoft : ucapsaBrand.colors.purpleSoft }]}>
                  <MaterialIcons name={attempt.attemptStatus === 'reviewed' ? 'task-alt' : 'edit-note'} size={21} color={attempt.attemptStatus === 'reviewed' ? ucapsaBrand.colors.successDark : ucapsaBrand.colors.purpleDark} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.dogName}>{attempt.dogName}</Text>
                  <Text style={styles.owner}>{attempt.examTitle} · {attempt.ownerName}</Text>
                  <Text style={styles.attemptStatus}>{statusLabel(attempt.attemptStatus)}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.greenDark} />
              </Pressable>
            ))}
            {attempts.length === 0 ? <Text style={styles.muted}>No hay evaluaciones pendientes.</Text> : null}
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 13 },
  kicker: { color: ucapsaBrand.colors.greenDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 11 },
  actionCard: { flex: 1, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 10 },
  actionUpload: { borderColor: ucapsaBrand.colors.green },
  actionIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: ucapsaBrand.colors.text, fontSize: 10, lineHeight: 13, fontWeight: '900' },
  actionMeta: { color: ucapsaBrand.colors.muted, fontSize: 8, lineHeight: 11, fontWeight: '700', marginTop: 2 },
  draftsCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.gold, backgroundColor: ucapsaBrand.colors.goldPale, padding: 10, marginTop: 10 },
  draftsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  draftsEyebrow: { color: ucapsaBrand.colors.goldDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  draftsTitle: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', marginTop: 1 },
  draftCount: { color: ucapsaBrand.colors.goldDark, fontSize: 12, fontWeight: '900' },
  draftRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.gold, paddingVertical: 6 },
  draftName: { color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '900' },
  draftMeta: { color: ucapsaBrand.colors.goldDark, fontSize: 8, lineHeight: 11, fontWeight: '700', marginTop: 1 },
  draftStatus: { color: ucapsaBrand.colors.goldDark, fontSize: 8, fontWeight: '900' },
  loading: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 18 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  error: { borderRadius: 16, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12 },
  errorText: { color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '800' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  examList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  examChip: { minWidth: '47%', flex: 1, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 10 },
  examChipActive: { borderColor: ucapsaBrand.colors.purple, backgroundColor: ucapsaBrand.colors.purple },
  examCode: { color: ucapsaBrand.colors.purpleDark, fontSize: 9, fontWeight: '900' },
  examTitle: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', marginTop: 2 },
  examChipTextActive: { color: ucapsaBrand.colors.surface },
  search: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11, marginBottom: 8 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '700', paddingVertical: 9 },
  dogList: { gap: 6 },
  dogRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 9 },
  dogIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.greenSoft },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  owner: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  pendingCount: { minWidth: 30, textAlign: 'center', color: ucapsaBrand.colors.purpleDark, backgroundColor: ucapsaBrand.colors.purpleSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  attemptList: { gap: 7 },
  attemptRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 10 },
  attemptIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  attemptStatus: { color: ucapsaBrand.colors.greenDark, fontSize: 8, fontWeight: '900', marginTop: 3 },
  empty: { alignItems: 'center', gap: 6, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
