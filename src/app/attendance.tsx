import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand, withAlpha } from '../constants/brand';
import { resolveUcapsaFormat } from '../constants/ucapsaFormats';
import { useSession } from '../hooks/useSession';
import { clientReadKeys, sanitizeProgramRowsForCache, writeClientResource } from '../services/client-read-cache.service';
import {
  clearSavedAttendanceQr,
  getMyHistoricalAttendanceDates,
  getSavedAttendanceQrs,
  registerMyHistoricalAttendanceFromQr,
  saveAttendanceQrForLater,
  type HistoricalAttendanceCandidate,
  type SavedAttendanceQr,
} from '../services/historical-attendance.service';
import { registerMyMemberVisitFromQr } from '../services/member-visits.service';
import { getMyMembership, isMembershipActiveToday } from '../services/memberships.service';
import {
  formatProgramScheduleDisplayLabel,
  getMyProgramEnrollments,
  getProgramEnrollmentDogName,
  getProgramLevelLabel,
  parseOfficialAttendanceQrValue,
  registerMyProgramAttendanceFromQr,
} from '../services/programs.service';
import type { MembershipStatus, ProgramCode, ProgramEnrollmentWithDetails } from '../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS, withOperationTimeout } from '../utils/async.utils';

function programLabel(code: ProgramCode) {
  return code === 'puppy' ? 'Puppy' : 'Comandos';
}

function enrollmentLabel(item: ProgramEnrollmentWithDetails) {
  const dog = getProgramEnrollmentDogName(item);
  return item.program.code === 'comandos' ? `${dog} - ${getProgramLevelLabel(item.enrollment.program_level)}` : dog;
}

function historicalDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

type PendingChoice = {
  token: string;
  programCode: ProgramCode;
  enrollments: ProgramEnrollmentWithDetails[];
};

type SelectedClass = {
  token: string;
  enrollment: ProgramEnrollmentWithDetails;
};

type HistoricalFlow = SelectedClass & {
  candidates: HistoricalAttendanceCandidate[];
};

type OutsideConfirmation = SelectedClass & {
  message: string;
};

type Feedback = { kind: 'success' | 'business' | 'connection'; title: string; message: string } | null;

