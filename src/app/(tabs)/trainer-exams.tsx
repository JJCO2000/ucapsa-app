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
  getStaffEditableExamDraft,
  getTrainerExamCatalog,
  getTrainerExamDogs,
  getTrainerExamItems,
  publishTrainerExam,
  uploadTrainerExamResults,
  updateStaffExamDraft,
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
  const [catalogView, setCatalogView] = useState<'published' | 'drafts'>('published');
  const [dogs, setDogs] = useState<TrainerExamDog[]>([]);
  const [selectedExam, setSelectedExam] = useState<TrainerExamCatalogRow | null>(null);
  const [dogQuery, setDogQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<{ examId: string; updatedAt: string } | null>(null);
  const [draftCode, setDraftCode] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftFileName, setDraftFileName] = useState('');
  const [draftInputMode, setDraftInputMode] = useState<'manual' | 'excel'>('manual');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemPoints, setNewItemPoints] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
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
        `${result.rowsImported} resultado${result.rowsImported === 1 ? '' : 's'} quedaron revisados y listos para que Administración determine la oficialidad del resultado.`,
      );
      await load();
    } catch (cause) {
      Alert.alert('No se pudo subir el Excel', cause instanceof Error ? cause.message : 'Revisa el archivo e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function resetDraftUpload() {
    setEditingDraft(null);
    setDraftCode('');
    setDraftTitle('');
    setDraftDate('');
    setDraftInputMode('manual');
    setNewItemTitle('');
    setNewItemDescription('');
    setNewItemPoints('');
    setEditingItemIndex(null);
    setDraftFileName('');
    setDraftItems([]);
  }

  async function openSavedDraft(draft: TrainerExamDraftRow) {
    if (saving) return;
    try {
      setSaving(true);
      const definition = await getStaffEditableExamDraft(draft.examId);
      resetDraftUpload();
      setEditingDraft({ examId: definition.examId, updatedAt: definition.updatedAt });
      setDraftCode(definition.code);
      setDraftTitle(definition.title);
      setDraftDate(definition.examDate ?? '');
      setDraftInputMode('manual');
      setDraftItems(definition.items);
      setUploadOpen(true);
    } catch (cause) {
      Alert.alert('No se pudo abrir el borrador',
        cause instanceof Error ? cause.message : 'Reintenta desde el listado.');
    } finally {
      setSaving(false);
    }
  }

  function chooseDraftInputMode(nextMode: 'manual' | 'excel') {
    if (draftInputMode === nextMode || saving) return;
    function applyMode() {
      setDraftInputMode(nextMode);
      setDraftFileName('');
      setDraftItems([]);
      setNewItemTitle('');
      setNewItemDescription('');
      setNewItemPoints('');
      setEditingItemIndex(null);
    }
    const hasUnsavedManualInput = Boolean(newItemTitle.trim() || newItemDescription.trim() || newItemPoints.trim());
    if (draftItems.length === 0 && !hasUnsavedManualInput) {
      applyMode();
      return;
    }
    Alert.alert(
      'Cambiar método',
      'Los ejercicios todavía no guardados se reemplazarán al cambiar de método.',
      [
        { text: 'Conservar', style: 'cancel' },
        { text: 'Cambiar', style: 'destructive', onPress: applyMode },
      ],
    );
  }

  function addManualExamItem() {
    if (saving || draftInputMode !== 'manual') return;
    const title = newItemTitle.trim();
    const rawPoints = newItemPoints.trim().replace(',', '.');
    const maxPoints = Number(rawPoints);
    if (!title || title.length > 160) {
      Alert.alert('Ejercicio inválido', 'Escribe un título de 1 a 160 caracteres.');
      return;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(rawPoints) || !Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 1000) {
      Alert.alert('Puntos inválidos', 'Escribe un máximo mayor que cero y hasta 1000, con máximo 2 decimales.');
      return;
    }
    if (editingItemIndex === null && draftItems.length >= 100) {
      Alert.alert('Límite de ejercicios', 'Puedes añadir hasta 100 ejercicios por examen.');
      return;
    }
    setDraftItems((items) => {
      const draft = { title, description: newItemDescription.trim() || null, max_points: maxPoints };
      if (editingItemIndex === null) return [...items, draft];
      return items.map((item, index) => index === editingItemIndex ? draft : item);
    });
    setEditingItemIndex(null);
    setNewItemTitle('');
    setNewItemDescription('');
    setNewItemPoints('');
  }

  function editManualExamItem(index: number) {
    if (saving || draftInputMode !== 'manual') return;
    const item = draftItems[index];
    if (!item) return;
    setEditingItemIndex(index);
    setNewItemTitle(item.title);
    setNewItemDescription(item.description ?? '');
    setNewItemPoints(String(item.max_points));
  }

  function removeManualExamItem(index: number) {
    if (saving || draftInputMode !== 'manual') return;
    setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
    if (editingItemIndex === index) {
      setEditingItemIndex(null);
      setNewItemTitle('');
      setNewItemDescription('');
      setNewItemPoints('');
    } else if (editingItemIndex !== null && index < editingItemIndex) {
      setEditingItemIndex(editingItemIndex - 1);
    }
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
      Alert.alert('Faltan ejercicios', 'Agrega ejercicios manualmente o carga un Excel con la definición.');
      return;
    }
    if (draftInputMode === 'manual' && (newItemTitle.trim() || newItemDescription.trim() || newItemPoints.trim())) {
      Alert.alert('Ejercicio sin agregar', 'Agrega el ejercicio en edición antes de guardar el examen.');
      return;
    }

    try {
      setSaving(true);
      if (editingDraft) {
        await updateStaffExamDraft({
          examId: editingDraft.examId,
          updatedAt: editingDraft.updatedAt,
          code,
          title,
          examDate: date || null,
          items: draftItems,
        });
      } else {
        await createTrainerExamDraft({
          code,
          title,
          examDate: date || null,
          items: draftItems,
        });
      }
      const wasEditing = Boolean(editingDraft);
      setUploadOpen(false);
      resetDraftUpload();
      setCatalogView('drafts');
      await load();
      Alert.alert(
        wasEditing ? 'Borrador actualizado' : 'Examen cargado',
        wasEditing
          ? 'Los ejercicios del borrador quedaron actualizados.'
          : 'Quedó guardado como borrador. Puedes publicarlo desde esta misma pantalla.',
      );
    } catch (cause) {
      Alert.alert(editingDraft ? 'No se pudo actualizar el borrador' : 'No se pudo cargar el examen',
        cause instanceof Error ? cause.message : 'Revisa los datos e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function confirmPublishDraft(draft: TrainerExamDraftRow) {
    if (saving || !capabilities.canPublishExamDefinition) return;
    Alert.alert(
      'Publicar examen',
      'Al publicarlo, la estructura del examen queda congelada. Podrás capturar y subir calificaciones después.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Publicar',
          onPress: () => void runPublishDraft(draft),
        },
      ],
    );
  }

  async function runPublishDraft(draft: TrainerExamDraftRow) {
    if (saving || !capabilities.canPublishExamDefinition) return;
    try {
      setSaving(true);
      await publishTrainerExam(draft.examId);
      setCatalogView('published');
      await load();
      Alert.alert('Examen publicado', `${draft.examTitle} ya está disponible para evaluación.`);
    } catch (cause) {
      Alert.alert('No se pudo publicar', cause instanceof Error ? cause.message : 'Revisa el examen e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!capabilities.canUseTrainingWorkspace) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{isAdmin ? 'Administración' : 'Entrenador'} · Evaluación</Text>
        <Text style={styles.title}>Exámenes</Text>
        <Text style={styles.subtitle}>Consulta exámenes publicados o borradores. Solo Administración oficializa resultados y cambios de nivel.</Text>
        <Pressable
          disabled={saving}
          style={styles.newExamButton}
          onPress={() => { resetDraftUpload(); setUploadOpen(true); }}
        >
          <MaterialIcons name="note-add" size={18} color={ucapsaBrand.colors.surface} />
          <Text style={styles.newExamButtonText}>Nuevo examen</Text>
        </Pressable>
      </View>

      <View style={styles.catalogTabs} accessibilityRole="tablist">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: catalogView === 'published' }}
          style={[styles.catalogTab, catalogView === 'published' && styles.catalogTabSelected]}
          onPress={() => setCatalogView('published')}>
          <Text style={[styles.catalogTabText, catalogView === 'published' && styles.catalogTabTextSelected]}>
            Publicados ({exams.length})
          </Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: catalogView === 'drafts' }}
          style={[styles.catalogTab, catalogView === 'drafts' && styles.catalogTabSelected]}
          onPress={() => setCatalogView('drafts')}>
          <Text style={[styles.catalogTabText, catalogView === 'drafts' && styles.catalogTabTextSelected]}>
            Borradores ({drafts.length})
          </Text>
        </Pressable>
      </View>

      {!loading && !error && catalogView === 'drafts' && drafts.length > 0 ? (
        <View style={styles.draftsSection}>
          <Text style={styles.sectionKicker}>BORRADORES</Text>
          <Text style={styles.sectionTitle}>Borradores listos para publicar</Text>
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
                <View style={styles.draftActions}>
                  <View style={styles.pendingPill}>
                    <Text style={styles.pendingPillText}>Borrador</Text>
                  </View>
                  {capabilities.canUploadExamDefinition ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Editar borrador ${draft.examTitle}`}
                      disabled={saving}
                      style={[styles.editDraftButton, saving && styles.disabled]}
                      onPress={() => void openSavedDraft(draft)}
                    >
                      <MaterialIcons name="edit" size={16} color={ucapsaBrand.colors.blueDark} />
                      <Text style={styles.editDraftText}>Editar</Text>
                    </Pressable>
                  ) : null}
                  {capabilities.canPublishExamDefinition ? (
                    <Pressable
                      disabled={saving}
                      style={[styles.publishDraftButton, saving && styles.disabled]}
                      onPress={() => confirmPublishDraft(draft)}
                    >
                      <MaterialIcons name="publish" size={16} color={ucapsaBrand.colors.surface} />
                      <Text style={styles.publishDraftText}>Publicar</Text>
                    </Pressable>
                  ) : null}
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

      {!loading && !error && catalogView === 'drafts' && drafts.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="pending-actions" size={28} color={ucapsaBrand.colors.muted} />
          <Text style={styles.emptyTitle}>No hay borradores pendientes</Text>
        </View>
      ) : null}

      {!loading && !error && catalogView === 'published' && exams.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="assignment" size={28} color={ucapsaBrand.colors.muted} />
          <Text style={styles.emptyTitle}>No hay exámenes publicados</Text>
        </View>
      ) : null}

      {!loading && !error && catalogView === 'published' ? <View style={styles.list}>
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
      </View> : null}

      <KeyboardAwareModal
        visible={uploadOpen}
        onClose={() => { setUploadOpen(false); resetDraftUpload(); }}
      >
        <Text style={styles.modalKicker}>{editingDraft ? 'Editar borrador' : 'Nuevo examen'}</Text>
        <Text style={styles.modalTitle}>{editingDraft ? 'Editar examen' : 'Crear examen'}</Text>
        <Text style={styles.modalSubtitle}>
          Define la estructura manualmente o importa los ejercicios desde Excel. Ambos métodos guardan el mismo borrador canónico.
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

        <Text style={styles.fieldLabel}>Cómo agregar ejercicios</Text>
        <View style={styles.inputModeRow}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: draftInputMode === 'manual' }} disabled={saving} style={[styles.inputModeButton, draftInputMode === 'manual' && styles.inputModeSelected]} onPress={() => chooseDraftInputMode('manual')}>
            <MaterialIcons name="edit-note" size={18} color={draftInputMode === 'manual' ? ucapsaBrand.colors.surface : ucapsaBrand.colors.redDark} />
            <Text style={[styles.inputModeText, draftInputMode === 'manual' && styles.inputModeTextSelected]}>Crear manual</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: draftInputMode === 'excel' }} disabled={saving} style={[styles.inputModeButton, draftInputMode === 'excel' && styles.inputModeSelected]} onPress={() => chooseDraftInputMode('excel')}>
            <MaterialIcons name="upload-file" size={18} color={draftInputMode === 'excel' ? ucapsaBrand.colors.surface : ucapsaBrand.colors.redDark} />
            <Text style={[styles.inputModeText, draftInputMode === 'excel' && styles.inputModeTextSelected]}>Importar Excel</Text>
          </Pressable>
        </View>

        {draftInputMode === 'excel' ? (
          <Pressable disabled={saving} style={styles.definitionButton} onPress={() => void chooseExamDefinition()}>
            <MaterialIcons name="upload-file" size={19} color={ucapsaBrand.colors.purpleDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.definitionTitle}>{draftFileName || 'Seleccionar Excel del examen'}</Text>
              <Text style={styles.definitionHint}>Columnas: Ejercicio · Puntos máximos · Descripción opcional</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.manualEditor}>
            <Text style={styles.fieldLabel}>Ejercicio</Text>
            <TextInput value={newItemTitle} onChangeText={setNewItemTitle} placeholder="Ej. Sentado" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.fieldInput} />
            <Text style={styles.fieldLabel}>Descripción · opcional</Text>
            <TextInput value={newItemDescription} onChangeText={setNewItemDescription} placeholder="Qué se evaluará" multiline placeholderTextColor={ucapsaBrand.colors.muted} style={[styles.fieldInput, styles.multiInput]} />
            <Text style={styles.fieldLabel}>Puntos máximos</Text>
            <TextInput value={newItemPoints} onChangeText={setNewItemPoints} keyboardType="decimal-pad" placeholder="Ej. 10" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.fieldInput} />
            <Pressable accessibilityRole="button" disabled={saving} style={styles.addItemButton} onPress={addManualExamItem}>
              <MaterialIcons name="add-circle-outline" size={18} color={ucapsaBrand.colors.blueDark} />
              <Text style={styles.addItemText}>{editingItemIndex === null ? 'Agregar ejercicio' : 'Guardar ejercicio'}</Text>
            </Pressable>
          </View>
        )}

        {draftItems.length > 0 ? (
          <View style={styles.definitionPreview}>
            <Text style={styles.previewTitle}>{draftItems.length} ejercicio{draftItems.length === 1 ? '' : 's'} en el borrador</Text>
            {draftItems.map((item, index) => (
              <View key={`${index}:${item.title}`} style={styles.previewRow}>
                <Text style={styles.previewNumber}>{index + 1}</Text>
                <Text numberOfLines={1} style={styles.previewName}>{item.title}</Text>
                <Text style={styles.previewPoints}>{item.max_points} pts</Text>
                {draftInputMode === 'manual' ? (
                  <>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Editar ejercicio ${index + 1}: ${item.title}`} disabled={saving} onPress={() => editManualExamItem(index)}>
                      <MaterialIcons name="edit" size={19} color={ucapsaBrand.colors.blueDark} />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ejercicio ${index + 1}: ${item.title}`} disabled={saving} onPress={() => removeManualExamItem(index)}>
                      <MaterialIcons name="delete-outline" size={20} color={ucapsaBrand.colors.danger} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          disabled={saving || !draftCode.trim() || !draftTitle.trim() || draftItems.length === 0}
          style={[styles.saveDraftButton, (saving || !draftCode.trim() || !draftTitle.trim() || draftItems.length === 0) && styles.disabled]}
          onPress={() => void saveExamDraft()}
        >
          <MaterialIcons name="save" size={18} color={ucapsaBrand.colors.surface} />
          <Text style={styles.saveDraftText}>{saving ? 'Guardando…' : editingDraft ? 'Guardar cambios' : 'Guardar borrador'}</Text>
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
  catalogTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  catalogTab: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  catalogTabSelected: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  catalogTabText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
  catalogTabTextSelected: { color: ucapsaBrand.colors.surface },
  draftsSection: { marginBottom: 16 },
  sectionKicker: { color: ucapsaBrand.colors.goldDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900', marginTop: 1, marginBottom: 8 },
  draftList: { gap: 7 },
  draftCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.gold, backgroundColor: ucapsaBrand.colors.goldPale, padding: 10 },
  draftIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  draftCode: { color: ucapsaBrand.colors.goldDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  draftTitle: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 1 },
  draftMeta: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  draftActions: { alignItems: 'flex-end', gap: 6 },
  pendingPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 8, paddingVertical: 5 },
  pendingPillText: { color: ucapsaBrand.colors.goldDark, fontSize: 8, fontWeight: '900' },
  editDraftButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: ucapsaBrand.colors.blueSoft, paddingHorizontal: 8 },
  editDraftText: { color: ucapsaBrand.colors.blueDark, fontSize: 8, fontWeight: '900' },
  publishDraftButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: ucapsaBrand.colors.greenDark, paddingHorizontal: 8 },
  publishDraftText: { color: ucapsaBrand.colors.surface, fontSize: 8, fontWeight: '900' },
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
  inputModeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  inputModeButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface },
  inputModeSelected: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  inputModeText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  inputModeTextSelected: { color: ucapsaBrand.colors.surface },
  manualEditor: { marginTop: 8 },
  multiInput: { minHeight: 66, textAlignVertical: 'top', paddingVertical: 9 },
  addItemButton: { minHeight: 44, marginTop: 11, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: ucapsaBrand.colors.blueSoft },
  addItemText: { color: ucapsaBrand.colors.blueDark, fontSize: 11, fontWeight: '900' },
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
