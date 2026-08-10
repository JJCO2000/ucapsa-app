import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import { useSession } from '../hooks/useSession';
import {
  getMyProgramEnrollments,
  getProgramLevelLabel,
  parseOfficialAttendanceQrValue,
  registerMyProgramAttendanceFromQr,
} from '../services/programs.service';
import type { ProgramCode, ProgramEnrollmentWithDetails } from '../types/app.types';

function programLabel(code: ProgramCode) {
  return code === 'puppy' ? 'Puppy' : 'Comandos';
}

function enrollmentLabel(item: ProgramEnrollmentWithDetails) {
  const dog = item.enrollment.dog_name || item.profile?.dog_name || 'Tu perro';
  if (item.program.code === 'comandos') {
    return `${dog} - ${getProgramLevelLabel(item.enrollment.program_level)}`;
  }
  return dog;
}

export default function AttendanceScanScreen() {
  const { user, isAdmin, loading: sessionLoading } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);
  const [screenFocused, setScreenFocused] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [enrollments, setEnrollments] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingProgram, setPendingProgram] = useState<ProgramCode | null>(null);
  const [choices, setChoices] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeEnrollments = useMemo(
    () => enrollments.filter((item) => item.enrollment.status === 'active'),
    [enrollments],
  );

  const loadEnrollments = useCallback(async () => {
    if (!user || isAdmin) return;
    try {
      setLoadingEnrollments(true);
      const rows = await getMyProgramEnrollments();
      setEnrollments(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus clases.');
    } finally {
      setLoadingEnrollments(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      void loadEnrollments();
      return () => setScreenFocused(false);
    }, [loadEnrollments]),
  );

  function resetScanner() {
    scanLockRef.current = false;
    setPendingToken(null);
    setPendingProgram(null);
    setChoices([]);
    setMessage(null);
    setError(null);
    setCameraActive(true);
  }

  async function register(token: string, enrollment: ProgramEnrollmentWithDetails) {
    try {
      setRegistering(true);
      setCameraActive(false);
      setError(null);
      const result = await registerMyProgramAttendanceFromQr({ token, enrollmentId: enrollment.enrollment.id });

      if (result.result === 'registered') {
        setMessage(`${result.message} ${programLabel(enrollment.program.code)} - ${enrollmentLabel(enrollment)}.`);
        const refreshed = await getMyProgramEnrollments();
        setEnrollments(refreshed);
        return;
      }

      if (result.result === 'already_registered') {
        setMessage(result.message);
        return;
      }

      setError(result.message || 'No se pudo registrar la asistencia.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la asistencia.');
    } finally {
      setRegistering(false);
      setChoices([]);
      setPendingToken(null);
      setPendingProgram(null);
    }
  }

  async function handleBarcode(value: string) {
    if (scanLockRef.current || registering || !cameraActive) return;
    // CameraView puede emitir el mismo QR varias veces antes de que React
    // pinte cameraActive=false. El lock sincronico evita dos RPC simultaneas.
    scanLockRef.current = true;

    const parsed = parseOfficialAttendanceQrValue(value);
    if (!parsed) {
      setCameraActive(false);
      setError('Este no es un QR oficial de asistencia UCAPSA.');
      return;
    }

    const matching = activeEnrollments.filter((item) => item.program.code === parsed.programCode);
    setCameraActive(false);
    setError(null);

    if (matching.length === 0) {
      setError(`No tienes una inscripcion activa en ${programLabel(parsed.programCode)}.`);
      return;
    }

    if (matching.length === 1) {
      await register(parsed.token, matching[0]);
      return;
    }

    // Preparado para el futuro con multiples perros sin adivinar cual asistio.
    setPendingToken(parsed.token);
    setPendingProgram(parsed.programCode);
    setChoices(matching);
  }

  if (sessionLoading) {
    return (
      <KeyboardAwareScreen>
        <ActivityIndicator color={ucapsaBrand.colors.red} />
        <Text style={styles.muted}>Revisando sesion...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.centerBox}>
          <MaterialIcons name="lock" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.title}>Inicia sesion</Text>
          <Text style={styles.muted}>Necesitas tu cuenta UCAPSA para registrar asistencia.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/auth/login' as never)}>
            <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  if (isAdmin) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.centerBox}>
          <MaterialIcons name="admin-panel-settings" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.title}>Cuenta administrativa</Text>
          <Text style={styles.muted}>Los QR de asistencia se administran desde Clases.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/admin/attendance-qr' as never)}>
            <Text style={styles.primaryButtonText}>Abrir QR de asistencia</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  if (!permission) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.title}>Registrar asistencia</Text>
        <Text style={styles.muted}>Preparando camara...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!permission.granted) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.centerBox}>
          <MaterialCommunityIcons name="qrcode-scan" size={46} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.title}>Registrar asistencia</Text>
          <Text style={styles.muted}>Permite la camara para escanear el QR oficial de Puppy o Comandos.</Text>
          <Pressable style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Permitir camara</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Clases</Text>
        <Text style={styles.heroTitle}>Registrar asistencia</Text>
        <Text style={styles.muted}>Escanea el QR oficial colocado en UCAPSA. El sistema identifica tu programa, nivel y horario.</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={resetScanner}>
          <Text style={styles.secondaryButtonText}>Escanear otro</Text>
        </Pressable>
      </View>

      {loadingEnrollments ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando tus clases...</Text>
        </View>
      ) : null}

      {!loadingEnrollments && activeEnrollments.length === 0 ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Sin clases activas</Text>
          <Text style={styles.muted}>No tienes una inscripcion activa de Puppy o Comandos para registrar.</Text>
        </View>
      ) : null}

      {screenFocused && cameraActive && !loadingEnrollments && activeEnrollments.length > 0 ? (
        <View style={styles.cameraCard}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(event) => void handleBarcode(event.data)}
          />
          <View pointerEvents="none" style={styles.scanOverlay}>
            <MaterialCommunityIcons name="qrcode-scan" size={56} color="#ffffff" />
            <Text style={styles.scanText}>QR oficial UCAPSA</Text>
          </View>
        </View>
      ) : null}

      {registering ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.infoTitle}>Registrando asistencia...</Text>
        </View>
      ) : null}

      {choices.length > 1 && pendingToken && pendingProgram ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Selecciona quien asistio</Text>
          <Text style={styles.muted}>Hay mas de una inscripcion activa en {programLabel(pendingProgram)}. No vamos a adivinar.</Text>
          {choices.map((item) => (
            <Pressable key={item.enrollment.id} style={styles.choiceButton} onPress={() => void register(pendingToken, item)}>
              <Text style={styles.choiceTitle}>{enrollmentLabel(item)}</Text>
              <Text style={styles.choiceMeta}>{programLabel(item.program.code)} - {item.enrollment.attendances_count}/{item.program.required_attendances}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {message ? (
        <View style={[styles.infoCard, styles.successCard]}>
          <MaterialIcons name="check-circle" size={34} color="#15803D" />
          <Text style={styles.infoTitle}>Listo</Text>
          <Text style={styles.muted}>{message}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.infoCard, styles.errorCard]}>
          <MaterialIcons name="error-outline" size={34} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.infoTitle}>No se registro</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  title: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  centerBox: { minHeight: 520, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  primaryButton: { marginTop: 8, borderRadius: 18, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 20, paddingVertical: 14 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  actionRow: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#ffffff', paddingVertical: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  cameraCard: { position: 'relative', overflow: 'hidden', height: 390, borderRadius: 28, backgroundColor: '#111827' },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.12)' },
  scanText: { color: '#ffffff', fontSize: 15, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6 },
  infoCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#ffffff', padding: 16 },
  successCard: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  errorCard: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  infoTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  choiceButton: { gap: 3, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#F8FAFC', padding: 14 },
  choiceTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  choiceMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
});
