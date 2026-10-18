import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  exportStaffExamReportXlsx,
  getStaffExamReport,
  type StaffExamReportRow,
} from '../../services/exam-report-export.service';
import { getTrainerExamCatalog, type TrainerExamCatalogRow } from '../../services/trainer-staff.service';

export default function StaffExamReportScreen() {
  const { capabilities, isAdmin } = useSession();
  const [exams, setExams] = useState<TrainerExamCatalogRow[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [examOptionsOpen, setExamOptionsOpen] = useState(false);
  const [rows, setRows] = useState<StaffExamReportRow[]>([]);
  const [selectedDogIds, setSelectedDogIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    if (!capabilities.canExportOperationalReports) return () => { mounted = false; };
    setLoading(true);
    void getTrainerExamCatalog().then((value) => {
      if (!mounted) return;
      setExams(value);
      setError(null);
    }).catch(() => {
      if (mounted) setError('No se pudo consultar el catálogo. Reintenta más tarde.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [capabilities.canExportOperationalReports]));

  useEffect(() => {
    let mounted = true;
    setRows([]);
    setSelectedDogIds([]);
    setResultsError(null);
    if (!selectedExamId || !capabilities.canExportOperationalReports) {
      setLoadingResults(false);
      return () => { mounted = false; };
    }
    setLoadingResults(true);
    void getStaffExamReport(selectedExamId).then((value) => {
      if (!mounted) return;
      const official = value.filter((r) => r.isOfficial &&
        r.status === 'published' && r.voidedAt === null);
      setRows(official);
      setSelectedDogIds([...new Set(official.map((r) => r.dogId))]);
    }).catch(() => {
      if (mounted) setResultsError('No fue posible consultar los resultados oficiales.');
    }).finally(() => { if (mounted) setLoadingResults(false); });
    return () => { mounted = false; };
  }, [capabilities.canExportOperationalReports, selectedExamId]);

  const dogs = useMemo(() => {
    const all = new Map<string, { id: string; name: string; client: string }>();
    for (const row of rows) {
      if (!all.has(row.dogId)) {
        all.set(row.dogId, { id: row.dogId, name: row.dogName, client: row.clientName });
      }
    }
    const items = [...all.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'es-MX') || a.client.localeCompare(b.client, 'es-MX'));
    const duplicates = new Map<string, number>();
    for (const item of items) {
      const key = item.name.trim().toLocaleLowerCase('es-MX');
      duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
    }
    return items.map((item) => ({
      ...item,
      label: (duplicates.get(item.name.trim().toLocaleLowerCase('es-MX')) ?? 0) > 1
        ? item.name + ' · ' + item.client + ' · ' + item.id.slice(-4)
        : item.name,
    }));
  }, [rows]);

  async function exportExcel() {
    if (exporting || loadingResults) return;
    const exam = exams.find((candidate) => candidate.examId === selectedExamId);
    if (!exam || selectedDogIds.length === 0) {
      Alert.alert('Selecciona resultados', 'Elige un examen y al menos un perro con evaluación oficial.');
      return;
    }
    try {
      setExporting(true);
      await exportStaffExamReportXlsx(rows, exam.examCode, selectedDogIds);
      Alert.alert('Comparativo generado', 'El Excel contiene ejercicios, perros seleccionados y su promedio. Si falta una nota, indica Incompleto.');
    } catch (cause) {
      Alert.alert('No se pudo exportar', cause instanceof Error ? cause.message : 'Revisa la selección e intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  }

  if (!capabilities.canExportOperationalReports) {
    return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;
  }

  return (
    <KeyboardAwareScreen style={{ backgroundColor: ucapsaBrand.colors.background }}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.backText}>Regresar</Text>
        </Pressable>
        <Text style={styles.kicker}>Entrenamiento · Exámenes</Text>
        <Text style={styles.title}>Comparar resultados</Text>
        <Text style={styles.subtitle}>Elige un examen, selecciona los perros y descarga un solo Excel cruzado. Se utiliza el último intento oficial de cada perro.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Examen</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: examOptionsOpen }}
          style={styles.selectTrigger}
          onPress={() => setExamOptionsOpen((previous) => !previous)}
        >
          <Text style={styles.optionText}>
            {exams.find((exam) => exam.examId === selectedExamId)?.examTitle ?? 'Seleccionar examen'}
          </Text>
          <MaterialIcons name={examOptionsOpen ? 'expand-less' : 'expand-more'} size={20} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        {loading ? <ActivityIndicator color={ucapsaBrand.colors.red} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {examOptionsOpen ? (
          <View>
            {exams.map((exam) => (
              <Pressable
                key={exam.examId}
                style={[styles.option, selectedExamId === exam.examId && styles.selected]}
                onPress={() => { setSelectedExamId(exam.examId); setExamOptionsOpen(false); }}
              >
                <Text style={[styles.optionText, selectedExamId === exam.examId && styles.selectedText]}>
                  {exam.examTitle}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {selectedExamId ? (
        <View style={styles.card}>
          <View style={styles.sectionHeading}>
            <Text style={styles.section}>Perros ({selectedDogIds.length}/{dogs.length})</Text>
            {dogs.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelectedDogIds(
                  selectedDogIds.length === dogs.length ? [] : dogs.map((dog) => dog.id))}
              >
                <Text style={styles.toggleAll}>
                  {selectedDogIds.length === dogs.length ? 'Quitar todos' : 'Seleccionar todos'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {loadingResults ? <ActivityIndicator color={ucapsaBrand.colors.red} /> : null}
          {resultsError ? <Text style={styles.error}>{resultsError}</Text> : null}
          {!loadingResults && !resultsError && dogs.length === 0 ? (
            <Text style={styles.hint}>Todavía no hay resultados oficiales para este examen.</Text>
          ) : null}
          {dogs.map((dog) => {
            const checked = selectedDogIds.includes(dog.id);
            return (
              <Pressable
                key={dog.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                style={styles.dogRow}
                onPress={() => setSelectedDogIds((ids) =>
                  checked ? ids.filter((id) => id !== dog.id) : [...ids, dog.id])}
              >
                <MaterialIcons
                  name={checked ? 'check-box' : 'check-box-outline-blank'}
                  size={23}
                  color={checked ? ucapsaBrand.colors.greenDark : ucapsaBrand.colors.muted}
                />
                <Text style={styles.dogName}>{dog.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={exporting || loadingResults || selectedDogIds.length === 0}
        style={[styles.export, (exporting || loadingResults || selectedDogIds.length === 0) && styles.disabled]}
        onPress={() => void exportExcel()}
      >
        <MaterialIcons name="table-view" size={20} color={ucapsaBrand.colors.surface} />
        <Text style={styles.exportText}>{exporting ? 'Generando…' : 'Exportar Excel'}</Text>
      </Pressable>
      <Text style={styles.note}>Un examen por archivo. Si varios ejercicios tienen distinta puntuación máxima, el promedio se calcula sobre el total posible, sin transformar datos faltantes en ceros.</Text>
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
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  section: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 17, marginBottom: 8 },
  selectTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 6 },
  option: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 7 },
  optionText: { color: ucapsaBrand.colors.text, fontWeight: '700', fontSize: 12 },
  selected: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  selectedText: { color: ucapsaBrand.colors.surface },
  error: { color: ucapsaBrand.colors.danger, fontWeight: '700', fontSize: 11 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18 },
  toggleAll: { color: ucapsaBrand.colors.blueDark, fontWeight: '800', fontSize: 12 },
  dogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  dogName: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700' },
  export: { backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  exportText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 13 },
  disabled: { opacity: 0.6 },
  note: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 11 },
});
