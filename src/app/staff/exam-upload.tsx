import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { createTrainerExamDraft, localDateKey } from '../../services/trainer-staff.service';
import {
  pickAndParseUcapsaExamDefinitionXlsx,
  type ExamDefinitionUploadItem,
} from '../../services/ucapsa-exam-xlsx';

function validOptionalDate(value: string) {
  if (!value.trim()) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export default function StaffExamUploadScreen() {
  const { isAdmin, capabilities } = useSession();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState(localDateKey());
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<ExamDefinitionUploadItem[]>([]);
  const [working, setWorking] = useState(false);

  if (!capabilities.canUploadExamDefinition) {
    return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;
  }

  async function pickFile() {
    if (working) return;
    try {
      setWorking(true);
      const parsed = await pickAndParseUcapsaExamDefinitionXlsx();
      if (!parsed) return;
      setFileName(parsed.fileName);
      setItems(parsed.items);
      if (!title.trim()) {
        setTitle(parsed.fileName.replace(/\.xlsx$/i, '').replaceAll('_', ' ').trim());
      }
    } catch (cause) {
      Alert.alert('No se pudo leer el examen', cause instanceof Error ? cause.message : 'Revisa el archivo .xlsx.');
    } finally {
      setWorking(false);
    }
  }

  async function save() {
    if (!code.trim() || !title.trim()) {
      Alert.alert('Faltan datos', 'Captura código y nombre del examen.');
      return;
    }
    if (!validOptionalDate(examDate)) {
      Alert.alert('Fecha inválida', 'Usa AAAA-MM-DD o deja la fecha vacía.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Falta el archivo', 'Selecciona el Excel con los ejercicios.');
      return;
    }

    try {
      setWorking(true);
      await createTrainerExamDraft({
        code,
        title,
        examDate: examDate.trim() || null,
        items,
      });
      Alert.alert(
        'Examen cargado',
        'Quedó como borrador. Administración conserva la revisión final y la publicación.',
        [{ text: 'OK', onPress: () => router.replace('/trainer-exams' as never) }],
      );
    } catch (cause) {
      Alert.alert('No se pudo cargar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.greenDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>ENTRENAMIENTO</Text>
          <Text style={styles.title}>Subir examen</Text>
          <Text style={styles.subtitle}>Carga ejercicios y puntajes. Administración decide cuándo se publica.</Text>
        </View>
      </View>

      <View style={styles.ruleCard}>
        <MaterialIcons name="security" size={20} color={ucapsaBrand.colors.greenDark} />
        <Text style={styles.ruleText}>Desde Entrenamiento no se cambia temporada, ranking, publicación ni oficialidad.</Text>
      </View>

      <Text style={styles.label}>Código</Text>
      <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Ej. CMD-2026-03" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

      <Text style={styles.label}>Nombre</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Ej. Evaluación Comandos" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

      <Text style={styles.label}>Fecha del examen</Text>
      <TextInput value={examDate} onChangeText={setExamDate} placeholder="AAAA-MM-DD" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

      <View style={styles.templateCard}>
        <View style={styles.templateTop}>
          <MaterialIcons name="table-view" size={22} color={ucapsaBrand.colors.purpleDark} />
          <View style={{ flex: 1 }}>
            <Text style={styles.templateTitle}>Excel del examen</Text>
            <Text style={styles.templateMeta}>Fila 1: Ejercicio · Puntos máximos · Descripción (opcional)</Text>
          </View>
        </View>

        <Pressable disabled={working} style={styles.fileButton} onPress={() => void pickFile()}>
          {working ? <ActivityIndicator color={ucapsaBrand.colors.purpleDark} /> : <MaterialIcons name="upload-file" size={20} color={ucapsaBrand.colors.purpleDark} />}
          <Text style={styles.fileButtonText}>{fileName || 'Seleccionar .xlsx'}</Text>
        </Pressable>

        {items.length > 0 ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>{items.length} ejercicios detectados</Text>
            {items.slice(0, 5).map((item, index) => (
              <View key={`${index}:${item.title}`} style={styles.previewRow}>
                <Text style={styles.previewNumber}>{index + 1}</Text>
                <Text numberOfLines={1} style={styles.previewName}>{item.title}</Text>
                <Text style={styles.previewPoints}>{item.max_points} pts</Text>
              </View>
            ))}
            {items.length > 5 ? <Text style={styles.more}>+ {items.length - 5} ejercicios más</Text> : null}
          </View>
        ) : null}
      </View>

      <Pressable disabled={working || items.length === 0} style={[styles.saveButton, (working || items.length === 0) && styles.disabled]} onPress={() => void save()}>
        {working ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="save" size={19} color={ucapsaBrand.colors.surface} />}
        <Text style={styles.saveText}>{working ? 'Guardando…' : 'Guardar como borrador'}</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.greenSoft },
  kicker: { color: ucapsaBrand.colors.greenDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, lineHeight: 33, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  ruleCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.greenSoft, padding: 10, marginBottom: 12 },
  ruleText: { flex: 1, color: ucapsaBrand.colors.greenDark, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  label: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900', marginTop: 9, marginBottom: 5 },
  input: { minHeight: 46, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '800', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11 },
  templateCard: { borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12, marginTop: 14 },
  templateTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  templateTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  templateMeta: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  fileButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: ucapsaBrand.colors.purpleSoft, marginTop: 10, paddingHorizontal: 10 },
  fileButtonText: { flexShrink: 1, color: ucapsaBrand.colors.purpleDark, fontSize: 10, fontWeight: '900' },
  preview: { gap: 5, marginTop: 10 },
  previewTitle: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900', marginBottom: 2 },
  previewRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 8 },
  previewNumber: { width: 20, color: ucapsaBrand.colors.purpleDark, fontSize: 9, fontWeight: '900' },
  previewName: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 9, fontWeight: '800' },
  previewPoints: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '900' },
  more: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '800', marginTop: 2 },
  saveButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.greenDark, marginTop: 14 },
  saveText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
