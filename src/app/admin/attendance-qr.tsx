import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Print from 'expo-print';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { buildOfficialAttendanceQrValue, getOfficialAttendanceQrCodes } from '../../services/programs.service';
import type { AttendanceQrCode, AttendanceQrProgramCode } from '../../types/app.types';

type QrSvgHandle = {
  toDataURL: (callback: (base64: string) => void) => void;
};

function labelFor(code: AttendanceQrProgramCode) {
  if (code === 'puppy') return 'Puppy';
  if (code === 'comandos') return 'Comandos';
  return 'Socios';
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

function qrHtml(items: Array<{ code: AttendanceQrProgramCode; base64: string }>) {
  const cards = items.map(({ code, base64 }) => `
    <section class="card">
      <div class="brand">UCAPSA</div>
      <h1>${labelFor(code)}</h1>
      <div class="subtitle">${code === 'member' ? 'QR oficial permanente de visitas de socios' : 'QR oficial permanente de asistencia'}</div>
      <img src="data:image/png;base64,${base64}" />
      <div class="instruction">${code === 'member' ? 'Escanea este codigo desde la app UCAPSA para registrar una visita de socio.' : 'Escanea este codigo desde la app UCAPSA para registrar asistencia.'}</div>
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
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: ${ucapsaBrand.colors.text}; }
        .card { page-break-inside: avoid; text-align: center; border: 2px solid ${ucapsaBrand.colors.red}; border-radius: 22px; padding: 28px 20px; margin: 0 auto 24px; max-width: 520px; }
        .brand { color: ${ucapsaBrand.colors.red}; font-size: 15px; font-weight: 900; letter-spacing: 2px; }
        h1 { font-size: 34px; margin: 8px 0 4px; }
        .subtitle { color: ${ucapsaBrand.colors.muted}; font-size: 15px; font-weight: 700; margin-bottom: 20px; }
        img { width: 330px; height: 330px; max-width: 86vw; object-fit: contain; }
        .instruction { margin: 18px auto 8px; max-width: 400px; font-size: 15px; line-height: 1.45; font-weight: 700; }
        .warning { color: ${ucapsaBrand.colors.danger}; font-size: 12px; font-weight: 800; }
      </style>
    </head>
    <body>${cards}</body>
  </html>`;
}

export default function AdminAttendanceQrScreen() {
  const [rows, setRows] = useState<AttendanceQrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const puppyRef = useRef<QrSvgHandle | null>(null);
  const comandosRef = useRef<QrSvgHandle | null>(null);
  const memberRef = useRef<QrSvgHandle | null>(null);

  const byCode = useMemo(() => {
    return rows.reduce<Partial<Record<AttendanceQrProgramCode, AttendanceQrCode>>>((acc, row) => {
      acc[row.program_code] = row;
      return acc;
    }, {});
  }, [rows]);

  useEffect(() => {
    void getOfficialAttendanceQrCodes()
      .then(setRows)
      .catch((err) => Alert.alert('No se pudieron cargar', err instanceof Error ? err.message : 'Intenta de nuevo.'))
      .finally(() => setLoading(false));
  }, []);

  function refFor(code: AttendanceQrProgramCode) {
    if (code === 'puppy') return puppyRef.current;
    if (code === 'comandos') return comandosRef.current;
    return memberRef.current;
  }

  async function buildPrintItem(code: AttendanceQrProgramCode) {
    const row = byCode[code];
    if (!row) throw new Error(`Falta el QR oficial de ${labelFor(code)}.`);
    const base64 = await getQrBase64(refFor(code));
    return { code, base64 };
  }

  async function printOne(code: AttendanceQrProgramCode) {
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

  async function sharePdf(code: AttendanceQrProgramCode) {
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

  async function printAll() {
    try {
      setWorking('print-all');
      const [puppy, comandos, member] = await Promise.all([buildPrintItem('puppy'), buildPrintItem('comandos'), buildPrintItem('member')]);
      await Print.printAsync({ html: qrHtml([puppy, comandos, member]) });
    } catch (err) {
      Alert.alert('No se pudieron imprimir', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin - QR</Text>
        <Text style={styles.heroTitle}>QR oficiales</Text>
        <Text style={styles.muted}>Existen tres QR oficiales permanentes: Puppy, Comandos y Socios. El QR de Socios registra visitas libres y no consume clases.</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/admin/classes' as never)}>
          <Text style={styles.secondaryButtonText}>Volver a Clases</Text>
        </Pressable>
        <Pressable disabled={loading || Boolean(working)} style={styles.primaryButton} onPress={() => void printAll()}>
          <MaterialIcons name="print" size={18} color={ucapsaBrand.colors.surface} />
          <Text style={styles.primaryButtonText}>{working === 'print-all' ? 'Preparando...' : 'Imprimir los 3'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando QR oficiales...</Text>
        </View>
      ) : null}

      {!loading && (!byCode.puppy || !byCode.comandos || !byCode.member) ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="error-outline" size={30} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.cardTitle}>Configuracion incompleta</Text>
          <Text style={styles.muted}>Supabase debe contener los QR oficiales de Puppy, Comandos y Socios. La app no inventa tokens faltantes.</Text>
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

      {byCode.member ? (
        <OfficialQrCard
          row={byCode.member}
          getRef={(ref) => { memberRef.current = ref; }}
          working={working}
          onPrint={() => void printOne('member')}
          onPdf={() => void sharePdf('member')}
        />
      ) : null}

      <View style={styles.noteCard}>
        <MaterialCommunityIcons name="shield-check-outline" size={26} color={ucapsaBrand.colors.successDark} />
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
          <MaterialCommunityIcons name={code === 'puppy' ? 'dog' : code === 'comandos' ? 'school' : 'account-group'} size={24} color={ucapsaBrand.colors.redDark} />
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

      <Text style={styles.windowText}>{code === 'member' ? 'Visitas libres: sin ventana de clase' : `Ventana habitual: ${row.window_before_minutes} min antes - ${row.window_after_minutes} min despues`}</Text>

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
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  secondaryButton: { flexGrow: 1, minWidth: 145, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16 },
  errorCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 16 },
  qrCard: { gap: 14, borderRadius: 26, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900' },
  statusPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.greenSoft, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillOff: { backgroundColor: ucapsaBrand.colors.premiumMuted },
  statusText: { color: ucapsaBrand.colors.successDark, fontSize: 11, fontWeight: '900' },
  qrWrap: { alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 10 },
  windowText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  noteCard: { flexDirection: 'row', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft, padding: 16 },
  noteTitle: { color: ucapsaBrand.colors.successDark, fontSize: 14, fontWeight: '900', marginBottom: 3 },
});
