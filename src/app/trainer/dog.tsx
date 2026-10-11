import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getProgramLevelLabel } from '../../services/programs.service';
import {
  addStaffDogNote,
  getStaffDogNotes,
  getStaffDogs,
  type StaffDogNote,
  type StaffDogRow,
} from '../../services/staff-operations.service';

type NoteType = 'general' | 'training' | 'behavior' | 'interaction' | 'safety';
type Severity = 'info' | 'watch' | 'high';

const noteTypes: Array<{ value: NoteType; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = [
  { value: 'behavior', label: 'Conducta', icon: 'psychology' },
  { value: 'interaction', label: 'Interacción', icon: 'groups' },
  { value: 'training', label: 'Entrenamiento', icon: 'school' },
  { value: 'safety', label: 'Seguridad', icon: 'health-and-safety' },
  { value: 'general', label: 'General', icon: 'notes' },
];

const severities: Array<{ value: Severity; label: string }> = [
  { value: 'info', label: 'Normal' },
  { value: 'watch', label: 'Observar' },
  { value: 'high', label: 'Importante' },
];

function typeLabel(value: string) {
  return noteTypes.find((item) => item.value === value)?.label ?? 'General';
}

function severityTone(value: string) {
  if (value === 'high') return { bg: ucapsaBrand.colors.dangerSoft, fg: ucapsaBrand.colors.danger };
  if (value === 'watch') return { bg: ucapsaBrand.colors.goldPale, fg: ucapsaBrand.colors.goldDark };
  return { bg: ucapsaBrand.colors.blueSoft, fg: ucapsaBrand.colors.blueDark };
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TrainerDogDetailScreen() {
  const { dogId } = useLocalSearchParams<{ dogId?: string }>();
  const { isStaff, isAdmin } = useSession();
  const id = typeof dogId === 'string' ? dogId : '';
  const [dog, setDog] = useState<StaffDogRow | null>(null);
  const [notes, setNotes] = useState<StaffDogNote[]>([]);
  const [note, setNote] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('behavior');
  const [severity, setSeverity] = useState<Severity>('info');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [dogs, history] = await Promise.all([getStaffDogs(), getStaffDogNotes(id)]);
      setDog(dogs.find((item) => item.dogId === id) ?? null);
      setNotes(history);
    } catch (cause) {
      Alert.alert('No se pudo cargar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return undefined;
    setLoading(true);
    void load();
    return undefined;
  }, [isStaff, load]));

  const program = useMemo(() => {
    if (!dog?.programCode) return 'Sin programa activo';
    if (dog.programCode === 'puppy') return 'Puppy';
    return `Comandos · ${getProgramLevelLabel(dog.programLevel as never)}`;
  }, [dog]);

  async function saveNote() {
    if (!id || !note.trim() || saving) return;
    try {
      setSaving(true);
      await addStaffDogNote({ dogId: id, note, noteType, severity });
      setNote('');
      setSeverity('info');
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.green} /><Text style={styles.muted}>Cargando historial…</Text></View> : null}

      {dog ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><MaterialIcons name="pets" size={26} color={ucapsaBrand.colors.greenDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{dog.dogName}</Text>
              <Text style={styles.owner}>{dog.ownerName} · {program}</Text>
              {dog.membershipStatus === 'active' ? <Text style={styles.member}>Socio UCAPSA</Text> : null}
            </View>
          </View>

          <View style={styles.operationalCard}>
            <View style={styles.operationalHeader}>
              <MaterialIcons name="health-and-safety" size={19} color={ucapsaBrand.colors.blueDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.operationalTitle}>Datos operativos</Text>
                <Text style={styles.operationalMeta}>Sólo información útil para entrenamiento y seguridad.</Text>
              </View>
            </View>
            <View style={styles.factGrid}>
              <OperationalField label="Raza" value={dog.breed} />
              <OperationalField label="Sexo" value={dog.sex} />
              <OperationalField label="Peso" value={dog.weightKg === null ? null : `${dog.weightKg} kg`} />
              <OperationalField label="Nacimiento" value={dog.birthDate} />
            </View>
            {dog.allergies || dog.medications ? (
              <View style={styles.safetyAlert}>
                <MaterialIcons name="medical-information" size={18} color={ucapsaBrand.colors.danger} />
                <View style={{ flex: 1 }}>
                  {dog.allergies ? <Text style={styles.safetyText}><Text style={styles.safetyLabel}>Alergias: </Text>{dog.allergies}</Text> : null}
                  {dog.medications ? <Text style={styles.safetyText}><Text style={styles.safetyLabel}>Medicamentos: </Text>{dog.medications}</Text> : null}
                </View>
              </View>
            ) : null}
            {dog.emergencyContactName || dog.emergencyContactPhone || dog.veterinarianName || dog.veterinarianPhone ? (
              <View style={styles.contactGrid}>
                <OperationalField
                  label="Emergencia"
                  value={[dog.emergencyContactName, dog.emergencyContactPhone].filter(Boolean).join(' · ') || null}
                />
                <OperationalField
                  label="Veterinario"
                  value={[dog.veterinarianName, dog.veterinarianPhone].filter(Boolean).join(' · ') || null}
                />
              </View>
            ) : null}
          </View>

          {dog.behaviorNotes ? (
            <View style={styles.legacyNote}>
              <MaterialIcons name="psychology" size={19} color={ucapsaBrand.colors.goldDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.legacyTitle}>Observación base</Text>
                <Text style={styles.legacyText}>{dog.behaviorNotes}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.newNoteCard}>
            <Text style={styles.sectionTitle}>Registrar observación</Text>
            <Text style={styles.helper}>Conserva hechos operativos: conducta, interacción, seguridad o progreso. No reemplaza notas anteriores.</Text>

            <View style={styles.chipRow}>
              {noteTypes.map((item) => (
                <Pressable key={item.value} style={[styles.chip, noteType === item.value && styles.chipActive]} onPress={() => setNoteType(item.value)}>
                  <MaterialIcons name={item.icon} size={15} color={noteType === item.value ? ucapsaBrand.colors.surface : ucapsaBrand.colors.greenDark} />
                  <Text style={[styles.chipText, noteType === item.value && styles.chipTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.chipRow}>
              {severities.map((item) => {
                const active = severity === item.value;
                const tone = severityTone(item.value);
                return (
                  <Pressable key={item.value} style={[styles.severityChip, active && { backgroundColor: tone.bg, borderColor: tone.fg }]} onPress={() => setSeverity(item.value)}>
                    <Text style={[styles.severityText, active && { color: tone.fg }]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Ej. mostró tensión con perros grandes; mantener distancia al ingresar."
              placeholderTextColor={ucapsaBrand.colors.muted}
              style={styles.input}
            />
            <Pressable disabled={!note.trim() || saving} style={[styles.saveButton, (!note.trim() || saving) && styles.disabled]} onPress={() => void saveNote()}>
              <Text style={styles.saveButtonText}>{saving ? 'Guardando…' : 'Guardar en historial'}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Historial de staff</Text>
          <View style={styles.history}>
            {notes.map((item) => {
              const tone = severityTone(item.severity);
              return (
                <View key={item.id} style={styles.historyRow}>
                  <View style={[styles.historyMarker, { backgroundColor: tone.bg }]}>
                    <MaterialIcons name={item.severity === 'high' ? 'warning' : item.severity === 'watch' ? 'visibility' : 'notes'} size={17} color={tone.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.historyTop}>
                      <Text style={[styles.historyType, { color: tone.fg }]}>{typeLabel(item.noteType)}</Text>
                      <Text style={styles.historyDate}>{dateTime(item.occurredAt)}</Text>
                    </View>
                    <Text style={styles.historyNote}>{item.note}</Text>
                    <Text style={styles.historyBy}>{item.createdByName}</Text>
                  </View>
                </View>
              );
            })}
            {notes.length === 0 ? <Text style={styles.muted}>Todavía no hay observaciones internas para este perro.</Text> : null}
          </View>
        </>
      ) : !loading ? (
        <View style={styles.empty}><Text style={styles.sectionTitle}>Perro no encontrado</Text></View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function OperationalField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.operationalField}>
      <Text style={styles.operationalLabel}>{label}</Text>
      <Text style={styles.operationalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 21, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14, marginBottom: 10 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.greenSoft },
  title: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
  owner: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '800', marginTop: 2 },
  member: { alignSelf: 'flex-start', color: ucapsaBrand.colors.purpleDark, backgroundColor: ucapsaBrand.colors.purpleSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, fontSize: 8, fontWeight: '900', marginTop: 5 },
  operationalCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.blue, backgroundColor: ucapsaBrand.colors.surface, padding: 11, marginBottom: 10 },
  operationalHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  operationalTitle: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  operationalMeta: { color: ucapsaBrand.colors.muted, fontSize: 8, lineHeight: 11, fontWeight: '700', marginTop: 1 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  contactGrid: { gap: 7, marginTop: 8 },
  operationalField: { minWidth: '46%', flexGrow: 1, borderRadius: 11, backgroundColor: ucapsaBrand.colors.blueSoft, paddingHorizontal: 8, paddingVertical: 7 },
  operationalLabel: { color: ucapsaBrand.colors.blueDark, fontSize: 7, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  operationalValue: { color: ucapsaBrand.colors.text, fontSize: 9, lineHeight: 13, fontWeight: '800', marginTop: 2 },
  safetyAlert: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 11, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 8, marginTop: 8 },
  safetyText: { color: ucapsaBrand.colors.danger, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  safetyLabel: { fontWeight: '900' },
  legacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.goldPale, padding: 11, marginBottom: 12 },
  legacyTitle: { color: ucapsaBrand.colors.goldDark, fontSize: 10, fontWeight: '900' },
  legacyText: { color: ucapsaBrand.colors.goldDark, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  newNoteCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13, marginBottom: 18 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 7 },
  helper: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginBottom: 9 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingHorizontal: 9 },
  chipActive: { backgroundColor: ucapsaBrand.colors.greenDark, borderColor: ucapsaBrand.colors.greenDark },
  chipText: { color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '900' },
  chipTextActive: { color: ucapsaBrand.colors.surface },
  severityChip: { minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingHorizontal: 10 },
  severityText: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  input: { minHeight: 94, color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlignVertical: 'top', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, padding: 11 },
  saveButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.greenDark, marginTop: 9 },
  saveButtonText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  history: { gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  historyMarker: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  historyType: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  historyDate: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '700' },
  historyNote: { color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  historyBy: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '800', marginTop: 4 },
  empty: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18 },
});
