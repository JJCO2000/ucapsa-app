import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getStaffExamAttemptDetail,
  reviewStaffExamAttempt,
  saveStaffExamResult,
  type StaffExamAttemptItem,
} from '../../services/staff-operations.service';

type DraftValue = { points: string; note: string };

export default function TrainerExamAttemptScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId?: string }>();
  const { isStaff, isAdmin } = useSession();
  const id = typeof attemptId === 'string' ? attemptId : '';
  const [items, setItems] = useState<StaffExamAttemptItem[]>([]);
  const [values, setValues] = useState<Record<string, DraftValue>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const rows = await getStaffExamAttemptDetail(id);
      setItems(rows);
      setValues(Object.fromEntries(rows.map((item) => [
        item.examItemId,
        {
          points: item.pointsAwarded === null ? '' : String(item.pointsAwarded),
          note: item.evaluatorNote ?? '',
        },
      ])));
    } catch (cause) {
      Alert.alert('No se pudo cargar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
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

  const complete = useMemo(() => items.length > 0 && items.every((item) => {
    const value = Number(values[item.examItemId]?.points);
    return values[item.examItemId]?.points.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= item.maxPoints;
  }), [items, values]);

  const total = useMemo(() => items.reduce((sum, item) => {
    const raw = values[item.examItemId]?.points ?? '';
    const value = Number(raw);
    return raw.trim() && Number.isFinite(value) ? sum + value : sum;
  }, 0), [items, values]);
  const maxTotal = items.reduce((sum, item) => sum + item.maxPoints, 0);
  const first = items[0] ?? null;
  const reviewed = first?.attemptStatus === 'reviewed';

  function updateValue(itemId: string, patch: Partial<DraftValue>) {
    setValues((current) => ({
      ...current,
      [itemId]: {
        points: current[itemId]?.points ?? '',
        note: current[itemId]?.note ?? '',
        ...patch,
      },
    }));
  }

  async function save(reviewAfter: boolean) {
    if (!id || saving) return;
    if (!complete) {
      Alert.alert('Faltan resultados', 'Captura una puntuación válida en todos los ejercicios.');
      return;
    }

    try {
      setSaving(true);
      for (const item of items) {
        const draft = values[item.examItemId];
        const points = Number(draft.points);
        await saveStaffExamResult({
          attemptId: id,
          examItemId: item.examItemId,
          pointsAwarded: points,
          evaluatorNote: draft.note,
        });
      }

      if (reviewAfter && !reviewed) {
        await reviewStaffExamAttempt(id);
        Alert.alert(
          'Evaluación terminada',
          'Quedó lista para revisión/publicación administrativa. El entrenador no publica resultados oficiales.',
          [{ text: 'OK', onPress: () => router.replace('/trainer-exams' as never) }],
        );
        return;
      }

      Alert.alert('Borrador guardado', 'Los resultados quedaron registrados.');
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.green} /><Text style={styles.muted}>Cargando evaluación…</Text></View> : null}

      {first ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><MaterialIcons name="fact-check" size={24} color={ucapsaBrand.colors.purpleDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>{reviewed ? 'LISTO PARA ADMINISTRACIÓN' : 'EN CAPTURA'}</Text>
              <Text style={styles.title}>{first.dogName}</Text>
              <Text style={styles.subtitle}>{first.examTitle} · {first.ownerName}</Text>
            </View>
            <View style={styles.scorePill}><Text style={styles.scoreText}>{total}/{maxTotal}</Text></View>
          </View>

          <View style={styles.list}>
            {items.map((item) => {
              const draft = values[item.examItemId] ?? { points: '', note: '' };
              const numeric = Number(draft.points);
              const invalid = draft.points.trim() !== '' && (!Number.isFinite(numeric) || numeric < 0 || numeric > item.maxPoints);
              return (
                <View key={item.examItemId} style={[styles.itemCard, invalid && styles.itemCardInvalid]}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemNumber}><Text style={styles.itemNumberText}>{item.itemNumber}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.itemTitle}</Text>
                      {item.itemDescription ? <Text style={styles.itemDescription}>{item.itemDescription}</Text> : null}
                    </View>
                    <Text style={styles.maxPoints}>/{item.maxPoints}</Text>
                  </View>

                  <View style={styles.scoreRow}>
                    <TextInput
                      value={draft.points}
                      onChangeText={(points) => updateValue(item.examItemId, { points })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={ucapsaBrand.colors.muted}
                      style={[styles.pointsInput, invalid && styles.pointsInputInvalid]}
                    />
                    <TextInput
                      value={draft.note}
                      onChangeText={(note) => updateValue(item.examItemId, { note })}
                      placeholder="Observación opcional"
                      placeholderTextColor={ucapsaBrand.colors.muted}
                      style={styles.noteInput}
                    />
                  </View>
                  {invalid ? <Text style={styles.invalidText}>Debe estar entre 0 y {item.maxPoints}.</Text> : null}
                </View>
              );
            })}
          </View>

          <Pressable disabled={!complete || saving} style={[styles.saveButton, (!complete || saving) && styles.disabled]} onPress={() => void save(false)}>
            <MaterialIcons name="save" size={19} color={ucapsaBrand.colors.surface} />
            <Text style={styles.saveButtonText}>{saving ? 'Guardando…' : 'Guardar borrador'}</Text>
          </Pressable>

          {!reviewed ? (
            <Pressable disabled={!complete || saving} style={[styles.reviewButton, (!complete || saving) && styles.disabled]} onPress={() => void save(true)}>
              <MaterialIcons name="task-alt" size={19} color={ucapsaBrand.colors.greenDark} />
              <Text style={styles.reviewButtonText}>Terminar evaluación</Text>
            </Pressable>
          ) : (
            <View style={styles.reviewedCard}>
              <MaterialIcons name="verified" size={20} color={ucapsaBrand.colors.successDark} />
              <Text style={styles.reviewedText}>Captura completa. Un administrador decide la publicación oficial.</Text>
            </View>
          )}
        </>
      ) : !loading ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>Evaluación no disponible</Text></View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13, marginBottom: 12 },
  heroIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.purpleSoft },
  kicker: { color: ucapsaBrand.colors.greenDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  title: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 1 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  scorePill: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.purpleSoft, paddingHorizontal: 9, paddingVertical: 7 },
  scoreText: { color: ucapsaBrand.colors.purpleDark, fontSize: 12, fontWeight: '900' },
  list: { gap: 8 },
  itemCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  itemCardInvalid: { borderColor: ucapsaBrand.colors.dangerBorder },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemNumber: { width: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.purpleSoft },
  itemNumberText: { color: ucapsaBrand.colors.purpleDark, fontSize: 11, fontWeight: '900' },
  itemTitle: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  itemDescription: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  maxPoints: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  pointsInput: { width: 72, minHeight: 43, color: ucapsaBrand.colors.text, textAlign: 'center', fontSize: 15, fontWeight: '900', borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background },
  pointsInputInvalid: { borderColor: ucapsaBrand.colors.danger },
  noteInput: { flex: 1, minHeight: 43, color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '700', borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, paddingHorizontal: 10 },
  invalidText: { color: ucapsaBrand.colors.danger, fontSize: 8, fontWeight: '800', marginTop: 4 },
  saveButton: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.greenDark, marginTop: 14 },
  saveButtonText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  reviewButton: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.greenDark, backgroundColor: ucapsaBrand.colors.greenSoft, marginTop: 8 },
  reviewButtonText: { color: ucapsaBrand.colors.greenDark, fontSize: 11, fontWeight: '900' },
  reviewedCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.successSoft, padding: 11, marginTop: 8 },
  reviewedText: { flex: 1, color: ucapsaBrand.colors.successDark, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  empty: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
});
