import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { buildOfficialAttendanceQrValue, getOfficialAttendanceQrCodes } from '../../services/programs.service';
import type { AttendanceQrCode, ProgramCode } from '../../types/app.types';

type QrSvgHandle = {
  toDataURL: (callback: (base64: string) => void) => void;
};

function labelFor(code: ProgramCode) {
  return code === 'puppy' ? 'Puppy' : 'Comandos';
}

function getQrBase64(ref: QrSvgHandle | null) {
  return new Promise<string>((resolve, reject) => {
    if (!ref?.toDataURL) {
      reject(new Error('El QR todavia no esta listo. Intenta de nuevo.'));
      return;
    }
    ref.toDataURL((data) => resolve(data.replace(/\s+/g, '')));
  });
}

function qrHtml(items: Array<{ code: ProgramCode; base64: string }>) {
  const cards = items.map(({ code, base64 }) => `
    <section class="card">
      <div class="brand">UCAPSA</div>
      <h1>${labelFor(code)}</h1>
      <div class="subtitle">QR oficial permanente de asistencia</div>
      <img src="data:image/png;base64,${base64}" />
      <div class="instruction">Escanea este codigo desde la app UCAPSA para registrar asistencia.</div>
      <div class="warning">Reimprimir este documento NO crea un QR nuevo.</div>
    </section>
  `).join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { margin: 18px; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #18181b; }
        .card { page-break-inside: avoid; text-align: center; border: 2px solid #C91F37; border-radius: 22px; padding: 28px 20px; margin: 0 auto 24px; max-width: 520px; }
        .brand { color: #C91F37; font-size: 15px; font-weight: 900; letter-spacing: 2px; }
        h1 { font-size: 34px; margin: 8px 0 4px; }
        .subtitle { color: #52525b; font-size: 15px; font-weight: 700; margin-bottom: 20px; }
        img { width: 330px; height: 330px; max-width: 86vw; object-fit: contain; }
        .instruction { margin: 18px auto 8px; max-width: 400px; font-size: 15px; line-height: 1.45; font-weight: 700; }
        .warning { color: #7f1d1d; font-size: 12px; font-weight: 800; }
      </style>
    </head>
    <body>${cards}</body>
  </html>`;
}

export default function AdminAttendanceQrScreen() {
  const { isAdmin } = useSession();
  const [rows, setRows] = useState<AttendanceQrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const puppyRef = useRef<QrSvgHandle | null>(null);
  const comandosRef = useRef<QrSvgHandle | null>(null);

  const byCode = useMemo(() => {
    return rows.reduce<Partial<Record<ProgramCode, AttendanceQrCode>>>((acc, row) => {
      acc[row.program_code] = row;
      return acc;
    }, {});
  }, [rows]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    void getOfficialAttendanceQrCodes()
      .then(setRows)
      .catch((err) => Alert.alert('No se pudieron cargar', err instanceof Error ? err.message : 'Intenta de nuevo.'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  function refFor(code: ProgramCode) {
    return code === 'puppy' ? puppyRef.current : comandosRef.current;
  }

  async function buildPrintItem(code: ProgramCode) {
    const row = byCode[code];
    if (!row) throw new Error(`Falta el QR oficial de ${labelFor(code)}.`);
    const base64 = await getQrBase64(refFor(code));
    return { code, base64 };
  }

  async function printOne(code: ProgramCode) {
    try {
      setWorking(`print-${code}`);
      const item = await buildPrintItem(code);
      await Print.printAsync({ html: qrHtml([item]) });
    } catch (err) {
      Alert.alert('No se pudo imprimir', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setWorking(null);
    }
  }

  async function sharePdf(code: ProgramCode) {
    try {
      setWorking(`pdf-${code}`);
      const item = await buildPrintItem(code);
      const file = await Print.printToFileAsync({ html: qrHtml([item]) });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('PDF creado', 'El dispositivo no permite compartir archivos desde esta pantalla. Puedes usar Imprimir / reimprimir.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `QR oficial ${labelFor(code)} - UCAPSA`,
        UTI: 'com.adobe.pdf',
      });
    } catch (err) {
      Alert.alert('No se pudo crear el PDF', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setWorking(null);
    }
  }

  async function printBoth() {
    try {
      setWorking('print-both');
      const [puppy, comandos] = await Promise.all([buildPrintItem('puppy'), buildPrintItem('comandos')]);
      await Print.printAsync({ html: qrHtml([puppy, comandos]) });
    } catch (err) {
      Alert.alert('No se pudieron imprimir', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setWorking(null);
    }
  }

  if (!isAdmin) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.deniedBox}>
          <MaterialIcons name="lock" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.title}>Acceso restringido</Text>
          <Text style={styles.muted}>Solo administradores pueden consultar los QR de asistencia.</Text>
        </View>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin - Clases</Text>
        <Text style={styles.heroTitle}>QR de asistencia</Text>
        <Text style={styles.muted}>Existen exactamente dos QR logicos: Puppy y Comandos. Puedes imprimir todas las copias fisicas que necesites sin generar codigos nuevos.</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/admin/classes' as never)}>
          <Text style={styles.secondaryButtonText}>Volver a Clases</Text>
        </Pressable>
        <Pressable disabled={loading || Boolean(working)} style={styles.primaryButton} onPress={() => void printBoth()}>
          <MaterialIcons name="print" size={18} color="#ffffff" />
          <Text style={styles.primaryButtonText}>{working === 'print-both' ? 'Preparando...' : 'Imprimir ambos'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando QR de asistencia...</Text>
        </View>
      ) : null}

      {!loading && (!byCode.puppy || !byCode.comandos) ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="error-outline" size={30} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.cardTitle}>Configuracion incompleta</Text>
          <Text style={styles.muted}>Supabase debe contener un QR Puppy y un QR Comandos. No generaremos otro automaticamente desde la app.</Text>
        </View>
      ) : null}

      {byCode.puppy ? (
        <OfficialQrCard
          row={byCode.puppy}
          getRef={(ref) => { puppyRef.current = ref; }}
          working={working}
          onPrint={() => void printOne('puppy')}
          onPdf={() => void sharePdf('puppy')}
        />
      ) : null}

      {byCode.comandos ? (
        <OfficialQrCard
          row={byCode.comandos}
          getRef={(ref) => { comandosRef.current = ref; }}
          working={working}
          onPrint={() => void printOne('comandos')}
          onPdf={() => void sharePdf('comandos')}
        />
      ) : null}

      <View style={styles.noteCard}>
        <MaterialCommunityIcons name="shield-check-outline" size={26} color="#166534" />
        <View style={{ flex: 1 }}>
          <Text style={styles.noteTitle}>Reimprimir no reemplaza el codigo</Text>
          <Text style={styles.muted}>No hay boton normal para regenerar tokens. Las copias fisicas siguen apuntando al mismo QR oficial.</Text>
        </View>
      </View>
    </KeyboardAwareScreen>
  );
}

function OfficialQrCard({
  row,
  getRef,
  working,
  onPrint,
  onPdf,
}: {
  row: AttendanceQrCode;
  getRef: (ref: QrSvgHandle | null) => void;
  working: string | null;
  onPrint: () => void;
  onPdf: () => void;
}) {
  const code = row.program_code;
  const value = buildOfficialAttendanceQrValue(code, row.token);
  const isBusy = Boolean(working);

  return (
    <View style={styles.qrCard}>
      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name={code === 'puppy' ? 'dog' : 'school'} size={24} color={ucapsaBrand.colors.redDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{labelFor(code)}</Text>
          <Text style={styles.muted}>QR oficial - version {row.version}</Text>
        </View>
        <View style={[styles.statusPill, !row.is_active && styles.statusPillOff]}>
          <Text style={styles.statusText}>{row.is_active ? 'Activo' : 'Inactivo'}</Text>
        </View>
      </View>

      <View style={styles.qrWrap}>
        <QRCode
          value={value}
          size={220}
          quietZone={12}
          ecl="H"
          getRef={(ref) => getRef((ref as unknown as QrSvgHandle) ?? null)}
        />
      </View>

      <Text style={styles.windowText}>Ventana: {row.window_before_minutes} min antes - {row.window_after_minutes} min despues</Text>

      <View style={styles.actionRow}>
        <Pressable disabled={isBusy} style={styles.secondaryButton} onPress={onPrint}>
          <MaterialIcons name="print" size={18} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.secondaryButtonText}>{working === `print-${code}` ? 'Preparando...' : 'Imprimir / reimprimir'}</Text>
        </Pressable>
        <Pressable disabled={isBusy} style={styles.secondaryButton} onPress={onPdf}>
          <MaterialIcons name="picture-as-pdf" size={18} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.secondaryButtonText}>{working === `pdf-${code}` ? 'Creando...' : 'PDF / compartir'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  title: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  deniedBox: { minHeight: 520, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryButton: { flexGrow: 1, minWidth: 145, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 14, paddingVertical: 13 },
  primaryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  secondaryButton: { flexGrow: 1, minWidth: 145, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#ffffff', padding: 16 },
  errorCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 16 },
  qrCard: { gap: 14, borderRadius: 26, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#ffffff', padding: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFF1F2' },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900' },
  statusPill: { borderRadius: 999, backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 6 },
  statusPillOff: { backgroundColor: '#FEE2E2' },
  statusText: { color: '#166534', fontSize: 11, fontWeight: '900' },
  qrWrap: { alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#ffffff', paddingVertical: 10 },
  windowText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  noteCard: { flexDirection: 'row', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', padding: 16 },
  noteTitle: { color: '#166534', fontSize: 14, fontWeight: '900', marginBottom: 3 },
});
