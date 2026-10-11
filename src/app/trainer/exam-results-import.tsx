import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getStaffExamItems,
  getStaffPublishedExams,
  importStaffExamResults,
  type StaffExam,
  type StaffExamImportResult,
  type StaffExamItem,
} from '../../services/staff-operations.service';
import { pickAndParseUcapsaExamXlsx } from '../../services/ucapsa-exam-xlsx';

export default function TrainerExamResultsImportScreen() {
  const { examId } = useLocalSearchParams<{ examId?: string }>();
  const { isStaff, isAdmin } = useSession();
  const id = typeof examId === 'string' ? examId : '';
  const [exam, setExam] = useState<StaffExam | null>(null);
  const [items, setItems] = useState<StaffExamItem[]>([]);
  const [result, setResult] = useState<StaffExamImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError('Falta el examen.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [exams, examItems] = await Promise.all([
        getStaffPublishedExams(),
        getStaffExamItems(id),
      ]);
      setExam(exams.find((item) => item.examId === id) ?? null);
      setItems(examItems);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo preparar la importación.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return undefined;
    setLoading(true);
    void load();
    return undefined;
  }, [isStaff, load]));

  const descriptors = useMemo(() => items.map((item) => ({
    item_number: item.itemNumber,
    title: item.title,
    max_points: item.maxPoints,
  })), [items]);

  async function importFile() {
    if (!exam || items.length === 0 || working) return;

    try {
      setWorking(true);
      setResult(null);
      const picked = await pickAndParseUcapsaExamXlsx(descriptors);
      if (!picked) return;
      setFileName(picked.fileName);

      const importResult = await importStaffExamResults({
        examId: exam.examId,
        fileName: picked.fileName,
        rows: picked.rows,
      });
      setResult(importResult);

      if (importResult.status === 'reviewed') {
        Alert.alert(
          'Calificaciones cargadas',
          `${importResult.rowsValid} evaluaciones quedaron revisadas y listas para publicación administrativa.`,
          [{ text: 'OK' }],
        );
      }
    } catch (cause) {
      Alert.alert('No se pudo importar', cause instanceof Error ? cause.message : 'Revisa el archivo .xlsx.');
    } finally {
      setWorking(false);
    }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ucapsaBrand.colors.green} />
          <Text style={styles.muted}>Preparando importación…</Text>
        </View>
      ) : null}

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!loading && !error && exam ? (
        <>
          <View style={styles.header}>
            <Text style={styles.kicker}>{exam.examCode}</Text>
            <Text style={styles.title}>Subir calificaciones</Text>
            <Text style={styles.subtitle}>{exam.examTitle}</Text>
          </View>

          <View style={styles.infoCard}>
            <MaterialIcons name="table-view" size={21} color={ucapsaBrand.colors.purpleDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Formato del Excel</Text>
              <Text style={styles.infoText}>Fila 1: Identificador · Perro · una columna por ejercicio. Los máximos vienen del examen y no se aceptan valores fuera de rango.</Text>
            </View>
          </View>

          <View style={styles.itemsCard}>
            <Text style={styles.sectionTitle}>{items.length} ejercicios</Text>
            {items.map((item) => (
              <View key={item.examItemId} style={styles.itemRow}>
                <Text style={styles.itemNumber}>{item.itemNumber}</Text>
                <Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemPoints}>{item.maxPoints} pts</Text>
              </View>
            ))}
          </View>

          <Pressable disabled={working || items.length === 0} style={[styles.uploadButton, working && styles.disabled]} onPress={() => void importFile()}>
            {working ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="upload-file" size={20} color={ucapsaBrand.colors.surface} />}
            <Text style={styles.uploadText}>{working ? 'Validando y cargando…' : fileName ? 'Seleccionar otro .xlsx' : 'Seleccionar calificaciones .xlsx'}</Text>
          </Pressable>

          {fileName ? <Text style={styles.fileName}>{fileName}</Text> : null}

          {result?.status === 'reviewed' ? (
            <View style={styles.successCard}>
              <MaterialIcons name="verified" size={21} color={ucapsaBrand.colors.successDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>Carga terminada</Text>
                <Text style={styles.successText}>{result.rowsValid} evaluaciones quedaron en estado Revisado. El entrenador no las publica ni las vuelve oficiales.</Text>
              </View>
            </View>
          ) : null}

          {result?.status === 'invalid' ? (
            <View style={styles.invalidCard}>
              <View style={styles.invalidHeader}>
                <MaterialIcons name="warning-amber" size={21} color={ucapsaBrand.colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.invalidTitle}>Archivo con errores</Text>
                  <Text style={styles.invalidMeta}>{result.rowsInvalid} de {result.rowsTotal} filas necesitan corrección. No se creó ninguna calificación oficial.</Text>
                </View>
              </View>
              <View style={styles.errorRows}>
                {result.errors.slice(0, 12).map((row) => (
                  <View key={`${row.rowNumber}:${row.memberNumber ?? ''}:${row.dogName ?? ''}`} style={styles.errorRow}>
                    <Text style={styles.errorRowTitle}>Fila {row.rowNumber} · {row.dogName || 'Perro sin nombre'}</Text>
                    {row.errors.map((item, index) => (
                      <Text key={`${index}:${String(item.code ?? '')}`} style={styles.errorRowText}>• {String(item.message ?? item.code ?? 'Error de validación')}</Text>
                    ))}
                  </View>
                ))}
                {result.errors.length > 12 ? <Text style={styles.moreErrors}>+ {result.errors.length - 12} filas con error</Text> : null}
              </View>
            </View>
          ) : null}

          <Pressable style={styles.backButton} onPress={() => router.replace('/trainer-exams' as never)}>
            <Text style={styles.backText}>Volver a Exámenes</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700' },
  error: { borderRadius: 16, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12 },
  errorText: { color: ucapsaBrand.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  header: { marginBottom: 12 },
  kicker: { color: ucapsaBrand.colors.greenDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 17, backgroundColor: ucapsaBrand.colors.purpleSoft, padding: 11, marginBottom: 10 },
  infoTitle: { color: ucapsaBrand.colors.purpleDark, fontSize: 11, fontWeight: '900' },
  infoText: { color: ucapsaBrand.colors.purpleDark, fontSize: 9, lineHeight: 14, fontWeight: '700', marginTop: 2 },
  itemsCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginBottom: 7 },
  itemRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border, paddingVertical: 5 },
  itemNumber: { width: 24, color: ucapsaBrand.colors.purpleDark, fontSize: 9, fontWeight: '900' },
  itemTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '800' },
  itemPoints: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '900' },
  uploadButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.greenDark, marginTop: 12 },
  uploadText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  fileName: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  successCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.successSoft, padding: 11, marginTop: 12 },
  successTitle: { color: ucapsaBrand.colors.successDark, fontSize: 11, fontWeight: '900' },
  successText: { color: ucapsaBrand.colors.successDark, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  invalidCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 11, marginTop: 12 },
  invalidHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  invalidTitle: { color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '900' },
  invalidMeta: { color: ucapsaBrand.colors.danger, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  errorRows: { gap: 6, marginTop: 9 },
  errorRow: { borderRadius: 11, backgroundColor: ucapsaBrand.colors.surface, padding: 8 },
  errorRowTitle: { color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '900' },
  errorRowText: { color: ucapsaBrand.colors.danger, fontSize: 8, lineHeight: 12, fontWeight: '700', marginTop: 2 },
  moreErrors: { color: ucapsaBrand.colors.danger, fontSize: 8, fontWeight: '900' },
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, marginTop: 10 },
  backText: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900' },
});
