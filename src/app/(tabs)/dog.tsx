import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { createMyDog, getMyDogs, renameMyDog, type BasicDog } from '../../services/dogs.service';
import { getMyProgramEnrollments, getProgramCodeLabel, getProgramLevelLabel } from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

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

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError('');
    try {
      const [dogRows, enrollmentRows] = await Promise.all([getMyDogs(), getMyProgramEnrollments()]);
      setDogs(dogRows);
      setRows(enrollmentRows);
      setSelectedDogId((current) => {
        if (current && dogRows.some((dog) => dog.id === current)) return current;
        return dogRows[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus perros.');
    } finally {
      setLoading(false);
    }
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
    const name = draftName.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de tu perro.');
      return;
    }

    setSaving(true);
    try {
      if (editorMode === 'create') {
        const created = await createMyDog(name);
        await load();
        setSelectedDogId(created.id);
      } else if (editorMode === 'rename' && selectedDog) {
        const updated = await renameMyDog(selectedDog.id, name);
        await load();
        setSelectedDogId(updated.id);
      }
      setEditorMode(null);
      setDraftName('');
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
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
          <MaterialIcons name="pets" size={32} color={premium ? '#FFE8B5' : format.accentDark} />
          <View style={[styles.editDot, premium && styles.editDotPremium]}><MaterialIcons name="edit" size={14} color={premium ? '#7A1020' : '#FFFFFF'} /></View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: premium ? '#FFE8B5' : format.accentDark }]}>Mis perros</Text>
          <Text style={[styles.title, { color: format.text }]}>{selectedDog?.name || 'Agrega tu primer perro'}</Text>
          <Text style={[styles.subtitle, { color: format.muted }]}>
            {dogs.length > 1 ? `${dogs.length} perros registrados. Elige uno para ver sus clases.` : dogs.length === 1 ? 'La pata con lapiz abre Mis datos. Edita al perro desde su tarjeta.' : 'La pata con lapiz abre Mis datos. Puedes registrar mas de un perro aqui.'}
          </Text>
        </View>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando perros...</Text></View> : null}
      {error ? <View style={[styles.errorCard, premium && styles.errorCardPremium]}><Text style={[styles.errorTitle, premium && styles.textPremium]}>No se pudieron cargar</Text><Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>{error}</Text></View> : null}

      {!loading && !error ? (
        <>
          <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}> 
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Tus perros</Text>
                <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>Selecciona el perro que quieres consultar.</Text>
              </View>
              <Pressable style={[styles.addButton, { backgroundColor: format.primaryButton }]} onPress={openCreate}>
                <MaterialIcons name="add" size={18} color={format.primaryButtonText} />
                <Text style={[styles.addButtonText, { color: format.primaryButtonText }]}>Agregar</Text>
              </Pressable>
            </View>

            {dogs.length === 0 ? (
              <Pressable style={[styles.emptyDog, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={openCreate}>
                <MaterialIcons name="pets" size={28} color={premium ? '#FFE8B5' : format.accentDark} />
                <Text style={[styles.emptyDogTitle, { color: format.cardText }]}>Agrega tu primer perro</Text>
                <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>Despues podras agregar los demas desde esta misma pantalla.</Text>
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
                      <MaterialIcons name="pets" size={18} color={selected ? format.pillText : premium ? '#FFE8B5' : format.accentDark} />
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
                  <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>{selectedActive.length} clase{selectedActive.length === 1 ? '' : 's'} activa{selectedActive.length === 1 ? '' : 's'}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Editar a ${selectedDog.name}`} style={[styles.pencilButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]} onPress={openRename}>
                  <MaterialIcons name="edit" size={19} color={premium ? '#FFE8B5' : format.accentDark} />
                </Pressable>
              </View>

              {selectedEnrollments.length === 0 ? (
                <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>No hay clases vinculadas a {selectedDog.name}.</Text>
              ) : selectedEnrollments.map((item) => (
                <View key={item.enrollment.id} style={[styles.classRow, premium && styles.rowPremium]}>
                  <View style={[styles.classIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="school" size={19} color={format.pillText} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.classTitle, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}</Text>
                    <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>{getProgramLevelLabel(item.enrollment.program_level)} - {item.attendances.length}/{item.program.required_attendances} asistencias</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <Modal visible={editorMode !== null} transparent animationType="slide" onRequestClose={() => setEditorMode(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, premium && styles.modalCardPremium]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, premium && styles.textPremium]}>{editorMode === 'create' ? 'Agregar perro' : 'Editar perro'}</Text>
                <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>{editorMode === 'create' ? 'Registra otro perro en tu cuenta.' : 'Cambia el nombre sin perder sus clases.'}</Text>
              </View>
              <Pressable onPress={() => setEditorMode(null)}><MaterialIcons name="close" size={25} color={premium ? '#FFE8B5' : ucapsaBrand.colors.text} /></Pressable>
            </View>
            <Text style={[styles.label, premium && styles.textPremium]}>Nombre</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Ej. Max, Luna, Toby"
              placeholderTextColor={premium ? '#D7A0A9' : '#9CA3AF'}
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
          </View>
        </View>
      </Modal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: '#270711' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  petIcon: { position: 'relative', width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  editDot: { position: 'absolute', right: -3, bottom: -3, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.red },
  editDotPremium: { backgroundColor: '#FFE8B5', borderWidth: 1, borderColor: '#FACC15' },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 2 },
  loading: { flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 12 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  textPremium: { color: '#FFFFFF' },
  errorCard: { gap: 5, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 15, marginBottom: 14 },
  errorCardPremium: { borderColor: 'rgba(250,204,21,0.34)', backgroundColor: '#38111B' },
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
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 11 },
  rowPremium: { borderTopColor: 'rgba(250,204,21,0.16)' },
  classIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  classTitle: { fontSize: 14, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
  modalCard: { gap: 11, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF', padding: 20, paddingBottom: 34 },
  modalCardPremium: { backgroundColor: '#38111B', borderTopWidth: 1, borderColor: 'rgba(250,204,21,0.34)' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 15 },
  inputPremium: { borderColor: 'rgba(250,204,21,0.34)', backgroundColor: '#270711', color: '#FFFFFF' },
  actions: { flexDirection: 'row', gap: 9 },
  primaryButton: { flex: 1, alignItems: 'center', borderRadius: 15, paddingVertical: 12 },
  primaryButtonText: { fontSize: 13, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 15, borderWidth: 1, paddingVertical: 12 },
  secondaryButtonText: { fontSize: 13, fontWeight: '900' },
});
