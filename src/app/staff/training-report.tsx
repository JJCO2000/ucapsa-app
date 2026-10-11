import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { buildTrainingReportStats, exportTrainingReportXlsx } from '../../services/training-report-export.service';
import {
  currentMonthRange,
  getStaffTrainingReport,
  localDateKey,
  type StaffTrainingReportRow,
} from '../../services/trainer-staff.service';

type DateTarget = 'start' | 'end';

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function StaffTrainingReportScreen() {
  const { isAdmin, capabilities } = useSession();
  const month = useMemo(() => currentMonthRange(), []);
  const [startDate, setStartDate] = useState(month.startDate);
  const [endDate, setEndDate] = useState(month.endDate);
  const [calendarTarget, setCalendarTarget] = useState<DateTarget | null>(null);
  const [rows, setRows] = useState<StaffTrainingReportRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  if (!capabilities.canUseTrainingWorkspace) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  async function loadRows() {
    if (endDate < startDate) {
      Alert.alert('Rango inválido', 'La fecha final debe ser igual o posterior a la inicial.');
      return null;
    }
    try {
      setGenerating(true);
      const next = await getStaffTrainingReport(startDate, endDate);
      setRows(next);
      setPreviewed(true);
      return next;
    } catch (cause) {
      Alert.alert('No se pudo generar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
      return null;
    } finally {
      setGenerating(false);
    }
  }

  async function exportExcel() {
    const next = await loadRows();
    if (!next) return;
    try {
      setGenerating(true);
      await exportTrainingReportXlsx(next, startDate, endDate);
    } catch (cause) {
      Alert.alert('No se pudo exportar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setGenerating(false);
    }
  }

  function setCurrentMonth() {
    const next = currentMonthRange();
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setRows([]);
    setPreviewed(false);
  }

  function setLast30Days() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29, 12, 0, 0, 0);
    setStartDate(localDateKey(start));
    setEndDate(localDateKey(today));
    setRows([]);
    setPreviewed(false);
  }

  const stats = useMemo(() => buildTrainingReportStats(rows), [rows]);

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>UCAPSA Staff</Text>
          <Text style={styles.title}>Reporte de clases</Text>
          <Text style={styles.subtitle}>Exporta datos duros: asistencia, RSVP, clientes, perros y desglose por programa.</Text>
        </View>
      </View>

      <View style={styles.presets}>
        <Pressable style={styles.presetButton} onPress={setCurrentMonth}>
          <MaterialIcons name="calendar-month" size={18} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.presetText}>Este mes</Text>
        </Pressable>
        <Pressable style={styles.presetButton} onPress={setLast30Days}>
          <MaterialIcons name="date-range" size={18} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.presetText}>Últimos 30 días</Text>
        </Pressable>
      </View>

      <View style={styles.rangeCard}>
        <Pressable style={styles.dateField} onPress={() => setCalendarTarget(calendarTarget === 'start' ? null : 'start')}>
          <Text style={styles.dateFieldLabel}>Desde</Text>
          <Text style={styles.dateFieldValue}>{dateLabel(startDate)}</Text>
        </Pressable>
        <MaterialIcons name="arrow-forward" size={18} color={ucapsaBrand.colors.muted} />
        <Pressable style={styles.dateField} onPress={() => setCalendarTarget(calendarTarget === 'end' ? null : 'end')}>
          <Text style={styles.dateFieldLabel}>Hasta</Text>
          <Text style={styles.dateFieldValue}>{dateLabel(endDate)}</Text>
        </Pressable>
      </View>

      {calendarTarget ? (
        <View style={styles.calendarWrap}>
          <Calendar
            current={calendarTarget === 'start' ? startDate : endDate}
            maxDate={localDateKey()}
            markedDates={{
              [startDate]: { selected: true, selectedColor: ucapsaBrand.colors.red },
              [endDate]: { selected: true, selectedColor: ucapsaBrand.colors.purple },
            }}
            onDayPress={(day) => {
              if (calendarTarget === 'start') {
                setStartDate(day.dateString);
                if (day.dateString > endDate) setEndDate(day.dateString);
              } else {
                setEndDate(day.dateString);
                if (day.dateString < startDate) setStartDate(day.dateString);
              }
              setCalendarTarget(null);
              setRows([]);
              setPreviewed(false);
            }}
            theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable disabled={generating} style={[styles.previewButton, generating && styles.disabled]} onPress={() => void loadRows()}>
          {generating ? <ActivityIndicator color={ucapsaBrand.colors.redDark} /> : <MaterialIcons name="visibility" size={19} color={ucapsaBrand.colors.redDark} />}
          <Text style={styles.previewText}>Vista previa</Text>
        </Pressable>
        <Pressable disabled={generating} style={[styles.exportButton, generating && styles.disabled]} onPress={() => void exportExcel()}>
          <MaterialIcons name="table-view" size={19} color={ucapsaBrand.colors.surface} />
          <Text style={styles.exportText}>Exportar estadísticas</Text>
        </Pressable>
      </View>

      {previewed ? (
        <View style={styles.summaryGrid}>
          <Summary value={stats.uniqueClients} label="Clientes únicos" />
          <Summary value={stats.uniqueDogs} label="Perros únicos" />
          <Summary value={stats.classOccurrences} label="Clases con inscritos" />
          <Summary value={stats.attended} label="Asistieron" />
          <Summary value={stats.absent} label="No asistieron" />
          <Summary value={stats.unmarked} label="Sin registrar" />
          <Summary value={`${(stats.attendanceRate * 100).toFixed(1)}%`} label="Tasa de asistencia" />
          <Summary value={`${(stats.markCoverageRate * 100).toFixed(1)}%`} label="Cobertura del registro" />
        </View>
      ) : null}

      {previewed && rows.length > 0 ? (
        <View style={styles.previewList}>
          {rows.slice(0, 12).map((row, index) => (
            <View key={`${row.enrollmentId}:${row.classDate}:${index}`} style={styles.previewRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTitle}>{row.dogName} · {row.programName}</Text>
                <Text style={styles.previewMeta}>{row.classDate} · {row.startTime} · {row.clientName}</Text>
              </View>
              <Text style={[
                styles.previewStatus,
                row.attended && styles.previewStatusDone,
                row.absent && styles.previewStatusAbsent,
              ]}>{row.attended ? 'Asistió' : row.absent ? 'No asistió' : 'Sin registrar'}</Text>
            </View>
          ))}
          {rows.length > 12 ? <Text style={styles.moreText}>+ {rows.length - 12} filas adicionales en el Excel</Text> : null}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Summary({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  presetButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  presetText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  rangeCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 10, marginBottom: 10 },
  dateField: { flex: 1, minHeight: 56, justifyContent: 'center', borderRadius: 13, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 10 },
  dateFieldLabel: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '900', textTransform: 'uppercase' },
  dateFieldValue: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 2 },
  calendarWrap: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  previewButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  previewText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  exportButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red },
  exportText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  summaryCard: { width: '31%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  summaryValue: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  summaryLabel: { color: ucapsaBrand.colors.muted, fontSize: 8, lineHeight: 11, fontWeight: '800', marginTop: 2 },
  previewList: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  previewRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.borderNeutral },
  previewTitle: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  previewMeta: { color: ucapsaBrand.colors.muted, fontSize: 8, lineHeight: 12, fontWeight: '700', marginTop: 2 },
  previewStatus: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '900' },
  previewStatusDone: { color: ucapsaBrand.colors.greenDark },
  previewStatusAbsent: { color: ucapsaBrand.colors.danger },
  moreText: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '800', padding: 10, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
