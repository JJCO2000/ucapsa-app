import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { supabase } from '../../lib/supabase';
import { getAdminCustomerRecord, type AdminCustomerRecord } from '../../services/admin-customer.service';
import {
  correctProgramAttendance,
  deleteProgramAttendance,
  formatProgramScheduleDisplayLabel,
  getProgramLevelLabel,
  getProgramScheduleTimeline,
  getProgramSchedulesForDate,
  registerProgramAttendance,
} from '../../services/programs.service';
import type { ProgramAttendance, ProgramEnrollmentWithDetails, ProgramSchedule } from '../../types/app.types';

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(value: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

type EditState = {
  attendance: ProgramAttendance | null;
  enrollment: ProgramEnrollmentWithDetails | null;
  date: string;
  scheduleId: string;
  notes: string;
};

const emptyEdit: EditState = { attendance: null, enrollment: null, date: todayKey(), scheduleId: '', notes: '' };

export default function CustomerAttendanceScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ userId?: string; enrollmentId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const initialEnrollmentId = typeof params.enrollmentId === 'string' ? params.enrollmentId.trim() : '';
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [schedules, setSchedules] = useState<ProgramSchedule[]>([]);
  const [sessionScheduleById, setSessionScheduleById] = useState<Record<string, string>>({});
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(initialEnrollmentId);
  const [edit, setEdit] = useState<EditState>(emptyEdit);
  const [modalOpen, setModalOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin || !userId) return;
    const [nextRecord, nextSchedules] = await Promise.all([getAdminCustomerRecord(userId), getProgramScheduleTimeline()]);
    setRecord(nextRecord);
    setSchedules(nextSchedules);
    const firstId = initialEnrollmentId || nextRecord.enrollments[0]?.enrollment.id || '';
    setSelectedEnrollmentId((current) => current || firstId);

    const sessionIds = [...new Set(nextRecord.enrollments.flatMap((item) => item.attendances.map((attendance) => attendance.session_id).filter(Boolean) as string[]))];
    if (sessionIds.length === 0) {
      setSessionScheduleById({});
      return;
    }
    const { data, error } = await supabase.from('program_sessions').select('id, schedule_id').in('id', sessionIds);
    if (error) throw error;
    setSessionScheduleById(Object.fromEntries((data ?? []).map((item) => [item.id, item.schedule_id])));
  }, [initialEnrollmentId, isAdmin, userId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [load]));

  const selectedEnrollment = useMemo(() => record?.enrollments.find((item) => item.enrollment.id === selectedEnrollmentId) ?? record?.enrollments[0] ?? null, [record, selectedEnrollmentId]);
  const attendanceRows = useMemo(() => selectedEnrollment ? [...selectedEnrollment.attendances].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)) : [], [selectedEnrollment]);

  const validSchedules = useMemo(() => {
    if (!edit.enrollment) return [] as ProgramSchedule[];
    const sameProgram = schedules
      .filter((schedule) => schedule.program_id === edit.enrollment?.program.id)
      .map((schedule) => ({ ...schedule, is_active: true }));
    return getProgramSchedulesForDate(sameProgram, edit.date);
  }, [edit.date, edit.enrollment, schedules]);

  useEffect(() => {
    if (!modalOpen) return;
    if (validSchedules.some((schedule) => schedule.id === edit.scheduleId)) return;
    const preferred = validSchedules.find((schedule) => schedule.id === edit.enrollment?.enrollment.schedule_id) ?? validSchedules[0];
    setEdit((current) => ({ ...current, scheduleId: preferred?.id ?? '' }));
  }, [edit.enrollment, edit.scheduleId, modalOpen, validSchedules]);

  function openNew() {
    if (!selectedEnrollment) return;
    setEdit({ attendance: null, enrollment: selectedEnrollment, date: todayKey(), scheduleId: selectedEnrollment.enrollment.schedule_id, notes: '' });
    setCalendarOpen(false);
    setModalOpen(true);
  }

  function openCorrection(attendance: ProgramAttendance) {
    if (!selectedEnrollment) return;
    setEdit({
      attendance,
      enrollment: selectedEnrollment,
      date: attendance.attendance_date.slice(0, 10),
      scheduleId: attendance.session_id ? sessionScheduleById[attendance.session_id] || selectedEnrollment.enrollment.schedule_id : selectedEnrollment.enrollment.schedule_id,
      notes: attendance.notes ?? '',
    });
    setCalendarOpen(false);
    setModalOpen(true);
  }

  async function saveAttendance() {
    if (!edit.enrollment || !edit.scheduleId) {
      Alert.alert('Falta clase', 'Selecciona una fecha y horario reales.');
      return;
    }
    try {
      setSaving(true);
      if (edit.attendance) {
        await correctProgramAttendance({ attendanceId: edit.attendance.id, attendanceDate: edit.date, scheduleId: edit.scheduleId, notes: edit.notes });
      } else {
        await registerProgramAttendance({ enrollmentId: edit.enrollment.enrollment.id, attendanceDate: edit.date, scheduleId: edit.scheduleId, notes: edit.notes });
      }
      setModalOpen(false);
      await load();
      Alert.alert(edit.attendance ? 'Asistencia corregida' : 'Asistencia registrada', 'El historial y el avance quedaron actualizados.');
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function removeAttendance(attendance: ProgramAttendance) {
    if (!selectedEnrollment) return;
    Alert.alert('Eliminar asistencia', 'Se eliminara este registro real y el avance se recalculara.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          setSaving(true);
          await deleteProgramAttendance(attendance.id, selectedEnrollment.enrollment.id);
          await load();
        } catch (cause) {
          Alert.alert('No se pudo eliminar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
        } finally {
          setSaving(false);
        }
      } },
    ]);
  }

  if (!isAdmin) return <KeyboardAwareScreen><Text style={styles.title}>Acceso restringido</Text></KeyboardAwareScreen>;

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader customerName={adminCustomerDisplayName(record?.profile)} section="Asistencias" subtitle="Registra, corrige o elimina asistencias reales sin tocar contadores." member={record?.membership?.status === 'active'} onBack={() => router.back()} />

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}

      {record && record.enrollments.length > 1 ? (
        <View style={styles.programChooser}>
          {record.enrollments.map((item) => (
            <Pressable key={item.enrollment.id} style={[styles.programButton, selectedEnrollment?.enrollment.id === item.enrollment.id && styles.programButtonActive]} onPress={() => { setSelectedEnrollmentId(item.enrollment.id); setVisibleCount(8); }}>
              <Text style={[styles.programText, selectedEnrollment?.enrollment.id === item.enrollment.id && styles.programTextActive]}>{item.program.name}{item.program.code === 'comandos' ? ` ${getProgramLevelLabel(item.enrollment.program_level)}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {selectedEnrollment ? (
        <View style={styles.summary}>
          <View><Text style={styles.summaryTitle}>{selectedEnrollment.program.name}</Text><Text style={styles.muted}>{attendanceRows.length} de {selectedEnrollment.program.required_attendances} registradas</Text></View>
          <Pressable style={styles.addButton} onPress={openNew}><MaterialIcons name="add" size={19} color={ucapsaBrand.colors.surface} /><Text style={styles.addText}>Registrar</Text></Pressable>
        </View>
      ) : null}

      {!loading && !selectedEnrollment ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sin clases</Text><Text style={styles.muted}>El cliente no tiene inscripciones.</Text></View> : null}

      {selectedEnrollment && attendanceRows.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sin asistencias</Text><Text style={styles.muted}>Usa Registrar para agregar la primera asistencia manual.</Text></View> : null}

      {selectedEnrollment ? (
        <View style={styles.list}>
          {attendanceRows.slice(0, visibleCount).map((attendance, index) => (
            <View key={attendance.id} style={[styles.row, index === Math.min(attendanceRows.length, visibleCount) - 1 && styles.rowLast]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{formatDate(attendance.attendance_date)}</Text>
                <Text style={styles.rowMeta}>{attendance.source === 'qr_client' ? `QR cliente${attendance.outside_window ? ' - Fuera de horario' : ''}` : attendance.source === 'admin_manual' ? 'Manual admin' : 'Historico'}</Text>
                {attendance.notes ? <Text style={styles.rowMeta}>{attendance.notes}</Text> : null}
              </View>
              <View style={styles.rowActions}>
                <Pressable style={styles.smallButton} onPress={() => openCorrection(attendance)}><Text style={styles.smallButtonText}>Corregir</Text></Pressable>
                <Pressable style={styles.deleteButton} onPress={() => removeAttendance(attendance)}><Text style={styles.deleteText}>Eliminar</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {attendanceRows.length > visibleCount ? <Pressable style={styles.moreButton} onPress={() => setVisibleCount((value) => value + 8)}><Text style={styles.moreText}>Ver 8 mas</Text></Pressable> : null}

      <KeyboardAwareModal visible={modalOpen} onClose={() => setModalOpen(false)}>
        <Text style={styles.modalCustomerName}>{adminCustomerDisplayName(record?.profile)}</Text>
        <Text style={styles.modalKicker}>Asistencia manual</Text>
        <Text style={styles.modalTitle}>{edit.attendance ? 'Corregir asistencia' : 'Registrar asistencia'}</Text>

        <Text style={styles.label}>Fecha de clase</Text>
        <Pressable style={styles.dateButton} onPress={() => setCalendarOpen((value) => !value)}><Text style={styles.dateText}>{formatDate(edit.date)}</Text><MaterialIcons name="event" size={20} color={ucapsaBrand.colors.redDark} /></Pressable>
        {calendarOpen ? <Calendar current={edit.date} markedDates={{ [edit.date]: { selected: true, selectedColor: ucapsaBrand.colors.red } }} onDayPress={(day) => { setEdit((current) => ({ ...current, date: day.dateString, scheduleId: '' })); setCalendarOpen(false); }} theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }} /> : null}

        <Text style={styles.label}>Clase y horario real</Text>
        <View style={styles.scheduleList}>
          {validSchedules.map((schedule) => <Pressable key={schedule.id} style={[styles.scheduleButton, edit.scheduleId === schedule.id && styles.scheduleButtonActive]} onPress={() => setEdit((current) => ({ ...current, scheduleId: schedule.id }))}><Text style={[styles.scheduleText, edit.scheduleId === schedule.id && styles.scheduleTextActive]}>{formatProgramScheduleDisplayLabel(schedule, edit.enrollment?.program)}</Text></Pressable>)}
          {validSchedules.length === 0 ? <Text style={styles.muted}>No hay una clase real para esa fecha.</Text> : null}
        </View>

        <Text style={styles.label}>Nota</Text>
        <TextInput value={edit.notes} onChangeText={(notes) => setEdit((current) => ({ ...current, notes }))} placeholder="Nota opcional" multiline style={[styles.input, styles.textArea]} />

        <Pressable disabled={saving || !edit.scheduleId} style={[styles.primary, (!edit.scheduleId || saving) && styles.disabled]} onPress={saveAttendance}><Text style={styles.primaryText}>{saving ? 'Guardando...' : edit.attendance ? 'Guardar correccion' : 'Registrar asistencia'}</Text></Pressable>
        <Pressable disabled={saving} style={styles.secondary} onPress={() => setModalOpen(false)}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  programChooser: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  programButton: { borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 9 },
  programButtonActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  programText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  programTextActive: { color: ucapsaBrand.colors.surface },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 12 },
  summaryTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  addButton: { marginLeft: 'auto', flexDirection: 'row', gap: 5, alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 12, paddingVertical: 10 },
  addText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 30 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  list: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  rowActions: { gap: 6 },
  smallButton: { borderRadius: 11, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 10, paddingVertical: 7 },
  smallButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  deleteButton: { borderRadius: 11, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, paddingHorizontal: 10, paddingVertical: 7 },
  deleteText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  moreButton: { alignItems: 'center', paddingVertical: 12 },
  moreText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', marginBottom: 12 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 8, marginBottom: 5 },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  dateText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  scheduleList: { gap: 7 },
  scheduleButton: { borderRadius: 13, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, padding: 11 },
  scheduleButtonActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  scheduleText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '800' },
  scheduleTextActive: { color: ucapsaBrand.colors.redDark },
  input: { borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text },
  textArea: { minHeight: 84, textAlignVertical: 'top' },
  primary: { marginTop: 12, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingVertical: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  secondary: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, alignItems: 'center', paddingVertical: 12 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  modalCustomerName: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', marginBottom: 6 },
});
