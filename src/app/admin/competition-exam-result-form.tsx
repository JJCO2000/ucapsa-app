import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  deleteCompetitionExamItemResult,
  getAdminCompetitionExamAttemptDetail,
  saveCompetitionExamItemResult,
  type AdminCompetitionExamAttemptDetail,
} from '../../services/ucapsa-competition.service';

function numericValue(value: string) {
  return Number(value.trim().replace(',', '.'));
}

export default function AdminCompetitionExamResultFormScreen() {
  const params = useLocalSearchParams<{ attemptId?: string | string[]; itemId?: string | string[] }>();
  const attemptId = Array.isArray(params.attemptId) ? params.attemptId[0] ?? '' : params.attemptId ?? '';
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] ?? '' : params.itemId ?? '';
  const [detail, setDetail] = useState<AdminCompetitionExamAttemptDetail | null>(null);
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!attemptId || !itemId) {
      setError('Falta el intento o el ejercicio.');
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const next = await getAdminCompetitionExamAttemptDetail(attemptId);
      setDetail(next);
      const result = next.results.find((candidate) => candidate.exam_item_id === itemId) ?? null;
      if (result) {
        setPoints(String(result.points_awarded));
        setNote(result.evaluator_note ?? '');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo preparar el resultado.');
    } finally {
      setLoading(false);
    }
  }, [attemptId, itemId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  const item = detail?.items.find((candidate) => candidate.id === itemId) ?? null;
  const existing = detail?.results.find((candidate) => candidate.exam_item_id === itemId) ?? null;
  const imported = Boolean(detail?.attempt.import_batch_id);
  const closed = detail?.season?.status === 'closed';
  const voided = detail?.attempt.status === 'voided';
  const missingLocked = Boolean(detail && !existing && detail.attempt.status !== 'draft');
  const editable = Boolean(detail && item && !imported && !closed && !voided && !missingLocked);

  async function save() {
    if (!detail || !item || !editable || saving) return;
    const value = numericValue(points);
    const max = Number(item.max_points);

    if (!Number.isFinite(value) || value < 0) {
      Alert.alert('Puntuación inválida', 'La puntuación debe ser cero o mayor.');
      return;
    }
    if (value > max) {
      Alert.alert('Supera el máximo', `Este ejercicio permite como máximo ${max} puntos.`);
      return;
    }

    setSaving(true);
    try {
      await saveCompetitionExamItemResult({
        attemptId: detail.attempt.id,
        examItemId: item.id,
        pointsAwarded: value,
        evaluatorNote: note,
      });
      router.replace(`/admin/competition-exam-attempt-detail?attemptId=${encodeURIComponent(detail.attempt.id)}` as never);
    } catch (actionError) {
      Alert.alert('No se pudo guardar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!detail || !item || !existing || detail.attempt.status !== 'draft' || !editable || saving) return;
    Alert.alert(
      'Quitar calificación',
      'El ejercicio volverá a quedar sin calificar. Esta acción sólo se permite mientras el intento siga en borrador.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => void runDelete() },
      ],
    );
  }

  async function runDelete() {
    if (!detail || !item || saving) return;
    setSaving(true);
    try {
      await deleteCompetitionExamItemResult({
        attemptId: detail.attempt.id,
        examItemId: item.id,
      });
      router.replace(`/admin/competition-exam-attempt-detail?attemptId=${encodeURIComponent(detail.attempt.id)}` as never);
    } catch (actionError) {
      Alert.alert('No se pudo quitar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>{detail?.exam.code || 'EXAMEN'} · {detail?.dog.name || 'PERRO'}</Text>
        <Text style={styles.title}>{existing ? 'Corregir resultado' : 'Calificar ejercicio'}</Text>
        <Text style={styles.subtitle}>La puntuación pertenece al intento; el máximo pertenece a la definición del ejercicio.</Text>
      </View>

      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Preparando resultado…</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error && detail && item ? (
        <>
          <View style={styles.itemCard}>
            <View style={styles.numberBox}><Text style={styles.numberText}>{item.item_number}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
              <Text style={styles.maxText}>Máximo: {item.max_points} puntos</Text>
            </View>
          </View>

          {!editable ? (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>
                {imported
                  ? 'Este resultado pertenece a una importación Excel y se administrará desde el lote.'
                  : closed
                    ? 'La temporada está cerrada.'
                    : voided
                      ? 'El intento está anulado.'
                      : 'Este intento ya fue revisado/publicado y no puede agregar una fila que faltaba. Sólo pueden corregirse resultados existentes.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Puntuación</Text>
              <TextInput value={points} onChangeText={setPoints} keyboardType="decimal-pad" placeholder={`0 – ${item.max_points}`} placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />

              <Text style={styles.label}>Nota del evaluador opcional</Text>
              <TextInput value={note} onChangeText={setNote} placeholder="Observación interna" placeholderTextColor={ucapsaBrand.colors.muted} style={[styles.input, styles.multiline]} multiline />

              <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void save()}>
                {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="save" size={20} color={ucapsaBrand.colors.surface} />}
                <Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Guardar resultado'}</Text>
              </Pressable>

              {existing && detail.attempt.status === 'draft' ? (
                <Pressable disabled={saving} style={styles.dangerButton} onPress={confirmDelete}>
                  <MaterialIcons name="delete-outline" size={18} color={ucapsaBrand.colors.danger} />
                  <Text style={styles.dangerButtonText}>Quitar calificación</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 15 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  itemCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  numberBox: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  numberText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  itemTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  maxText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 3 },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginTop: 11 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 11, marginBottom: 6 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 78, textAlignVertical: 'top' },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginTop: 16 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  dangerButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, paddingHorizontal: 13, marginTop: 9 },
  dangerButtonText: { color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
