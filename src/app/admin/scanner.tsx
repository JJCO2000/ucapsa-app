import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgramCredentialCard } from '../../components/domain/ProgramCredentialCard';
import { MemberCredentialCard } from '../../components/domain/MemberCredentialCard';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  formatDate,
  getDisplayName,
  getMembershipByQrToken,
  getMembershipStatusLabel,
  type MembershipAdminRow,
} from '../../services/memberships.service';
import {
  getProgramEnrollmentByQrToken,
  registerProgramAttendance,
} from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

type ScanMode = 'all' | 'member' | 'program';

type ScanResult =
  | { type: 'member'; raw: string; token: string; row: MembershipAdminRow }
  | { type: 'program'; raw: string; token: string; row: ProgramEnrollmentWithDetails };

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseQrValue(value: string): { type: 'member' | 'program'; token: string; programCode?: string } | null {
  const raw = value.trim();
  if (!raw) return null;

  const parts = raw.split(':').map((part) => part.trim());

  if (parts[0] === 'ucapsa-program' && parts.length >= 3) {
    return { type: 'program', programCode: parts[1], token: parts.slice(2).join(':') };
  }

  if ((parts[0] === 'ucapsa-member' || parts[0] === 'ucapsa-membership') && parts.length >= 2) {
    return { type: 'member', token: parts.slice(1).join(':') };
  }

  if (raw.startsWith('program_')) return { type: 'program', token: raw };
  if (raw.startsWith('ucapsa_')) return { type: 'member', token: raw };

  return null;
}

function modeAllows(mode: ScanMode, type: 'member' | 'program') {
  if (mode === 'all') return true;
  return mode === type;
}

