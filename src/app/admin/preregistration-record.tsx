import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { preregistrationDirectoryEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import { getAdminPreregisteredDirectory, updateAdminPreregisteredHistory,
  type AdminPreregistrationRow } from '../../services/preregistration-directory.service';

type Level = AdminPreregistrationRow['programLevel'];
const levels: { level: Level; label: string }[] = [
  { level: 'principiante', label: 'Básico' },
  { level: 'medio', label: 'Intermedio' },
  { level: 'avanzado', label: 'Avanzado' },
];
function description(row: AdminPreregistrationRow) {
  if (row.programCode === 'puppy') return 'Puppy · 4 clases habituales';
  return 'Comandos · 6 clases para evaluación';
}
export default function AdminPreregistrationRecordScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ intakeProgramId?: string }>();
  const id = typeof params.intakeProgramId === 'string' ? params.intakeProgramId : '';
  const [record, setRecord] = useState<AdminPreregistrationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('base');
  const [cardNumber, setCardNumber] = useState('');
  const [cardStart, setCardStart] = useState('');
  const [historicalTotal, setHistoricalTotal] = useState('0');
  const [knownDates, setKnownDates] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const rows = await getAdminPreregisteredDirectory();
    const row = rows.find((item) => item.programId === id) ?? null;
    setRecord(row);
    if (row) {
      setLevel(row.programLevel);
      setCardNumber(row.physicalCardNumber ?? '');
      setCardStart(row.cardStartedOn ?? '');
      setHistoricalTotal(String(row.historicalAttendances));
      setKnownDates(row.knownDates.join('\n'));
      setNote(row.sourceNote ?? '');
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin || !preregistrationDirectoryEnabled || !id) return;
    let active = true;
    setLoading(true);
    setError(null);
    void load().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo abrir la ficha.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, isAdmin, load]));

  async function save() {
    if (!record || saving) return;
    try {
      const count = Number(historicalTotal);
      if (!Number.isSafeInteger(count) || count < 0 || count > 500) {
        throw new Error('El total histórico debe ser un número entre 0 y 500.');
      }
      const dates = knownDates.split(/[\n,;]+/).map((date) => date.trim()).filter(Boolean);
      if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))
        || new Set(dates).size !== dates.length || dates.length > count) {
        throw new Error('Revisa las fechas: deben ser únicas y no superar el total.');
      }
      if (cardStart && !/^\d{4}-\d{2}-\d{2}$/.test(cardStart.trim())) {
        throw new Error('Usa AAAA-MM-DD para el inicio de tarjeta Puppy.');
      }
      setSaving(true);
      await updateAdminPreregisteredHistory({
        dogId: record.dogId,
        programCode: record.programCode,
        level: record.programCode === 'puppy' ? 'base' : level,
        physicalCardNumber: record.programCode === 'puppy' ? cardNumber.trim() || null : null,
        cardStartedOn: record.programCode === 'puppy' ? cardStart.trim() || null : null,
        totalHistoricalAttendances: count,
        knownDates: dates,
        sourceNote: note.trim() || null,
      });
      await load();
      setEditing(false);
      Alert.alert('Historial actualizado', 'Se conserva por separado la asistencia registrada por Entrenador.');
    } catch (cause) {
      Alert.alert('No se pudo actualizar', cause instanceof Error ? cause.message : 'Revisa el expediente.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin || !preregistrationDirectoryEnabled) return <Redirect href="/home" />;
  return (
    <KeyboardAwareScreen style={{ backgroundColor: ucapsaBrand.colors.background }}>
      <Pressable style={styles.back} accessibilityRole="button" onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={19} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backText}>Preinscripciones</Text>
      </Pressable>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /></View> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && !record ? <Text style={styles.error}>Expediente no disponible o ya vinculado a una cuenta.</Text> : null}
      {record ? (
        <>
          <Text style={styles.kicker}>Administración · Expediente provisional</Text>
          <Text style={styles.title}>{record.dogName}</Text>
          <Text style={styles.subtitle}>{description(record)}</Text>
          <View style={styles.card}>
            <Line label="Tutor" value={record.ownerName} />
            <Line label="Correo" value={record.email || 'No registrado'} />
            <Line label="Teléfono" value={record.phone || 'No registrado'} />
            <Line label="Cuenta" value="Pendiente de vincular" />
            <Line label="Membresía" value="Se gestiona desde la cuenta oficial" />
            <Line label="Programa" value={record.programCode === 'puppy' ? 'Puppy' : 'Comandos'} />
            {record.programCode === 'comandos' ? (
              <Line label="Nivel" value={levels.find((x) => x.level === record.programLevel)?.label ?? 'Básico'} />
            ) : (
              <Line label="Referencia física Puppy" value={record.physicalCardNumber || 'No registrada'} />
            )}
            <Line label="Asistencias históricas" value={String(record.historicalAttendances)} />
            <Line label="Asistencias del entrenador" value={String(record.staffAttendances)} />
            <Line label="Total reconocido" value={String(record.historicalAttendances + record.staffAttendances)} />
          </View>
          {!editing ? (
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.primary}>
              <Text style={styles.primaryText}>Editar nivel e historial</Text>
            </Pressable>
          ) : (
            <View style={styles.card}>
              <Text style={styles.hint}>El programa y la identidad del tutor se mantienen. Las asistencias reales del entrenador no se pueden editar desde aquí.</Text>
              {record.programCode === 'comandos' ? (
                <View style={styles.levels}>
                  {levels.map((item) => (
                    <Pressable key={item.level} accessibilityRole="button"
                      style={[styles.choice, level === item.level && styles.selected]}
                      onPress={() => setLevel(item.level)}>
                      <Text style={[styles.choiceText, level === item.level && styles.selectedText]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  <Field label="Referencia física Puppy (si se conoce)" value={cardNumber} onChangeText={setCardNumber} />
                  <Field label="Inicio físico conocido (AAAA-MM-DD)" value={cardStart} onChangeText={setCardStart} />
                </>
              )}
              <Field label="Asistencias históricas reconocidas" value={historicalTotal} onChangeText={setHistoricalTotal} />
              <Field label="Fechas conocidas (una por línea)" value={knownDates} onChangeText={setKnownDates} multiline />
              <Field label="Origen del histórico" value={note} onChangeText={setNote} multiline />
              <Text style={styles.hint}>Las {record.staffAttendances} asistencias del entrenador se suman aparte y se conservan.</Text>
              <Pressable accessibilityRole="button" disabled={saving} style={[styles.primary, saving && styles.disabled]}
                onPress={() => void save()}>
                <Text style={styles.primaryText}>{saving ? 'Guardando…' : 'Guardar correcciones'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving}
                onPress={() => { setEditing(false); void load(); }} style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancelar</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return <View style={styles.line}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}
function Field({ label, value, onChangeText, multiline }: {
  label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean;
}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <TextInput style={[styles.input, multiline && styles.multiline]} value={value}
      onChangeText={onChangeText} multiline={multiline} autoCapitalize="none" /></View>;
}
const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  backText: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  kicker: { fontSize: 11, fontWeight: '900', color: ucapsaBrand.colors.redDark },
  title: { fontSize: 26, fontWeight: '900', color: ucapsaBrand.colors.text, marginTop: 5 },
  subtitle: { fontSize: 13, color: ucapsaBrand.colors.muted, marginBottom: 13, marginTop: 5 },
  card: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 13, gap: 9 },
  line: { gap: 2, paddingVertical: 3 },
  label: { fontSize: 11, fontWeight: '900', color: ucapsaBrand.colors.muted },
  value: { fontSize: 14, fontWeight: '700', color: ucapsaBrand.colors.text },
  primary: { borderRadius: 12, padding: 15, backgroundColor: ucapsaBrand.colors.greenDark, alignItems: 'center', marginTop: 7 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  secondary: { borderRadius: 12, padding: 13, alignItems: 'center' },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  field: { gap: 6 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 10, color: ucapsaBrand.colors.text },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 10, borderRadius: 10 },
  selected: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  choiceText: { color: ucapsaBrand.colors.text, fontWeight: '800' },
  selectedText: { color: ucapsaBrand.colors.surface },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: ucapsaBrand.colors.danger, marginTop: 15 },
  loading: { marginTop: 32, alignItems: 'center' },
  disabled: { opacity: 0.6 },
});
