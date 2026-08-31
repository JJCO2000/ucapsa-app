import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { createMyDog, getMyDogs, renameMyDog, type BasicDog } from '../../services/dogs.service';
import { clientReadKeys, readClientResource, sanitizeProgramRowsForCache, writeClientResource } from '../../services/client-read-cache.service';
import { getMyProgramEnrollments, getProgramCodeLabel, getProgramLevelLabel } from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS, friendlyReadError, friendlyWriteError, withOperationTimeout } from '../../utils/async.utils';

type EditorMode = 'create' | 'rename' | null;

function sameDogName(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? '').trim().toLocaleLowerCase('es-MX') === (right ?? '').trim().toLocaleLowerCase('es-MX');
}

export default function DogTab() {
  const { user, role, isAdmin } = useSession();
  const [dogs, setDogs] = useState<BasicDog[]>([]);
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [programWarning, setProgramWarning] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError('');
    setUsingSavedData(false);
    setProgramWarning(false);

    const [dogCache, programCache] = await Promise.all([
      readClientResource<BasicDog[]>(user.id, clientReadKeys.dogs),
      readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs),
    ]);
    let nextDogs = dogCache?.data ?? [];
    let nextPrograms = programCache?.data ?? [];

    if (dogCache || programCache) {
      setDogs(nextDogs);
      setRows(nextPrograms);
      setSavedAt(dogCache?.saved_at ?? programCache?.saved_at ?? null);
      setLoading(false);
    }

    const [dogResult, programResult] = await Promise.allSettled([
      withOperationTimeout(getMyDogs(), DEFAULT_READ_TIMEOUT_MS, 'dogs'),
      withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'dog-programs'),
    ]);

    if (dogResult.status === 'fulfilled') {
      nextDogs = dogResult.value;
      const stored = await writeClientResource(user.id, clientReadKeys.dogs, nextDogs);
      setSavedAt(stored.saved_at);
    }
    if (programResult.status === 'fulfilled') {
      nextPrograms = programResult.value;
      await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(nextPrograms));
    }

    setDogs(nextDogs);
    setRows(nextPrograms);
    setSelectedDogId((current) => {
      if (current && nextDogs.some((dog) => dog.id === current)) return current;
      return nextDogs[0]?.id ?? null;
    });

    const dogFailed = dogResult.status === 'rejected';
    const programFailed = programResult.status === 'rejected';
    if (dogFailed && !dogCache) {
      setError(friendlyReadError('No se pudieron cargar tus perros.'));
    } else if (dogFailed || programFailed) {
      setUsingSavedData(Boolean((dogFailed && dogCache) || (programFailed && programCache)));
      setSavedAt(
        dogFailed && dogCache
          ? dogCache.saved_at
          : programFailed && programCache
            ? programCache.saved_at
            : null,
      );
    }
    if (programFailed && !programCache) setProgramWarning(true);

    setLoading(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const activeEnrollments = useMemo(() => rows.filter((item) => item.enrollment.status === 'active'), [rows]);
  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: activeEnrollments.length > 0 }),
    [activeEnrollments.length, isAdmin, role, user],
  );
  const premium = format.key === 'member';
  const selectedDog = useMemo(() => dogs.find((dog) => dog.id === selectedDogId) ?? dogs[0] ?? null, [dogs, selectedDogId]);
  const selectedEnrollments = useMemo(() => {
    if (!selectedDog) return [];
    return rows.filter((item) => {
      if (item.enrollment.dog_id) return item.enrollment.dog_id === selectedDog.id;
      return sameDogName(item.enrollment.dog_name, selectedDog.name);
    });
  }, [rows, selectedDog]);
  const selectedActive = useMemo(() => selectedEnrollments.filter((item) => item.enrollment.status === 'active'), [selectedEnrollments]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  function openCreate() {
    setDraftName('');
    setEditorMode('create');
  }

  function openRename() {
    if (!selectedDog) {
      openCreate();
      return;
    }
    setDraftName(selectedDog.name);
    setEditorMode('rename');
  }

  async function saveDog() {
    const userId = user?.id;
    if (!userId) {
      Alert.alert('Sesion requerida', 'Vuelve a iniciar sesion para guardar cambios.');
      return;
    }

    const name = draftName.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de tu perro.');
      return;
    }

    setSaving(true);
    try {
      let selectedAfterSave: string | null = null;
      let nextDogs = dogs;
      if (editorMode === 'create') {
        // Crear un perro no usa timeout artificial: una peticion tardia podria completar despues y duplicarse al reintentar.
        const created = await createMyDog(name);
        selectedAfterSave = created.id;
        nextDogs = [...dogs.filter((dog) => dog.id !== created.id), created];
      } else if (editorMode === 'rename' && selectedDog) {
        const updated = await withOperationTimeout(renameMyDog(selectedDog.id, name), DEFAULT_WRITE_TIMEOUT_MS, 'dog-rename');
        selectedAfterSave = updated.id;
        nextDogs = dogs.map((dog) => (dog.id === updated.id ? updated : dog));
      }

      // La escritura ya fue confirmada. Actualiza primero la vista y la cache local;
      // si la lectura posterior falla, el usuario no debe ver desaparecer el cambio.
      setDogs(nextDogs);
      await writeClientResource(userId, clientReadKeys.dogs, nextDogs);
      setEditorMode(null);
      setDraftName('');
      if (selectedAfterSave) setSelectedDogId(selectedAfterSave);
      void load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', friendlyWriteError(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.hero}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir mis datos"
          style={[styles.petIcon, { backgroundColor: format.surfaceAlt, borderColor: format.border }]}
          onPress={() => router.push('/account-settings?section=profile' as never)}
        >
          <MaterialIcons name="pets" size={32} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <View style={[styles.editDot, premium && styles.editDotPremium]}><MaterialIcons name="edit" size={14} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.surface} /></View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Mis perros</Text>
          <Text style={[styles.title, { color: format.text }]}>{selectedDog?.name || 'Agrega tu primer perro'}</Text>
          <Text style={[styles.subtitle, { color: format.muted }]}>
            {dogs.length > 1 ? `${dogs.length} perros registrados. Elige uno para ver sus clases.` : dogs.length === 1 ? 'La pata con lapiz abre Mis datos. Edita al perro desde su tarjeta.' : 'La pata con lapiz abre Mis datos. Puedes registrar mas de un perro aqui.'}
          </Text>
        </View>
      </View>

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando informacion guardada" /> : null}
      {programWarning ? <View style={[styles.errorCard, premium && styles.errorCardPremium]}><Text style={[styles.errorTitle, premium && styles.textPremium]}>Clases no disponibles</Text><Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tus perros cargaron, pero no pudimos actualizar sus clases. Reintenta para ver progreso y asistencias.</Text></View> : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando perros...</Text></View> : null}
      {error ? <View style={[styles.errorCard, premium && styles.errorCardPremium]}><Text style={[styles.errorTitle, premium && styles.textPremium]}>No se pudieron cargar</Text><Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{error}</Text><Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void refresh()}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Reintentar</Text></Pressable></View> : null}

      {!loading && !error ? (
        <>
          <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Tus perros</Text>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Selecciona el perro que quieres consultar.</Text>
              </View>
              <Pressable style={[styles.addButton, { backgroundColor: format.primaryButton }]} onPress={openCreate}>
                <MaterialIcons name="add" size={18} color={format.primaryButtonText} />
                <Text style={[styles.addButtonText, { color: format.primaryButtonText }]}>Agregar</Text>
              </Pressable>
            </View>

            {dogs.length === 0 ? (
              <Pressable style={[styles.emptyDog, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={openCreate}>
                <MaterialIcons name="pets" size={28} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                <Text style={[styles.emptyDogTitle, { color: format.cardText }]}>Agrega tu primer perro</Text>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Despues podras agregar los demas desde esta misma pantalla.</Text>
              </Pressable>
            ) : (
              <View style={styles.dogGrid}>
                {dogs.map((dog) => {
                  const selected = selectedDog?.id === dog.id;
                  return (
                    <Pressable
                      key={dog.id}
                      style={[
                        styles.dogChip,
                        { borderColor: selected ? format.accent : format.cardBorder, backgroundColor: selected ? format.pillBackground : format.secondaryButton },
                      ]}
                      onPress={() => setSelectedDogId(dog.id)}
                    >
                      <MaterialIcons name="pets" size={18} color={selected ? format.pillText : premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                      <Text style={[styles.dogChipText, { color: selected ? format.pillText : format.cardText }]} numberOfLines={1}>{dog.name}</Text>
                      {selected ? <MaterialIcons name="check-circle" size={18} color={format.pillText} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {selectedDog ? (
            <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: format.cardText }]}>{selectedDog.name}</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{programWarning ? 'Clases no disponibles' : `${selectedActive.length} clase${selectedActive.length === 1 ? '' : 's'} activa${selectedActive.length === 1 ? '' : 's'}`}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Editar a ${selectedDog.name}`} style={[styles.pencilButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]} onPress={openRename}>
                  <MaterialIcons name="edit" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                </Pressable>
              </View>

              {programWarning ? (
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Conectate para consultar las clases de {selectedDog.name}.</Text>
              ) : selectedEnrollments.length === 0 ? (
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>No hay clases vinculadas a {selectedDog.name}.</Text>
              ) : selectedEnrollments.map((item) => (
                <View key={item.enrollment.id} style={[styles.classRow, premium && styles.rowPremium]}>
                  <View style={[styles.classIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="school" size={19} color={format.pillText} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.classTitle, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}</Text>
                    <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{getProgramLevelLabel(item.enrollment.program_level)} - {item.attendances.length}/{item.program.required_attendances} asistencias</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <KeyboardAwareModal
        visible={editorMode !== null}
        onClose={() => setEditorMode(null)}
        sheetStyle={premium ? styles.modalCardPremium : undefined}
        contentContainerStyle={styles.modalContent}
      >
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalTitle, premium && styles.textPremium]}>{editorMode === 'create' ? 'Agregar perro' : 'Editar perro'}</Text>
            <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{editorMode === 'create' ? 'Registra otro perro en tu cuenta.' : 'Cambia el nombre sin perder sus clases.'}</Text>
          </View>
          <Pressable onPress={() => setEditorMode(null)}><MaterialIcons name="close" size={25} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.text} /></Pressable>
        </View>
        <Text style={[styles.label, premium && styles.textPremium]}>Nombre</Text>
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Ej. Max, Luna, Toby"
          placeholderTextColor={premium ? ucapsaBrand.colors.redBorder : ucapsaBrand.colors.gray}
          autoCapitalize="words"
          autoFocus
          style={[styles.input, premium && styles.inputPremium]}
        />
        <View style={styles.actions}>
          <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => setEditorMode(null)} disabled={saving}>
            <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => void saveDog()} disabled={saving}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Guardando...' : editorMode === 'create' ? 'Agregar perro' : 'Guardar'}</Text>
          </Pressable>
        </View>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  petIcon: { position: 'relative', width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  editDot: { position: 'absolute', right: -3, bottom: -3, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.red },
  editDotPremium: { backgroundColor: ucapsaBrand.colors.premiumAction, borderWidth: 1, borderColor: ucapsaBrand.colors.gold },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 2 },
  loading: { flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 12 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  textPremium: { color: ucapsaBrand.colors.surface },
  errorCard: { gap: 5, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 15, marginBottom: 14 },
  errorCardPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34), backgroundColor: ucapsaBrand.colors.premiumSurface },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 16, fontWeight: '900' },
  card: { gap: 12, borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9 },
  addButtonText: { fontSize: 12, fontWeight: '900' },
  emptyDog: { alignItems: 'center', gap: 6, borderRadius: 18, borderWidth: 1, padding: 18 },
  emptyDogTitle: { fontSize: 16, fontWeight: '900' },
  dogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  dogChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 16, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10 },
  dogChipText: { maxWidth: 165, fontSize: 13, fontWeight: '900' },
  pencilButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.premiumMuted, paddingTop: 11 },
  rowPremium: { borderTopColor: withAlpha(ucapsaBrand.colors.gold, 0.16) },
  classIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  classTitle: { fontSize: 14, fontWeight: '900' },
  modalContent: { gap: 11 },
  modalCardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderTopWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34) },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 15 },
  inputPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34), backgroundColor: ucapsaBrand.colors.premiumBackground, color: ucapsaBrand.colors.surface },
  actions: { flexDirection: 'row', gap: 9 },
  primaryButton: { flex: 1, alignItems: 'center', borderRadius: 15, paddingVertical: 12 },
  primaryButtonText: { fontSize: 13, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 15, borderWidth: 1, paddingVertical: 12 },
  secondaryButtonText: { fontSize: 13, fontWeight: '900' },
});
