import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getStaffClassReport, type StaffClassReportRow } from '../../services/staff-operations.service';
import { shareStaffClassReportXlsx } from '../../services/staff-report-export.service';

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentMonthRange() {
  const now = new Date();
  return {
    from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1, 12)),
    to: dateKey(now),
  };
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

export default function TrainerReportsTab() {
  const { isTrainer, isStaff, isAdmin } = useSession();
  const month = useMemo(currentMonthRange, []);
  const [fromDate, setFromDate] = useState(month.from);
  const [toDate, setToDate] = useState(month.to);
  const [rows, setRows] = useState<StaffClassReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from = fromDate, to = toDate) => {
    if (!validDate(from) || !validDate(to) || to < from) {
      setError('Usa fechas válidas AAAA-MM-DD y asegúrate de que “Hasta” no sea anterior a “Desde”.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await getStaffClassReport(from, to));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el reporte.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return undefined;
    void load(month.from, month.to);
    return undefined;
  }, [isTrainer, load, month.from, month.to]));

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    eligible: acc.eligible + row.eligibleCount,
    confirmed: acc.confirmed + row.confirmedCount,
    attendance: acc.attendance + row.attendanceCount,
  }), { eligible: 0, confirmed: 0, attendance: 0 }), [rows]);

  function useThisMonth() {
    setFromDate(month.from);
    setToDate(month.to);
    void load(month.from, month.to);
  }

  async function exportExcel() {
    if (rows.length === 0 || exporting) return;
    try {
      setExporting(true);
      await shareStaffClassReportXlsx(rows, fromDate, toDate);
    } catch (cause) {
      Alert.alert('No se pudo exportar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>OPERACIÓN</Text>
        <Text style={styles.title}>Reportes de clases</Text>
        <Text style={styles.subtitle}>Elige el mes o un rango de fechas. El archivo incluye aforo, confirmaciones y asistencia real.</Text>
      </View>

      <Pressable style={styles.monthButton} onPress={useThisMonth}>
        <MaterialIcons name="calendar-month" size={20} color={ucapsaBrand.colors.greenDark} />
        <Text style={styles.monthButtonText}>Mes actual</Text>
        <Text style={styles.monthRange}>{month.from} → {month.to}</Text>
      </Pressable>

      <View style={styles.rangeCard}>
        <View style={styles.dateField}>
          <Text style={styles.label}>Desde</Text>
          <TextInput value={fromDate} onChangeText={setFromDate} placeholder="AAAA-MM-DD" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />
        </View>
        <View style={styles.dateField}>
          <Text style={styles.label}>Hasta</Text>
          <TextInput value={toDate} onChangeText={setToDate} placeholder="AAAA-MM-DD" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />
        </View>
        <Pressable style={styles.applyButton} onPress={() => void load()}>
          <MaterialIcons name="search" size={18} color={ucapsaBrand.colors.surface} />
          <Text style={styles.applyText}>Consultar</Text>
        </Pressable>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.green} /><Text style={styles.muted}>Calculando clases reales del rango…</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!loading && !error ? (
        <>
          <View style={styles.summaryGrid}>
            <Summary value={rows.length} label="Clases / nivel" />
            <Summary value={totals.confirmed} label="Confirmaciones" />
            <Summary value={totals.attendance} label="Asistencias reales" />
          </View>

          <View style={styles.info}>
            <MaterialIcons name="info-outline" size={18} color={ucapsaBrand.colors.blueDark} />
            <Text style={styles.infoText}>Los horarios se reconstruyen según la fecha histórica. Una cancelación no se cuenta y los cambios futuros no reescriben meses anteriores.</Text>
          </View>

          <Pressable disabled={rows.length === 0 || exporting} style={[styles.exportButton, (rows.length === 0 || exporting) && styles.disabled]} onPress={() => void exportExcel()}>
            <MaterialIcons name="table-view" size={20} color={ucapsaBrand.colors.surface} />
            <Text style={styles.exportText}>{exporting ? 'Preparando Excel…' : 'Exportar Excel'}</Text>
          </Pressable>

          <Text style={styles.rowsMeta}>{rows.length} fila{rows.length === 1 ? '' : 's'} operativas en el rango.</Text>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 13 },
  kicker: { color: ucapsaBrand.colors.greenDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  monthButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 17, backgroundColor: ucapsaBrand.colors.greenSoft, paddingHorizontal: 12, marginBottom: 9 },
  monthButtonText: { color: ucapsaBrand.colors.greenDark, fontSize: 12, fontWeight: '900' },
  monthRange: { flex: 1, color: ucapsaBrand.colors.greenDark, textAlign: 'right', fontSize: 9, fontWeight: '800' },
  rangeCard: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  dateField: { flex: 1, minWidth: 130 },
  label: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900', marginBottom: 4 },
  input: { minHeight: 42, color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '800', borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 9 },
  applyButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: ucapsaBrand.colors.greenDark, paddingHorizontal: 13, alignSelf: 'flex-end' },
  applyText: { color: ucapsaBrand.colors.surface, fontSize: 10, fontWeight: '900' },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  error: { borderRadius: 16, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12, marginTop: 10 },
  errorText: { color: ucapsaBrand.colors.danger, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  summaryGrid: { flexDirection: 'row', gap: 7, marginTop: 12 },
  summary: { flex: 1, borderRadius: 15, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 10 },
  summaryValue: { color: ucapsaBrand.colors.greenDark, fontSize: 19, fontWeight: '900' },
  summaryLabel: { color: ucapsaBrand.colors.muted, fontSize: 8, lineHeight: 11, fontWeight: '800', marginTop: 2 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.blueSoft, padding: 10, marginTop: 10 },
  infoText: { flex: 1, color: ucapsaBrand.colors.blueDark, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  exportButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.greenDark, marginTop: 12 },
  exportText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  rowsMeta: { color: ucapsaBrand.colors.muted, fontSize: 9, textAlign: 'center', fontWeight: '700', marginTop: 7 },
});
