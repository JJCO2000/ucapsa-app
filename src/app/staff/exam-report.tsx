import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { exportStaffExamReportXlsx, getStaffExamReport } from '../../services/exam-report-export.service';
import { currentMonthRange, getTrainerExamCatalog, type TrainerExamCatalogRow } from '../../services/trainer-staff.service';

export default function StaffExamReportScreen() {
  const { capabilities, isAdmin } = useSession();
  const month = currentMonthRange();
  const [startDate, setStartDate] = useState(month.startDate);
  const [endDate, setEndDate] = useState(month.endDate);
  const [exams, setExams] = useState<TrainerExamCatalogRow[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [examOptionsOpen, setExamOptionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!capabilities.canExportOperationalReports) return () => { active = false; };
    setLoading(true);
    void getTrainerExamCatalog().then((items) => {
      if (active) { setExams(items); setError(null); }
    }).catch(() => {
      if (active) setError('No se pudo consultar el catálogo de exámenes. Puedes intentar nuevamente.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [capabilities.canExportOperationalReports]));

  async function exportExcel() {
    if (exporting) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      Alert.alert('Fechas inválidas', 'Usa AAAA-MM-DD en las dos fechas.');
      return;
    }
    try {
      setExporting(true);
      const rows = await getStaffExamReport(startDate, endDate, selectedExamId);
      await exportStaffExamReportXlsx(rows, startDate, endDate);
      Alert.alert('Reporte generado', 'Se generó el Excel con datos oficiales y pendientes identificados. Las notas vacías no se transforman en cero.');
    } catch (cause) {
      Alert.alert('No se pudo exportar', cause instanceof Error ? cause.message : 'Revisa el rango e intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  }

  if (!capabilities.canExportOperationalReports) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen style={{ backgroundColor: ucapsaBrand.colors.background }}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.backText}>Regresar</Text>
        </Pressable>
        <Text style={styles.kicker}>Entrenamiento · Reportes</Text>
        <Text style={styles.title}>Exámenes en Excel</Text>
        <Text style={styles.subtitle}>
          Un reporte con estadísticas, resultados por intento y calificación de cada ejercicio.
          Solo se consideran oficiales los intentos publicados y vigentes.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Periodo</Text>
        <Text style={styles.label}>Desde · AAAA-MM-DD</Text>
        <TextInput value={startDate} onChangeText={setStartDate} style={styles.input} keyboardType="numbers-and-punctuation" placeholder="AAAA-MM-DD" />
        <Text style={styles.label}>Hasta · AAAA-MM-DD</Text>
        <TextInput value={endDate} onChangeText={setEndDate} style={styles.input} keyboardType="numbers-and-punctuation" placeholder="AAAA-MM-DD" />
        <Text style={styles.hint}>Rango máximo: 366 días. Incluye intentos del periodo seleccionado.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Examen</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: examOptionsOpen }}
          style={styles.selectTrigger}
          onPress={() => setExamOptionsOpen((value) => !value)}
        >
          <Text style={styles.optionText}>
            {exams.find((exam) => exam.examId === selectedExamId)?.examTitle ?? 'Todos los exámenes'}
          </Text>
          <MaterialIcons name={examOptionsOpen ? 'expand-less' : 'expand-more'} size={20} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        {loading ? <ActivityIndicator color={ucapsaBrand.colors.red} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {examOptionsOpen ? (
          <View>
            <Pressable style={[styles.option, !selectedExamId && styles.selected]} onPress={() => { setSelectedExamId(null); setExamOptionsOpen(false); }}>
              <Text style={[styles.optionText, !selectedExamId && styles.selectedText]}>Todos los exámenes</Text>
            </Pressable>
            {exams.map((exam) => (
              <Pressable key={exam.examId} style={[styles.option, selectedExamId === exam.examId && styles.selected]} onPress={() => { setSelectedExamId(exam.examId); setExamOptionsOpen(false); }}>
                <Text style={[styles.optionText, selectedExamId === exam.examId && styles.selectedText]}>{exam.examTitle}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={styles.hint}>Si necesitas exámenes históricos no visibles en el catálogo, usa «Todos los exámenes» y filtra por fecha en Excel.</Text>
      </View>

      <Pressable accessibilityRole="button" disabled={exporting} style={[styles.export, exporting && styles.disabled]} onPress={() => void exportExcel()}>
        <MaterialIcons name="table-view" size={20} color={ucapsaBrand.colors.surface} />
        <Text style={styles.exportText}>{exporting ? 'Generando…' : 'Exportar reporte Excel'}</Text>
      </Pressable>
      <Text style={styles.note}>Las evaluaciones sin nota quedan como «Sin registrar». No se inventan aprobaciones ni resultados.</Text>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backText: { color: ucapsaBrand.colors.redDark, fontWeight: '800', fontSize: 13 },
  kicker: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 10, letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 26, marginTop: 3 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  card: { backgroundColor: ucapsaBrand.colors.surface, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginBottom: 12 },
  section: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 17, marginBottom: 8 },
  label: { color: ucapsaBrand.colors.text, fontWeight: '800', fontSize: 12, marginTop: 9, marginBottom: 5 },
  input: { color: ucapsaBrand.colors.text, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 11, paddingHorizontal: 12, minHeight: 46, backgroundColor: ucapsaBrand.colors.surface, fontWeight: '700' },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 9 },
  selectTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 6 },
  option: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 7 },
  optionText: { color: ucapsaBrand.colors.text, fontWeight: '700', fontSize: 12 },
  selected: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  selectedText: { color: ucapsaBrand.colors.surface },
  error: { color: ucapsaBrand.colors.danger, fontWeight: '700', fontSize: 11 },
  export: { backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  exportText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 13 },
  disabled: { opacity: 0.6 },
  note: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 11 },
});
