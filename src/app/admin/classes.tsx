import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { ProgramCredentialCard } from '../../components/domain/ProgramCredentialCard';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import { useSession } from '../../hooks/useSession';
import {
  createProgramEnrollment,
  createProgramClassCancellation,
  createProgramDayCancellations,
  deleteProgramClassCancellation,
  deleteProgramAttendance,
  deleteProgramEnrollment,
  formatNextProgramClassLabel,
  formatProgramScheduleDetailLabel,
  formatProgramScheduleDisplayLabel,
  formatProgramScheduleName,
  getProgramSchedulesForDate,
  getAdminProgramRows,
  getDefaultProgramLevel,
  getNextProgramLevel,
  getProgramClientProfiles,
  getProgramCodeLabel,
  getProgramLevelLabel,
  getProgramClassCancellations,
  getProgramSchedules,
  getProgramScheduleTimeline,
  getProgramStatusLabel,
  getPrograms,
  getRecommendedScheduleId,
  programLevelOptions,
  registerProgramAttendance,
  restoreProgramClassCancellation,
  setProgramEnrollmentStatus,
  sortProgramSchedules,
  updateProgramEnrollment,
  updateProgramSchedule,
} from '../../services/programs.service';
import { sendClassCancellationNotification } from '../../services/admin-class-cancellations.service';
import type {
  Announcement,
  Profile,
  ProgramClassCancellation,
  ProgramCode,
  ProgramEnrollmentStatus,
  ProgramEnrollmentWithDetails,
  ProgramLevel,
  ProgramRepeatType,
  ProgramSchedule,
  UcapsaEvent,
  UcapsaProgram,
} from '../../types/app.types';

type EnrollmentFormState = {
  userId: string;
  programId: string;
  scheduleId: string;
  initialAttendanceCount: string;
  attendanceAdjustmentDate: string;
  dogName: string;
  physicalCardNumber: string;
  programLevel: ProgramLevel;
  notes: string;
};

type EditFormState = {
  programId: string;
  scheduleId: string;
  attendancesCount: string;
  attendanceAdjustmentDate: string;
  dogName: string;
  physicalCardNumber: string;
  programLevel: ProgramLevel;
  notes: string;
};

type ProgramFilter = 'all' | ProgramCode;
type StatusFilter = 'active' | 'completed' | 'cancelled' | 'all';

const dayOptions = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
];

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'active', label: 'Activas' },
  { value: 'completed', label: 'Completadas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'all', label: 'Todas' },
];

function emptyForm(): EnrollmentFormState {
  return { userId: '', programId: '', scheduleId: 'auto', initialAttendanceCount: '0', attendanceAdjustmentDate: todayKey(), dogName: '', physicalCardNumber: '', programLevel: 'base', notes: '' };
}

function normalizeTerm(value: string) {
  return value.trim().toLowerCase();
}

