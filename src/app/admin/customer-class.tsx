import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminDogPicker, type AdminDogMode } from '../../components/domain/AdminDogPicker';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getAdminCustomerRecord, type AdminCustomerRecord } from '../../services/admin-customer.service';
import { createDogForUserAdmin, getDogsForUser, type BasicDog } from '../../services/dogs.service';
import {
  formatProgramScheduleDisplayLabel,
  getProgramEnrollmentDogName,
  getProgramLevelLabel,
  getProgramSchedules,
  getProgramStatusLabel,
  programLevelOptions,
  setProgramEnrollmentStatus,
  updateProgramEnrollment,
} from '../../services/programs.service';
import type { ProgramEnrollmentStatus, ProgramLevel, ProgramSchedule } from '../../types/app.types';

export default function CustomerClassScreen() {
  const params = useLocalSearchParams<{ userId?: string; enrollmentId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const enrollmentId = typeof params.enrollmentId === 'string' ? params.enrollmentId.trim() : '';
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [schedules, setSchedules] = useState<ProgramSchedule[]>([]);
  const [scheduleId, setScheduleId] = useState('');
  const [level, setLevel] = useState<ProgramLevel>('base');
  const [dogs, setDogs] = useState<BasicDog[]>([]);
  const [dogMode, setDogMode] = useState<AdminDogMode>('existing');
  const [dogId, setDogId] = useState('');
  const [dogName, setDogName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [nextRecord, nextSchedules, nextDogs] = await Promise.all([getAdminCustomerRecord(userId), getProgramSchedules(), getDogsForUser(userId)]);
    setRecord(nextRecord);
    setSchedules(nextSchedules);
    setDogs(nextDogs);
    const row = nextRecord.enrollments.find((item) => item.enrollment.id === enrollmentId) ?? nextRecord.enrollments[0] ?? null;
    if (row) {
      setScheduleId(row.enrollment.schedule_id);
      setLevel(row.enrollment.program_level);
      const linkedDog = nextDogs.find((dog) => dog.id === row.enrollment.dog_id) ?? nextDogs.find((dog) => dog.name.trim().toLowerCase() === (row.enrollment.dog_name ?? '').trim().toLowerCase()) ?? null;
      setDogMode(linkedDog ? 'existing' : 'new');
      setDogId(linkedDog?.id ?? '');
      setDogName(linkedDog?.name ?? row.enrollment.dog_name ?? '');
      setCardNumber(row.enrollment.physical_card_number ?? '');
      setNotes(row.enrollment.notes ?? '');
    }
  }, [enrollmentId, userId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [load]));

  const row = useMemo(() => {
    if (!record) return null;
    return record.enrollments.find((item) => item.enrollment.id === enrollmentId) ?? record.enrollments[0] ?? null;
  }, [enrollmentId, record]);

  const programSchedules = useMemo(() => row ? schedules.filter((item) => item.program_id === row.program.id) : [], [row, schedules]);

  async function save() {
    if (!row) return;
    if (!scheduleId) {
      Alert.alert('Falta horario', 'Selecciona un horario.');
      return;
    }
    try {
      setSaving(true);
      const selectedDog = dogMode === 'existing' ? dogs.find((dog) => dog.id === dogId) ?? null : null;
      const resolvedDogName = selectedDog?.name ?? dogName.trim();
      if (dogMode === 'existing' && !selectedDog) {
        Alert.alert('Selecciona perro', 'Elige uno de los perros registrados.');
        return;
      }
      if (!resolvedDogName) {
        Alert.alert('Falta perro', 'Escribe el nombre del nuevo perro.');
        return;
      }
      const linkedDog = selectedDog ?? await createDogForUserAdmin(row.enrollment.user_id, resolvedDogName);
      await updateProgramEnrollment(row.enrollment.id, {
        scheduleId,
        dogId: linkedDog.id,
        dogName: linkedDog.name,
        physicalCardNumber: cardNumber,
        programLevel: row.program.code === 'comandos' ? level : 'base',
        notes,
      });
      setEditing(false);
      await load();
      Alert.alert('Clase guardada', 'La inscripcion se actualizo.');
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function changeStatus(status: ProgramEnrollmentStatus) {
    if (!row) return;
    Alert.alert('Confirmar', `La inscripcion quedara como ${getProgramStatusLabel(status).toLowerCase()}.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        try {
          setSaving(true);
          await setProgramEnrollmentStatus(row.enrollment.id, status);
          await load();
        } catch (cause) {
          Alert.alert('No se pudo cambiar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
        } finally {
          setSaving(false);
        }
      } },
    ]);
  }

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader customerName={adminCustomerDisplayName(record?.profile)} section={row?.program.name || 'Clase'} subtitle="Inscripcion, perro, horario y asistencias del cliente seleccionado." member={record?.membership?.status === 'active'} onBack={() => router.back()} />

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}

      {!loading && !row ? <View style={styles.empty}><MaterialIcons name="school" size={34} color={ucapsaBrand.colors.redDark} /><Text style={styles.emptyTitle}>Inscripcion no disponible</Text></View> : null}

      {row ? (
        <>
          {!editing ? (
            <View style={styles.card}>
              <Detail label="Estado" value={getProgramStatusLabel(row.enrollment.status)} />
              {row.program.code === 'comandos' ? <Detail label="Nivel" value={getProgramLevelLabel(row.enrollment.program_level)} /> : null}
              <Detail label="Horario" value={formatProgramScheduleDisplayLabel(row.schedule, row.program)} />
              <Detail label="Perro" value={getProgramEnrollmentDogName(row)} />
              <Pressable style={styles.editableDetail} onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Editar numero de tarjeta">
                <View style={{ flex: 1 }}><Text style={styles.detailLabel}>Tarjeta</Text><Text style={styles.detailValue}>{row.enrollment.physical_card_number || 'Sin numero'}</Text></View>
                <MaterialIcons name="edit" size={19} color={ucapsaBrand.colors.redDark} />
              </Pressable>
              <Detail label="Asistencias" value={`${row.attendances.length} de ${row.program.required_attendances}`} last />
            </View>
          ) : (
            <View style={styles.card}>
              {row.program.code === 'comandos' ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Nivel</Text>
                  <View style={styles.choiceWrap}>{programLevelOptions.map((option) => <Choice key={option.value} label={option.label} active={level === option.value} onPress={() => setLevel(option.value)} />)}</View>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Horario</Text>
                <View style={styles.scheduleList}>
                  {programSchedules.map((schedule) => (
                    <Pressable key={schedule.id} style={[styles.scheduleButton, scheduleId === schedule.id && styles.scheduleButtonActive]} onPress={() => setScheduleId(schedule.id)}>
                      <Text style={[styles.scheduleText, scheduleId === schedule.id && styles.scheduleTextActive]}>{formatProgramScheduleDisplayLabel(schedule, row.program)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <AdminDogPicker
                dogs={dogs}
                mode={dogMode}
                selectedDogId={dogId}
                newDogName={dogName}
                onModeChange={(mode) => { setDogMode(mode); if (mode === 'existing' && dogs[0]) { setDogId(dogs[0].id); setDogName(dogs[0].name); } else if (mode === 'new') { setDogId(''); setDogName(''); } }}
                onSelectDog={(dog) => { setDogMode('existing'); setDogId(dog.id); setDogName(dog.name); }}
                onNewDogNameChange={(value) => { setDogMode('new'); setDogId(''); setDogName(value); }}
              />
              <Field label="Tarjeta" value={cardNumber} onChangeText={setCardNumber} placeholder="Numero de tarjeta" />
              <Field label="Notas" value={notes} onChangeText={setNotes} placeholder="Notas internas" multiline />
            </View>
          )}

          <View style={styles.actions}>
            {editing ? (
              <>
                <Pressable disabled={saving} style={styles.primary} onPress={save}><Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text></Pressable>
                <Pressable disabled={saving} style={styles.secondary} onPress={() => setEditing(false)}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.primary} onPress={() => setEditing(true)}><Text style={styles.primaryText}>Editar clase</Text></Pressable>
                <Pressable style={styles.secondary} onPress={() => router.push(`/admin/customer-attendance?userId=${encodeURIComponent(userId)}&enrollmentId=${encodeURIComponent(row.enrollment.id)}` as never)}><Text style={styles.secondaryText}>Administrar asistencias</Text></Pressable>
              </>
            )}
          </View>

          {!editing ? (
            <>
              <Pressable style={styles.statusAction} onPress={() => setStatusModalOpen(true)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusActionTitle}>Cambiar estado</Text>
                  <Text style={styles.muted}>Activa, completada o cancelada</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
              </Pressable>

              <View style={styles.manageCard}>
                <Text style={styles.manageTitle}>Administrar este cliente</Text>
                <Text style={styles.manageText}>Desde aqui puedes saltar a los demas datos editables sin volver a buscar al cliente.</Text>
                <ManageRow icon="person" label="Datos personales" onPress={() => router.push(`/admin/customer-profile-edit?userId=${encodeURIComponent(userId)}` as never)} />
                <ManageRow icon="badge" label="Membresia" onPress={() => router.push(`/admin/customer-membership?userId=${encodeURIComponent(userId)}` as never)} />
                <ManageRow icon="payments" label="Pagos" onPress={() => router.push(`/admin/customer-payments?userId=${encodeURIComponent(userId)}` as never)} />
              </View>
            </>
          ) : null}

          <KeyboardAwareModal visible={statusModalOpen} onClose={() => setStatusModalOpen(false)}>
            <Text style={styles.modalCustomerName}>{adminCustomerDisplayName(record?.profile)}</Text>
            <Text style={styles.modalKicker}>Clase</Text>
            <Text style={styles.modalTitle}>Cambiar estado</Text>
            <Text style={styles.modalText}>Completar es una decision administrativa. No depende del contador de asistencias.</Text>
            <View style={styles.modalChoices}>
              <Choice label="Activa" active={row.enrollment.status === 'active'} onPress={() => { setStatusModalOpen(false); changeStatus('active'); }} />
              <Choice label="Completada" active={row.enrollment.status === 'completed'} onPress={() => { setStatusModalOpen(false); changeStatus('completed'); }} />
              <Choice label="Cancelada" active={row.enrollment.status === 'cancelled'} onPress={() => { setStatusModalOpen(false); changeStatus('cancelled'); }} />
            </View>
            <Pressable style={styles.modalClose} onPress={() => setStatusModalOpen(false)}><Text style={styles.modalCloseText}>Cerrar</Text></Pressable>
          </KeyboardAwareModal>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Detail({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.detail, last && styles.detailLast]}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function Field({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} multiline={multiline} style={[styles.input, multiline && styles.textArea]} /></View>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function ManageRow({ icon, label, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable style={styles.manageRow} onPress={onPress}><MaterialIcons name={icon} size={19} color={ucapsaBrand.colors.redDark} /><Text style={styles.manageRowText}>{label}</Text><MaterialIcons name="chevron-right" size={21} color={ucapsaBrand.colors.redDark} /></Pressable>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  card: { borderRadius: 20, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14, gap: 12 },
  detail: { borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted, paddingBottom: 10 },
  editableDetail: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted, paddingBottom: 10 },
  detailLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 3 },
  field: { gap: 6 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text, backgroundColor: ucapsaBrand.colors.surfaceSubtle },
  textArea: { minHeight: 86, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: ucapsaBrand.colors.surface },
  choiceActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  choiceText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  choiceTextActive: { color: ucapsaBrand.colors.surface },
  scheduleList: { gap: 8 },
  scheduleButton: { borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 11, backgroundColor: ucapsaBrand.colors.surface },
  scheduleButtonActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  scheduleText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '800' },
  scheduleTextActive: { color: ucapsaBrand.colors.redDark },
  actions: { marginTop: 14, gap: 9 },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingVertical: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  secondary: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, alignItems: 'center', paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  statusAction: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  statusActionTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  manageCard: { marginTop: 12, gap: 8, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  manageTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  manageText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  manageRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11, paddingVertical: 9 },
  manageRowText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', marginTop: 2 },
  modalText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 6, marginBottom: 10 },
  modalChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalClose: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, alignItems: 'center', paddingVertical: 12 },
  modalCloseText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  modalCustomerName: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', marginBottom: 6 },
});
