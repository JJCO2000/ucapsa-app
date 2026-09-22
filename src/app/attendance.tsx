import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand, withAlpha } from '../constants/brand';
import { devWarn } from '../lib/client-diagnostics';
import { resolveUcapsaFormat } from '../constants/ucapsaFormats';
import { useSession } from '../hooks/useSession';
import {
  discardAttendanceOperation,
  getPendingAttendanceOperations,
  queueClassAttendance,
  queueMemberVisit,
  type PendingAttendanceOperation,
  type PendingClassAttendanceOperation,
} from '../services/attendance-outbox.service';
import {
  confirmPendingClassAttendance,
  flushPendingAttendanceOperations,
  syncAttendanceOperation,
} from '../services/attendance-sync.service';
import {
  clientReadKeys,
  createMembershipOfflineSummary,
  readClientResource,
  sanitizeProgramRowsForCache,
  writeClientResource,
  type MembershipOfflineSummary,
} from '../services/client-read-cache.service';
import { getMyMembership } from '../services/memberships.service';
import {
  formatProgramScheduleDisplayLabel,
  getMyProgramEnrollments,
  getProgramEnrollmentDogName,
  getProgramLevelLabel,
  parseOfficialAttendanceQrValue,
} from '../services/programs.service';
import type { MembershipStatus, ProgramCode, ProgramEnrollmentWithDetails } from '../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../utils/async.utils';

function programLabel(code: ProgramCode) {
  return code === 'puppy' ? 'Puppy' : 'Comandos';
}

function enrollmentLabel(item: ProgramEnrollmentWithDetails) {
  const dog = getProgramEnrollmentDogName(item);
  return item.program.code === 'comandos' ? `${dog} - ${getProgramLevelLabel(item.enrollment.program_level)}` : dog;
}

function capturedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'captura local';
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Feedback = { kind: 'success' | 'business' | 'connection'; title: string; message: string } | null;
type CardCompletionNotice = {
  enrollmentId: string;
  dogName: string;
  title: string;
  message: string;
} | null;
type ChoiceMode = 'select_member_dog' | 'select_card' | 'optional_card';