export default function AdminScannerScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: ScanMode = params.mode === 'member' || params.mode === 'program' ? params.mode : 'all';
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [rawValue, setRawValue] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    if (mode === 'member') return 'Escanear socio';
    if (mode === 'program') return 'Escanear clase';
    return 'Escanear';
  }, [mode]);

  async function resolveQr(value: string) {
    if (loading) return;

    const parsed = parseQrValue(value);
    setRawValue(value);
    setError(null);
    setResult(null);

    if (!parsed) {
      setError('QR no reconocido. Escanea una credencial UCAPSA valida.');
      setIsCameraActive(false);
      return;
    }

    if (!modeAllows(mode, parsed.type)) {
      setError(mode === 'member' ? 'Este QR no es de socio.' : 'Este QR no es de Puppy o Comandos.');
      setIsCameraActive(false);
      return;
    }

    try {
      setLoading(true);
      setIsCameraActive(false);

      if (parsed.type === 'member') {
        const row = await getMembershipByQrToken(parsed.token);
        if (!row) {
          setError('No se encontro socio con este QR.');
          return;
        }
        setResult({ type: 'member', raw: value, token: parsed.token, row });
        return;
      }

      const row = await getProgramEnrollmentByQrToken(parsed.token);
      if (!row) {
        setError('No se encontro inscripcion con este QR.');
        return;
      }
      setResult({ type: 'program', raw: value, token: parsed.token, row });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el QR.');
    } finally {
      setLoading(false);
    }
  }

  function resetScanner() {
    setRawValue('');
    setResult(null);
    setError(null);
    setIsCameraActive(true);
  }

  async function registerTodayAttendance() {
    if (!result || result.type !== 'program') return;
    const row = result.row;
    const today = todayKey();

    if (row.enrollment.status !== 'active') {
      Alert.alert('No disponible', 'Esta inscripcion no esta activa.');
      return;
    }

    const alreadyToday = row.attendances.some((attendance) => attendance.attendance_date === today);
    if (alreadyToday) {
      Alert.alert('Asistencia ya registrada', 'Esta inscripcion ya tiene una asistencia registrada hoy.');
      return;
    }

    try {
      setRegistering(true);
      await registerProgramAttendance({
        enrollmentId: row.enrollment.id,
        attendanceDate: today,
        notes: 'Asistencia registrada por QR de credencial durante la transicion.',
      });
      const refreshed = await getProgramEnrollmentByQrToken(result.token);
      if (refreshed) setResult({ ...result, row: refreshed });
      Alert.alert('Asistencia registrada', 'Se actualizo el avance del programa.');
    } catch (err) {
      Alert.alert('No se pudo registrar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setRegistering(false);
    }
  }

  if (!isAdmin) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.deniedBox}>
          <MaterialIcons name="lock" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.title}>Acceso restringido</Text>
          <Text style={styles.muted}>Solo administradores pueden usar el escaner.</Text>
        </View>
      </KeyboardAwareScreen>
    );
  }

  if (!permission) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.muted}>Preparando permisos de camara...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!permission.granted) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Admin</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.subtitle}>Se necesita permiso de camara para leer QR de socios, Puppy y Comandos.</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Permitir camara</Text>
        </Pressable>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.subtitle}>Lee QR de socio o de programa y muestra la ficha correcta.</Text>
      </View>

      <View style={styles.topActionsRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/admin' as never)}>
          <Text style={styles.secondaryButtonText}>Panel admin</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={resetScanner}>
          <Text style={styles.secondaryButtonText}>Escanear otro</Text>
        </Pressable>
      </View>

      {isCameraActive ? (
        <View style={styles.cameraCard}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(event: { data: string }) => resolveQr(event.data)}
          />
          <View style={styles.scanFrame}>
            <MaterialIcons name="qr-code-scanner" size={54} color="#ffffff" />
            <Text style={styles.scanText}>Apunta al codigo QR</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Leyendo QR...</Text>
          <Text style={styles.muted}>Espera un momento.</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>QR no valido</Text>
          <Text style={styles.errorText}>{error}</Text>
          {rawValue ? <Text style={styles.rawText}>Valor: {rawValue}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={resetScanner}>
            <Text style={styles.primaryButtonText}>Intentar otra vez</Text>
          </Pressable>
        </View>
      ) : null}

      {result?.type === 'member' ? (
        <View style={styles.resultBox}>
          <Text style={styles.kickerDark}>Socio</Text>
          <Text style={styles.modalTitle}>{getDisplayName(result.row.profile)}</Text>
          <Text style={styles.muted}>Estado: {getMembershipStatusLabel(result.row.membership.status)}</Text>
          <MemberCredentialCard
            membership={result.row.membership}
            profile={result.row.profile}
            displayName={result.row.profile?.full_name?.trim() || result.row.profile?.email?.trim() || 'Socio UCAPSA'}
            expiredByDate={Boolean(result.row.membership.end_date && new Date(result.row.membership.end_date).getTime() < Date.now())}
          />
          <View style={styles.detailBox}>
            <Detail label="Numero de socio" value={result.row.membership.member_number || 'Pendiente'} />
            <Detail label="Correo" value={result.row.profile?.email || 'Sin correo'} />
            <Detail label="Telefono" value={result.row.profile?.phone || 'Sin telefono'} />
            <Detail label="Vigencia" value={formatDate(result.row.membership.end_date)} />
          </View>
          <Pressable style={styles.primaryButton} onPress={() => router.push(`/admin/customer?userId=${encodeURIComponent(result.row.membership.user_id)}` as never)}>
            <Text style={styles.primaryButtonText}>Ver cliente</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonWide} onPress={() => router.push(`/admin/members?userId=${encodeURIComponent(result.row.membership.user_id)}` as never)}>
            <Text style={styles.secondaryButtonText}>Membresia</Text>
          </Pressable>
        </View>
      ) : null}

      {result?.type === 'program' ? (
        <View style={styles.resultBox}>
          <Text style={styles.kickerDark}>Programa</Text>
          <Text style={styles.modalTitle}>{result.row.program.name}</Text>
          <Text style={styles.muted}>
            {result.row.profile?.full_name || result.row.profile?.email || 'Cliente'} - Perro: {result.row.enrollment.dog_name || result.row.profile?.dog_name || 'Sin registrar'}
          </Text>
          <ProgramCredentialCard item={result.row} compact />
          <View style={styles.detailBox}>
            <Detail label="Estado" value={result.row.enrollment.status} />
            <Detail label="Asistencias" value={`${result.row.enrollment.attendances_count}/${result.row.program.required_attendances}`} />
            <Detail label="Ultima clase" value={result.row.enrollment.last_attendance_at || 'Sin registro'} />
          </View>
          <Pressable
            disabled={registering || result.row.enrollment.status !== 'active'}
            style={[styles.primaryButton, result.row.enrollment.status !== 'active' && styles.disabledButton]}
            onPress={() => registerTodayAttendance()}
          >
            <Text style={styles.primaryButtonText}>{registering ? 'Registrando...' : 'Registrar asistencia de hoy'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonWide} onPress={() => router.push(`/admin/customer?userId=${encodeURIComponent(result.row.enrollment.user_id)}` as never)}>
            <Text style={styles.secondaryButtonText}>Ver cliente</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonWide} onPress={() => router.push(`/admin/classes?userId=${encodeURIComponent(result.row.enrollment.user_id)}` as never)}>
            <Text style={styles.secondaryButtonText}>Clases</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, padding: 22, borderRadius: 28, backgroundColor: ucapsaBrand.colors.text },
  kicker: { color: '#FFE8EC', fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  kickerDark: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 29, fontWeight: '900' },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#F0D4DA', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  topActionsRow: { flexDirection: 'row', gap: 10, marginVertical: 14 },
  cameraCard: { height: 420, overflow: 'hidden', borderRadius: 28, backgroundColor: '#000', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  camera: { flex: 1 },
  scanFrame: { position: 'absolute', left: 30, right: 30, top: 96, bottom: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ffffff', borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.18)' },
  scanText: { color: '#ffffff', fontSize: 15, fontWeight: '900', marginTop: 10 },
  infoBox: { gap: 6, padding: 16, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  infoTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  errorBox: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: '#FFF0F2', borderWidth: 1, borderColor: '#F3B8C2' },
  errorTitle: { color: ucapsaBrand.colors.redDark, fontSize: 17, fontWeight: '900' },
  errorText: { color: ucapsaBrand.colors.redDark, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  rawText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  resultBox: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  detailBox: { gap: 8, padding: 14, borderRadius: 18, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  detailRow: { gap: 3, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  primaryButton: { alignItems: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.red, marginTop: 8 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  secondaryButtonWide: { alignItems: 'center', borderRadius: 16, paddingVertical: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  disabledButton: { opacity: 0.48 },
  deniedBox: { gap: 10, alignItems: 'center', justifyContent: 'center', flex: 1 },
});



