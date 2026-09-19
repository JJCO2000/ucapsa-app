import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  addCompetitionExamItem,
  getAdminCompetitionExamDetail,
  updateCompetitionExamItem,
  type AdminCompetitionExamDetail,
} from '../../services/ucapsa-competition.service';

function numericValue(value: string) {
  return Number(value.trim().replace(',', '.'));
}

export default function AdminCompetitionExamItemFormScreen() {
  const params = useLocalSearchParams<{ examId?: string | string[]; itemId?: string | string[] }>();
  const examId = Array.isArray(params.examId) ? params.examId[0] ?? '' : params.examId ?? '';
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] ?? null : params.itemId ?? null;
  const [detail, setDetail] = useState<AdminCompetitionExamDetail | null>(null);
  const [itemNumber, setItemNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxPoints, setMaxPoints] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!examId) {
      setError('Falta el examen.');
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const next = await getAdminCompetitionExamDetail(examId);
      setDetail(next);

      if (itemId) {
        const item = next.items.find((candidate) => candidate.id === itemId);
        if (!item) {
          setError('No encontramos este ejercicio.');
          return;
        }
        setItemNumber(String(item.item_number));
        setTitle(item.title);
        setDescription(item.description ?? '');
        setMaxPoints(String(item.max_points));
        setSortOrder(String(item.sort_order));
      } else {
        const nextNumber = next.items.reduce((max, item) => Math.max(max, item.item_number), 0) + 1;
        setItemNumber(String(nextNumber));
        setSortOrder(String(nextNumber));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo preparar el ejercicio.');
    } finally {
      setLoading(false);
    }
  }, [examId, itemId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  const locked = Boolean(detail?.season?.status === 'closed' || detail?.exam.status === 'archived' || detail?.structureLocked);
  const editing = Boolean(itemId);

  async function save() {
    if (!detail || locked || saving) return;
    const number = Number(itemNumber.trim());
    const points = numericValue(maxPoints);
    const order = Number(sortOrder.trim());
    const cleanTitle = title.trim();

    if (!cleanTitle || !Number.isInteger(number) || number <= 0) {
      Alert.alert('Datos inválidos', 'Escribe título y un número de ejercicio entero mayor que cero.');
      return;
    }
    if (!Number.isFinite(points) || points <= 0) {
      Alert.alert('Puntaje inválido', 'El puntaje máximo debe ser mayor que cero.');
      return;
    }
    if (!Number.isFinite(order)) {
      Alert.alert('Orden inválido', 'El orden debe ser un número.');
      return;
    }

    setSaving(true);
    try {
      if (itemId) {
        await updateCompetitionExamItem({
          examItemId: itemId,
          itemNumber: number,
          title: cleanTitle,
          description,
          maxPoints: points,
          sortOrder: Math.round(order),
        });
      } else {
        await addCompetitionExamItem({
          examId: detail.exam.id,
          itemNumber: number,
          title: cleanTitle,
          description,
          maxPoints: points,
          sortOrder: Math.round(order),
        });
      }
      router.replace(`/admin/competition-exam-detail?examId=${encodeURIComponent(detail.exam.id)}` as never);
    } catch (actionError) {
      Alert.alert('No se pudo guardar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>{detail?.exam.code || 'EXAMEN'}</Text>
        <Text style={styles.title}>{editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}</Text>
        <Text style={styles.subtitle}>Cada ejercicio define una sola vez su máximo de puntos. Los resultados sólo guardan lo obtenido por intento.</Text>
      </View>

      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Preparando ejercicio…</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error && detail ? (
        <>
          {locked ? (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>La estructura sólo puede modificarse mientras el examen esté en borrador y la temporada siga abierta.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Número de ejercicio</Text>
              <TextInput value={itemNumber} onChangeText={setItemNumber} keyboardType="number-pad" placeholder="1" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

              <Text style={styles.label}>Título</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="Ej. Quieto con distracción" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

              <Text style={styles.label}>Descripción opcional</Text>
              <TextInput value={description} onChangeText={setDescription} placeholder="Criterio observable" placeholderTextColor={ucapsaBrand.colors.muted} style={[styles.input, styles.multiline]} multiline />

              <Text style={styles.label}>Puntaje máximo</Text>
              <TextInput value={maxPoints} onChangeText={setMaxPoints} keyboardType="decimal-pad" placeholder="10" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

              <Text style={styles.label}>Orden visual</Text>
              <TextInput value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" placeholder={itemNumber || '1'} placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

              <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void save()}>
                {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="save" size={20} color={ucapsaBrand.colors.surface} />}
                <Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : editing ? 'Guardar ejercicio' : 'Agregar ejercicio'}</Text>
              </Pressable>
            </>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 15 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 11, marginBottom: 6 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 78, textAlignVertical: 'top' },
  primaryButton: { minHeight: 50, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginTop: 16 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