export default function AttendanceScanScreen() {
  const { user, role, isAdmin, loading: sessionLoading } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);
  const loadRunRef = useRef(0);
  const [screenFocused, setScreenFocused] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [enrollments, setEnrollments] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [membershipActive, setMembershipActive] = useState(false);
  const [outbox, setOutbox] = useState<PendingAttendanceOperation[]>([]);
  const [usingOfflineData, setUsingOfflineData] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingProgram, setPendingProgram] = useState<ProgramCode | null>(null);
  const [choices, setChoices] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [choiceMode, setChoiceMode] = useState<ChoiceMode>('select_card');
  const [deferredCards, setDeferredCards] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [pendingVisitNeeded, setPendingVisitNeeded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [cardCompletion, setCardCompletion] = useState<CardCompletionNotice>(null);
  const completionAnimation = useRef(new Animated.Value(0)).current;

  const activeEnrollments = useMemo(() => enrollments.filter((item) => item.enrollment.status === 'active'), [enrollments]);
  const canScanMemberVisits = membershipActive;
  const canScanAnything = activeEnrollments.length > 0 || canScanMemberVisits;
  const pendingCount = outbox.filter((item) => item.state === 'pending').length;
  const confirmationOperation = outbox.find(
    (item): item is PendingClassAttendanceOperation => item.kind === 'class' && item.state === 'needs_confirmation',
  ) ?? null;
  const rejectedOperation = outbox.find((item) => item.state === 'rejected') ?? null;
  const confirmationEnrollment = confirmationOperation
    ? enrollments.find((item) => item.enrollment.id === confirmationOperation.enrollmentId) ?? null
    : null;

  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus, hasActivePrograms: activeEnrollments.length > 0 }),
    [activeEnrollments.length, isAdmin, membershipStatus, role, user],
  );
  const premium = format.key === 'member' && !isAdmin;

  useEffect(() => {
    if (!cardCompletion) {
      completionAnimation.setValue(0);
      return;
    }

    completionAnimation.setValue(0);
    Animated.sequence([
      Animated.spring(completionAnimation, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }),
      Animated.delay(2200),
      Animated.timing(completionAnimation, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setCardCompletion(null);
    });
  }, [cardCompletion, completionAnimation]);

  const loadData = useCallback(async () => {
    if (!user || isAdmin) return;
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;

    setLoadingData(true);
    setFeedback(null);

    const [cachedPrograms, cachedMembership, cachedOutbox] = await Promise.all([
      readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs),
      readClientResource<MembershipOfflineSummary>(user.id, clientReadKeys.membership),
      getPendingAttendanceOperations(user.id),
    ]);
    if (!isCurrentRun()) return;

    setEnrollments(cachedPrograms?.data ?? []);
    setMembershipStatus(cachedMembership?.data.status ?? null);
    setMembershipActive(cachedMembership?.data.status === 'active');
    setOutbox(cachedOutbox);
    setLoadingData(false);

    const [programResult, membershipResult, flushResult] = await Promise.allSettled([
      withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'attendance-enrollments'),
      withOperationTimeout(getMyMembership(), DEFAULT_READ_TIMEOUT_MS, 'attendance-membership'),
      flushPendingAttendanceOperations(user.id),
    ]);
    if (!isCurrentRun()) return;

    if (programResult.status === 'fulfilled') {
      setEnrollments(programResult.value);
      await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(programResult.value));
      if (!isCurrentRun()) return;
    }

    if (membershipResult.status === 'fulfilled') {
      const nextMembership = membershipResult.value;
      setMembershipStatus(nextMembership?.status ?? null);
      setMembershipActive(nextMembership?.status === 'active');
      await writeClientResource(user.id, clientReadKeys.membership, createMembershipOfflineSummary(nextMembership));
      if (!isCurrentRun()) return;
    }

    if (flushResult.status === 'fulfilled') {
      setOutbox(await getPendingAttendanceOperations(user.id));
      if (!isCurrentRun()) return;
    }

    const remoteFailed = programResult.status === 'rejected' || membershipResult.status === 'rejected';
    const hasLocalIdentity = Boolean(cachedPrograms || cachedMembership);
    setUsingOfflineData(remoteFailed && hasLocalIdentity);

    if (programResult.status === 'rejected' && membershipResult.status === 'rejected' && !hasLocalIdentity) {
      setFeedback({
        kind: 'connection',
        title: 'No pudimos verificar tu cuenta',
        message: 'Conecta una vez para guardar tus programas y membresía en este dispositivo. Después podrás capturar QR sin conexión.',
      });
    }

    setLoadingData(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    void loadData();
    return () => {
      setScreenFocused(false);
      loadRunRef.current += 1;
    };
  }, [loadData]));

  function resetScanner() {
    scanLockRef.current = false;
    setPendingToken(null);
    setPendingProgram(null);
    setChoices([]);
    setChoiceMode('select_card');
    setDeferredCards([]);
    setPendingVisitNeeded(false);
    setFeedback(null);
    setCameraActive(true);
  }

  async function refreshOutbox(userId: string) {
    setOutbox(await getPendingAttendanceOperations(userId));
  }

  async function refreshProgramsAfterConfirmedWrite(userId: string) {
    try {
      const refreshed = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'attendance-refresh');
      setEnrollments(refreshed);
      await writeClientResource(userId, clientReadKeys.programs, sanitizeProgramRowsForCache(refreshed));
      return refreshed;
    } catch (error) {
      // La escritura ya fue confirmada por Supabase. No convertir éxito en error por el refresco.
      devWarn('Could not refresh programs after confirmed attendance write.', error);
      return null;
    }
  }

  function completionNoticeFor(item: ProgramEnrollmentWithDetails): CardCompletionNotice {
    if ((item.enrollment.access_mode ?? 'card') !== 'card') return null;
    const required = Math.max(1, Number(item.program.required_attendances ?? 0));
    if (item.attendances.length < required) return null;

    const dogName = getProgramEnrollmentDogName(item);
    const level = item.program.code === 'comandos' ? getProgramLevelLabel(item.enrollment.program_level) : 'Puppy';
    const message = item.program.code === 'puppy'
      ? 'Consulta con UCAPSA el siguiente paso de ' + dogName + '.'
      : item.enrollment.program_level === 'avanzado'
        ? 'Puedes seguir entrenando en Avanzado y continuar sumando logros.'
        : 'Ya puedes solicitar tu evaluación para avanzar al siguiente nivel.';

    return {
      enrollmentId: item.enrollment.id,
      dogName,
      title: '¡Completaste tus ' + String(required) + ' clases de ' + level + '!',
      message,
    };
  }

  async function registerClasses(
    token: string,
    targets: ProgramEnrollmentWithDetails[],
    options?: {
      includeMemberVisit?: boolean;
      optionalCards?: ProgramEnrollmentWithDetails[];
    },
  ) {
    const userId = user?.id;
    if (!userId) {
      setFeedback({ kind: 'business', title: 'Sesión no disponible', message: 'Vuelve a iniciar sesión.' });
      return;
    }

    setRegistering(true);
    setCameraActive(false);
    setFeedback(null);

    const operations: PendingAttendanceOperation[] = [];
    try {
      for (const target of targets) {
        operations.push(await queueClassAttendance({
          userId,
          token,
          enrollmentId: target.enrollment.id,
        }));
      }
      if (options?.includeMemberVisit && membershipActive) {
        operations.push(await queueMemberVisit({ userId, token }));
      }
      await refreshOutbox(userId);
    } catch (error) {
      setFeedback({
        kind: 'business',
        title: 'No se pudo guardar la captura',
        message: error instanceof Error ? error.message : 'El dispositivo no pudo conservar este registro. Intenta de nuevo.',
      });
      setRegistering(false);
      return;
    }

    let hasConnectionPending = false;
    let hasConfirmation = false;
    const rejectedMessages: string[] = [];
    const newlyRegisteredEnrollmentIds = new Set<string>();
    let syncedClasses = 0;
    let visitConfirmed = false;

    try {
      for (const operation of operations) {
        const result = await syncAttendanceOperation(userId, operation.id);
        if (!result) continue;
        if (result.status === 'synced') {
          if (operation.kind === 'class') {
            syncedClasses += 1;
            if (result.outcome === 'registered') newlyRegisteredEnrollmentIds.add(operation.enrollmentId);
          } else {
            visitConfirmed = true;
          }
        } else if (result.status === 'needs_confirmation') {
          hasConfirmation = true;
        } else if (result.status === 'rejected') {
          rejectedMessages.push(result.message);
        } else {
          hasConnectionPending = true;
        }
      }
      await refreshOutbox(userId);

      if (targets.length > 0 && (syncedClasses > 0 || hasConfirmation)) {
        const refreshed = await refreshProgramsAfterConfirmedWrite(userId);
        if (refreshed && newlyRegisteredEnrollmentIds.size > 0) {
          const completed = refreshed.find((item) =>
            newlyRegisteredEnrollmentIds.has(item.enrollment.id)
            && (item.enrollment.access_mode ?? 'card') === 'card'
            && item.attendances.length >= Math.max(1, Number(item.program.required_attendances ?? 0)),
          );
          if (completed) setCardCompletion(completionNoticeFor(completed));
        }
      }

      const optionalCards = options?.optionalCards ?? [];
      if (optionalCards.length > 0) {
        setPendingToken(token);
        setPendingProgram(null);
        setChoices(optionalCards);
        setChoiceMode('optional_card');
        setDeferredCards([]);
        setPendingVisitNeeded(false);
      } else {
        setChoices([]);
        setPendingToken(null);
        setPendingProgram(null);
        setDeferredCards([]);
        setPendingVisitNeeded(false);
      }

      if (rejectedMessages.length > 0) {
        setFeedback({
          kind: 'business',
          title: 'UCAPSA necesita revisar un registro',
          message: rejectedMessages[0],
        });
      } else if (hasConnectionPending) {
        setFeedback({
          kind: 'connection',
          title: 'Registro guardado sin conexión',
          message: 'La captura quedó en este dispositivo y se volverá a intentar cuando haya conexión.',
        });
      } else if (hasConfirmation) {
        setFeedback(null);
      } else {
        const dogNames = targets.map((item) => getProgramEnrollmentDogName(item));
        const classMessage = targets.length > 0
          ? (targets.length === 1
            ? `Asistencia de ${dogNames[0]} confirmada.`
            : `Asistencias de ${dogNames.join(', ')} confirmadas.`)
          : '';
        const visitMessage = options?.includeMemberVisit && membershipActive
          ? (visitConfirmed ? ' Visita de socio registrada.' : ' La visita de socio ya estaba registrada.')
          : '';
        setFeedback({
          kind: 'success',
          title: targets.length > 0 ? 'Asistencia confirmada' : 'Visita confirmada',
          message: (classMessage + visitMessage).trim() || 'Registro confirmado.',
        });
      }
    } catch {
      setFeedback({
        kind: 'connection',
        title: 'Registro guardado sin conexión',
        message: 'La captura quedó en este dispositivo y se volverá a intentar cuando haya conexión.',
      });
      await refreshOutbox(userId).catch((error) => {
        devWarn('Could not refresh attendance outbox after preserving an offline capture.', error);
      });
    } finally {
      setRegistering(false);
    }
  }

  async function registerMemberVisit(token: string) {
    const userId = user?.id;
    if (!userId) {
      setFeedback({ kind: 'business', title: 'Sesión no disponible', message: 'Vuelve a iniciar sesión.' });
      return;
    }

    setRegistering(true);
    setCameraActive(false);
    setFeedback(null);

    let operation: PendingAttendanceOperation;
    try {
      operation = await queueMemberVisit({ userId, token });
      await refreshOutbox(userId);
    } catch (error) {
      setFeedback({
        kind: 'business',
        title: 'No se pudo guardar la captura',
        message: error instanceof Error ? error.message : 'El dispositivo no pudo conservar esta visita. Intenta de nuevo.',
      });
      setRegistering(false);
      return;
    }

    try {
      const result = await syncAttendanceOperation(userId, operation.id);
      await refreshOutbox(userId);
      if (!result) throw new Error('No se encontró la visita local pendiente.');

      if (result.status === 'synced') {
        setFeedback({ kind: 'success', title: 'Visita confirmada', message: result.message || 'Tu visita como socio quedó registrada.' });
        return;
      }
      if (result.status === 'rejected') {
        setFeedback({ kind: 'business', title: 'UCAPSA no pudo aceptar esta visita', message: result.message });
        return;
      }
      setFeedback({ kind: 'connection', title: 'Visita guardada sin conexión', message: result.message });
    } catch {
      setFeedback({
        kind: 'connection',
        title: 'Visita guardada sin conexión',
        message: 'La captura ya quedó en este dispositivo y se volverá a intentar cuando haya conexión.',
      });
      await refreshOutbox(userId).catch((error) => {
        devWarn('Could not refresh attendance outbox after preserving an offline capture.', error);
      });
    } finally {
      setRegistering(false);
    }
  }

  async function confirmQueuedClass(operation: PendingClassAttendanceOperation) {
    const userId = user?.id;
    if (!userId) return;
    try {
      setRegistering(true);
      setFeedback(null);
      const result = await confirmPendingClassAttendance(userId, operation.id);
      await refreshOutbox(userId);
      if (!result) throw new Error('No se encontró la asistencia pendiente.');

      if (result.status === 'synced') {
        setFeedback({ kind: 'success', title: 'Asistencia confirmada', message: result.message });
        await refreshProgramsAfterConfirmedWrite(userId);
        return;
      }
      if (result.status === 'rejected') {
        setFeedback({ kind: 'business', title: 'UCAPSA no pudo aceptar esta asistencia', message: result.message });
        return;
      }
      setFeedback({ kind: 'connection', title: 'Confirmación pendiente', message: result.message });
    } catch {
      setFeedback({
        kind: 'connection',
        title: 'Confirmación pendiente',
        message: 'La captura sigue guardada en este dispositivo y se volverá a intentar cuando haya conexión.',
      });
    } finally {
      setRegistering(false);
    }
  }

  async function discardQueued(operationId: string) {
    const userId = user?.id;
    if (!userId) return;
    await discardAttendanceOperation(userId, operationId);
    await refreshOutbox(userId);
    resetScanner();
  }

  async function registerSelectedChoice(item: ProgramEnrollmentWithDetails) {
    if (!pendingToken) return;

    if (choiceMode === 'optional_card') {
      await registerClasses(pendingToken, [item], { includeMemberVisit: false });
      return;
    }

    if (choiceMode === 'select_member_dog') {
      await registerClasses(pendingToken, [item], {
        includeMemberVisit: pendingVisitNeeded,
        optionalCards: deferredCards,
      });
      return;
    }

    await registerClasses(pendingToken, [item], {
      includeMemberVisit: pendingVisitNeeded,
    });
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

    const memberEnrollments = activeEnrollments.filter(
      (item) => item.enrollment.access_mode === 'membership',
    );
    const cardEnrollments = activeEnrollments.filter(
      (item) => (item.enrollment.access_mode ?? 'card') === 'card',
    );

    if (parsed.programCode === 'member') {
      if (!canScanMemberVisits) {
        setFeedback({ kind: 'business', title: 'QR de socios', message: 'Tu membresía no está marcada como activa. Si crees que es un error, solicita revisión en UCAPSA.' });
        return;
      }

      const memberChoices = memberEnrollments;
      if (memberChoices.length === 0) {
        await registerClasses(parsed.token, [], {
          includeMemberVisit: true,
          optionalCards: cardEnrollments,
        });
        return;
      }

      if (memberChoices.length === 1) {
        await registerClasses(parsed.token, [memberChoices[0]], {
          includeMemberVisit: true,
          optionalCards: cardEnrollments,
        });
        return;
      }

      // La visita es inequívoca aunque haya que preguntar a qué grupo/etapa vino.
      await registerMemberVisit(parsed.token);
      setPendingToken(parsed.token);
      setPendingProgram(null);
      setChoices(memberChoices);
      setChoiceMode('select_member_dog');
      setDeferredCards(cardEnrollments);
      setPendingVisitNeeded(false);
      return;
    }

    const matching = activeEnrollments.filter((item) => item.program.code === parsed.programCode);
    if (matching.length === 0) {
      if (membershipActive) {
        await registerClasses(parsed.token, [], { includeMemberVisit: true });
        return;
      }
      setFeedback({ kind: 'business', title: 'Programa no disponible', message: `No tienes una inscripción activa en ${programLabel(parsed.programCode)}.` });
      return;
    }

    const memberMatching = matching.filter((item) => item.enrollment.access_mode === 'membership');
    const cardMatching = matching.filter((item) => (item.enrollment.access_mode ?? 'card') === 'card');
    const memberChoices = memberMatching;

    if (memberChoices.length === 1) {
      await registerClasses(parsed.token, [memberChoices[0]], {
        includeMemberVisit: membershipActive,
        optionalCards: cardMatching,
      });
      return;
    }

    if (memberChoices.length > 1) {
      setPendingToken(parsed.token);
      setPendingProgram(parsed.programCode);
      setChoices(memberChoices);
      setChoiceMode('select_member_dog');
      setDeferredCards(cardMatching);
      setPendingVisitNeeded(membershipActive);
      return;
    }

    if (cardMatching.length === 1) {
      await registerClasses(parsed.token, cardMatching, { includeMemberVisit: membershipActive });
      return;
    }

    setPendingToken(parsed.token);
    setPendingProgram(parsed.programCode);
    setChoices(cardMatching);
    setChoiceMode('select_card');
    setDeferredCards([]);
    setPendingVisitNeeded(membershipActive);
  }

  if (sessionLoading) return <KeyboardAwareScreen backgroundColor={format.background}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Revisando sesión...</Text></KeyboardAwareScreen>;

  if (!user) {
    return <KeyboardAwareScreen backgroundColor={format.background}><View style={styles.centerBox}><MaterialIcons name="lock" size={42} color={format.accentDark} /><Text style={styles.title}>Inicia sesión</Text><Text style={[styles.muted, { color: format.muted }]}>Necesitas tu cuenta UCAPSA para registrar asistencia o visita.</Text><Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/auth/login' as never)}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Iniciar sesión</Text></Pressable></View></KeyboardAwareScreen>;
  }

  if (isAdmin) {
    return <KeyboardAwareScreen><View style={styles.centerBox}><MaterialIcons name="admin-panel-settings" size={42} color={ucapsaBrand.colors.redDark} /><Text style={styles.title}>Cuenta administrativa</Text><Text style={styles.muted}>Los QR oficiales se administran desde Administración.</Text><Pressable style={styles.primaryButton} onPress={() => router.replace('/admin/attendance-qr' as never)}><Text style={styles.primaryButtonText}>Abrir QR oficiales</Text></Pressable></View></KeyboardAwareScreen>;
  }

  if (!permission) return <KeyboardAwareScreen backgroundColor={format.background}><Text style={styles.title}>Registrar</Text><Text style={[styles.muted, { color: format.muted }]}>Preparando cámara...</Text></KeyboardAwareScreen>;

  if (!permission.granted) {
    return <KeyboardAwareScreen backgroundColor={format.background}><View style={styles.centerBox}><MaterialCommunityIcons name="qrcode-scan" size={46} color={format.accentDark} /><Text style={styles.title}>Registrar</Text><Text style={[styles.muted, { color: format.muted }]}>Permite la cámara para escanear el QR oficial de Puppy, Comandos o Socios.</Text><Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={requestPermission}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Permitir cámara</Text></Pressable></View></KeyboardAwareScreen>;
  }

  return (
    <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
      <View style={styles.hero}>
        <Text style={[styles.kicker, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>UCAPSA</Text>
        <Text style={[styles.heroTitle, { color: format.text }]}>Registrar</Text>
        <Text style={[styles.muted, { color: format.muted }]}>Escanea el QR oficial. Si no hay internet, la captura queda guardada en este dispositivo hasta que UCAPSA pueda confirmarla.</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.back()}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Volver</Text></Pressable>
        <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={resetScanner}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Escanear otro</Text></Pressable>
      </View>

      {loadingData ? <InfoCard format={format}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Preparando tus datos guardados...</Text></InfoCard> : null}

      {usingOfflineData ? (
        <InfoCard format={format}>
          <View style={styles.inlineStatus}>
            <MaterialIcons name="offline-pin" size={22} color={format.accentDark} />
            <View style={styles.statusCopy}>
              <Text style={[styles.infoTitle, { color: format.cardText }]}>Modo sin conexión</Text>
              <Text style={[styles.muted, { color: format.muted }]}>Usando la última información guardada en este dispositivo.</Text>
            </View>
          </View>
        </InfoCard>
      ) : null}

      {pendingCount > 0 ? (
        <InfoCard format={format}>
          <View style={styles.inlineStatus}>
            <MaterialIcons name="sync" size={22} color={format.accentDark} />
            <View style={styles.statusCopy}>
              <Text style={[styles.infoTitle, { color: format.cardText }]}>{pendingCount} registro{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}</Text>
              <Text style={[styles.muted, { color: format.muted }]}>Se reintentará la sincronización cuando UCAPSA tenga conexión.</Text>
            </View>
          </View>
        </InfoCard>
      ) : null}

      {confirmationOperation ? (
        <View style={[styles.infoCard, styles.warningCard]}>
          <MaterialIcons name="schedule" size={32} color={ucapsaBrand.colors.warningDark} />
          <Text style={styles.warningTitle}>Confirma una captura fuera del horario habitual</Text>
          <Text style={styles.warningText}>{confirmationOperation.message || 'UCAPSA necesita tu confirmación antes de registrar esta asistencia.'}</Text>
          <Text style={styles.warningDetail}>
            {confirmationEnrollment
              ? `${enrollmentLabel(confirmationEnrollment)} - ${formatProgramScheduleDisplayLabel(confirmationEnrollment.schedule, confirmationEnrollment.program)}`
              : `Capturado ${capturedLabel(confirmationOperation.capturedAt)}`}
          </Text>
          <Text style={styles.warningQuestion}>¿Quieres registrar esta asistencia de todos modos?</Text>
          <View style={styles.actionRow}>
            <Pressable style={[styles.secondaryButton, styles.flexButton]} onPress={() => void discardQueued(confirmationOperation.id)}><Text style={styles.secondaryButtonText}>Descartar</Text></Pressable>
            <Pressable style={[styles.primaryButton, styles.flexButton]} onPress={() => void confirmQueuedClass(confirmationOperation)}><Text style={styles.primaryButtonText}>Confirmar asistencia</Text></Pressable>
          </View>
        </View>
      ) : null}

      {rejectedOperation ? (
        <View style={[styles.infoCard, styles.errorCard]}>
          <MaterialIcons name="info-outline" size={30} color={ucapsaBrand.colors.danger} />
          <Text style={styles.feedbackTitle}>Un registro necesita revisión</Text>
          <Text style={styles.feedbackText}>{rejectedOperation.message || 'UCAPSA no pudo aceptar esta captura.'}</Text>
          <Text style={styles.feedbackText}>Capturado {capturedLabel(rejectedOperation.capturedAt)}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void discardQueued(rejectedOperation.id)}><Text style={styles.secondaryButtonText}>Descartar registro local</Text></Pressable>
        </View>
      ) : null}

      {!loadingData && !feedback && !canScanAnything ? <InfoCard format={format}><Text style={[styles.infoTitle, { color: format.cardText }]}>Sin registros disponibles</Text><Text style={[styles.muted, { color: format.muted }]}>No tienes clases activas ni una membresía activa guardada para registrar en este momento.</Text></InfoCard> : null}

      {screenFocused && cameraActive && !loadingData && canScanAnything && !confirmationOperation ? (
        <View style={styles.cameraCard}>
          <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(event) => void handleBarcode(event.data)} />
          <View pointerEvents="none" style={styles.scanOverlay}><MaterialCommunityIcons name="qrcode-scan" size={56} color={ucapsaBrand.colors.surface} /><Text style={styles.scanText}>QR oficial UCAPSA</Text></View>
        </View>
      ) : null}

      {registering ? <InfoCard format={format}><ActivityIndicator color={format.accent} /><Text style={[styles.infoTitle, { color: format.cardText }]}>Guardando y sincronizando...</Text></InfoCard> : null}

      {choices.length > 0 && pendingToken ? (
        <InfoCard format={format}>
          <Text style={[styles.infoTitle, { color: format.cardText }]}>
            {choiceMode === 'optional_card'
              ? '¿Registrar también otra clase?'
              : choiceMode === 'select_member_dog'
                ? '¿Qué perro asistió?'
                : 'Selecciona quién asistió'}
          </Text>
          <Text style={[styles.muted, { color: format.muted }]}>
            {choiceMode === 'optional_card'
              ? 'La asistencia de socio ya quedó resuelta. Estas tarjetas normales sí consumen una clase.'
              : choiceMode === 'select_member_dog'
                ? 'Hay más de un perro con acceso de socio. Elige el que asistió a esta clase.'
                : pendingProgram
                  ? `Hay más de una tarjeta activa en ${programLabel(pendingProgram)}.`
                  : 'Elige el registro correcto.'}
          </Text>
          {choices.map((item) => {
            const dogName = getProgramEnrollmentDogName(item);
            const level = item.program.code === 'comandos' ? getProgramLevelLabel(item.enrollment.program_level) : null;
            const title = item.enrollment.access_mode === 'membership'
              ? [dogName, programLabel(item.program.code), level].filter(Boolean).join(' · ')
              : enrollmentLabel(item);
            const meta = item.enrollment.access_mode === 'membership'
              ? 'Socio · acceso ilimitado'
              : `Tarjeta · ${item.attendances.length}/${item.program.required_attendances}`;
            return (
              <Pressable
                key={item.enrollment.id}
                style={[styles.choiceButton, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}
                onPress={() => void registerSelectedChoice(item)}
              >
                <Text style={[styles.choiceTitle, { color: format.cardText }]}>{title}</Text>
                <Text style={[styles.choiceMeta, { color: format.muted }]}>{meta}</Text>
              </Pressable>
            );
          })}
          {choiceMode === 'optional_card' ? (
            <Pressable
              style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
              onPress={() => {
                setChoices([]);
                setPendingToken(null);
                setPendingProgram(null);
                setChoiceMode('select_card');
                setDeferredCards([]);
                setPendingVisitNeeded(false);
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>No, sólo los socios</Text>
            </Pressable>
          ) : null}
        </InfoCard>
      ) : null}

      {cardCompletion ? (
        <Animated.View
          style={[
            styles.completionCard,
            {
              opacity: completionAnimation,
              transform: [{
                scale: completionAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              }],
            },
          ]}
        >
          <View style={styles.completionMedal}>
            <MaterialIcons name="emoji-events" size={30} color={ucapsaBrand.colors.goldDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.completionKicker}>TARJETA COMPLETA</Text>
            <Text style={styles.completionTitle}>{cardCompletion.title}</Text>
            <Text style={styles.completionText}>{cardCompletion.message}</Text>
          </View>
        </Animated.View>
      ) : null}

      {feedback ? (
        <View style={[styles.infoCard, feedback.kind === 'success' ? styles.successCard : feedback.kind === 'connection' ? styles.connectionCard : styles.errorCard]}>
          <MaterialIcons name={feedback.kind === 'success' ? 'check-circle' : feedback.kind === 'connection' ? 'cloud-off' : 'info-outline'} size={34} color={feedback.kind === 'success' ? ucapsaBrand.colors.success : feedback.kind === 'connection' ? ucapsaBrand.colors.warningDark : ucapsaBrand.colors.danger} />
          <Text style={styles.feedbackTitle}>{feedback.title}</Text>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          {feedback.kind === 'connection' ? <Pressable style={styles.secondaryButton} onPress={() => void loadData()}><Text style={styles.secondaryButtonText}>Reintentar sincronización</Text></Pressable> : <Pressable style={styles.secondaryButton} onPress={resetScanner}><Text style={styles.secondaryButtonText}>Escanear otro</Text></Pressable>}
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
  secondaryButton: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  cameraCard: { position: 'relative', overflow: 'hidden', height: 390, borderRadius: 28, backgroundColor: ucapsaBrand.colors.cameraDark },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: withAlpha(ucapsaBrand.colors.black, 0.12) },
  scanText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900', textShadowColor: withAlpha(ucapsaBrand.colors.black, 0.45), textShadowRadius: 6 },
  infoCard: { gap: 9, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16 },
  inlineStatus: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  statusCopy: { flex: 1, gap: 2 },
  completionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.gold, backgroundColor: ucapsaBrand.colors.goldPale, padding: 16 },
  completionMedal: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  completionKicker: { color: ucapsaBrand.colors.goldDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  completionTitle: { color: ucapsaBrand.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 2 },
  completionText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
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