export default function AttendanceScanScreen() {
  const { user, role, isAdmin, loading: sessionLoading } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);
  const [screenFocused, setScreenFocused] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [enrollments, setEnrollments] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [membershipActiveToday, setMembershipActiveToday] = useState(false);
  const [savedQrs, setSavedQrs] = useState<SavedAttendanceQr[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [selectedClass, setSelectedClass] = useState<SelectedClass | null>(null);
  const [historicalFlow, setHistoricalFlow] = useState<HistoricalFlow | null>(null);
  const [outsideConfirmation, setOutsideConfirmation] = useState<OutsideConfirmation | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const activeEnrollments = useMemo(() => enrollments.filter((item) => item.enrollment.status === 'active'), [enrollments]);
  const canScanMemberVisits = membershipActiveToday;
  const canScanAnything = activeEnrollments.length > 0 || canScanMemberVisits;
  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus, hasActivePrograms: activeEnrollments.length > 0 }),
    [activeEnrollments.length, isAdmin, membershipStatus, role, user],
  );
  const premium = format.key === 'member' && !isAdmin;

  const loadSavedQrs = useCallback(async (userId: string) => {
    setSavedQrs(await getSavedAttendanceQrs(userId));
  }, []);

  const loadData = useCallback(async () => {
    if (!user || isAdmin) return;
    setLoadingData(true);
    setFeedback(null);
    setMembershipActiveToday(false);
    const [programResult, membershipResult, savedQrResult] = await Promise.allSettled([
      withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'attendance-enrollments'),
      withOperationTimeout(getMyMembership(), DEFAULT_READ_TIMEOUT_MS, 'attendance-membership'),
      getSavedAttendanceQrs(user.id),
    ]);

    if (programResult.status === 'fulfilled') {
      setEnrollments(programResult.value);
      await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(programResult.value));
    }
    if (membershipResult.status === 'fulfilled') {
      setMembershipStatus(membershipResult.value?.status ?? null);
      setMembershipActiveToday(isMembershipActiveToday(membershipResult.value));
    }
    if (savedQrResult.status === 'fulfilled') setSavedQrs(savedQrResult.value);

    if (programResult.status === 'rejected' && membershipResult.status === 'rejected') {
      setFeedback({ kind: 'connection', title: 'No pudimos verificar tu cuenta', message: 'Registrar asistencia o visita necesita conexion para confirmar tus datos con UCAPSA.' });
    }
    setLoadingData(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    void loadData();
    return () => setScreenFocused(false);
  }, [loadData]));

  function resetScanner() {
    scanLockRef.current = false;
    setPendingChoice(null);
    setSelectedClass(null);
    setHistoricalFlow(null);
    setOutsideConfirmation(null);
    setFeedback(null);
    setCameraActive(true);
  }

  async function refreshProgramsAfterConfirmedWrite(userId: string) {
    try {
      const refreshed = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'attendance-refresh');
      setEnrollments(refreshed);
      await writeClientResource(userId, clientReadKeys.programs, sanitizeProgramRowsForCache(refreshed));
    } catch {
      // La escritura ya fue confirmada por Supabase. No convertir exito en error por el refresco.
    }
  }

  function chooseEnrollment(token: string, enrollment: ProgramEnrollmentWithDetails) {
    setPendingChoice(null);
    setHistoricalFlow(null);
    setOutsideConfirmation(null);
    setSelectedClass({ token, enrollment });
    setFeedback(null);
    setCameraActive(false);
  }

  function chooseByProgram(token: string, programCode: ProgramCode) {
    const matching = activeEnrollments.filter((item) => item.program.code === programCode);
    if (matching.length === 0) {
      setFeedback({ kind: 'business', title: 'Programa no disponible', message: `No tienes una inscripcion activa en ${programLabel(programCode)}.` });
      setCameraActive(false);
      return;
    }
    if (matching.length === 1) {
      chooseEnrollment(token, matching[0]);
      return;
    }
    setSelectedClass(null);
    setHistoricalFlow(null);
    setPendingChoice({ token, programCode, enrollments: matching });
    setCameraActive(false);
  }

  async function registerClassNow(token: string, enrollment: ProgramEnrollmentWithDetails, confirmOutsideWindow = false) {
    const userId = user?.id;
    if (!userId) {
      setFeedback({ kind: 'business', title: 'Sesion no disponible', message: 'Vuelve a iniciar sesion.' });
      return;
    }
    try {
      setRegistering(true);
      setFeedback(null);
      const result = await withOperationTimeout(
        registerMyProgramAttendanceFromQr({ token, enrollmentId: enrollment.enrollment.id, confirmOutsideWindow }),
        DEFAULT_WRITE_TIMEOUT_MS,
        'attendance-register',
      );

      if (result.result === 'outside_window_confirmation_required') {
        setSelectedClass(null);
        setOutsideConfirmation({ token, enrollment, message: result.message });
        return;
      }

      if (result.result === 'registered') {
        setSelectedClass(null);
        setOutsideConfirmation(null);
        setFeedback({ kind: 'success', title: 'Asistencia registrada', message: `${result.message} ${programLabel(enrollment.program.code)} - ${enrollmentLabel(enrollment)}.` });
        await refreshProgramsAfterConfirmedWrite(userId);
        return;
      }

      if (result.result === 'already_registered') {
        setSelectedClass(null);
        setOutsideConfirmation(null);
        setFeedback({ kind: 'success', title: 'Ya estaba registrada', message: result.message });
        return;
      }

      setFeedback({ kind: 'business', title: 'No se puede registrar esta asistencia', message: result.message || 'UCAPSA rechazo el registro.' });
    } catch {
      setFeedback({ kind: 'connection', title: 'No se pudo confirmar', message: 'Revisa tu conexion e intenta de nuevo. No se registro ninguna asistencia sin confirmacion del servidor.' });
    } finally {
      setRegistering(false);
    }
  }

  async function openHistorical(token: string, enrollment: ProgramEnrollmentWithDetails) {
    try {
      setLoadingHistorical(true);
      setSelectedClass(null);
      setFeedback(null);
      const candidates = await withOperationTimeout(
        getMyHistoricalAttendanceDates(enrollment.enrollment.id, 12),
        DEFAULT_READ_TIMEOUT_MS,
        'attendance-historical-dates',
      );
      setHistoricalFlow({ token, enrollment, candidates });
    } catch {
      setFeedback({ kind: 'connection', title: 'No se pudieron cargar fechas anteriores', message: 'Necesitamos conexion para validar que fechas pasadas son realmente elegibles.' });
    } finally {
      setLoadingHistorical(false);
    }
  }

  async function registerHistorical(candidate: HistoricalAttendanceCandidate) {
    const flow = historicalFlow;
    const userId = user?.id;
    if (!flow || !userId) return;
    try {
      setRegistering(true);
      setFeedback(null);
      const result = await withOperationTimeout(
        registerMyHistoricalAttendanceFromQr({
          token: flow.token,
          enrollmentId: flow.enrollment.enrollment.id,
          attendanceDate: candidate.attendance_date,
        }),
        DEFAULT_WRITE_TIMEOUT_MS,
        'attendance-register-historical',
      );

      if (result.result === 'registered' || result.result === 'already_registered') {
        setHistoricalFlow(null);
        setFeedback({
          kind: 'success',
          title: result.result === 'registered' ? 'Asistencia anterior registrada' : 'Ya estaba registrada',
          message: result.message,
        });
        await refreshProgramsAfterConfirmedWrite(userId);
        return;
      }

      if (result.result === 'invalid_qr') {
        await clearSavedAttendanceQr(userId, flow.enrollment.program.code);
        await loadSavedQrs(userId);
      }
      setFeedback({ kind: 'business', title: 'No se puede registrar esa fecha', message: result.message || 'UCAPSA rechazo el registro historico.' });
    } catch {
      setFeedback({ kind: 'connection', title: 'No se pudo confirmar', message: 'No se registro ninguna asistencia anterior sin confirmacion del servidor.' });
    } finally {
      setRegistering(false);
    }
  }

  async function registerMemberVisit(token: string) {
    try {
      setRegistering(true);
      setCameraActive(false);
      setFeedback(null);
      const result = await withOperationTimeout(registerMyMemberVisitFromQr(token), DEFAULT_WRITE_TIMEOUT_MS, 'member-visit-register');
      if (result.result === 'registered') {
        setFeedback({ kind: 'success', title: 'Visita registrada', message: result.message || 'Tu visita como socio quedo registrada.' });
      } else {
        setFeedback({ kind: 'business', title: 'No se puede registrar la visita', message: result.message || 'UCAPSA rechazo el registro.' });
      }
    } catch {
      setFeedback({ kind: 'connection', title: 'No se pudo confirmar', message: 'Revisa tu conexion e intenta de nuevo. No se registro ninguna visita sin confirmacion del servidor.' });
    } finally {
      setRegistering(false);
    }
  }

  async function handleBarcode(value: string) {
    if (scanLockRef.current || registering || !cameraActive) return;
    scanLockRef.current = true;
    const parsed = parseOfficialAttendanceQrValue(value);
    setCameraActive(false);
    setFeedback(null);

    if (!parsed) {
      setFeedback({ kind: 'business', title: 'QR no reconocido', message: 'Este no es un QR oficial UCAPSA.' });
      return;
    }

    if (parsed.programCode === 'member') {
      if (!canScanMemberVisits) {
        setFeedback({ kind: 'business', title: 'QR de socios', message: 'Tu membresia no esta activa. Si crees que es un error, solicita revision en UCAPSA.' });
        return;
      }
      await registerMemberVisit(parsed.token);
      return;
    }

    if (user) {
      try {
        await saveAttendanceQrForLater(user.id, parsed.programCode, parsed.token);
        await loadSavedQrs(user.id);
      } catch {
        // Guardar el token local es una comodidad; nunca bloquea el registro actual.
      }
    }
    chooseByProgram(parsed.token, parsed.programCode);
  }

  if (sessionLoading) return <KeyboardAwareScreen backgroundColor={format.background}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Revisando sesion...</Text></KeyboardAwareScreen>;

  if (!user) {
    return <KeyboardAwareScreen backgroundColor={format.background}><View style={styles.centerBox}><MaterialIcons name="lock" size={42} color={format.accentDark} /><Text style={styles.title}>Inicia sesion</Text><Text style={[styles.muted, { color: format.muted }]}>Necesitas tu cuenta UCAPSA para registrar asistencia o visita.</Text><Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/auth/login' as never)}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Iniciar sesion</Text></Pressable></View></KeyboardAwareScreen>;
  }

  if (isAdmin) {
    return <KeyboardAwareScreen><View style={styles.centerBox}><MaterialIcons name="admin-panel-settings" size={42} color={ucapsaBrand.colors.redDark} /><Text style={styles.title}>Cuenta administrativa</Text><Text style={styles.muted}>Los QR oficiales se administran desde Administracion.</Text><Pressable style={styles.primaryButton} onPress={() => router.replace('/admin/attendance-qr' as never)}><Text style={styles.primaryButtonText}>Abrir QR oficiales</Text></Pressable></View></KeyboardAwareScreen>;
  }

  return (
    <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
      <View style={styles.hero}>
        <Text style={[styles.kicker, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>UCAPSA</Text>
        <Text style={[styles.heroTitle, { color: format.text }]}>Registrar</Text>
        <Text style={[styles.muted, { color: format.muted }]}>Escanea el QR oficial. Los QR de clase quedan guardados en este dispositivo para poder registrar despues una fecha pasada valida.</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.back()}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Volver</Text></Pressable>
        <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={resetScanner}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Escanear otro</Text></Pressable>
      </View>

      {loadingData ? <InfoCard format={format}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Verificando tu cuenta...</Text></InfoCard> : null}

      {!loadingData && savedQrs.length > 0 && activeEnrollments.length > 0 ? (
        <InfoCard format={format}>
          <Text style={[styles.infoTitle, { color: format.cardText }]}>QR guardados</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Puedes usarlos para registrar una clase anterior. Supabase solo ofrece fechas pasadas que cumplen programa, horario, vigencia y cancelaciones.</Text>
          {savedQrs.map((item) => (
            <Pressable key={item.programCode} style={[styles.choiceButton, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => chooseByProgram(item.token, item.programCode)}>
              <Text style={[styles.choiceTitle, { color: format.cardText }]}>{programLabel(item.programCode)}</Text>
              <Text style={[styles.choiceMeta, { color: format.muted }]}>Usar QR guardado</Text>
            </Pressable>
          ))}
        </InfoCard>
      ) : null}

      {!loadingData && !feedback && !canScanAnything ? <InfoCard format={format}><Text style={[styles.infoTitle, { color: format.cardText }]}>Sin registros disponibles</Text><Text style={[styles.muted, { color: format.muted }]}>No tienes clases activas ni una membresia activa para registrar en este momento.</Text></InfoCard> : null}

      {!permission?.granted ? (
        <InfoCard format={format}>
          <MaterialCommunityIcons name="qrcode-scan" size={34} color={format.accentDark} />
          <Text style={[styles.infoTitle, { color: format.cardText }]}>Camara</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Permite la camara para leer un QR nuevo. Los QR de clase ya guardados siguen disponibles sin abrir la camara.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={requestPermission}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Permitir camara</Text></Pressable>
        </InfoCard>
      ) : null}

      {permission?.granted && screenFocused && cameraActive && !loadingData && canScanAnything ? (
        <View style={styles.cameraCard}>
          <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(event) => void handleBarcode(event.data)} />
          <View pointerEvents="none" style={styles.scanOverlay}><MaterialCommunityIcons name="qrcode-scan" size={56} color={ucapsaBrand.colors.surface} /><Text style={styles.scanText}>QR oficial UCAPSA</Text></View>
        </View>
      ) : null}

      {registering || loadingHistorical ? <InfoCard format={format}><ActivityIndicator color={format.accent} /><Text style={[styles.infoTitle, { color: format.cardText }]}>{loadingHistorical ? 'Buscando fechas validas...' : 'Confirmando con UCAPSA...'}</Text></InfoCard> : null}

      {pendingChoice ? (
        <InfoCard format={format}>
          <Text style={[styles.infoTitle, { color: format.cardText }]}>Selecciona quien asistio</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Hay mas de una inscripcion activa en {programLabel(pendingChoice.programCode)}.</Text>
          {pendingChoice.enrollments.map((item) => <Pressable key={item.enrollment.id} style={[styles.choiceButton, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => chooseEnrollment(pendingChoice.token, item)}><Text style={[styles.choiceTitle, { color: format.cardText }]}>{enrollmentLabel(item)}</Text><Text style={[styles.choiceMeta, { color: format.muted }]}>{programLabel(item.program.code)} - {item.enrollment.attendances_count}/{item.program.required_attendances}</Text></Pressable>)}
        </InfoCard>
      ) : null}

      {selectedClass ? (
        <InfoCard format={format}>
          <MaterialIcons name="fact-check" size={32} color={format.accentDark} />
          <Text style={[styles.infoTitle, { color: format.cardText }]}>{programLabel(selectedClass.enrollment.program.code)} - {enrollmentLabel(selectedClass.enrollment)}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>{formatProgramScheduleDisplayLabel(selectedClass.enrollment.schedule, selectedClass.enrollment.program)}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Elige si quieres registrar la asistencia de hoy o una fecha anterior elegible.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => void registerClassNow(selectedClass.token, selectedClass.enrollment)}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Registrar ahora</Text></Pressable>
          <Pressable style={[styles.secondaryButton, styles.fullButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void openHistorical(selectedClass.token, selectedClass.enrollment)}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Elegir fecha pasada</Text></Pressable>
        </InfoCard>
      ) : null}

      {historicalFlow ? (
        <InfoCard format={format}>
          <MaterialIcons name="history" size={32} color={format.accentDark} />
          <Text style={[styles.infoTitle, { color: format.cardText }]}>Registrar fecha pasada</Text>
          <Text style={[styles.muted, { color: format.muted }]}>{programLabel(historicalFlow.enrollment.program.code)} - {enrollmentLabel(historicalFlow.enrollment)}</Text>
          {historicalFlow.candidates.length === 0 ? <Text style={[styles.muted, { color: format.muted }]}>No hay fechas anteriores disponibles para esta inscripcion.</Text> : null}
          {historicalFlow.candidates.map((candidate) => (
            <Pressable key={`${candidate.attendance_date}:${candidate.schedule_id}`} disabled={registering} style={[styles.choiceButton, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => void registerHistorical(candidate)}>
              <Text style={[styles.choiceTitle, { color: format.cardText }]}>{historicalDateLabel(candidate.attendance_date)}</Text>
              <Text style={[styles.choiceMeta, { color: format.muted }]}>{candidate.schedule_name} · {String(candidate.scheduled_start_time).slice(0, 5)}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.secondaryButton, styles.fullButton]} onPress={() => setHistoricalFlow(null)}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
        </InfoCard>
      ) : null}

      {outsideConfirmation ? (
        <View style={[styles.infoCard, styles.warningCard]}>
          <MaterialIcons name="schedule" size={32} color={ucapsaBrand.colors.warningDark} />
          <Text style={styles.warningTitle}>Estas fuera del horario habitual</Text>
          <Text style={styles.warningText}>{outsideConfirmation.message}</Text>
          <Text style={styles.warningDetail}>{enrollmentLabel(outsideConfirmation.enrollment)} - {formatProgramScheduleDisplayLabel(outsideConfirmation.enrollment.schedule, outsideConfirmation.enrollment.program)}</Text>
          <Text style={styles.warningQuestion}>Estas seguro de querer registrar esta asistencia?</Text>
          <View style={styles.actionRow}>
            <Pressable style={[styles.secondaryButton, styles.flexButton]} onPress={resetScanner}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
            <Pressable style={[styles.primaryButton, styles.flexButton]} onPress={() => void registerClassNow(outsideConfirmation.token, outsideConfirmation.enrollment, true)}><Text style={styles.primaryButtonText}>Registrar asistencia</Text></Pressable>
          </View>
        </View>
      ) : null}

      {feedback ? (
        <View style={[styles.infoCard, feedback.kind === 'success' ? styles.successCard : feedback.kind === 'connection' ? styles.connectionCard : styles.errorCard]}>
          <MaterialIcons name={feedback.kind === 'success' ? 'check-circle' : feedback.kind === 'connection' ? 'cloud-off' : 'info-outline'} size={34} color={feedback.kind === 'success' ? ucapsaBrand.colors.success : feedback.kind === 'connection' ? ucapsaBrand.colors.warningDark : ucapsaBrand.colors.danger} />
          <Text style={styles.feedbackTitle}>{feedback.title}</Text>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          {feedback.kind === 'connection' ? <Pressable style={styles.secondaryButton} onPress={() => void loadData()}><Text style={styles.secondaryButtonText}>Reintentar conexion</Text></Pressable> : <Pressable style={styles.secondaryButton} onPress={resetScanner}><Text style={styles.secondaryButtonText}>Continuar</Text></Pressable>}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function InfoCard({ format, children }: { format: ReturnType<typeof resolveUcapsaFormat>; children: ReactNode }) {
  return <View style={[styles.infoCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>{children}</View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  hero: { gap: 6 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  title: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  centerBox: { minHeight: 520, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  primaryButton: { marginTop: 8, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 18, paddingVertical: 12 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10 },
  flexButton: { flex: 1 },
  fullButton: { flex: 0, width: '100%' },
  secondaryButton: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  cameraCard: { position: 'relative', overflow: 'hidden', height: 390, borderRadius: 28, backgroundColor: ucapsaBrand.colors.cameraDark },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: withAlpha(ucapsaBrand.colors.black, 0.12) },
  scanText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900', textShadowColor: withAlpha(ucapsaBrand.colors.black, 0.45), textShadowRadius: 6 },
  infoCard: { gap: 9, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16 },
  successCard: { borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft },
  connectionCard: { borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft },
  errorCard: { borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft },
  warningCard: { borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft },
  infoTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  feedbackTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  feedbackText: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  warningTitle: { color: ucapsaBrand.colors.warningDark, fontSize: 18, fontWeight: '900' },
  warningText: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  warningDetail: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 19, fontWeight: '900' },
  warningQuestion: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  choiceButton: { gap: 3, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.redPale, padding: 14 },
  choiceTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  choiceMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
});
