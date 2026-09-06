import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { sendClassCancellationNotification } from '../../services/admin-class-cancellations.service';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import {
  createProgramClassCancellation,
  createProgramDayCancellations,
  deleteProgramClassCancellation,
  formatProgramScheduleDetailLabel,
  formatProgramScheduleName,
  getProgramClassCancellations,
  getProgramSchedules,
  getProgramSchedulesForDate,
  getPrograms,
  restoreProgramClassCancellation,
} from '../../services/programs.service';
import type { Announcement, ProgramClassCancellation, ProgramSchedule, UcapsaEvent, UcapsaProgram } from '../../types/app.types';

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateKey(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function programFor(programs: UcapsaProgram[], schedule: ProgramSchedule | null | undefined) {
  if (!schedule) return null;
  return programs.find((program) => program.id === schedule.program_id) ?? null;
}

function eventDate(event: UcapsaEvent) {
  return toDateKey(event.start_date);
}

function announcementDate(announcement: Announcement) {
  return toDateKey(announcement.announcement_date || announcement.event?.start_date || announcement.created_at);
}

export default function AdminClassCancellationsScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const routeDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey();
  const [selectedDate, setSelectedDate] = useState(routeDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [programs, setPrograms] = useState<UcapsaProgram[]>([]);
  const [daySchedules, setDaySchedules] = useState<ProgramSchedule[]>([]);
  const [cancellations, setCancellations] = useState<ProgramClassCancellation[]>([]);
  const [events, setEvents] = useState<UcapsaEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [programResult, scheduleResult, cancellationResult, eventResult, announcementResult] = await Promise.all([
        getPrograms(),
        getProgramSchedules(selectedDate),
        getProgramClassCancellations(false),
        getVisibleEvents(),
        getVisibleAnnouncements(),
      ]);
      setPrograms(programResult);
      setDaySchedules(getProgramSchedulesForDate(scheduleResult, selectedDate));
      setCancellations(cancellationResult);
      setEvents(eventResult);
      setAnnouncements(announcementResult);
    } catch (cause) {
      Alert.alert('No se pudo cargar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const activeKeys = useMemo(() => new Set(cancellations.map((item) => `${item.schedule_id}:${item.cancellation_date}`)), [cancellations]);
  const availableSchedules = useMemo(() => daySchedules.filter((schedule) => !activeKeys.has(`${schedule.id}:${selectedDate}`)), [activeKeys, daySchedules, selectedDate]);
  const cancelledToday = useMemo(() => cancellations.filter((item) => item.cancellation_date === selectedDate), [cancellations, selectedDate]);
  const dayEvents = useMemo(() => events.filter((event) => eventDate(event) === selectedDate), [events, selectedDate]);
  const dayAnnouncements = useMemo(() => announcements.filter((announcement) => announcementDate(announcement) === selectedDate), [announcements, selectedDate]);
  const upcomingCancellations = useMemo(() => cancellations.filter((item) => item.cancellation_date >= todayKey()).slice(0, 8), [cancellations]);

  useEffect(() => {
    if (availableSchedules.some((schedule) => schedule.id === selectedScheduleId)) return;
    setSelectedScheduleId(availableSchedules[0]?.id ?? '');
  }, [availableSchedules, selectedScheduleId]);

  function notify(scheduleIds: string[], cancellationDate: string, cancellationReason: string) {
    if (scheduleIds.length === 0) return;
    Alert.alert('Notificar inscritos', 'Quieres enviar una notificacion a los inscritos?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Si, notificar',
        onPress: async () => {
          try {
            setSaving(true);
            const result = await sendClassCancellationNotification({
              scheduleIds,
              cancellationDate,
              reason: cancellationReason,
            });
            Alert.alert(result.status === 'no_targets' ? 'Sin destinatarios' : 'Notificacion procesada', result.message ?? `Destinatarios: ${result.total_targets}. Enviadas: ${result.success_count}. Fallidas: ${result.failure_count}.`);
          } catch (cause) {
            Alert.alert('No se pudo notificar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function cancelOne() {
    if (!selectedScheduleId) {
      Alert.alert('Selecciona clase', 'Elige una clase programada para esta fecha.');
      return;
    }
    try {
      setSaving(true);
      const cancellationReason = reason;
      const cancellation = await createProgramClassCancellation({
        scheduleId: selectedScheduleId,
        cancellationDate: selectedDate,
        reason,
        createAnnouncement: true,
      });
      setReason('');
      await load();
      Alert.alert('Clase cancelada', 'El calendario y el anuncio automatico quedaron actualizados.', [
        { text: 'Cerrar', style: 'cancel' },
        { text: 'Notificar inscritos', onPress: () => notify([cancellation.schedule_id], cancellation.cancellation_date, cancellationReason) },
      ]);
    } catch (cause) {
      Alert.alert('No se pudo cancelar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function cancelAll() {
    if (availableSchedules.length === 0) {
      Alert.alert('Sin clases disponibles', 'No hay clases disponibles para cancelar en esta fecha.');
      return;
    }
    Alert.alert('Cancelar todas las clases', `Se cancelaran ${availableSchedules.length} clase(s) del ${formatDate(selectedDate)}.`, [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Confirmar',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            const cancellationReason = reason;
            const result = await createProgramDayCancellations({
              scheduleIds: availableSchedules.map((schedule) => schedule.id),
              cancellationDate: selectedDate,
              reason,
              createAnnouncement: true,
            });
            setReason('');
            await load();
            Alert.alert('Clases canceladas', 'Se creo un anuncio general y el calendario quedo actualizado.', [
              { text: 'Cerrar', style: 'cancel' },
              { text: 'Notificar inscritos', onPress: () => notify(result.map((item) => item.schedule_id), selectedDate, cancellationReason) },
            ]);
          } catch (cause) {
            Alert.alert('No se pudieron cancelar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function restore(cancellation: ProgramClassCancellation) {
    try {
      setSaving(true);
      await restoreProgramClassCancellation(cancellation.id);
      await load();
      Alert.alert('Clase reactivada', 'La clase vuelve al calendario y el anuncio automatico queda archivado.');
    } catch (cause) {
      Alert.alert('No se pudo reactivar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function remove(cancellation: ProgramClassCancellation) {
    Alert.alert('Eliminar cancelacion', 'El registro se eliminara y el anuncio automatico quedara oculto.', [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await deleteProgramClassCancellation(cancellation.id);
            await load();
          } catch (cause) {
            Alert.alert('No se pudo eliminar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Clases</Text>
          <Text style={styles.title}>Cancelaciones</Text>
          <Text style={styles.subtitle}>Elige fecha, elige clase y confirma. Lo secundario queda plegado.</Text>
        </View>
        <Pressable style={styles.calendarShortcut} onPress={() => router.push('/calendar' as never)}><MaterialIcons name="calendar-month" size={22} color={ucapsaBrand.colors.redDark} /></Pressable>
      </View>

      <Text style={styles.labelDark}>Fecha</Text>
      <Pressable style={styles.dateButton} onPress={() => setCalendarOpen((value) => !value)}>
        <View><Text style={styles.dateTitle}>{formatDate(selectedDate)}</Text><Text style={styles.dateMeta}>{daySchedules.length} clase(s), {cancelledToday.length} cancelada(s)</Text></View>
        <MaterialIcons name="event-busy" size={22} color={ucapsaBrand.colors.redDark} />
      </Pressable>
      {calendarOpen ? (
        <View style={styles.calendarBox}>
          <Calendar
            current={selectedDate}
            markedDates={{ [selectedDate]: { selected: true, selectedColor: ucapsaBrand.colors.red } }}
            onDayPress={(day) => { setSelectedDate(day.dateString); setCalendarOpen(false); setActivityOpen(false); }}
            theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
          />
        </View>
      ) : null}

      <Pressable style={styles.activityHeader} onPress={() => setActivityOpen((value) => !value)}>
        <View style={{ flex: 1 }}><Text style={styles.activityTitle}>Actividad del dia</Text><Text style={styles.muted}>{dayEvents.length} evento(s), {dayAnnouncements.length} anuncio(s)</Text></View>
        <MaterialIcons name={activityOpen ? 'expand-less' : 'expand-more'} size={22} color={ucapsaBrand.colors.redDark} />
      </Pressable>
      {activityOpen ? (
        <View style={styles.activityBody}>
          {dayEvents.map((event) => <View key={event.id} style={styles.activityRow}><MaterialIcons name="event" size={18} color={ucapsaBrand.colors.redDark} /><Text style={styles.activityText}>{event.title}</Text></View>)}
          {dayAnnouncements.map((announcement) => <View key={announcement.id} style={styles.activityRow}><MaterialIcons name="campaign" size={18} color={ucapsaBrand.colors.redDark} /><Text style={styles.activityText}>{announcement.title}</Text></View>)}
          {dayEvents.length + dayAnnouncements.length === 0 ? <Text style={styles.muted}>Sin eventos ni anuncios para esta fecha.</Text> : null}
        </View>
      ) : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando clases...</Text></View> : null}

      <Text style={styles.sectionTitle}>Clase</Text>
      {availableSchedules.length > 0 ? (
        <View style={styles.classList}>
          {availableSchedules.map((schedule) => {
            const program = programFor(programs, schedule);
            const selected = selectedScheduleId === schedule.id;
            return (
              <Pressable key={schedule.id} style={[styles.classRow, selected && styles.classRowSelected]} onPress={() => setSelectedScheduleId(schedule.id)}>
                <View style={[styles.radio, selected && styles.radioSelected]} />
                <View style={{ flex: 1 }}><Text style={styles.classTitle}>{program?.name ?? 'Clase'} - {formatProgramScheduleName(schedule, program)}</Text><Text style={styles.muted}>{formatProgramScheduleDetailLabel(schedule)}</Text></View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{daySchedules.length === 0 ? 'No hay clases programadas' : 'Todas las clases ya estan canceladas'}</Text>
          <Text style={styles.muted}>{daySchedules.length === 0 ? 'Si UCAPSA si dara clase este dia, cambia el horario desde esta fecha.' : 'Puedes reactivar una cancelacion abajo.'}</Text>
          {daySchedules.length === 0 ? <Pressable style={styles.linkButton} onPress={() => router.push(`/admin/class-schedules?date=${selectedDate}` as never)}><Text style={styles.linkButtonText}>Cambiar horario desde esta fecha</Text></Pressable> : null}
        </View>
      )}

      <Text style={styles.sectionTitle}>Motivo</Text>
      <TextInput value={reason} onChangeText={setReason} placeholder="Ej. Mantenimiento, clima o ajuste operativo" multiline style={[styles.input, styles.textArea]} />

      <Pressable disabled={saving || !selectedScheduleId} style={[styles.cancelButton, (saving || !selectedScheduleId) && styles.disabled]} onPress={() => void cancelOne()}><Text style={styles.cancelButtonText}>{saving ? 'Guardando...' : 'Cancelar clase y anunciar'}</Text></Pressable>
      <Pressable disabled={saving || availableSchedules.length === 0} style={[styles.cancelAllButton, (saving || availableSchedules.length === 0) && styles.disabled]} onPress={cancelAll}><Text style={styles.cancelAllText}>Cancelar todas las clases del dia</Text></Pressable>

      {cancelledToday.length > 0 ? (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Canceladas este dia</Text>
          {cancelledToday.map((item) => <CancellationRow key={item.id} item={item} programs={programs} saving={saving} onRestore={() => void restore(item)} onDelete={() => remove(item)} />)}
        </View>
      ) : null}

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>Proximas cancelaciones</Text>
        {upcomingCancellations.length === 0 ? <Text style={styles.muted}>No hay cancelaciones activas.</Text> : upcomingCancellations.map((item) => <CancellationRow key={item.id} item={item} programs={programs} saving={saving} onRestore={() => void restore(item)} onDelete={() => remove(item)} />)}
      </View>
    </KeyboardAwareScreen>
  );
}

function CancellationRow({ item, programs, saving, onRestore, onDelete }: { item: ProgramClassCancellation; programs: UcapsaProgram[]; saving: boolean; onRestore: () => void; onDelete: () => void }) {
  const program = programFor(programs, item.schedule);
  return (
    <View style={styles.cancellationRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cancellationTitle}>{formatDate(item.cancellation_date)} - {program?.name ?? 'Clase'}</Text>
        <Text style={styles.muted}>{formatProgramScheduleName(item.schedule, program)} - {formatProgramScheduleDetailLabel(item.schedule)}</Text>
        <Text style={styles.muted}>{item.reason || 'Sin motivo'}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable disabled={saving} style={styles.restoreButton} onPress={onRestore}><Text style={styles.restoreText}>Reactivar</Text></Pressable>
        <Pressable disabled={saving} style={styles.deleteButton} onPress={onDelete}><Text style={styles.deleteText}>Eliminar</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  calendarShortcut: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  labelDark: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginBottom: 6 },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  dateTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  dateMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  calendarBox: { overflow: 'hidden', borderRadius: 18, marginTop: 8 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  activityTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  activityBody: { gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 12, marginBottom: 10 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '800' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  classList: { gap: 7 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  classRowSelected: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.redSoftMuted },
  radio: { width: 17, height: 17, borderRadius: 9, borderWidth: 2, borderColor: ucapsaBrand.colors.redBorder },
  radioSelected: { borderWidth: 5, borderColor: ucapsaBrand.colors.red },
  classTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  emptyCard: { gap: 5, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  linkButton: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11, paddingVertical: 9, marginTop: 5 },
  linkButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text },
  textArea: { minHeight: 78, textAlignVertical: 'top' },
  cancelButton: { alignItems: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginTop: 11 },
  cancelButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  cancelAllButton: { alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 12, marginTop: 7 },
  cancelAllText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.48 },
  sectionBlock: { marginTop: 8 },
  cancellationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12, marginBottom: 7 },
  cancellationTitle: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  rowActions: { gap: 5 },
  restoreButton: { borderRadius: 10, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 9, paddingVertical: 7 },
  restoreText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  deleteButton: { borderRadius: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, paddingHorizontal: 9, paddingVertical: 7 },
  deleteText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
});
