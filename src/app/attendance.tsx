import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import { resolveUcapsaFormat } from '../constants/ucapsaFormats';
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
  const { user, role, isAdmin, loading: sessionLoading } = useSession();
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
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: activeEnrollments.length > 0 }), [activeEnrollments.length, isAdmin, role, user]);
  const premium = format.key === 'member' && !isAdmin;

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
      <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
        <ActivityIndicator color={format.accent} />
        <Text style={[styles.muted, { color: format.muted }]}>Revisando sesion...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
        <View style={styles.centerBox}>
          <MaterialIcons name="lock" size={42} color={premium ? '#FFE8B5' : format.accentDark} />
          <Text style={styles.title}>Inicia sesion</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Necesitas tu cuenta UCAPSA para registrar asistencia.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/auth/login' as never)}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Iniciar sesion</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  if (isAdmin) {
    return (
      <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
        <View style={styles.centerBox}>
          <MaterialIcons name="admin-panel-settings" size={42} color={premium ? '#FFE8B5' : format.accentDark} />
          <Text style={styles.title}>Cuenta administrativa</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Los QR de asistencia se administran desde Clases.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.replace('/admin/attendance-qr' as never)}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Abrir QR de asistencia</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  if (!permission) {
    return (
      <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
        <Text style={styles.title}>Registrar asistencia</Text>
        <Text style={[styles.muted, { color: format.muted }]}>Preparando camara...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!permission.granted) {
    return (
      <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
        <View style={styles.centerBox}>
          <MaterialCommunityIcons name="qrcode-scan" size={46} color={premium ? '#FFE8B5' : format.accentDark} />
          <Text style={styles.title}>Registrar asistencia</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Permite la camara para escanear el QR oficial de Puppy o Comandos.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={requestPermission}>
            <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Permitir camara</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined}>
      <View style={styles.hero}>
        <Text style={[styles.kicker, { color: premium ? '#FFE8B5' : format.accentDark }]}>Clases</Text>
        <Text style={[styles.heroTitle, { color: format.text }]}>Registrar asistencia</Text>
        <Text style={[styles.muted, { color: format.muted }]}>Escanea el QR oficial colocado en UCAPSA. El sistema identifica tu programa, nivel y horario.</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.back()}>
          <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Volver</Text>
        </Pressable>
        <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={resetScanner}>
          <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Escanear otro</Text>
        </Pressable>
      </View>

      {loadingEnrollments ? (
        <View style={[styles.infoCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: format.muted }]}>Cargando tus clases...</Text>
        </View>
      ) : null}

      {!loadingEnrollments && activeEnrollments.length === 0 ? (
        <View style={[styles.infoCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.infoTitle, { color: format.cardText }]}>Sin clases activas</Text>
          <Text style={[styles.muted, { color: format.muted }]}>No tienes una inscripcion activa de Puppy o Comandos para registrar.</Text>
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
        <View style={[styles.infoCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.infoTitle, { color: format.cardText }]}>Registrando asistencia...</Text>
        </View>
      ) : null}

      {choices.length > 1 && pendingToken && pendingProgram ? (
        <View style={[styles.infoCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.infoTitle, { color: format.cardText }]}>Selecciona quien asistio</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Hay mas de una inscripcion activa en {programLabel(pendingProgram)}. No vamos a adivinar.</Text>
          {choices.map((item) => (
            <Pressable key={item.enrollment.id} style={[styles.choiceButton, { borderColor: format.cardBorder, backgroundColor: premium ? '#38111B' : '#F8FAFC' }]} onPress={() => void register(pendingToken, item)}>
              <Text style={[styles.choiceTitle, { color: format.cardText }]}>{enrollmentLabel(item)}</Text>
              <Text style={[styles.choiceMeta, { color: format.muted }]}>{programLabel(item.program.code)} - {item.enrollment.attendances_count}/{item.program.required_attendances}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {message ? (
        <View style={[styles.infoCard, styles.successCard]}>
          <MaterialIcons name="check-circle" size={34} color="#15803D" />
          <Text style={[styles.infoTitle, { color: format.cardText }]}>Listo</Text>
          <Text style={[styles.muted, { color: format.muted }]}>{message}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.infoCard, styles.errorCard]}>
          <MaterialIcons name="error-outline" size={34} color={premium ? '#FFE8B5' : format.accentDark} />
          <Text style={[styles.infoTitle, { color: format.cardText }]}>No se registro</Text>
          <Text style={[styles.muted, { color: format.muted }]}>{error}</Text>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: '#270711' },
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
