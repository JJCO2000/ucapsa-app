import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  createTrainerExamAttempt,
  createTrainerExamDraft,
  getStaffExamDrafts,
  getTrainerExamCatalog,
  getTrainerExamDogs,
  getTrainerExamItems,
  uploadTrainerExamResults,
  type TrainerExamCatalogRow,
  type TrainerExamDog,
  type TrainerExamDraftRow,
} from '../../services/trainer-staff.service';
import {
  pickAndParseUcapsaExamDefinitionXlsx,
  pickAndParseUcapsaExamXlsx,
  type ExamDefinitionUploadItem,
} from '../../services/ucapsa-exam-xlsx';

export default function TrainerExamsTab() {
  const { isAdmin, capabilities } = useSession();
  const [exams, setExams] = useState<TrainerExamCatalogRow[]>([]);
  const [drafts, setDrafts] = useState<TrainerExamDraftRow[]>([]);
  const [dogs, setDogs] = useState<TrainerExamDog[]>([]);
  const [selectedExam, setSelectedExam] = useState<TrainerExamCatalogRow | null>(null);
  const [dogQuery, setDogQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftFileName, setDraftFileName] = useState('');
  const [draftItems, setDraftItems] = useState<ExamDefinitionUploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!capabilities.canUseTrainingWorkspace) return;
    setError(null);
    try {
      const [examRows, draftRows, dogRows] = await Promise.all([
        getTrainerExamCatalog(),
        getStaffExamDrafts(),
        getTrainerExamDogs(),
      ]);
      setExams(examRows);
      setDrafts(draftRows);
      setDogs(dogRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los exámenes.');
    } finally {
      setLoading(false);
    }
  }, [capabilities.canUseTrainingWorkspace]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const filteredDogs = useMemo(() => {
    const term = dogQuery.trim().toLocaleLowerCase('es-MX');
    if (!term) return dogs.slice(0, 30);
    return dogs
      .filter((dog) => `${dog.dogName} ${dog.ownerName}`.toLocaleLowerCase('es-MX').includes(term))
      .slice(0, 30);
  }, [dogQuery, dogs]);

  async function startAttempt(dog: TrainerExamDog) {
    if (!selectedExam || saving) return;
    try {
      setSaving(true);
      const attemptId = await createTrainerExamAttempt(selectedExam.examId, dog.dogId);
      setSelectedExam(null);
      setDogQuery('');
      router.push(`/staff/exam-attempt?attemptId=${encodeURIComponent(String(attemptId))}` as never);
    } catch (cause) {
      Alert.alert('No se pudo iniciar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadExamScores(exam: TrainerExamCatalogRow) {
    if (saving) return;
    try {
      setSaving(true);
      const items = await getTrainerExamItems(exam.examId);
      const picked = await pickAndParseUcapsaExamXlsx(items);
      if (!picked) return;

      const result = await uploadTrainerExamResults({
        examId: exam.examId,
        fileName: picked.fileName,
        rows: picked.rows,
      });

      Alert.alert(
        'Calificaciones subidas',
        `${result.rowsImported} resultado${result.rowsImported === 1 ? '' : 's'} quedaron revisados y listos para que Administración publique/oficialice.`,
      );
      await load();
    } catch (cause) {
      Alert.alert('No se pudo subir el Excel', cause instanceof Error ? cause.message : 'Revisa el archivo e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function resetDraftUpload() {
    setDraftCode('');
    setDraftTitle('');
    setDraftDate('');
    setDraftFileName('');
    setDraftItems([]);
  }

  async function chooseExamDefinition() {
    if (saving) return;
    try {
      setSaving(true);
      const picked = await pickAndParseUcapsaExamDefinitionXlsx();
      if (!picked) return;
      setDraftFileName(picked.fileName);
      setDraftItems(picked.items);
    } catch (cause) {
      Alert.alert('No se pudo leer el examen', cause instanceof Error ? cause.message : 'Revisa el Excel e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function saveExamDraft() {
    if (saving) return;
    const code = draftCode.trim();
    const title = draftTitle.trim();
    const date = draftDate.trim();

    if (!code || !title) {
      Alert.alert('Faltan datos', 'Escribe el código y nombre del examen.');
      return;
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD.');
      return;
    }
    if (draftItems.length === 0) {
      Alert.alert('Falta el Excel', 'Selecciona el archivo con los ejercicios del examen.');
      return;
    }

    try {
      setSaving(true);
      await createTrainerExamDraft({
        code,
        title,
        examDate: date || null,
        items: draftItems,
      });
      setUploadOpen(false);
      resetDraftUpload();
      await load();
      Alert.alert(
        'Examen cargado',
        'Quedó guardado como borrador. Administración conserva la publicación y la oficialidad.',
      );
    } catch (cause) {
      Alert.alert('No se pudo cargar el examen', cause instanceof Error ? cause.message : 'Revisa los datos e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!capabilities.canUseTrainingWorkspace) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Entrenador · Evaluación</Text>
        <Text style={styles.title}>Exámenes</Text>
        <Text style={styles.subtitle}>Carga exámenes, captura resultados o sube calificaciones por Excel. Administración conserva publicación y oficialidad.</Text>
        <Pressable
          disabled={saving}
          style={styles.newExamButton}
          onPress={() => { resetDraftUpload(); setUploadOpen(true); }}
        >
          <MaterialIcons name="note-add" size={18} color={ucapsaBrand.colors.surface} />
          <Text style={styles.newExamButtonText}>Subir examen</Text>
        </Pressable>
      </View>

      {drafts.length > 0 ? (
        <View style={styles.draftsSection}>
          <Text style={styles.sectionKicker}>BORRADORES</Text>
          <Text style={styles.sectionTitle}>Pendientes de Administración</Text>
          <View style={styles.draftList}>
            {drafts.map((draft) => (
              <View key={draft.examId} style={styles.draftCard}>
                <View style={styles.draftIcon}>
                  <MaterialIcons name="pending-actions" size={19} color={ucapsaBrand.colors.goldDark} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.draftCode}>{draft.examCode}</Text>
                  <Text style={styles.draftTitle}>{draft.examTitle}</Text>
                  <Text style={styles.draftMeta}>
                    {draft.seasonName} · {draft.itemCount} ejercicios · {draft.maxPoints} pts
                    {draft.examDate ? ` · ${draft.examDate}` : ''}
                  </Text>
                </View>
                <View style={styles.pendingPill}>
                  <Text style={styles.pendingPillText}>Borrador</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando exámenes…</Text></View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}><MaterialIcons name="error-outline" size={20} color={ucapsaBrand.colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {!loading && !error && exams.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="assignment" size={28} color={ucapsaBrand.colors.muted} />
          <Text style={styles.emptyTitle}>No hay exámenes publicados</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {exams.map((exam) => (
          <View key={exam.examId} style={styles.examCard}>
            <View style={styles.examIcon}><MaterialIcons name="assignment" size={21} color={ucapsaBrand.colors.purpleDark} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.examCode}>{exam.examCode}</Text>
              <Text style={styles.examTitle}>{exam.examTitle}</Text>
              <Text style={styles.examMeta}>{exam.seasonName} · {exam.itemCount} ejercicios · {exam.maxPoints} pts</Text>
              <View style={styles.examActions}>
                <Pressable
                  disabled={saving}
                  style={styles.captureButton}
                  onPress={() => { setSelectedExam(exam); setDogQuery(''); }}
                >
                  <MaterialIcons name="edit-note" size={17} color={ucapsaBrand.colors.redDark} />
                  <Text style={styles.captureText}>Capturar</Text>
                </Pressable>
                <Pressable
                  disabled={saving}
                  style={styles.uploadButton}
                  onPress={() => void uploadExamScores(exam)}
                >
                  <MaterialIcons name="upload-file" size={17} color={ucapsaBrand.colors.greenDark} />
                  <Text style={styles.uploadText}>Subir Excel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </View>

      <KeyboardAwareModal
        visible={uploadOpen}
        onClose={() => { setUploadOpen(false); resetDraftUpload(); }}
      >
        <Text style={styles.modalKicker}>Nuevo examen</Text>
        <Text style={styles.modalTitle}>Subir examen</Text>
        <Text style={styles.modalSubtitle}>
          El Excel define los ejercicios. Se guarda como borrador; Administración decide cuándo publicarlo.
        </Text>

        <Text style={styles.fieldLabel}>Código</Text>
        <TextInput
          value={draftCode}
          onChangeText={setDraftCode}
          placeholder="Ej. EXAM-01"
          autoCapitalize="characters"
          placeholderTextColor={ucapsaBrand.colors.muted}
          style={styles.fieldInput}
        />

        <Text style={styles.fieldLabel}>Nombre</Text>
        <TextInput
          value={draftTitle}
          onChangeText={setDraftTitle}
          placeholder="Nombre del examen"
          placeholderTextColor={ucapsaBrand.colors.muted}
          style={styles.fieldInput}
        />

        <Text style={styles.fieldLabel}>Fecha del examen · opcional</Text>
        <TextInput
          value={draftDate}
          onChangeText={setDraftDate}
          placeholder="AAAA-MM-DD"
          keyboardType="numbers-and-punctuation"
          placeholderTextColor={ucapsaBrand.colors.muted}
          style={styles.fieldInput}
        />

        <Pressable disabled={saving} style={styles.definitionButton} onPress={() => void chooseExamDefinition()}>
          <MaterialIcons name="upload-file" size={19} color={ucapsaBrand.colors.purpleDark} />
          <View style={{ flex: 1 }}>
            <Text style={styles.definitionTitle}>{draftFileName || 'Seleccionar Excel del examen'}</Text>
            <Text style={styles.definitionHint}>
              Columnas: Ejercicio · Puntos máximos · Descripción opcional
            </Text>
          </View>
        </Pressable>

        {draftItems.length > 0 ? (
          <View style={styles.definitionPreview}>
            <Text style={styles.previewTitle}>{draftItems.length} ejercicio{draftItems.length === 1 ? '' : 's'} detectado{draftItems.length === 1 ? '' : 's'}</Text>
            {draftItems.slice(0, 4).map((item, index) => (
              <View key={`${index}:${item.title}`} style={styles.previewRow}>
                <Text style={styles.previewNumber}>{index + 1}</Text>
                <Text numberOfLines={1} style={styles.previewName}>{item.title}</Text>
                <Text style={styles.previewPoints}>{item.max_points} pts</Text>
              </View>
            ))}
            {draftItems.length > 4 ? <Text style={styles.previewMore}>+ {draftItems.length - 4} más</Text> : null}
          </View>
        ) : null}

        <Pressable
          disabled={saving || !draftCode.trim() || !draftTitle.trim() || draftItems.length === 0}
          style={[styles.saveDraftButton, (saving || !draftCode.trim() || !draftTitle.trim() || draftItems.length === 0) && styles.disabled]}
          onPress={() => void saveExamDraft()}
        >
          <MaterialIcons name="save" size={18} color={ucapsaBrand.colors.surface} />
          <Text style={styles.saveDraftText}>{saving ? 'Guardando…' : 'Guardar borrador'}</Text>
        </Pressable>
      </KeyboardAwareModal>

      <KeyboardAwareModal visible={Boolean(selectedExam)} onClose={() => setSelectedExam(null)}>
        <Text style={styles.modalKicker}>Nuevo intento</Text>
        <Text style={styles.modalTitle}>{selectedExam?.examTitle ?? 'Examen'}</Text>
        <Text style={styles.modalSubtitle}>Selecciona el perro que vas a evaluar.</Text>

        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={19} color={ucapsaBrand.colors.muted} />
          <TextInput
            value={dogQuery}
            onChangeText={setDogQuery}
            placeholder="Buscar perro o tutor"
            placeholderTextColor={ucapsaBrand.colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.dogList}>
          {filteredDogs.map((dog) => (
            <Pressable key={dog.dogId} disabled={saving} style={styles.dogRow} onPress={() => void startAttempt(dog)}>
              <View style={styles.dogIcon}><MaterialIcons name="pets" size={19} color={ucapsaBrand.colors.redDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dogName}>{dog.dogName}</Text>
                <Text style={styles.ownerName}>{dog.ownerName}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={21} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          ))}
        </View>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  newExamButton: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, backgroundColor: ucapsaBrand.colors.greenDark, paddingHorizontal: 11, marginTop: 10 },
  newExamButtonText: { color: ucapsaBrand.colors.surface, fontSize: 10, fontWeight: '900' },
  draftsSection: { marginBottom: 16 },
  sectionKicker: { color: ucapsaBrand.colors.goldDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900', marginTop: 1, marginBottom: 8 },
  draftList: { gap: 7 },
  draftCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.gold, backgroundColor: ucapsaBrand.colors.goldPale, padding: 10 },
  draftIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  draftCode: { color: ucapsaBrand.colors.goldDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  draftTitle: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 1 },
  draftMeta: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  pendingPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 8, paddingVertical: 5 },
  pendingPillText: { color: ucapsaBrand.colors.goldDark, fontSize: 8, fontWeight: '900' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.dangerSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, padding: 12 },
  errorText: { flex: 1, color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 7, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 22 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 9 },
  examCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  examIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.purpleSoft },
  examCode: { color: ucapsaBrand.colors.purpleDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  examTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 1 },
  examMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 3 },
  examActions: { flexDirection: 'row', gap: 7, marginTop: 8 },
  captureButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 11, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 9 },
  captureText: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900' },
  uploadButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 11, backgroundColor: ucapsaBrand.colors.greenSoft, paddingHorizontal: 9 },
  uploadText: { color: ucapsaBrand.colors.greenDark, fontSize: 9, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900' },
  modalSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3, marginBottom: 10 },
  fieldLabel: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900', marginTop: 8, marginBottom: 5 },
  fieldInput: { minHeight: 44, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '800', borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11 },
  definitionButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, backgroundColor: ucapsaBrand.colors.purpleSoft, padding: 11, marginTop: 12 },
  definitionTitle: { color: ucapsaBrand.colors.purpleDark, fontSize: 11, fontWeight: '900' },
  definitionHint: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  definitionPreview: { gap: 5, marginTop: 10 },
  previewTitle: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900', marginBottom: 2 },
  previewRow: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 8 },
  previewNumber: { width: 20, color: ucapsaBrand.colors.purpleDark, fontSize: 9, fontWeight: '900' },
  previewName: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '800' },
  previewPoints: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '900' },
  previewMore: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '800' },
  saveDraftButton: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: ucapsaBrand.colors.greenDark, marginTop: 13 },
  saveDraftText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  searchBox: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '700', paddingVertical: 9 },
  dogList: { gap: 7, marginTop: 10 },
  dogRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 10 },
  dogIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  ownerName: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '700', marginTop: 2 },
});
