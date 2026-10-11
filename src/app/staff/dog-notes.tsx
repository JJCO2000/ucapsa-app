import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  addStaffDogNote,
  getStaffDogNotes,
  resolveStaffDogNote,
  updateStaffDogNote,
  type StaffDogNote,
} from '../../services/trainer-staff.service';

const noteTypes: Array<{ value: StaffDogNote['noteType']; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = [
  { value: 'behavior', label: 'Conducta', icon: 'psychology' },
  { value: 'incident', label: 'Incidente', icon: 'warning' },
  { value: 'training', label: 'Entrenamiento', icon: 'school' },
  { value: 'health_context', label: 'Contexto salud', icon: 'medical-information' },
  { value: 'general', label: 'General', icon: 'notes' },
];

const severities: Array<{ value: StaffDogNote['severity']; label: string }> = [
  { value: 'info', label: 'Informativa' },
  { value: 'caution', label: 'Atención' },
  { value: 'high', label: 'Alta' },
];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function noteTypeLabel(value: StaffDogNote['noteType']) {
  return noteTypes.find((item) => item.value === value)?.label ?? 'Nota';
}

export default function StaffDogNotesScreen() {
  const params = useLocalSearchParams<{ dogId?: string; dogName?: string }>();
  const dogId = typeof params.dogId === 'string' ? params.dogId : '';
  const dogName = typeof params.dogName === 'string' ? params.dogName : 'Perro';
  const { isStaff, isAdmin } = useSession();
  const [rows, setRows] = useState<StaffDogNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<StaffDogNote | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [noteType, setNoteType] = useState<StaffDogNote['noteType']>('behavior');
  const [severity, setSeverity] = useState<StaffDogNote['severity']>('caution');
  const [note, setNote] = useState('');
  const [happenedOn, setHappenedOn] = useState(todayKey());

  const load = useCallback(async () => {
    if (!isStaff || !dogId) return;
    try {
      setRows(await getStaffDogNotes(dogId));
    } catch (cause) {
      Alert.alert('No se pudo cargar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [dogId, isStaff]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  function openNew() {
    setSelected(null);
    setNoteType('behavior');
    setSeverity('caution');
    setNote('');
    setHappenedOn(todayKey());
    setModalOpen(true);
  }

  function openEdit(item: StaffDogNote) {
    setSelected(item);
    setNoteType(item.noteType);
    setSeverity(item.severity);
    setNote(item.note);
    setHappenedOn(item.happenedOn);
    setModalOpen(true);
  }

  async function save() {
    if (!dogId || saving) return;
    if (!note.trim()) {
      Alert.alert('Falta nota', 'Describe lo que el equipo necesita recordar.');
      return;
    }
    try {
      setSaving(true);
      if (selected) {
        await updateStaffDogNote({
          noteId: selected.id,
          noteType,
          severity,
          note,
          happenedOn,
        });
      } else {
        await addStaffDogNote({
          dogId,
          noteType,
          severity,
          note,
          happenedOn,
        });
      }
      setModalOpen(false);
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleResolved(item: StaffDogNote) {
    try {
      setSaving(true);
      await resolveStaffDogNote(item.id, !item.resolvedAt);
      await load();
    } catch (cause) {
      Alert.alert('No se pudo actualizar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!isStaff) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>UCAPSA Staff · interno</Text>
          <Text style={styles.title}>{dogName}</Text>
          <Text style={styles.subtitle}>Historial operativo para que el siguiente entrenador sepa qué cuidar.</Text>
        </View>
        <Pressable accessibilityLabel="Agregar nota interna" style={styles.addButton} onPress={openNew}>
          <MaterialIcons name="add" size={22} color={ucapsaBrand.colors.surface} />
        </Pressable>
      </View>

      <View style={styles.notice}>
        <MaterialIcons name="lock" size={18} color={ucapsaBrand.colors.blueDark} />
        <Text style={styles.noticeText}>Estas notas son internas. No aparecen en la app del cliente.</Text>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando historial…</Text></View>
      ) : null}

      {!loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="fact-check" size={28} color={ucapsaBrand.colors.muted} />
          <Text style={styles.emptyTitle}>Sin notas internas</Text>
          <Text style={styles.muted}>Agrega sólo información útil para seguridad, conducta o continuidad del entrenamiento.</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {rows.map((item) => {
          const high = item.severity === 'high';
          const caution = item.severity === 'caution';
          const resolved = Boolean(item.resolvedAt);
          return (
            <View key={item.id} style={[styles.card, high && styles.cardHigh, caution && styles.cardCaution, resolved && styles.cardResolved]}>
              <View style={styles.cardHeader}>
                <View style={[
                  styles.severityIcon,
                  { backgroundColor: high ? ucapsaBrand.colors.dangerSoft : caution ? ucapsaBrand.colors.goldPale : ucapsaBrand.colors.blueSoft },
                ]}>
                  <MaterialIcons
                    name={high ? 'warning' : caution ? 'report-problem' : 'info'}
                    size={18}
                    color={high ? ucapsaBrand.colors.danger : caution ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.blueDark}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{noteTypeLabel(item.noteType)} · {item.happenedOn}</Text>
                  <Text style={[styles.severityLabel, high && styles.highText, caution && styles.cautionText]}>
                    {high ? 'ALTA' : caution ? 'ATENCIÓN' : 'INFORMATIVA'}{resolved ? ' · RESUELTA' : ''}
                  </Text>
                </View>
                <Pressable accessibilityLabel="Editar nota" style={styles.smallIcon} onPress={() => openEdit(item)}>
                  <MaterialIcons name="edit" size={17} color={ucapsaBrand.colors.redDark} />
                </Pressable>
              </View>
              <Text style={styles.noteText}>{item.note}</Text>
              <Pressable disabled={saving} style={styles.resolveButton} onPress={() => void toggleResolved(item)}>
                <MaterialIcons name={resolved ? 'restart-alt' : 'check-circle'} size={17} color={resolved ? ucapsaBrand.colors.blueDark : ucapsaBrand.colors.greenDark} />
                <Text style={[styles.resolveText, resolved && { color: ucapsaBrand.colors.blueDark }]}>
                  {resolved ? 'Reabrir' : 'Marcar resuelta'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <KeyboardAwareModal visible={modalOpen} onClose={() => setModalOpen(false)}>
        <Text style={styles.modalKicker}>Nota interna</Text>
        <Text style={styles.modalTitle}>{selected ? 'Editar historial' : `Agregar a ${dogName}`}</Text>

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chips}>
          {noteTypes.map((item) => (
            <Pressable key={item.value} style={[styles.chip, noteType === item.value && styles.chipActive]} onPress={() => setNoteType(item.value)}>
              <MaterialIcons name={item.icon} size={16} color={noteType === item.value ? ucapsaBrand.colors.surface : ucapsaBrand.colors.redDark} />
              <Text style={[styles.chipText, noteType === item.value && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Importancia</Text>
        <View style={styles.chips}>
          {severities.map((item) => (
            <Pressable key={item.value} style={[styles.chip, severity === item.value && styles.chipActive]} onPress={() => setSeverity(item.value)}>
              <Text style={[styles.chipText, severity === item.value && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Fecha</Text>
        <TextInput value={happenedOn} onChangeText={setHappenedOn} placeholder="AAAA-MM-DD" style={styles.input} />

        <Text style={styles.label}>Qué debe saber el equipo</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ej. Reactivo con perros grandes; mantener distancia al entrar."
          multiline
          style={[styles.input, styles.textArea]}
        />

        <Pressable disabled={saving} style={[styles.primary, saving && styles.disabled]} onPress={() => void save()}>
          <Text style={styles.primaryText}>{saving ? 'Guardando…' : 'Guardar nota'}</Text>
        </Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  addButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.red },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.blueSoft, padding: 11, marginBottom: 12 },
  noticeText: { flex: 1, color: ucapsaBrand.colors.blueDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 7, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 22 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 9 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.blue, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  cardHigh: { borderColor: ucapsaBrand.colors.danger, backgroundColor: ucapsaBrand.colors.dangerSoft },
  cardCaution: { borderColor: ucapsaBrand.colors.gold, backgroundColor: ucapsaBrand.colors.goldPale },
  cardResolved: { opacity: 0.72 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  severityIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  severityLabel: { color: ucapsaBrand.colors.blueDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.6, marginTop: 2 },
  highText: { color: ucapsaBrand.colors.danger },
  cautionText: { color: ucapsaBrand.colors.goldDark },
  smallIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  noteText: { color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700', marginTop: 9 },
  resolveButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  resolveText: { color: ucapsaBrand.colors.greenDark, fontSize: 9, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', marginBottom: 10 },
  label: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', marginTop: 8, marginBottom: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10 },
  chipActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  chipText: { color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '900' },
  chipTextActive: { color: ucapsaBrand.colors.surface },
  input: { minHeight: 45, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '700', paddingHorizontal: 11, paddingVertical: 10 },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, marginTop: 14 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