function profileLabel(profile: Profile | null | undefined) {
  return profile?.full_name?.trim() || profile?.email?.trim() || 'Cliente';
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return localDateKey();
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toDateKey(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localDateKey(date);
}

function eventDateKey(event: UcapsaEvent) {
  return toDateKey(event.start_date);
}

function announcementDateKey(announcement: Announcement) {
  return toDateKey(announcement.announcement_date || announcement.event?.start_date || announcement.created_at);
}

function getProgramForSchedule(programs: UcapsaProgram[], schedule: ProgramSchedule | null | undefined) {
  if (!schedule) return null;
  return programs.find((program) => program.id === schedule.program_id) ?? null;
}

function getSchedulesForProgram(schedules: ProgramSchedule[], programId: string) {
  return sortProgramSchedules(schedules.filter((schedule) => schedule.program_id === programId && schedule.is_active));
}

function formatAttendanceCountLabel(count: number) {
  return `${count} asistencia${count === 1 ? '' : 's'}`;
}

function getScheduleClassOptions(program: UcapsaProgram) {
  if (program.code === 'puppy') {
    return [1, 2, 3, 4].map((classNumber) => ({ value: String(classNumber), label: `Clase ${classNumber}` }));
  }
  return [{ value: '1', label: 'Comandos' }];
}

function getScheduleProgram(schedules: ProgramSchedule[], programs: UcapsaProgram[], schedule: ProgramSchedule) {
  return programs.find((program) => program.id === schedule.program_id) ?? getProgramForSchedule(programs, schedule);
}

function nextScheduleForForm(form: EnrollmentFormState, schedules: ProgramSchedule[]) {
  if (form.scheduleId !== 'auto') return form.scheduleId;
  return getRecommendedScheduleId(form.programId, schedules, Number(form.initialAttendanceCount || 0));
}

export default function AdminClassesScreen() {
  const { isAdmin, role } = useSession();
  const params = useLocalSearchParams<{ scheduleId?: string; cancellations?: string; date?: string; userId?: string; program?: string; status?: string }>();
  const isSuperAdmin = role === 'super_admin';
  const [programs, setPrograms] = useState<UcapsaProgram[]>([]);
  const [schedules, setSchedules] = useState<ProgramSchedule[]>([]);
  const [scheduleTimeline, setScheduleTimeline] = useState<ProgramSchedule[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<UcapsaEvent[]>([]);
  const [calendarAnnouncements, setCalendarAnnouncements] = useState<Announcement[]>([]);
  const [classCancellations, setClassCancellations] = useState<ProgramClassCancellation[]>([]);
  const [form, setForm] = useState<EnrollmentFormState>(() => emptyForm());
  const [clientSearch, setClientSearch] = useState('');
  const [rowSearch, setRowSearch] = useState('');
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [cancellationsOpen, setCancellationsOpen] = useState(false);
  const [cancelScheduleId, setCancelScheduleId] = useState('');
  const [cancelDate, setCancelDate] = useState(todayKey());
  const [cancelReason, setCancelReason] = useState('');
  const [cancelCalendarOpen, setCancelCalendarOpen] = useState(false);
  const [selectedBaseScheduleId, setSelectedBaseScheduleId] = useState('');
  const [selectedRow, setSelectedRow] = useState<ProgramEnrollmentWithDetails | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ programId: '', scheduleId: '', attendancesCount: '0', attendanceAdjustmentDate: todayKey(), dogName: '', physicalCardNumber: '', programLevel: 'base', notes: '' });
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(todayKey());
  const [attendanceScheduleId, setAttendanceScheduleId] = useState('');
  const [attendanceNotes, setAttendanceNotes] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [programResult, scheduleResult, timelineResult, profileResult, rowResult, cancellationResult, eventResult, announcementResult] = await Promise.all([
        getPrograms(),
        getProgramSchedules(),
        getProgramScheduleTimeline(),
        getProgramClientProfiles(),
        getAdminProgramRows(),
        getProgramClassCancellations(),
        getVisibleEvents(),
        getVisibleAnnouncements(),
      ]);
      setPrograms(programResult);
      setSchedules(scheduleResult);
      setScheduleTimeline(timelineResult);
      setProfiles(profileResult);
      setRows(rowResult);
      setClassCancellations(cancellationResult);
      setCalendarEvents(eventResult);
      setCalendarAnnouncements(announcementResult);

      setForm((current) => {
        const nextProgram = programResult.find((program) => program.id === current.programId) ?? programResult[0] ?? null;
        return { ...current, programId: nextProgram?.id ?? '', programLevel: current.programLevel === 'base' && nextProgram?.code === 'comandos' ? 'principiante' : current.programLevel };
      });
    } catch (error) {
      Alert.alert('No se pudo cargar Clases', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void loadData();
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadData();
      return undefined;
    }, [isAdmin]),
  );

  useEffect(() => {
    const routeCancelDate = typeof params.date === 'string' ? params.date : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(routeCancelDate)) {
      setCancelDate(routeCancelDate);
    }
    if (params.cancellations === '1') {
      setCancellationsOpen(true);
    }
  }, [params.cancellations, params.date]);

  useEffect(() => {
    if (params.program === 'puppy' || params.program === 'comandos') {
      setProgramFilter(params.program);
      setFiltersOpen(true);
    }
    if (params.status === 'active' || params.status === 'completed' || params.status === 'cancelled' || params.status === 'all') {
      setStatusFilter(params.status);
      setFiltersOpen(true);
    }
  }, [params.program, params.status]);

  useEffect(() => {
    const routeScheduleId = typeof params.scheduleId === 'string' ? params.scheduleId : '';
    if (!routeScheduleId || schedules.length === 0) return;
    if (schedules.some((schedule) => schedule.id === routeScheduleId)) {
      setSelectedBaseScheduleId(routeScheduleId);
      setSchedulesOpen(true);
    }
  }, [params.scheduleId, schedules]);

  async function refresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  const selectedProgram = programs.find((program) => program.id === form.programId) ?? null;
  const selectedProfile = profiles.find((profile) => profile.user_id === form.userId) ?? null;
  const schedulesForSelectedProgram = selectedProgram ? getSchedulesForProgram(schedules, selectedProgram.id) : [];
  const activeSchedules = useMemo(() => schedules.filter((schedule) => schedule.is_active), [schedules]);

  const activeCancellationKeys = useMemo(
    () => new Set(classCancellations.filter((item) => !item.restored_at).map((item) => `${item.schedule_id}:${item.cancellation_date}`)),
    [classCancellations],
  );
  const cancelDateSchedulesAll = useMemo(() => getProgramSchedulesForDate(activeSchedules, cancelDate), [activeSchedules, cancelDate]);
  const cancelDateSchedules = useMemo(
    () => cancelDateSchedulesAll.filter((schedule) => !activeCancellationKeys.has(`${schedule.id}:${cancelDate}`)),
    [activeCancellationKeys, cancelDate, cancelDateSchedulesAll],
  );
  const cancelDateCancellations = useMemo(
    () => classCancellations.filter((item) => !item.restored_at && item.cancellation_date === cancelDate),
    [cancelDate, classCancellations],
  );
  const cancelDateEvents = useMemo(() => calendarEvents.filter((event) => eventDateKey(event) === cancelDate), [calendarEvents, cancelDate]);
  const cancelDateAnnouncements = useMemo(() => calendarAnnouncements.filter((announcement) => announcementDateKey(announcement) === cancelDate), [calendarAnnouncements, cancelDate]);

  useEffect(() => {
    if (cancelDateSchedules.length === 0) {
      setCancelScheduleId('');
      return;
    }
    if (!cancelDateSchedules.some((schedule) => schedule.id === cancelScheduleId)) {
      setCancelScheduleId(cancelDateSchedules[0].id);
    }
  }, [cancelDateSchedules, cancelScheduleId]);

  const filteredProfiles = useMemo(() => {
    const term = normalizeTerm(clientSearch);
    if (!term) return [];

    return profiles
      .filter((profile) => `${profile.full_name ?? ''} ${profile.email ?? ''} ${profile.phone ?? ''} ${profile.dog_name ?? ''}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [clientSearch, profiles]);

  const routeUserId = typeof params.userId === 'string' ? params.userId.trim() : '';

  const filteredRows = useMemo(() => {
    const term = normalizeTerm(rowSearch);
    const base = rows.filter((row) => {
      if (routeUserId && row.enrollment.user_id !== routeUserId) return false;
      if (programFilter !== 'all' && row.program.code !== programFilter) return false;
      if (statusFilter !== 'all' && row.enrollment.status !== statusFilter) return false;
      if (scheduleFilter !== 'all' && row.schedule.id !== scheduleFilter) return false;
      if (!term) return true;
      const haystack = `${profileLabel(row.profile)} ${row.profile?.email ?? ''} ${row.enrollment.dog_name ?? ''} ${row.enrollment.physical_card_number ?? ''} ${row.program.name} ${formatProgramScheduleDisplayLabel(row.schedule, row.program)} ${getProgramLevelLabel(row.enrollment.program_level)}`.toLowerCase();
      return haystack.includes(term);
    });

    return [...base].sort((a, b) => {
      const inactiveDiff = Number(a.enrollment.status !== 'active') - Number(b.enrollment.status !== 'active');
      if (inactiveDiff !== 0) return inactiveDiff;
      const programDiff = a.program.name.localeCompare(b.program.name, 'es-MX', { sensitivity: 'base', numeric: true });
      if (programDiff !== 0) return programDiff;
      const scheduleDiff = (a.schedule.sequence_order ?? 99) - (b.schedule.sequence_order ?? 99);
      if (scheduleDiff !== 0) return scheduleDiff;
      return profileLabel(a.profile).localeCompare(profileLabel(b.profile), 'es-MX', { sensitivity: 'base', numeric: true });
    });
  }, [programFilter, routeUserId, rowSearch, rows, scheduleFilter, statusFilter]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.enrollment.status === 'active');
    return {
      puppy: active.filter((row) => row.program.code === 'puppy').length,
      comandos: active.filter((row) => row.program.code === 'comandos').length,
      completed: rows.filter((row) => row.enrollment.status === 'completed').length,
      cancelled: rows.filter((row) => row.enrollment.status === 'cancelled').length,
    };
  }, [rows]);

  function chooseProgram(programId: string) {
    const nextProgram = programs.find((program) => program.id === programId) ?? null;
    setForm((current) => ({
      ...current,
      programId,
      scheduleId: 'auto',
      initialAttendanceCount: '0',
      attendanceAdjustmentDate: todayKey(),
      programLevel: getDefaultProgramLevel(nextProgram),
    }));
  }

  function chooseProfile(profile: Profile) {
    setForm((current) => ({ ...current, userId: profile.user_id, dogName: current.dogName || profile.dog_name || '' }));
    setClientSearch(profileLabel(profile));
  }

  function openCreate(prefill?: Partial<EnrollmentFormState>) {
    const firstProgram = programs[0] ?? null;
    const nextForm = {
      ...emptyForm(),
      programId: firstProgram?.id ?? '',
      programLevel: getDefaultProgramLevel(firstProgram),
      ...prefill,
    };
    setForm(nextForm);
    if (prefill?.userId) {
      const profile = profiles.find((item) => item.user_id === prefill.userId);
      setClientSearch(profileLabel(profile));
    }
    setCreateOpen(true);
  }

  async function handleCreate() {
    const effectiveScheduleId = nextScheduleForForm(form, schedules);
    const initialAttendanceCount = Math.max(0, Number(form.initialAttendanceCount || 0));

    if (!form.userId) {
      Alert.alert('Selecciona cliente', 'Elige a la persona que se inscribe al programa.');
      return;
    }
    if (!form.programId || !effectiveScheduleId) {
      Alert.alert('Falta programa u horario', 'Selecciona programa y horario.');
      return;
    }
    if (!form.dogName.trim()) {
      Alert.alert('Falta perro', 'Registra el nombre del perro.');
      return;
    }
    if (initialAttendanceCount > 0) {
      Alert.alert(
        'Registra asistencias reales',
        'El avance ya no se crea por contador. Guarda la inscripcion con 0 y agrega cada asistencia manualmente desde su historial.',
      );
      return;
    }

    try {
      setSaving(true);
      await createProgramEnrollment({
        userId: form.userId,
        programId: form.programId,
        scheduleId: effectiveScheduleId,
        dogName: form.dogName,
        physicalCardNumber: form.physicalCardNumber,
        programLevel: form.programLevel,
        notes: form.notes,
      });
      setCreateOpen(false);
      setClientSearch('');
      await loadData();
      Alert.alert('Inscripcion creada', 'La tarjeta digital del programa quedo lista.');
    } catch (error) {
      Alert.alert('No se pudo crear', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function openEditor(row: ProgramEnrollmentWithDetails) {
    setSelectedRow(row);
    setEditForm({
      programId: row.program.id,
      scheduleId: row.enrollment.schedule_id,
      attendancesCount: String(row.enrollment.attendances_count || 0),
      attendanceAdjustmentDate: row.enrollment.last_attendance_at || todayKey(),
      dogName: row.enrollment.dog_name ?? row.profile?.dog_name ?? '',
      physicalCardNumber: row.enrollment.physical_card_number ?? '',
      programLevel: row.enrollment.program_level ?? getDefaultProgramLevel(row.program),
      notes: row.enrollment.notes ?? '',
    });
  }

  async function handleUpdate() {
    if (!selectedRow) return;
    const nextProgram = programs.find((program) => program.id === editForm.programId) ?? selectedRow.program;
    const targetAttendances = Math.max(0, Number(editForm.attendancesCount || 0));
    const nextScheduleId = editForm.scheduleId === 'auto'
      ? getRecommendedScheduleId(nextProgram.id, schedules, targetAttendances)
      : editForm.scheduleId;

    if (!nextScheduleId) {
      Alert.alert('Falta horario', 'Selecciona un horario valido para esta inscripcion.');
      return;
    }
    if (targetAttendances !== selectedRow.enrollment.attendances_count) {
      Alert.alert(
        'Avance protegido',
        'El avance se calcula con asistencias reales. Para corregirlo, registra o elimina una asistencia desde el historial.',
      );
      return;
    }

    try {
      setSaving(true);
      await updateProgramEnrollment(selectedRow.enrollment.id, {
        programId: nextProgram.id,
        scheduleId: nextScheduleId,
        dogName: editForm.dogName,
        physicalCardNumber: editForm.physicalCardNumber,
        programLevel: nextProgram.code === 'comandos' ? editForm.programLevel : 'base',
        notes: editForm.notes,
      });
      await loadData();
      const refreshedRows = await getAdminProgramRows();
      const refreshedRow = refreshedRows.find((row) => row.enrollment.id === selectedRow.enrollment.id) ?? selectedRow;
      setRows(refreshedRows);
      setSelectedRow(refreshedRow);
      Alert.alert('Inscripcion actualizada', 'Los datos del programa se guardaron.');
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function reloadAndCloseDetail() {
    await loadData();
    setSelectedRow(null);
  }

  function changeStatus(row: ProgramEnrollmentWithDetails, status: ProgramEnrollmentStatus) {
    const label = getProgramStatusLabel(status).toLowerCase();
    Alert.alert('Confirmar cambio', `La inscripcion quedara como ${label}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          try {
            setSaving(true);
            await setProgramEnrollmentStatus(row.enrollment.id, status);
            await reloadAndCloseDetail();
          } catch (error) {
            Alert.alert('No se pudo cambiar estado', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  const attendanceSchedules = useMemo(() => {
    if (!selectedRow) return [] as ProgramSchedule[];
    const sameProgram = scheduleTimeline
      .filter((schedule) => schedule.program_id === selectedRow.enrollment.program_id)
      .map((schedule) => ({ ...schedule, is_active: true }));
    return getProgramSchedulesForDate(sameProgram, attendanceDate);
  }, [attendanceDate, scheduleTimeline, selectedRow]);

  useEffect(() => {
    if (!attendanceOpen) return;
    if (attendanceSchedules.some((schedule) => schedule.id === attendanceScheduleId)) return;
    const preferred = attendanceSchedules.find((schedule) => schedule.id === selectedRow?.enrollment.schedule_id) ?? attendanceSchedules[0];
    setAttendanceScheduleId(preferred?.id ?? '');
  }, [attendanceOpen, attendanceScheduleId, attendanceSchedules, selectedRow]);

  async function handleRegisterAttendance() {
    if (!selectedRow) return;
    if (!attendanceScheduleId) {
      Alert.alert('Selecciona una clase', 'La fecha elegida no tiene un horario real disponible para este programa.');
      return;
    }
    try {
      setSaving(true);
      await registerProgramAttendance({ enrollmentId: selectedRow.enrollment.id, attendanceDate, scheduleId: attendanceScheduleId, notes: attendanceNotes });
      setAttendanceOpen(false);
      setAttendanceNotes('');
      setAttendanceDate(todayKey());
      setAttendanceScheduleId('');
      await reloadAndCloseDetail();
      Alert.alert('Asistencia registrada', 'Se actualizo el avance y el siguiente horario.');
    } catch (error) {
      Alert.alert('No se pudo registrar asistencia', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }



  async function notifyCancelledClasses(scheduleIds: string[], cancellationDate: string, reason: string) {
    if (scheduleIds.length === 0) return;

    try {
      setSaving(true);
      const result = await sendClassCancellationNotification({
        scheduleIds,
        cancellationDate,
        reason,
      });

      Alert.alert(
        result.status === 'no_targets' ? 'Sin destinatarios' : 'Notificacion procesada',
        result.message ?? `Destinatarios: ${result.total_targets}. Enviadas: ${result.success_count}. Fallidas: ${result.failure_count}.`,
      );
    } catch (error) {
      Alert.alert('No se pudo notificar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function askNotifyCancelledClasses(scheduleIds: string[], cancellationDate: string, reason: string) {
    if (scheduleIds.length === 0) return;

    Alert.alert('Notificar cancelacion', 'Quieres avisar a los inscritos de esta cancelacion?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Si, notificar',
        onPress: () => {
          void notifyCancelledClasses(scheduleIds, cancellationDate, reason);
        },
      },
    ]);
  }


  async function handleCancelClass() {
    if (!cancelScheduleId || !cancelDateSchedules.some((schedule) => schedule.id === cancelScheduleId)) {
      Alert.alert('Selecciona clase', 'Elige una clase programada para la fecha seleccionada.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cancelDate)) {
      Alert.alert('Fecha invalida', 'Usa formato AAAA-MM-DD.');
      return;
    }

    try {
      setSaving(true);
      const reasonToNotify = cancelReason;
      const cancellation = await createProgramClassCancellation({
        scheduleId: cancelScheduleId,
        cancellationDate: cancelDate,
        reason: cancelReason,
        createAnnouncement: true,
      });
      setCancelReason('');
      await loadData();
      Alert.alert('Clase cancelada', 'Se creo un anuncio automatico y el calendario queda actualizado.', [
        { text: 'No notificar', style: 'cancel' },
        {
          text: 'Notificar inscritos',
          onPress: () => askNotifyCancelledClasses([cancellation.schedule_id], cancellation.cancellation_date, reasonToNotify),
        },
      ]);
    } catch (error) {
      Alert.alert('No se pudo cancelar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelAllClassesForDay() {
    if (cancelDateSchedules.length === 0) {
      Alert.alert('Sin clases disponibles', 'No hay clases activas para cancelar en esta fecha.');
      return;
    }

    Alert.alert('Cancelar todas las clases', `Se cancelaran ${cancelDateSchedules.length} clase(s) del ${formatDate(cancelDate)}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            const reasonToNotify = cancelReason;
            const cancellations = await createProgramDayCancellations({
              scheduleIds: cancelDateSchedules.map((schedule) => schedule.id),
              cancellationDate: cancelDate,
              reason: cancelReason,
              createAnnouncement: true,
            });
            setCancelReason('');
            await loadData();
            Alert.alert('Clases canceladas', 'Se creo un anuncio general y el calendario queda actualizado.', [
              { text: 'No notificar', style: 'cancel' },
              {
                text: 'Notificar inscritos',
                onPress: () => askNotifyCancelledClasses(
                  cancellations.map((cancellation) => cancellation.schedule_id),
                  cancelDate,
                  reasonToNotify,
                ),
              },
            ]);
          } catch (error) {
            Alert.alert('No se pudieron cancelar', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function handleRestoreCancellation(cancellationId: string) {
    try {
      setSaving(true);
      await restoreProgramClassCancellation(cancellationId);
      await loadData();
      Alert.alert('Clase reactivada', 'La clase vuelve a aparecer en el calendario.');
    } catch (error) {
      Alert.alert('No se pudo reactivar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteCancellation(cancellationId: string) {
    Alert.alert('Eliminar cancelacion', 'Esto borra el registro de cancelacion y oculta el anuncio automatico relacionado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await deleteProgramClassCancellation(cancellationId);
            await loadData();
            Alert.alert('Cancelacion eliminada', 'La clase vuelve a estar disponible.');
          } catch (error) {
            Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  function handleDeleteAttendance(row: ProgramEnrollmentWithDetails, attendanceId: string) {
    Alert.alert('Eliminar asistencia', 'Esto corrige el avance de la inscripcion.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await deleteProgramAttendance(attendanceId, row.enrollment.id);
            await reloadAndCloseDetail();
          } catch (error) {
            Alert.alert('No se pudo eliminar asistencia', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  function handleDeleteEnrollment(row: ProgramEnrollmentWithDetails) {
    Alert.alert('Eliminar inscripcion', 'Esto borra la inscripcion y sus asistencias. Usalo solo para pruebas o errores.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar definitivo',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await deleteProgramEnrollment(row.enrollment.id);
            await reloadAndCloseDetail();
          } catch (error) {
            Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  function reopenEnrollment(row: ProgramEnrollmentWithDetails, useNextLevel: boolean) {
    setSelectedRow(null);
    openCreate({
      userId: row.enrollment.user_id,
      programId: row.program.id,
      scheduleId: 'auto',
      dogName: row.enrollment.dog_name ?? row.profile?.dog_name ?? '',
      physicalCardNumber: '',
      programLevel: useNextLevel ? getNextProgramLevel(row.enrollment.program_level) : row.enrollment.program_level,
      notes: useNextLevel ? `Reinscripcion desde ${getProgramLevelLabel(row.enrollment.program_level)}.` : 'Reinscripcion del mismo nivel.',
    });
  }

  if (!isAdmin) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.deniedBox}>
          <MaterialIcons name="lock" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.title}>Acceso restringido</Text>
          <Text style={styles.muted}>Solo administradores pueden gestionar Clases.</Text>
        </View>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.heroTitle}>Clases</Text>
        <Text style={styles.subtitle}>Puppy y Comandos por perro, con tarjeta fisica, sesiones reales y avance por asistencia.</Text>
      </View>

      <View style={styles.statsGrid}>
        <Stat label="Puppy activos" value={stats.puppy} icon="pets" onPress={() => { setProgramFilter('puppy'); setStatusFilter('active'); setScheduleFilter('all'); setFiltersOpen(true); }} />
        <Stat label="Comandos activos" value={stats.comandos} icon="school" onPress={() => { setProgramFilter('comandos'); setStatusFilter('active'); setScheduleFilter('all'); setFiltersOpen(true); }} />
        <Stat label="Completados" value={stats.completed} icon="workspace-premium" onPress={() => { setProgramFilter('all'); setStatusFilter('completed'); setScheduleFilter('all'); setFiltersOpen(true); }} />
        <Stat label="Cancelados" value={stats.cancelled} icon="block" onPress={() => { setProgramFilter('all'); setStatusFilter('cancelled'); setScheduleFilter('all'); setFiltersOpen(true); }} />
      </View>

      <View style={styles.topActionsRow}>
        <Pressable style={styles.primaryButtonInline} onPress={() => openCreate()}>
          <MaterialIcons name="add" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Nueva inscripcion</Text>
        </Pressable>
        <Pressable style={styles.secondaryButtonInline} onPress={() => router.push('/admin/class-schedules?status=active' as never)}>
          <MaterialIcons name="schedule" size={19} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.secondaryButtonText}>Editar horarios</Text>
        </Pressable>
        <Pressable style={styles.secondaryButtonInline} onPress={() => router.push('/admin/class-cancellations' as never)}>
          <MaterialIcons name="event-busy" size={19} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.secondaryButtonText}>Cancelar clase</Text>
        </Pressable>
        <Pressable style={styles.secondaryButtonInline} onPress={() => router.push('/admin/attendance-qr' as never)}>
          <MaterialIcons name="qr-code" size={19} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.secondaryButtonText}>QR de asistencia</Text>
        </Pressable>
      </View>

      <View style={styles.filtersCard}>
        <View style={styles.tableHeader}>
          <View>
            <Text style={styles.sectionTitle}>Inscripciones</Text>
            <Text style={styles.muted}>{filteredRows.length} visibles de {rows.length}</Text>
          </View>
          <Pressable style={styles.filterButton} onPress={() => setFiltersOpen((value) => !value)}>
            <Text style={styles.filterButtonText}>Filtros</Text>
          </Pressable>
        </View>
        <TextInput value={rowSearch} onChangeText={setRowSearch} placeholder="Buscar cliente, perro o tarjeta fisica..." style={styles.input} />

        {filtersOpen ? (
          <View style={styles.dropdownPanel}>
            <Text style={styles.label}>Programa</Text>
            <SelectList
              selectedValue={programFilter}
              options={[{ value: 'all', label: 'Todos' }, ...programs.map((program) => ({ value: program.code, label: program.name }))]}
              onSelect={(value) => { setProgramFilter(value as ProgramFilter); setScheduleFilter('all'); }}
            />
            <Text style={styles.label}>Estado</Text>
            <SelectList selectedValue={statusFilter} options={statusOptions} onSelect={(value) => setStatusFilter(value as StatusFilter)} />
            <Text style={styles.label}>Horario</Text>
            <SelectList
              selectedValue={scheduleFilter}
              options={[{ value: 'all', label: 'Todos los horarios' }, ...activeSchedules.filter((schedule) => programFilter === 'all' || programs.find((program) => program.id === schedule.program_id)?.code === programFilter).map((schedule) => ({ value: schedule.id, label: formatProgramScheduleDisplayLabel(schedule, getScheduleProgram(activeSchedules, programs, schedule)) }))]}
              onSelect={setScheduleFilter}
            />
          </View>
        ) : null}
      </View>

      {routeUserId ? (
        <View style={styles.customerFilterBanner}>
          <MaterialIcons name="person" size={18} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.customerFilterText}>Mostrando las clases del cliente seleccionado.</Text>
        </View>
      ) : null}

      {loading ? <Text style={styles.muted}>Cargando clases...</Text> : null}

      {filteredRows.length === 0 && !loading ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Sin inscripciones visibles</Text>
          <Text style={styles.muted}>Cambia los filtros o crea una nueva inscripcion.</Text>
        </View>
      ) : null}

      {filteredRows.map((row) => (
        <Pressable key={row.enrollment.id} style={styles.rowCard} onPress={() => router.push(`/admin/customer-class?userId=${encodeURIComponent(row.enrollment.user_id)}&enrollmentId=${encodeURIComponent(row.enrollment.id)}` as never)}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  router.push(`/admin/customer?userId=${encodeURIComponent(row.enrollment.user_id)}` as never);
                }}
              >
                <Text style={styles.rowTitle}>{profileLabel(row.profile)}</Text>
                <Text style={styles.customerLinkHint}>Ver cliente</Text>
              </Pressable>
              <Text style={styles.rowMeta}>Perro: {row.enrollment.dog_name || row.profile?.dog_name || 'Sin registrar'}</Text>
            </View>
            <Text style={[styles.statusPill, row.enrollment.status !== 'active' && styles.statusPillMuted]}>{getProgramStatusLabel(row.enrollment.status)}</Text>
          </View>
          <Text style={styles.rowMeta}>{row.program.name}{row.program.code === 'comandos' ? `  Nivel ${getProgramLevelLabel(row.enrollment.program_level)}` : ''}</Text>
          <Text style={styles.rowMeta}>{formatProgramScheduleName(row.schedule, row.program)} - {formatProgramScheduleDetailLabel(row.schedule)}</Text>
          <Text style={styles.rowMeta}>{formatNextProgramClassLabel(row.schedule)}</Text>
          <Text style={styles.rowMeta}>Tarjeta: {row.enrollment.physical_card_number || 'Sin numero'}  Asistencias: {row.enrollment.attendances_count}/{row.program.required_attendances}</Text>
        </Pressable>
      ))}

      <CreateEnrollmentModal
        visible={createOpen}
        saving={saving}
        form={form}
        programs={programs}
        profiles={filteredProfiles}
        selectedProfile={selectedProfile}
        selectedProgram={selectedProgram}
        schedules={schedulesForSelectedProgram}
        clientSearch={clientSearch}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
        onClientSearch={setClientSearch}
        onChooseProfile={chooseProfile}
        onChooseProgram={chooseProgram}
        onChange={setForm}
      />

      <EnrollmentDetailModal
        row={selectedRow}
        programs={programs}
        schedules={schedules}
        editForm={editForm}
        saving={saving}
        isSuperAdmin={isSuperAdmin}
        onChange={setEditForm}
        onClose={() => setSelectedRow(null)}
        onSave={handleUpdate}
        onOpenAttendance={() => { setAttendanceDate(todayKey()); setAttendanceScheduleId(selectedRow?.enrollment.schedule_id ?? ''); setAttendanceNotes(''); setAttendanceOpen(true); }}
        onDeleteAttendance={handleDeleteAttendance}
        onStatus={changeStatus}
        onDelete={handleDeleteEnrollment}
        onReopenSame={(row) => reopenEnrollment(row, false)}
        onReopenNext={(row) => reopenEnrollment(row, true)}
      />

      <AttendanceModal
        visible={attendanceOpen}
        date={attendanceDate}
        notes={attendanceNotes}
        schedules={attendanceSchedules}
        selectedScheduleId={attendanceScheduleId}
        saving={saving}
        datePickerOpen={datePickerOpen}
        onClose={() => setAttendanceOpen(false)}
        onSave={handleRegisterAttendance}
        onDateChange={setAttendanceDate}
        onScheduleChange={setAttendanceScheduleId}
        onNotesChange={setAttendanceNotes}
        onOpenDatePicker={() => setDatePickerOpen(true)}
        onCloseDatePicker={() => setDatePickerOpen(false)}
      />


      <ClassCancellationModal
        visible={cancellationsOpen}
        schedules={cancelDateSchedules}
        programs={programs}
        cancellations={cancelDateCancellations}
        events={cancelDateEvents}
        announcements={cancelDateAnnouncements}
        selectedScheduleId={cancelScheduleId}
        date={cancelDate}
        reason={cancelReason}
        saving={saving}
        calendarOpen={cancelCalendarOpen}
        onClose={() => setCancellationsOpen(false)}
        onSelectSchedule={setCancelScheduleId}
        onDateChange={setCancelDate}
        onReasonChange={setCancelReason}
        onToggleCalendar={() => setCancelCalendarOpen((value) => !value)}
        onCloseCalendar={() => setCancelCalendarOpen(false)}
        onSave={handleCancelClass}
        onCancelAll={handleCancelAllClassesForDay}
        onRestore={handleRestoreCancellation}
        onDelete={handleDeleteCancellation}
      />

      <SchedulesModal
        visible={schedulesOpen}
        programs={programs}
        schedules={schedules}
        saving={saving}
        initialScheduleId={selectedBaseScheduleId}
        onClose={() => setSchedulesOpen(false)}
        onSave={async (schedule, input) => {
          try {
            setSaving(true);
            await updateProgramSchedule(schedule.id, input);
            await loadData();
            Alert.alert('Horario actualizado', 'El horario quedo guardado.');
          } catch (error) {
            Alert.alert('No se pudo guardar horario', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSaving(false);
          }
        }}
      />
    </KeyboardAwareScreen>
  );
}

function CreateEnrollmentModal({
  visible,
  saving,
  form,
  programs,
  profiles,
  selectedProfile,
  selectedProgram,
  schedules,
  clientSearch,
  onClose,
  onSave,
  onClientSearch,
  onChooseProfile,
  onChooseProgram,
  onChange,
}: {
  visible: boolean;
  saving: boolean;
  form: EnrollmentFormState;
  programs: UcapsaProgram[];
  profiles: Profile[];
  selectedProfile: Profile | null;
  selectedProgram: UcapsaProgram | null;
  schedules: ProgramSchedule[];
  clientSearch: string;
  onClose: () => void;
  onSave: () => void;
  onClientSearch: (value: string) => void;
  onChooseProfile: (profile: Profile) => void;
  onChooseProgram: (programId: string) => void;
  onChange: (form: EnrollmentFormState) => void;
}) {
  return (
    <KeyboardAwareModal visible={visible} onClose={onClose}>
      <Text style={styles.kickerDark}>Nueva inscripcion</Text>
      <Text style={styles.modalTitle}>Inscribir perro</Text>

      <Text style={styles.label}>Cliente</Text>
      <TextInput value={clientSearch} onChangeText={onClientSearch} placeholder="Buscar por nombre, correo o perro..." style={styles.input} />
      <View style={styles.optionsBox}>
        {clientSearch.trim().length === 0 ? (
          <Text style={styles.optionHint}>Escribe para buscar clientes. La lista aparecera aqui cuando haya coincidencias.</Text>
        ) : profiles.length === 0 ? (
          <Text style={styles.optionHint}>No hay clientes que coincidan con esa busqueda.</Text>
        ) : (
          profiles.map((profile) => (
            <Pressable key={profile.user_id} style={[styles.optionItem, form.userId === profile.user_id && styles.optionItemActive]} onPress={() => onChooseProfile(profile)}>
              <Text style={[styles.optionTitle, form.userId === profile.user_id && styles.optionTitleActive]}>{profileLabel(profile)}</Text>
              <Text style={styles.optionMeta}>{profile.email || 'Sin correo'}  Perro: {profile.dog_name || 'Sin registrar'}</Text>
            </Pressable>
          ))
        )}
      </View>

      <Text style={styles.label}>Programa</Text>
      <ChipRow options={programs.map((program) => ({ value: program.id, label: program.name }))} value={form.programId} onChange={onChooseProgram} />

      {selectedProgram?.code === 'comandos' ? (
        <>
          <Text style={styles.label}>Nivel Comandos</Text>
          <ChipRow options={programLevelOptions} value={form.programLevel} onChange={(programLevel) => onChange({ ...form, programLevel: programLevel as ProgramLevel })} />
        </>
      ) : null}

      <Text style={styles.label}>Horario</Text>
      <SelectList
        selectedValue={form.scheduleId}
        options={[{ value: 'auto', label: 'Automatico por avance' }, ...schedules.map((schedule) => ({ value: schedule.id, label: formatProgramScheduleDisplayLabel(schedule, selectedProgram) }))]}
        onSelect={(scheduleId) => onChange({ ...form, scheduleId })}
      />
      <Text style={styles.hint}>Automatico usa el avance registrado para elegir la siguiente clase. Al inicio de Puppy empieza en Clase 1.</Text>

      <Text style={styles.label}>Avance inicial</Text>
      <Text style={styles.hint}>Las nuevas inscripciones empiezan en 0. Si el cliente ya tiene asistencias historicas, registralas manualmente con su fecha real desde la ficha de la inscripcion.</Text>

      <Text style={styles.label}>Perro</Text>
      <TextInput value={form.dogName} onChangeText={(dogName) => onChange({ ...form, dogName })} placeholder={selectedProfile?.dog_name || 'Nombre del perro'} style={styles.input} />

      <Text style={styles.label}>Numero de tarjeta fisica</Text>
      <TextInput value={form.physicalCardNumber} onChangeText={(physicalCardNumber) => onChange({ ...form, physicalCardNumber })} placeholder="Ej. P-0142" autoCapitalize="characters" style={styles.input} />

      <Text style={styles.label}>Notas</Text>
      <TextInput value={form.notes} onChangeText={(notes) => onChange({ ...form, notes })} multiline style={[styles.input, styles.textArea]} />

      <Pressable disabled={saving} style={styles.primaryButton} onPress={onSave}>
        <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar inscripcion'}</Text>
      </Pressable>
      <Pressable disabled={saving} style={styles.closeButtonLight} onPress={onClose}>
        <Text style={styles.closeButtonLightText}>Cancelar</Text>
      </Pressable>
    </KeyboardAwareModal>
  );
}

function EnrollmentDetailModal({
  row,
  programs,
  schedules,
  editForm,
  saving,
  isSuperAdmin,
  onChange,
  onClose,
  onSave,
  onOpenAttendance,
  onDeleteAttendance,
  onStatus,
  onDelete,
  onReopenSame,
  onReopenNext,
}: {
  row: ProgramEnrollmentWithDetails | null;
  programs: UcapsaProgram[];
  schedules: ProgramSchedule[];
  editForm: EditFormState;
  saving: boolean;
  isSuperAdmin: boolean;
  onChange: (form: EditFormState) => void;
  onClose: () => void;
  onSave: () => void;
  onOpenAttendance: () => void;
  onDeleteAttendance: (row: ProgramEnrollmentWithDetails, attendanceId: string) => void;
  onStatus: (row: ProgramEnrollmentWithDetails, status: ProgramEnrollmentStatus) => void;
  onDelete: (row: ProgramEnrollmentWithDetails) => void;
  onReopenSame: (row: ProgramEnrollmentWithDetails) => void;
  onReopenNext: (row: ProgramEnrollmentWithDetails) => void;
}) {
  if (!row) return null;

  const selectedProgram = programs.find((program) => program.id === editForm.programId) ?? row.program;
  const selectedSchedules = getSchedulesForProgram(schedules, selectedProgram.id);

  return (
    <KeyboardAwareModal visible={Boolean(row)} onClose={onClose}>
      <Text style={styles.kickerDark}>Ficha de clase</Text>
      <Text style={styles.modalTitle}>{profileLabel(row.profile)}</Text>
      <Text style={styles.muted}>{row.program.name}  {row.profile?.email || 'Sin correo'}</Text>

      <ProgramCredentialCard item={{ ...row, enrollment: { ...row.enrollment, dog_name: editForm.dogName || row.enrollment.dog_name, program_level: editForm.programLevel } }} compact />

      <View style={styles.formCardFlat}>
        <Text style={styles.sectionTitle}>Editar inscripcion</Text>
        <Text style={styles.label}>Programa</Text>
        <SelectList
          selectedValue={editForm.programId}
          options={programs.map((program) => ({ value: program.id, label: program.name }))}
          onSelect={(programId) => {
            const nextProgram = programs.find((program) => program.id === programId) ?? row.program;
            onChange({
              ...editForm,
              programId,
              scheduleId: 'auto',
              programLevel: getDefaultProgramLevel(nextProgram),
              attendancesCount: '0',
            });
          }}
        />

        <Text style={styles.label}>Horario actual</Text>
        <SelectList selectedValue={editForm.scheduleId} options={[{ value: 'auto', label: 'Automatico por avance' }, ...selectedSchedules.map((schedule) => ({ value: schedule.id, label: formatProgramScheduleDisplayLabel(schedule, selectedProgram) }))]} onSelect={(scheduleId) => onChange({ ...editForm, scheduleId })} />

        <Text style={styles.label}>Avance</Text>
        <Text style={styles.hint}>{row.enrollment.attendances_count}/{row.program.required_attendances} asistencias reales. Para corregir el avance, registra o elimina asistencias desde el historial de abajo.</Text>

        {selectedProgram.code === 'comandos' ? (
          <>
            <Text style={styles.label}>Nivel Comandos</Text>
            <ChipRow options={programLevelOptions} value={editForm.programLevel} onChange={(programLevel) => onChange({ ...editForm, programLevel: programLevel as ProgramLevel })} />
          </>
        ) : null}

        <Text style={styles.label}>Perro</Text>
        <TextInput value={editForm.dogName} onChangeText={(dogName) => onChange({ ...editForm, dogName })} style={styles.input} />
        <Text style={styles.label}>Tarjeta fisica</Text>
        <TextInput value={editForm.physicalCardNumber} onChangeText={(physicalCardNumber) => onChange({ ...editForm, physicalCardNumber })} autoCapitalize="characters" style={styles.input} />
        <Text style={styles.label}>Notas</Text>
        <TextInput value={editForm.notes} onChangeText={(notes) => onChange({ ...editForm, notes })} multiline style={[styles.input, styles.textArea]} />
        <Pressable disabled={saving} style={styles.primaryButton} onPress={onSave}>
          <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
        </Pressable>
      </View>

      <View style={styles.formCardFlat}>
        <View style={styles.tableHeader}>
          <View>
            <Text style={styles.sectionTitle}>Asistencias</Text>
            <Text style={styles.muted}>{row.enrollment.attendances_count}/{row.program.required_attendances} registradas</Text>
          </View>
          <Pressable disabled={saving || row.enrollment.status === 'completed'} style={styles.primaryMiniButton} onPress={onOpenAttendance}>
            <Text style={styles.primaryMiniButtonText}>+ Asistencia</Text>
          </Pressable>
        </View>

        {row.attendances.length === 0 ? <Text style={styles.muted}>Sin asistencias registradas.</Text> : null}
        {row.attendances.map((attendance) => (
          <View key={attendance.id} style={styles.attendanceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attendanceTitle}>{formatDate(attendance.attendance_date)}</Text>
              <Text style={styles.attendanceMeta}>{attendance.notes || 'Sin nota'}</Text>
            </View>
            <Pressable disabled={saving} style={styles.deleteSmallButton} onPress={() => onDeleteAttendance(row, attendance.id)}>
              <Text style={styles.deleteSmallButtonText}>Eliminar</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {row.enrollment.status === 'completed' ? (
        <View style={styles.rewardBox}>
          <Text style={styles.sectionTitle}>Programa completado</Text>
          <Text style={styles.muted}>Puedes reinscribir al mismo nivel o pasar al siguiente si aprobo examen.</Text>
          <View style={styles.actionGrid}>
            <Pressable style={styles.secondaryButton} onPress={() => onReopenSame(row)}><Text style={styles.secondaryButtonText}>Mismo nivel</Text></Pressable>
            {row.program.code === 'comandos' ? <Pressable style={styles.secondaryButton} onPress={() => onReopenNext(row)}><Text style={styles.secondaryButtonText}>Siguiente nivel</Text></Pressable> : null}
          </View>
        </View>
      ) : null}

      <View style={styles.actionGrid}>
        <Pressable disabled={saving} style={styles.secondaryButton} onPress={() => onStatus(row, 'active')}><Text style={styles.secondaryButtonText}>Activar</Text></Pressable>
        <Pressable disabled={saving} style={styles.secondaryButton} onPress={() => onStatus(row, 'completed')}><Text style={styles.secondaryButtonText}>Completar</Text></Pressable>
        <Pressable disabled={saving} style={styles.dangerButton} onPress={() => onStatus(row, 'cancelled')}><Text style={styles.dangerButtonText}>Cancelar</Text></Pressable>
      </View>

      {isSuperAdmin ? (
        <Pressable disabled={saving} style={styles.dangerSolidButton} onPress={() => onDelete(row)}>
          <Text style={styles.dangerSolidButtonText}>Eliminar definitivo</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Cerrar</Text>
      </Pressable>
    </KeyboardAwareModal>
  );
}

function AttendanceModal({
  visible,
  date,
  notes,
  schedules,
  selectedScheduleId,
  saving,
  datePickerOpen,
  onClose,
  onSave,
  onDateChange,
  onScheduleChange,
  onNotesChange,
  onOpenDatePicker,
  onCloseDatePicker,
}: {
  visible: boolean;
  date: string;
  notes: string;
  schedules: ProgramSchedule[];
  selectedScheduleId: string;
  saving: boolean;
  datePickerOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDateChange: (value: string) => void;
  onScheduleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onOpenDatePicker: () => void;
  onCloseDatePicker: () => void;
}) {
  return (
    <KeyboardAwareModal visible={visible} onClose={onClose}>
      <Text style={styles.kickerDark}>Asistencia manual</Text>
      <Text style={styles.modalTitle}>Registrar clase tomada</Text>
      <Text style={styles.label}>Dia de clase</Text>
      <Pressable style={styles.dateButton} onPress={onOpenDatePicker}>
        <Text style={styles.dateButtonText}>{formatDate(date)}</Text>
        <MaterialIcons name="event" size={20} color={ucapsaBrand.colors.redDark} />
      </Pressable>
      {datePickerOpen ? (
        <View style={styles.calendarBox}>
          <Calendar
            current={date}
            markedDates={{ [date]: { selected: true, selectedColor: ucapsaBrand.colors.red } }}
            onDayPress={(day) => { onDateChange(day.dateString); onCloseDatePicker(); }}
            theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
          />
        </View>
      ) : null}
      <Text style={styles.label}>Clase / horario real</Text>
      {schedules.length > 0 ? (
        <SelectList
          selectedValue={selectedScheduleId}
          options={schedules.map((schedule) => ({ value: schedule.id, label: formatProgramScheduleDisplayLabel(schedule) }))}
          onSelect={onScheduleChange}
        />
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Sin clase programada ese dia</Text>
          <Text style={styles.muted}>Elige una fecha que corresponda a un horario real del programa.</Text>
        </View>
      )}
      <Text style={styles.label}>Nota</Text>
      <TextInput value={notes} onChangeText={onNotesChange} placeholder="Ej. Asistio a clase completa" multiline style={[styles.input, styles.textArea]} />
      <Pressable disabled={saving} style={styles.primaryButton} onPress={onSave}>
        <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Registrar asistencia'}</Text>
      </Pressable>
      <Pressable disabled={saving} style={styles.closeButtonLight} onPress={onClose}>
        <Text style={styles.closeButtonLightText}>Cancelar</Text>
      </Pressable>
    </KeyboardAwareModal>
  );
}


function ClassCancellationModal({
  visible,
  schedules,
  programs,
  cancellations,
  events,
  announcements,
  selectedScheduleId,
  date,
  reason,
  saving,
  calendarOpen,
  onClose,
  onSelectSchedule,
  onDateChange,
  onReasonChange,
  onToggleCalendar,
  onCloseCalendar,
  onSave,
  onCancelAll,
  onRestore,
  onDelete,
}: {
  visible: boolean;
  schedules: ProgramSchedule[];
  programs: UcapsaProgram[];
  cancellations: ProgramClassCancellation[];
  events: UcapsaEvent[];
  announcements: Announcement[];
  selectedScheduleId: string;
  date: string;
  reason: string;
  saving: boolean;
  calendarOpen: boolean;
  onClose: () => void;
  onSelectSchedule: (value: string) => void;
  onDateChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  onSave: () => void;
  onCancelAll: () => void;
  onRestore: (cancellationId: string) => void;
  onDelete: (cancellationId: string) => void;
}) {
  const scheduleOptions = schedules.map((schedule) => {
    const program = getProgramForSchedule(programs, schedule);
    return {
      value: schedule.id,
      label: formatProgramScheduleDisplayLabel(schedule, program),
    };
  });

  return (
    <KeyboardAwareModal visible={visible} onClose={onClose}>
      <Text style={styles.kickerDark}>Cancelaciones</Text>
      <Text style={styles.modalTitle}>Cancelar clase por fecha</Text>
      <Text style={styles.muted}>Primero elige fecha. Solo aparecen clases reales de ese dia.</Text>

      <Text style={styles.label}>Fecha</Text>
      <Pressable style={styles.dateButton} onPress={onToggleCalendar}>
        <Text style={styles.dateButtonText}>{formatDate(date)}</Text>
        <MaterialIcons name="event-busy" size={20} color={ucapsaBrand.colors.redDark} />
      </Pressable>

      {calendarOpen ? (
        <View style={styles.calendarBox}>
          <Calendar
            current={date}
            markedDates={{ [date]: { selected: true, selectedColor: ucapsaBrand.colors.red } }}
            onDayPress={(day) => { onDateChange(day.dateString); onCloseCalendar(); }}
            theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
          />
        </View>
      ) : null}

      <View style={styles.daySummaryBox}>
        <Text style={styles.sectionTitle}>Actividad del dia</Text>
        <Text style={styles.muted}>{events.length} evento(s), {announcements.length} anuncio(s), {schedules.length} clase(s) disponible(s), {cancellations.length} cancelada(s).</Text>

        {events.map((event) => (
          <View key={`event-${event.id}`} style={styles.daySummaryItem}>
            <MaterialIcons name="event" size={17} color="#0f766e" />
            <Text style={styles.daySummaryText}>{event.title}</Text>
          </View>
        ))}

        {announcements.map((announcement) => (
          <View key={`announcement-${announcement.id}`} style={styles.daySummaryItem}>
            <MaterialIcons name="campaign" size={17} color="#2563eb" />
            <Text style={styles.daySummaryText}>{announcement.title}</Text>
          </View>
        ))}

        {schedules.length === 0 ? <Text style={styles.muted}>No hay clases programadas para esta fecha.</Text> : null}
      </View>

      <Text style={styles.label}>Clase</Text>
      {schedules.length > 0 ? (
        <SelectList selectedValue={selectedScheduleId} options={scheduleOptions} onSelect={onSelectSchedule} />
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Sin clases este dia</Text>
          <Text style={styles.muted}>Elige una fecha donde si exista Puppy o Comandos.</Text>
        </View>
      )}

      <Text style={styles.label}>Motivo</Text>
      <TextInput
        value={reason}
        onChangeText={onReasonChange}
        placeholder="Ej. Clase suspendida por mantenimiento."
        multiline
        style={[styles.input, styles.textArea]}
      />

      <Pressable disabled={saving || !selectedScheduleId || schedules.length === 0} style={[styles.dangerSolidButton, (!selectedScheduleId || schedules.length === 0) && styles.disabledButton]} onPress={onSave}>
        <Text style={styles.dangerSolidButtonText}>{saving ? 'Guardando...' : 'Cancelar clase y anunciar'}</Text>
      </Pressable>

      <Pressable disabled={saving || schedules.length === 0} style={[styles.dangerOutlineButton, schedules.length === 0 && styles.disabledButton]} onPress={onCancelAll}>
        <Text style={styles.dangerOutlineButtonText}>{saving ? 'Guardando...' : 'Cancelar todas las clases del dia'}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Cancelaciones activas</Text>
      {cancellations.length === 0 ? <Text style={styles.muted}>Sin clases canceladas.</Text> : null}
      {cancellations.map((item) => {
        const schedule = item.schedule ?? schedules.find((scheduleItem) => scheduleItem.id === item.schedule_id) ?? null;
        const program = getProgramForSchedule(programs, schedule);
        return (
          <View key={item.id} style={styles.cancellationRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attendanceTitle}>{formatProgramScheduleName(schedule, program)} - {formatDate(item.cancellation_date)}</Text>
              <Text style={styles.attendanceMeta}>{program?.name ?? 'Clase UCAPSA'} - {formatProgramScheduleDetailLabel(schedule)}</Text>
              <Text style={styles.attendanceMeta}>{item.reason || 'Sin motivo'}</Text>
            </View>
            <View style={styles.cancellationActions}>
              <Pressable disabled={saving} style={styles.secondaryMiniButton} onPress={() => onRestore(item.id)}>
                <Text style={styles.secondaryMiniButtonText}>Reactivar</Text>
              </Pressable>
              <Pressable disabled={saving} style={styles.deleteMiniButton} onPress={() => onDelete(item.id)}>
                <Text style={styles.deleteMiniButtonText}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Cerrar</Text>
      </Pressable>
    </KeyboardAwareModal>
  );
}

function SchedulesModal({ visible, programs, schedules, saving, initialScheduleId, onClose, onSave }: { visible: boolean; programs: UcapsaProgram[]; schedules: ProgramSchedule[]; saving: boolean; initialScheduleId?: string; onClose: () => void; onSave: (schedule: ProgramSchedule, input: { name: string; dayOfWeek: number; startTime: string; repeatType: ProgramRepeatType; cycleStartDate: string | null; sequenceOrder: number; isActive: boolean }) => void }) {
  const [programId, setProgramId] = useState('');
  const [scheduleId, setScheduleId] = useState('');

  useEffect(() => {
    if (!visible) return;

    const initialSchedule = initialScheduleId ? schedules.find((schedule) => schedule.id === initialScheduleId) ?? null : null;
    const firstProgram = programs[0] ?? null;
    const targetProgramId = initialSchedule?.program_id ?? firstProgram?.id ?? '';
    const targetSchedules = sortProgramSchedules(schedules.filter((schedule) => schedule.program_id === targetProgramId));

    setProgramId(targetProgramId);
    setScheduleId(initialSchedule?.id ?? targetSchedules[0]?.id ?? '');
  }, [initialScheduleId, programs, schedules, visible]);

  const selectedProgram = programs.find((program) => program.id === programId) ?? programs[0] ?? null;
  const scheduleOptions = selectedProgram ? sortProgramSchedules(schedules.filter((schedule) => schedule.program_id === selectedProgram.id)) : [];
  const selectedSchedule = scheduleOptions.find((schedule) => schedule.id === scheduleId) ?? scheduleOptions[0] ?? null;

  function selectProgram(nextProgramId: string) {
    setProgramId(nextProgramId);
    const nextSchedules = sortProgramSchedules(schedules.filter((schedule) => schedule.program_id === nextProgramId));
    setScheduleId(nextSchedules[0]?.id ?? '');
  }

  return (
    <KeyboardAwareModal visible={visible} onClose={onClose}>
      <Text style={styles.kickerDark}>Horarios</Text>
      <Text style={styles.modalTitle}>Editar horarios base</Text>
      <Text style={styles.muted}>Estos horarios afectan las proximas inscripciones y el calculo automatico por avance.</Text>

      <Text style={styles.label}>Programa</Text>
      <SelectList selectedValue={selectedProgram?.id ?? ''} options={programs.map((program) => ({ value: program.id, label: program.name }))} onSelect={selectProgram} />

      <Text style={styles.label}>Horario base</Text>
      <SelectList
        selectedValue={selectedSchedule?.id ?? ''}
        options={scheduleOptions.map((schedule) => ({
          value: schedule.id,
          label: formatProgramScheduleDisplayLabel(schedule, selectedProgram),
        }))}
        onSelect={setScheduleId}
      />

      {selectedSchedule && selectedProgram ? (
        <ScheduleEditor key={selectedSchedule.id} program={selectedProgram} schedule={selectedSchedule} saving={saving} onSave={(input) => onSave(selectedSchedule, input)} />
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Sin horario base</Text>
          <Text style={styles.muted}>No hay horarios configurados para este programa.</Text>
        </View>
      )}

      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Cerrar</Text>
      </Pressable>
    </KeyboardAwareModal>
  );
}

function ScheduleEditor({ program, schedule, saving, onSave }: { program: UcapsaProgram; schedule: ProgramSchedule; saving: boolean; onSave: (input: { name: string; dayOfWeek: number; startTime: string; repeatType: ProgramRepeatType; cycleStartDate: string | null; sequenceOrder: number; isActive: boolean }) => void }) {
  const [name, setName] = useState(schedule.name);
  const [dayOfWeek, setDayOfWeek] = useState(String(schedule.day_of_week));
  const [startTime, setStartTime] = useState(String(schedule.start_time).slice(0, 5));
  const [repeatType, setRepeatType] = useState<ProgramRepeatType>(schedule.repeat_type);
  const [cycleStartDate, setCycleStartDate] = useState(schedule.cycle_start_date ?? '');
  const [sequenceOrder, setSequenceOrder] = useState(String(schedule.sequence_order ?? 1));
  const [isActive, setIsActive] = useState(schedule.is_active);
  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <View style={styles.scheduleCard}>
      <Text style={styles.label}>Nombre</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} />
      <Text style={styles.label}>Orden / clase</Text>
      <SelectList selectedValue={sequenceOrder} options={getScheduleClassOptions(program)} onSelect={setSequenceOrder} />
      <Text style={styles.label}>Dia</Text>
      <SelectList selectedValue={dayOfWeek} options={dayOptions.map((day) => ({ value: String(day.value), label: day.label }))} onSelect={setDayOfWeek} />
      <Text style={styles.label}>Hora</Text>
      <TextInput value={startTime} onChangeText={setStartTime} placeholder="10:00" keyboardType="numbers-and-punctuation" style={styles.input} />
      <Text style={styles.label}>Repeticion</Text>
      <ChipRow options={[{ value: 'weekly', label: 'Semanal' }, { value: 'biweekly', label: 'Cada 2 semanas' }]} value={repeatType} onChange={(value) => setRepeatType(value as ProgramRepeatType)} />
      <Text style={styles.label}>Fecha inicial del ciclo</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowCalendar((value) => !value)}>
        <Text style={styles.dateButtonText}>{cycleStartDate || 'Sin fecha base'}</Text>
        <MaterialIcons name="event" size={20} color={ucapsaBrand.colors.redDark} />
      </Pressable>
      {showCalendar ? (
        <View style={styles.calendarBox}>
          <Calendar
            current={cycleStartDate || todayKey()}
            markedDates={cycleStartDate ? { [cycleStartDate]: { selected: true, selectedColor: ucapsaBrand.colors.red } } : {}}
            onDayPress={(day) => { setCycleStartDate(day.dateString); setShowCalendar(false); }}
            theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
          />
        </View>
      ) : null}
      <View style={styles.switchRow}>
        <Text style={styles.label}>Horario activo</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>
      <Pressable disabled={saving} style={styles.primaryButton} onPress={() => onSave({ name, dayOfWeek: Number(dayOfWeek), startTime, repeatType, cycleStartDate: cycleStartDate || null, sequenceOrder: Number(sequenceOrder || 1), isActive })}>
        <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar horario'}</Text>
      </Pressable>
    </View>
  );
}

function ChipRow<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.segmentRow}>
      {options.map((option) => (
        <Pressable key={option.value} style={[styles.programSegment, value === option.value && styles.programSegmentActive]} onPress={() => onChange(option.value)}>
          <Text style={[styles.programSegmentText, value === option.value && styles.programSegmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SelectList({ selectedValue, options, onSelect }: { selectedValue: string; options: Array<{ value: string; label: string }>; onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? 'Seleccionar';
  return (
    <View>
      <Pressable style={styles.selectButton} onPress={() => setOpen((value) => !value)}>
        <Text numberOfLines={2} style={styles.selectButtonText}>{selectedLabel}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={ucapsaBrand.colors.redDark} />
      </Pressable>
      {open ? (
        <View style={styles.selectOptions}>
          {options.map((option) => (
            <Pressable key={option.value} style={[styles.selectOption, selectedValue === option.value && styles.selectOptionActive]} onPress={() => { onSelect(option.value); setOpen(false); }}>
              <Text style={[styles.selectOptionText, selectedValue === option.value && styles.selectOptionTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, icon, onPress }: { label: string; value: number; icon: keyof typeof MaterialIcons.glyphMap; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.statCard, onPress && { borderColor: ucapsaBrand.colors.redSoft }, pressed && { opacity: 0.82, transform: [{ scale: 0.99 }] }]}>
      <MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.red} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={{ color: ucapsaBrand.colors.red, fontSize: 11, fontWeight: '900', marginTop: 4, textTransform: 'uppercase' }}>Abrir filtro</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, padding: 22, borderRadius: 28, backgroundColor: ucapsaBrand.colors.text },
  kicker: { color: '#FFE8EC', fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  kickerDark: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 29, fontWeight: '900' },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900', marginTop: 4, marginBottom: 8 },
  subtitle: { color: '#F0D4DA', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 16 },
  statCard: { width: '48%', gap: 5, padding: 14, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  statValue: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900' },
  statLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  topActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  primaryButtonInline: { width: '48%', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.red },
  secondaryButtonInline: { width: '48%', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  formCardFlat: { gap: 11, padding: 16, borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginBottom: 16 },
  filtersCard: { gap: 11, padding: 16, borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginBottom: 14 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 3 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700' },
  textArea: { minHeight: 82, paddingTop: 12, textAlignVertical: 'top' },
  optionsBox: { gap: 8 },
  optionHint: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700', padding: 12, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  optionItem: { gap: 3, padding: 12, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  optionItemActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  optionTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  optionTitleActive: { color: ucapsaBrand.colors.redDark },
  optionMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  programSegment: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  programSegmentActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  programSegmentText: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '900' },
  programSegmentTextActive: { color: '#fff' },
  selectButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  selectButtonText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  selectOptions: { gap: 7, marginTop: 7, padding: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  selectOption: { padding: 11, borderRadius: 14, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  selectOptionActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  selectOptionText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800' },
  selectOptionTextActive: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  primaryButton: { alignItems: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.red, marginTop: 8 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  primaryMiniButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: ucapsaBrand.colors.red },
  primaryMiniButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  closeButtonLight: { alignItems: 'center', borderRadius: 16, paddingVertical: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 8 },
  closeButtonLightText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  dangerButton: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: 13, backgroundColor: '#FFF0F2', borderWidth: 1, borderColor: '#F3B8C2' },
  dangerButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  dangerSolidButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.redDark, marginBottom: 12 },
  dangerSolidButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  dangerOutlineButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 14, backgroundColor: '#FFF0F2', borderWidth: 1, borderColor: '#F3B8C2', marginBottom: 12 },
  dangerOutlineButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 },
  filterButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: ucapsaBrand.colors.redSoft },
  filterButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  dropdownPanel: { gap: 10, paddingTop: 8 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  customerFilterBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoft, marginBottom: 10 },
  customerFilterText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  emptyBox: { gap: 6, padding: 18, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  rowCard: { gap: 7, padding: 14, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 10 },
  rowTop: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  customerLinkHint: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', marginTop: 2 },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  statusPill: { overflow: 'hidden', borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: '900' },
  statusPillMuted: { backgroundColor: '#F1F5F9', color: '#334155' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  rewardBox: { gap: 8, padding: 14, borderRadius: 20, backgroundColor: '#FFF7CC', borderWidth: 1, borderColor: '#FACC15', marginBottom: 14 },
  attendanceRow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 11, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 8 },
  attendanceTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  attendanceMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  deleteSmallButton: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#FFF0F2', borderWidth: 1, borderColor: '#F3B8C2' },
  deleteSmallButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  dateButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  dateButtonText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  calendarBox: { overflow: 'hidden', borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 8 },
  scheduleCard: { gap: 8, padding: 12, borderRadius: 18, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  closeButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.text },
  closeButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  daySummaryBox: { gap: 8, padding: 12, borderRadius: 18, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  daySummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  daySummaryText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800' },
  cancellationRow: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 8 },
  cancellationActions: { flexDirection: 'row', gap: 8 },
  secondaryMiniButton: { flex: 1, alignItems: 'center', borderRadius: 13, paddingVertical: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  secondaryMiniButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  deleteMiniButton: { flex: 1, alignItems: 'center', borderRadius: 13, paddingVertical: 10, backgroundColor: '#FFF0F2', borderWidth: 1, borderColor: '#F3B8C2' },
  deleteMiniButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  disabledButton: { opacity: 0.5 },
  deniedBox: { gap: 10, alignItems: 'center', justifyContent: 'center', flex: 1 },
});








