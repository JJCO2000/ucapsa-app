import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getStaffIntroAgendaPlans, type StaffIntroVisit } from '../../services/intro-class-agenda.service';
import { useSession } from '../../hooks/useSession';
import {
  getStaffClassRoster,
  localDateKey,
  markStaffAbsence,
  registerStaffAttendance,
  requestMembershipReviewFromStaff,
  tomorrowKey,
  type StaffRosterRow,
} from '../../services/trainer-staff.service';

type RosterGroup = {
  scheduleId: string;
  programCode: string;
  scheduleName: string;
  startTime: string;
  rows: StaffRosterRow[];
};

function levelLabel(level: string) {
  if (level === 'medio') return 'Intermedio';
  if (level === 'avanzado') return 'Avanzado';
  return 'Básico';
}

function responseLabel(value: StaffRosterRow['rsvpResponse']) {
  if (value === 'yes') return 'Confirmado';
  if (value === 'no') return 'No irá';
  return 'Sin responder';
}

function groupRoster(rows: StaffRosterRow[]) {
  const groups = new Map<string, RosterGroup>();
  for (const row of rows) {
    const key = `${row.scheduleId}:${row.programCode}:${row.startTime}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, {
        scheduleId: row.scheduleId,
        programCode: row.programCode,
        scheduleName: row.scheduleName,
        startTime: row.startTime,
        rows: [row],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export default function TrainerClassesTab() {
  const { date, scheduleId } = useLocalSearchParams<{ date?: string; scheduleId?: string }>();
  const { isAdmin, capabilities } = useSession();
  const initialDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateKey();
  const routeScheduleId = typeof scheduleId === 'string' ? scheduleId : '';
  const [dateKey, setDateKey] = useState(initialDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [focusedScheduleId, setFocusedScheduleId] = useState(routeScheduleId);
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(routeScheduleId || null);
  const loadRunRef = useRef(0);
  const [rows, setRows] = useState<StaffRosterRow[]>([]);
  const [introVisits, setIntroVisits] = useState<StaffIntroVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const all = groupRoster(rows);
    return focusedScheduleId ? all.filter((item) => item.scheduleId === focusedScheduleId) : all;
  }, [focusedScheduleId, rows]);

  const load = useCallback(async () => {
    if (!capabilities.canUseTrainingWorkspace) return;
    const runId = ++loadRunRef.current;
    setError(null);
    try {
      const [result, visits] = await Promise.all([
        getStaffClassRoster(dateKey),
        getStaffIntroAgendaPlans(dateKey),
      ]);
      if (runId === loadRunRef.current) {
        setRows(result);
        setIntroVisits(visits);
      }
    } catch (cause) {
      if (runId === loadRunRef.current) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el roster.');
    } finally {
      if (runId === loadRunRef.current) setLoading(false);
    }
  }, [capabilities.canUseTrainingWorkspace, dateKey]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  function selectDate(nextDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    setCalendarOpen(false);
    setLoading(true);
    if (nextDate === dateKey) {
      void load();
      return;
    }
    // Cambiar fecha no debe mantener un filtro de clase de la navegación anterior.
    setFocusedScheduleId('');
    setExpandedScheduleId(null);
    setRows([]);
    setIntroVisits([]);
    setDateKey(nextDate);
  }

  async function markAttendance(row: StaffRosterRow) {
    if (row.attended || busyId) return;
    Alert.alert(
      'Registrar asistencia',
      `¿Confirmas que ${row.dogName} asistió a la clase de hoy?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Registrar',
          onPress: async () => {
            try {
              setBusyId(row.enrollmentId);
              await registerStaffAttendance({
                enrollmentId: row.enrollmentId,
                attendanceDate: dateKey,
                scheduleId: row.scheduleId,
              });
              await load();
            } catch (cause) {
              Alert.alert('No se pudo registrar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  async function markAbsent(row: StaffRosterRow) {
    if (row.absent || row.attended || busyId) return;
    Alert.alert(
      'Registrar ausencia',
      `¿Confirmas que ${row.dogName} no asistió a esta clase?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'No asistió',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusyId(row.enrollmentId);
              await markStaffAbsence({
                enrollmentId: row.enrollmentId,
                attendanceDate: dateKey,
                scheduleId: row.scheduleId,
              });
              await load();
            } catch (cause) {
              Alert.alert('No se pudo registrar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  async function requestMembership(row: StaffRosterRow) {
    if (busyId) return;
    Alert.alert(
      'Enviar a revisión de socio',
      `Administración recibirá una solicitud para revisar a ${row.clientName}. El entrenador no aprueba la membresía.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            try {
              setBusyId(row.userId);
              await requestMembershipReviewFromStaff(row.userId, `Solicitud enviada desde clase con ${row.dogName}.`);
              Alert.alert('Solicitud enviada', 'Administración la verá en la cola de membresías pendientes.');
            } catch (cause) {
              Alert.alert('No se pudo enviar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  if (!capabilities.canUseTrainingWorkspace) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  const today = localDateKey();
  const tomorrow = tomorrowKey();
  // Fechas históricas son de consulta; correcciones usan el flujo administrativo auditado.
  const canMarkAttendance = dateKey === today;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{isAdmin ? 'Administración' : 'Entrenador'} · Clases</Text>
        <Text style={styles.title}>Roster</Text>
        <Text style={styles.subtitle}>Quién viene, alertas y resultado real: Asistió / No asistió / Sin registrar. Sin datos financieros.</Text>
      </View>

      <View style={styles.dateSwitch}>
        <Pressable style={[styles.dateButton, dateKey === today && styles.dateButtonActive]} onPress={() => selectDate(today)}>
          <Text style={[styles.dateButtonText, dateKey === today && styles.dateButtonTextActive]}>Hoy</Text>
        </Pressable>
        <Pressable style={[styles.dateButton, dateKey === tomorrow && styles.dateButtonActive]} onPress={() => selectDate(tomorrow)}>
          <Text style={[styles.dateButtonText, dateKey === tomorrow && styles.dateButtonTextActive]}>Mañana</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Seleccionar fecha, actual ${dateKey}`} accessibilityState={{ expanded: calendarOpen }} style={styles.dateValue} onPress={() => setCalendarOpen((current) => !current)}>
          <MaterialIcons name="calendar-month" size={17} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.dateValueText}>{dateKey}</Text>
          <MaterialIcons name={calendarOpen ? 'expand-less' : 'expand-more'} size={15} color={ucapsaBrand.colors.redDark} />
        </Pressable>
      </View>

      {calendarOpen ? (
        <View style={styles.calendarCard}>
          <Calendar
            current={dateKey}
            onDayPress={(day: DateData) => selectDate(day.dateString)}
            markedDates={{ [dateKey]: { selected: true, selectedColor: ucapsaBrand.colors.red } }}
            theme={{ todayTextColor: ucapsaBrand.colors.redDark, arrowColor: ucapsaBrand.colors.redDark, selectedDayTextColor: ucapsaBrand.colors.surface }}
            firstDay={1}
            enableSwipeMonths
          />
        </View>
      ) : null}
      {!canMarkAttendance ? <Text style={styles.dateReadOnlyHint}>Fecha de consulta: solo se registra asistencia del día actual. Las correcciones históricas se realizan desde Administración.</Text> : null}

      {loading ? (
        <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando clase…</Text></View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}><MaterialIcons name="cloud-off" size={20} color={ucapsaBrand.colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {!loading && !error && groups.length === 0 && introVisits.length === 0 ? (
        <View style={styles.emptyCard}><MaterialIcons name="event-busy" size={27} color={ucapsaBrand.colors.muted} /><Text style={styles.emptyTitle}>No hay clases para esta fecha</Text></View>
      ) : null}

      {!loading && !error && introVisits.length > 0 ? (
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Puppy inicial · visitas agendadas ({introVisits.length})</Text>
          <Text style={styles.introHint}>No son inscripciones. Una respuesta Sí no registra asistencia ni reserva de cupo.</Text>
          {introVisits.map(visit => (
            <View key={visit.id} style={styles.introRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.introName}>{visit.dogName} · {visit.clientName}</Text>
                <Text style={styles.introHint}>{
                  visit.status === 'yes' ? 'Sí asistirá' :
                  visit.status === 'no' ? 'No asistirá' : 'Agendó · sin respuesta'
                }</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.groups}>
        {!loading && !error ? groups.map((group) => {
          const puppy = group.programCode === 'puppy';
          const confirmed = group.rows.filter((row) => row.rsvpResponse === 'yes').length;
          return (
            <View key={`${group.scheduleId}:${group.startTime}`} style={styles.groupCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${puppy ? 'Puppy' : 'Comandos'} ${group.startTime}, ${group.rows.length} perros`}
                accessibilityState={{ expanded: expandedScheduleId === group.scheduleId }}
                onPress={() => setExpandedScheduleId((selected) => selected === group.scheduleId ? null : group.scheduleId)}
                style={styles.groupHeader}
              >
                <View style={[styles.groupIcon, { backgroundColor: puppy ? ucapsaBrand.colors.goldPale : ucapsaBrand.colors.blueSoft }]}>
                  <MaterialIcons name={puppy ? 'pets' : 'school'} size={21} color={puppy ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.blueDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupTitle}>{puppy ? 'Puppy' : 'Comandos'} · {group.startTime}</Text>
                  <Text style={styles.groupMeta}>{confirmed} / {group.rows.length} confirmados</Text>
                </View>
                <MaterialIcons name={expandedScheduleId === group.scheduleId ? 'expand-less' : 'expand-more'} size={24} color={ucapsaBrand.colors.muted} />
              </Pressable>

              {expandedScheduleId === group.scheduleId ? group.rows.map((row) => {
                const busy = busyId === row.enrollmentId || busyId === row.userId;
                return (
                  <View key={row.enrollmentId} style={styles.personRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.nameLine}>
                        <Text style={styles.dogName}>{row.dogName}</Text>
                        {!puppy ? <View style={styles.levelPill}><Text style={styles.levelText}>{levelLabel(row.programLevel)}</Text></View> : null}
                        {row.safetySeverity ? (
                          <View style={[styles.safetyPill, row.safetySeverity === 'high' && styles.safetyPillHigh]}>
                            <MaterialIcons name="warning" size={13} color={row.safetySeverity === 'high' ? ucapsaBrand.colors.danger : ucapsaBrand.colors.goldDark} />
                            <Text style={[styles.safetyText, row.safetySeverity === 'high' && styles.safetyTextHigh]}>Atención</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.clientName}>{row.clientName}</Text>
                      <Text style={[
                        styles.rsvpText,
                        row.rsvpResponse === 'yes' && styles.rsvpYes,
                        row.rsvpResponse === 'no' && styles.rsvpNo,
                      ]}>{responseLabel(row.rsvpResponse)}</Text>
                      {row.safetyNote ? <Text numberOfLines={2} style={styles.safetyNote}>{row.safetyNote}</Text> : null}
                    </View>

                    <View style={styles.actions}>
                      {row.dogId ? (
                        <Pressable
                          accessibilityLabel={`Notas internas de ${row.dogName}`}
                          style={styles.iconAction}
                          onPress={() => router.push(`/staff/dog-notes?dogId=${encodeURIComponent(row.dogId ?? '')}&dogName=${encodeURIComponent(row.dogName)}` as never)}
                        >
                          <MaterialIcons name="description" size={18} color={ucapsaBrand.colors.blueDark} />
                        </Pressable>
                      ) : null}
                      <Pressable accessibilityLabel="Solicitar revisión de socio" disabled={busy} style={styles.iconAction} onPress={() => void requestMembership(row)}>
                        <MaterialIcons name="workspace-premium" size={18} color={ucapsaBrand.colors.purpleDark} />
                      </Pressable>
                      <Pressable
                        disabled={!canMarkAttendance || row.attended || busy}
                        style={[styles.attendanceButton, row.attended && styles.attendanceDone, (!canMarkAttendance || busy) && styles.disabled]}
                        onPress={() => void markAttendance(row)}
                      >
                        <MaterialIcons
                          name={row.attended ? 'check-circle' : 'how-to-reg'}
                          size={18}
                          color={row.attended ? ucapsaBrand.colors.surface : ucapsaBrand.colors.greenDark}
                        />
                        <Text style={[styles.attendanceText, row.attended && styles.attendanceTextDone]}>
                          {row.attended ? 'Asistió' : row.absent ? 'Cambiar a asistió' : 'Asistió'}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={!canMarkAttendance || row.attended || row.absent || busy}
                        style={[
                          styles.absenceButton,
                          row.absent && styles.absenceDone,
                          (!canMarkAttendance || row.attended || busy) && styles.disabled,
                        ]}
                        onPress={() => void markAbsent(row)}
                      >
                        <MaterialIcons
                          name={row.absent ? 'cancel' : 'person-off'}
                          size={18}
                          color={row.absent ? ucapsaBrand.colors.surface : ucapsaBrand.colors.danger}
                        />
                        <Text style={[styles.absenceText, row.absent && styles.absenceTextDone]}>No asistió</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }) : null}
            </View>
          );
        }) : null}
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  introCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14, marginBottom: 14, backgroundColor: ucapsaBrand.colors.surface, gap: 9 },
  introTitle: { fontSize: 16, fontWeight: '900', color: ucapsaBrand.colors.text },
  introHint: { fontSize: 12, lineHeight: 18, color: ucapsaBrand.colors.muted, fontWeight: '700' },
  introName: { fontSize: 13, fontWeight: '900', color: ucapsaBrand.colors.text },
  introRow: { borderTopWidth: 1, borderColor: ucapsaBrand.colors.border, paddingTop: 8 },
  header: { marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 33, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  dateSwitch: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 12 },
  dateButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 14 },
  dateButtonActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  dateButtonText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  dateButtonTextActive: { color: ucapsaBrand.colors.surface },
  dateValue: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 9, paddingVertical: 7 },
  calendarCard: { borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 12 },
  dateReadOnlyHint: { fontSize: 11, color: ucapsaBrand.colors.muted, marginBottom: 10, lineHeight: 16 },
  dateValueText: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12, marginBottom: 10 },
  errorText: { flex: 1, color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '800' },
  emptyCard: { alignItems: 'center', gap: 8, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 22 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  groups: { gap: 12 },
  groupCard: { borderRadius: 21, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  groupHeader: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: ucapsaBrand.colors.surfaceSubtle },
  groupIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  groupMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '800', marginTop: 2 },
  personRow: { minHeight: 98, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.borderNeutral },
  nameLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  clientName: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 2 },
  levelPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.blueSoft, paddingHorizontal: 7, paddingVertical: 3 },
  levelText: { color: ucapsaBrand.colors.blueDark, fontSize: 8, fontWeight: '900' },
  safetyPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, backgroundColor: ucapsaBrand.colors.goldPale, paddingHorizontal: 6, paddingVertical: 3 },
  safetyPillHigh: { backgroundColor: ucapsaBrand.colors.dangerSoft },
  safetyText: { color: ucapsaBrand.colors.goldDark, fontSize: 8, fontWeight: '900' },
  safetyTextHigh: { color: ucapsaBrand.colors.danger },
  rsvpText: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900', marginTop: 4 },
  rsvpYes: { color: ucapsaBrand.colors.greenDark },
  rsvpNo: { color: ucapsaBrand.colors.danger },
  safetyNote: { color: ucapsaBrand.colors.danger, fontSize: 9, lineHeight: 13, fontWeight: '800', marginTop: 3 },
  actions: { alignItems: 'flex-end', gap: 6 },
  iconAction: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.graySoft },
  attendanceButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, backgroundColor: ucapsaBrand.colors.greenSoft, paddingHorizontal: 9 },
  attendanceDone: { backgroundColor: ucapsaBrand.colors.success },
  attendanceText: { color: ucapsaBrand.colors.greenDark, fontSize: 9, fontWeight: '900' },
  attendanceTextDone: { color: ucapsaBrand.colors.surface },
  absenceButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, backgroundColor: ucapsaBrand.colors.dangerSoft, paddingHorizontal: 9 },
  absenceDone: { backgroundColor: ucapsaBrand.colors.danger },
  absenceText: { color: ucapsaBrand.colors.danger, fontSize: 9, fontWeight: '900' },
  absenceTextDone: { color: ucapsaBrand.colors.surface },
  disabled: { opacity: 0.45 },
});
