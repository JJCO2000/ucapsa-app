import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  changeProgramScheduleFromDate,
  formatProgramScheduleDetailLabel,
  formatProgramScheduleName,
  getProgramScheduleFromTimeline,
  getProgramScheduleTimeline,
  getProgramSchedules,
  getPrograms,
  sortProgramSchedules,
} from '../../services/programs.service';
import type { ProgramCode, ProgramRepeatType, ProgramSchedule, UcapsaProgram } from '../../types/app.types';

type ProgramFilter = 'all' | ProgramCode;

const dayOptions = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
];

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateDayOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).getDay();
}

function formatDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function programFor(programs: UcapsaProgram[], schedule: ProgramSchedule | null) {
  if (!schedule) return null;
  return programs.find((program) => program.id === schedule.program_id) ?? null;
}

export default function AdminClassSchedulesScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ date?: string; scheduleId?: string; program?: string; status?: string }>();
  const routeDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey();
  const [programs, setPrograms] = useState<UcapsaProgram[]>([]);
  const [schedules, setSchedules] = useState<ProgramSchedule[]>([]);
  const [timeline, setTimeline] = useState<ProgramSchedule[]>([]);
  const [filter, setFilter] = useState<ProgramFilter>(params.program === 'puppy' || params.program === 'comandos' ? params.program : 'all');
  const [showAll, setShowAll] = useState(params.status === 'all');
  const [selected, setSelected] = useState<ProgramSchedule | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(routeDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startTime, setStartTime] = useState('10:00');
  const [repeatType, setRepeatType] = useState<ProgramRepeatType>('weekly');
  const [isActive, setIsActive] = useState(true);
  const [name, setName] = useState('Horario');
  const [sequenceOrder, setSequenceOrder] = useState('1');
  const [changeNote, setChangeNote] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [programResult, scheduleResult, timelineResult] = await Promise.all([
        getPrograms(),
        getProgramSchedules(),
        getProgramScheduleTimeline(),
      ]);
      setPrograms(programResult);
      setSchedules(scheduleResult);
      setTimeline(timelineResult);

      const routeScheduleId = typeof params.scheduleId === 'string' ? params.scheduleId : '';
      if (routeScheduleId) {
        const target = scheduleResult.find((schedule) => schedule.id === routeScheduleId) ?? null;
        if (target) openEditor(target, routeDate, timelineResult);
      }
    } catch (cause) {
      Alert.alert('No se pudieron cargar horarios', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, params.scheduleId, routeDate]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const filtered = useMemo(() => {
    const programById = new Map(programs.map((program) => [program.id, program]));
    return sortProgramSchedules(schedules.filter((schedule) => {
      if (!showAll && !schedule.is_active) return false;
      if (filter === 'all') return true;
      return programById.get(schedule.program_id)?.code === filter;
    }));
  }, [filter, programs, schedules, showAll]);

  const selectedProgram = programFor(programs, selected);
  const selectedHistory = useMemo(() => {
    if (!selected) return [];
    return timeline
      .filter((schedule) => schedule.id === selected.id)
      .sort((a, b) => String(b.effective_from ?? '').localeCompare(String(a.effective_from ?? '')));
  }, [selected, timeline]);

  function applyForm(schedule: ProgramSchedule) {
    setDayOfWeek(schedule.day_of_week);
    setStartTime(String(schedule.start_time).slice(0, 5));
    setRepeatType(schedule.repeat_type);
    setIsActive(schedule.is_active);
    setName(schedule.name || 'Horario');
    setSequenceOrder(String(schedule.sequence_order || 1));
  }

  function openEditor(schedule: ProgramSchedule, dateKey = todayKey(), sourceTimeline = timeline) {
    const effective = getProgramScheduleFromTimeline(sourceTimeline, schedule.id, dateKey) ?? schedule;
    setSelected(effective);
    setEffectiveDate(dateKey);
    setCalendarOpen(false);
    setAdvancedOpen(false);
    setHistoryOpen(false);
    setChangeNote('');
    applyForm(effective);
  }

  function changeEffectiveDate(dateKey: string) {
    setEffectiveDate(dateKey);
    setCalendarOpen(false);
    if (!selected) return;
    const effective = getProgramScheduleFromTimeline(timeline, selected.id, dateKey) ?? selected;
    applyForm(effective);
  }

  function useSelectedDateAsClassDay() {
    setDayOfWeek(dateDayOfWeek(effectiveDate));
    if (repeatType === 'biweekly') {
      Alert.alert('Nuevo ciclo', 'La fecha seleccionada sera la nueva semana base del ciclo cada 2 semanas.');
    }
  }

  async function save() {
    if (!selected) return;
    if (effectiveDate < todayKey()) {
      Alert.alert('Fecha no permitida', 'El historial no se cambia. Elige hoy o una fecha futura.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      Alert.alert('Hora invalida', 'Usa formato HH:mm, por ejemplo 10:30.');
      return;
    }

    const dayLabel = dayOptions.find((day) => day.value === dayOfWeek)?.label ?? 'dia seleccionado';
    const repeatLabel = repeatType === 'biweekly' ? 'cada 2 semanas' : 'cada semana';

    Alert.alert(
      'Aplicar cambio de horario',
      `Nada antes del ${formatDate(effectiveDate)} cambiara. Desde esa fecha: ${dayLabel}, ${startTime}, ${repeatLabel}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar',
          onPress: async () => {
            try {
              setSaving(true);
              await changeProgramScheduleFromDate(selected.id, effectiveDate, {
                name,
                dayOfWeek,
                startTime,
                repeatType,
                cycleStartDate: repeatType === 'biweekly' ? effectiveDate : null,
                sequenceOrder: Number(sequenceOrder || 1),
                isActive,
                changeNote,
              });
              setSelected(null);
              await load();
              Alert.alert('Horario actualizado', 'El historial anterior se conservo y el nuevo plan aplica solo hacia adelante.');
            } catch (cause) {
              Alert.alert('No se pudo cambiar el horario', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  if (!isAdmin) {
    return <KeyboardAwareScreen><Text style={styles.title}>Acceso restringido</Text></KeyboardAwareScreen>;
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Clases</Text>
          <Text style={styles.title}>Horarios</Text>
          <Text style={styles.subtitle}>Cambia el plan desde una fecha sin modificar clases anteriores.</Text>
        </View>
        <Pressable style={styles.calendarShortcut} onPress={() => router.push('/calendar' as never)}>
          <MaterialIcons name="calendar-month" size={22} color={ucapsaBrand.colors.redDark} />
        </Pressable>
      </View>

      <View style={styles.filters}>
        {(['all', 'puppy', 'comandos'] as ProgramFilter[]).map((value) => (
          <Pressable key={value} style={[styles.chip, filter === value && styles.chipActive]} onPress={() => setFilter(value)}>
            <Text style={[styles.chipText, filter === value && styles.chipTextActive]}>{value === 'all' ? 'Todos' : value === 'puppy' ? 'Puppy' : 'Comandos'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.statusFilters}>
        <Pressable style={[styles.smallChip, !showAll && styles.smallChipActive]} onPress={() => setShowAll(false)}><Text style={[styles.smallChipText, !showAll && styles.smallChipTextActive]}>Activos</Text></Pressable>
        <Pressable style={[styles.smallChip, showAll && styles.smallChipActive]} onPress={() => setShowAll(true)}><Text style={[styles.smallChipText, showAll && styles.smallChipTextActive]}>Todos</Text></Pressable>
      </View>

      <View style={styles.infoCard}>
        <MaterialIcons name="history" size={20} color={ucapsaBrand.colors.redDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>Cambios con vigencia</Text>
          <Text style={styles.infoText}>Un cambio desde hoy no reescribe ayer. En cada 2 semanas, la fecha elegida puede convertirse en la nueva semana base.</Text>
        </View>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando horarios...</Text></View> : null}

      <View style={styles.list}>
        {filtered.map((schedule, index) => {
          const program = programFor(programs, schedule);
          return (
            <Pressable key={schedule.id} style={[styles.row, index === filtered.length - 1 && styles.rowLast]} onPress={() => openEditor(schedule, routeDate)}>
              <View style={styles.rowIcon}><MaterialIcons name={program?.code === 'puppy' ? 'pets' : 'school'} size={21} color={ucapsaBrand.colors.redDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{program?.name ?? 'Clase'} - {formatProgramScheduleName(schedule, program)}</Text>
                <Text style={styles.rowMeta}>{formatProgramScheduleDetailLabel(schedule)}</Text>
                <Text style={styles.rowMeta}>{schedule.is_active ? 'Activo' : 'Pausado'}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          );
        })}
      </View>

      {!loading && filtered.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sin horarios</Text><Text style={styles.muted}>No hay horarios para este filtro.</Text></View> : null}

      <KeyboardAwareModal visible={Boolean(selected)} onClose={() => setSelected(null)}>
        <Text style={styles.modalKicker}>Horario</Text>
        <Text style={styles.modalTitle}>{selectedProgram?.name ?? 'Clase'} - {formatProgramScheduleName(selected, selectedProgram)}</Text>
        <Text style={styles.modalHint}>Define desde cuando cambia. Todo lo anterior queda igual.</Text>

        <Text style={styles.label}>Cambiar desde</Text>
        <Pressable style={styles.dateButton} onPress={() => setCalendarOpen((value) => !value)}>
          <Text style={styles.dateButtonText}>{formatDate(effectiveDate)}</Text>
          <MaterialIcons name="event" size={20} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        {calendarOpen ? (
          <View style={styles.calendarBox}>
            <Calendar
              current={effectiveDate}
              minDate={todayKey()}
              markedDates={{ [effectiveDate]: { selected: true, selectedColor: ucapsaBrand.colors.red } }}
              onDayPress={(day) => changeEffectiveDate(day.dateString)}
              theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
            />
          </View>
        ) : null}

        <Pressable style={styles.quickButton} onPress={useSelectedDateAsClassDay}>
          <MaterialIcons name="today" size={18} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.quickButtonText}>Usar esta fecha como dia de clase</Text>
        </Pressable>

        <Text style={styles.label}>Dia</Text>
        <View style={styles.dayGrid}>
          {dayOptions.map((day) => (
            <Pressable key={day.value} style={[styles.dayChip, dayOfWeek === day.value && styles.dayChipActive]} onPress={() => setDayOfWeek(day.value)}>
              <Text style={[styles.dayChipText, dayOfWeek === day.value && styles.dayChipTextActive]}>{day.label.slice(0, 3)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Hora</Text>
        <TextInput value={startTime} onChangeText={setStartTime} placeholder="10:00" keyboardType="numbers-and-punctuation" style={styles.input} />

        <Text style={styles.label}>Repeticion</Text>
        <View style={styles.segmentRow}>
          <Pressable style={[styles.segment, repeatType === 'weekly' && styles.segmentActive]} onPress={() => setRepeatType('weekly')}><Text style={[styles.segmentText, repeatType === 'weekly' && styles.segmentTextActive]}>Cada semana</Text></Pressable>
          <Pressable style={[styles.segment, repeatType === 'biweekly' && styles.segmentActive]} onPress={() => setRepeatType('biweekly')}><Text style={[styles.segmentText, repeatType === 'biweekly' && styles.segmentTextActive]}>Cada 2 semanas</Text></Pressable>
        </View>
        {repeatType === 'biweekly' ? <Text style={styles.modalHint}>La semana base sera {formatDate(effectiveDate)}. Las futuras clases se recorren al nuevo ciclo.</Text> : null}

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Horario activo</Text><Text style={styles.modalHint}>Desactivalo si ya no debe generar clases futuras.</Text></View>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>

        <Pressable style={styles.sectionToggle} onPress={() => setAdvancedOpen((value) => !value)}>
          <Text style={styles.sectionToggleText}>Opciones avanzadas</Text>
          <MaterialIcons name={advancedOpen ? 'expand-less' : 'expand-more'} size={21} color="#fff" />
        </Pressable>
        {advancedOpen ? (
          <View style={styles.advancedBox}>
            <Text style={styles.labelDark}>Nombre interno</Text>
            <TextInput value={name} onChangeText={setName} style={styles.inputLight} />
            <Text style={styles.labelDark}>Orden de clase</Text>
            <TextInput value={sequenceOrder} onChangeText={setSequenceOrder} keyboardType="number-pad" style={styles.inputLight} />
            <Text style={styles.labelDark}>Motivo del cambio</Text>
            <TextInput value={changeNote} onChangeText={setChangeNote} placeholder="Opcional" multiline style={[styles.inputLight, styles.textArea]} />
          </View>
        ) : null}

        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>Resumen</Text>
          <Text style={styles.previewText}>Antes de {formatDate(effectiveDate)}: sin cambios.</Text>
          <Text style={styles.previewText}>Desde {formatDate(effectiveDate)}: {dayOptions.find((day) => day.value === dayOfWeek)?.label}, {startTime}, {repeatType === 'biweekly' ? 'cada 2 semanas' : 'cada semana'}.</Text>
        </View>

        <Pressable style={styles.sectionToggle} onPress={() => setHistoryOpen((value) => !value)}>
          <Text style={styles.sectionToggleText}>Historial de horario</Text>
          <MaterialIcons name={historyOpen ? 'expand-less' : 'expand-more'} size={21} color="#fff" />
        </Pressable>
        {historyOpen ? (
          <View style={styles.historyBox}>
            {selectedHistory.slice(0, 8).map((item) => (
              <View key={item.version_id ?? `${item.id}-${item.effective_from}`} style={styles.historyRow}>
                <Text style={styles.historyTitle}>Desde {item.effective_from ? formatDate(item.effective_from) : 'inicio'}</Text>
                <Text style={styles.historyText}>{formatProgramScheduleDetailLabel(item)} - {item.is_active ? 'Activo' : 'Pausado'}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void save()}>
          <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Aplicar desde esta fecha'}</Text>
        </Pressable>
        <Pressable disabled={saving} style={styles.secondaryButton} onPress={() => setSelected(null)}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  calendarShortcut: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 7 },
  statusFilters: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  smallChip: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 7 },
  smallChipActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  smallChipText: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900' },
  smallChipTextActive: { color: ucapsaBrand.colors.redDark },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 9 },
  chipActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  chipText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#fff' },
  infoCard: { flexDirection: 'row', gap: 10, borderRadius: 17, backgroundColor: ucapsaBrand.colors.redSoft, padding: 13, marginBottom: 14 },
  infoTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  infoText: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 5, padding: 30 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  modalKicker: { color: '#F7B7C1', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: '#fff', fontSize: 23, fontWeight: '900', marginBottom: 3 },
  modalHint: { color: '#F5CBD2', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  label: { color: '#FDE7EA', fontSize: 12, fontWeight: '900', marginTop: 10, marginBottom: 5 },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: '#fff', padding: 12 },
  dateButtonText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  calendarBox: { overflow: 'hidden', borderRadius: 16, marginTop: 8 },
  quickButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: '#FDE7EA', paddingVertical: 10, marginTop: 8 },
  quickButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { minWidth: 42, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#F3B8C2', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 8 },
  dayChipActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  dayChipText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  dayChipTextActive: { color: '#fff' },
  input: { borderRadius: 14, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text, fontWeight: '800' },
  segmentRow: { flexDirection: 'row', gap: 7 },
  segment: { flex: 1, alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#F3B8C2', backgroundColor: '#fff', padding: 10 },
  segmentActive: { backgroundColor: '#FDE7EA', borderColor: ucapsaBrand.colors.red },
  segmentText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  segmentTextActive: { color: ucapsaBrand.colors.redDark },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  sectionToggleText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  advancedBox: { gap: 5, borderRadius: 16, backgroundColor: '#fff', padding: 12 },
  labelDark: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', marginTop: 4 },
  inputLight: { borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#FFF8F8', paddingHorizontal: 11, paddingVertical: 9, color: ucapsaBrand.colors.text },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  previewBox: { borderRadius: 15, backgroundColor: '#401C24', padding: 12, gap: 3, marginTop: 8 },
  previewTitle: { color: '#fff', fontSize: 12, fontWeight: '900' },
  previewText: { color: '#F5CBD2', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  historyBox: { borderRadius: 15, backgroundColor: '#fff', overflow: 'hidden' },
  historyRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  historyTitle: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  historyText: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  primaryButton: { alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginTop: 10 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#F3B8C2', paddingVertical: 12, marginTop: 7 },
  secondaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
