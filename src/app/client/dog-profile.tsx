import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyDogProfile, updateMyDogProfile, type DogProfile } from '../../services/dogs.service';
import { DEFAULT_READ_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS, friendlyWriteError, withOperationTimeout } from '../../utils/async.utils';

type DogSex = DogProfile['sex'];

type ProfileDraft = {
  name: string;
  breed: string;
  birthDate: string;
  sex: DogSex;
  weight: string;
  allergies: string;
  medications: string;
  feedingNotes: string;
  behaviorNotes: string;
  notes: string;
};

const EMPTY_DRAFT: ProfileDraft = {
  name: '',
  breed: '',
  birthDate: '',
  sex: null,
  weight: '',
  allergies: '',
  medications: '',
  feedingNotes: '',
  behaviorNotes: '',
  notes: '',
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function draftFromProfile(profile: DogProfile): ProfileDraft {
  return {
    name: profile.name,
    breed: profile.breed ?? '',
    birthDate: profile.birth_date ?? '',
    sex: profile.sex,
    weight: profile.weight_kg == null ? '' : String(profile.weight_kg),
    allergies: profile.allergies ?? '',
    medications: profile.medications ?? '',
    feedingNotes: profile.feeding_notes ?? '',
    behaviorNotes: profile.behavior_notes ?? '',
    notes: profile.notes ?? '',
  };
}

function normalizeBirthDate(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return undefined;
  if (date.getTime() > Date.now()) return undefined;
  return text;
}

export default function DogProfileScreen() {
  const { user, role, isAdmin } = useSession();
  const params = useLocalSearchParams<{ dogId?: string | string[] }>();
  const dogId = getParam(params.dogId).trim();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = Boolean(user) && format.key === 'member' && !isAdmin;

  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [profile, setProfile] = useState<DogProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin || !dogId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const nextProfile = await withOperationTimeout(getMyDogProfile(dogId), DEFAULT_READ_TIMEOUT_MS, 'dog-profile');
      setProfile(nextProfile);
      setDraft(draftFromProfile(nextProfile));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [dogId, isAdmin, user]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!dogId || !user) return;
    const name = draft.name.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de tu perro.');
      return;
    }

    const birthDate = normalizeBirthDate(draft.birthDate);
    if (birthDate === undefined) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD y una fecha que no sea futura.');
      return;
    }

    const normalizedWeight = draft.weight.trim().replace(',', '.');
    const weight = normalizedWeight ? Number(normalizedWeight) : null;
    if (weight != null && (!Number.isFinite(weight) || weight < 0)) {
      Alert.alert('Peso inválido', 'Escribe un peso igual o mayor a cero.');
      return;
    }

    setSaving(true);
    try {
      const saved = await withOperationTimeout(
        updateMyDogProfile(dogId, {
          name,
          breed: draft.breed,
          birth_date: birthDate,
          sex: draft.sex,
          weight_kg: weight,
          allergies: draft.allergies,
          medications: draft.medications,
          feeding_notes: draft.feedingNotes,
          behavior_notes: draft.behaviorNotes,
          notes: draft.notes,
        }),
        DEFAULT_WRITE_TIMEOUT_MS,
        'dog-profile-save',
      );
      setProfile(saved);
      setDraft(draftFromProfile(saved));
      Alert.alert('Datos guardados', `El perfil de ${saved.name} se actualizó correctamente.`);
    } catch (cause) {
      Alert.alert('No se pudo guardar', friendlyWriteError(cause, 'Conéctate a internet y vuelve a intentar.'));
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
      contentContainerStyle={styles.screenContent}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a Mi perro"
          style={[styles.backButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>MI PERRO</Text>
          <Text style={[styles.title, { color: format.cardText }]}>{profile?.name ? `Datos de ${profile.name}` : 'Datos del perro'}</Text>
          <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Edita únicamente la información del perro seleccionado.</Text>
        </View>
      </View>

      {!dogId ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>No encontramos el perro</Text>
          <Text style={[styles.helper, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Vuelve a Mi perro y selecciona cuál quieres editar.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.back()}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Volver</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>Cargando datos…</Text>
          <Text style={[styles.helper, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Estamos verificando el perfil actualizado de este perro.</Text>
        </View>
      ) : loadError ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <MaterialIcons name="cloud-off" size={26} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>No pudimos cargar los datos</Text>
          <Text style={[styles.helper, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Para editar el perfil completo necesitamos verificarlo en línea. Tus clases y logros no se modificaron.</Text>
          <View style={styles.buttonRow}>
            <Pressable style={[styles.secondaryButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]} onPress={() => router.back()}>
              <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Volver</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => void load()}>
              <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Reintentar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Identificación</Text>
            <Field label="Nombre" value={draft.name} onChangeText={(value) => setField('name', value)} premium={premium} required />
            <Field label="Raza" value={draft.breed} onChangeText={(value) => setField('breed', value)} premium={premium} placeholder="Ej. Pastor alemán" />
            <Field label="Fecha de nacimiento" value={draft.birthDate} onChangeText={(value) => setField('birthDate', value)} premium={premium} placeholder="AAAA-MM-DD" autoCapitalize="none" />

            <Text style={[styles.label, premium && styles.textPremium]}>Sexo</Text>
            <View style={styles.sexRow}>
              <SexOption label="Hembra" value="female" selected={draft.sex === 'female'} onPress={() => setField('sex', 'female')} premium={premium} />
              <SexOption label="Macho" value="male" selected={draft.sex === 'male'} onPress={() => setField('sex', 'male')} premium={premium} />
              <SexOption label="No especificado" value="unknown" selected={draft.sex === 'unknown' || draft.sex == null} onPress={() => setField('sex', 'unknown')} premium={premium} />
            </View>

            <Field label="Peso (kg)" value={draft.weight} onChangeText={(value) => setField('weight', value)} premium={premium} placeholder="Ej. 24.5" keyboardType="decimal-pad" />
          </View>

          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Salud y rutina</Text>
            <Field label="Alergias" value={draft.allergies} onChangeText={(value) => setField('allergies', value)} premium={premium} placeholder="Si no tiene, déjalo vacío" multiline />
            <Field label="Medicamentos" value={draft.medications} onChangeText={(value) => setField('medications', value)} premium={premium} placeholder="Medicamento, dosis u horario" multiline />
            <Field label="Alimentación" value={draft.feedingNotes} onChangeText={(value) => setField('feedingNotes', value)} premium={premium} placeholder="Alimento, porciones, restricciones…" multiline />
          </View>

          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Conducta y notas</Text>
            <Field label="Conducta" value={draft.behaviorNotes} onChangeText={(value) => setField('behaviorNotes', value)} premium={premium} placeholder="Miedos, reactividad, preferencias…" multiline />
            <Field label="Notas adicionales" value={draft.notes} onChangeText={(value) => setField('notes', value)} premium={premium} placeholder="Información útil para su seguimiento" multiline />
          </View>

          <Text style={[styles.safetyNote, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Guardar aquí no cambia clases, logros, historial ni otros perros de tu cuenta.</Text>

          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              style={[styles.secondaryButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}
              onPress={() => router.back()}
              disabled={saving}
            >
              <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, { backgroundColor: format.primaryButton }]}
              onPress={() => void save()}
              disabled={saving}
            >
              <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAwareScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  premium,
  placeholder,
  required = false,
  multiline = false,
  autoCapitalize = 'sentences',
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  premium: boolean;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, premium && styles.textPremium]}>{label}{required ? ' *' : ''}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={premium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.gray}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multilineInput, premium && styles.inputPremium]}
      />
    </View>
  );
}

function SexOption({ label, selected, onPress, premium }: { label: string; value: Exclude<DogSex, null>; selected: boolean; onPress: () => void; premium: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.sexOption,
        premium && styles.sexOptionPremium,
        selected && (premium ? styles.sexOptionSelectedPremium : styles.sexOptionSelected),
      ]}
      onPress={onPress}
    >
      <Text style={[styles.sexOptionText, premium && styles.textPremium, selected && styles.sexOptionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative', paddingBottom: 34 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  backButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.9 },
  title: { marginTop: 2, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  card: { gap: 12, borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  helper: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  fieldGroup: { gap: 6 },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  input: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 16 },
  inputPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, color: ucapsaBrand.colors.premiumText },
  multilineInput: { minHeight: 92 },
  sexRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sexOption: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  sexOptionPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  sexOptionSelected: { borderColor: ucapsaBrand.colors.red, backgroundColor: withAlpha(ucapsaBrand.colors.red, 0.1) },
  sexOptionSelectedPremium: { borderColor: ucapsaBrand.colors.gold, backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.13) },
  sexOptionText: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  sexOptionTextSelected: { fontWeight: '900' },
  safetyNote: { marginHorizontal: 4, marginBottom: 14, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 9, marginBottom: 8 },
  primaryButton: { minHeight: 50, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  secondaryButton: { minHeight: 50, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  secondaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
});
