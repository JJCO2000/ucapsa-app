import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getTrainerExamAttempt,
  reviewTrainerExamAttempt,
  saveTrainerExamResult,
  type TrainerExamAttempt,
} from '../../services/trainer-staff.service';

type ScoreDraft = {
  points: string;
  note: string;
};

export default function StaffExamAttemptScreen() {
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const attemptId = typeof params.attemptId === 'string' ? params.attemptId : '';
  const { isStaff } = useSession();
  const [detail, setDetail] = useState<TrainerExamAttempt | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isStaff || !attemptId) return;
    setError(null);
    try {
      const next = await getTrainerExamAttempt(attemptId);
      setDetail(next);
      const resultByItem = new Map(next.results.map((row) => [row.exam_item_id, row]));
      setDrafts(Object.fromEntries(next.items.map((item) => {
        const existing = resultByItem.get(item.id);
        return [item.id, {
          points: existing ? String(existing.points_awarded) : '',
          note: existing?.evaluator_note ?? '',
        }];
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el intento.');
    } finally {
      setLoading(false);
    }
  }, [attemptId, isStaff]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  const complete = useMemo(() => {
    if (!detail || detail.items.length === 0) return false;
    return detail.items.every((item) => {
      const value = Number((drafts[item.id]?.points ?? '').replace(',', '.'));
      return Number.isFinite(value) && value >= 0 && value <= Number(item.max_points);
    });
  }, [detail, drafts]);

  const total = useMemo(() => {
    if (!detail) return 0;
    return detail.items.reduce((sum, item) => {
      const value = Number((drafts[item.id]?.points ?? '').replace(',', '.'));
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }, [detail, drafts]);

  const maxTotal = useMemo(() => detail?.items.reduce((sum, item) => sum + Number(item.max_points), 0) ?? 0, [detail]);

  async function saveAll() {
    if (!detail || !complete || saving) return;
    try {
      setSaving(true);
      for (const item of detail.items) {
        const draft = drafts[item.id];
        const points = Number(draft.points.replace(',', '.'));
        await saveTrainerExamResult({
          attemptId: detail.attempt.id,
          examItemId: item.id,
          pointsAwarded: points,
          evaluatorNote: draft.note,
        });
      }
      await load();
      Alert.alert('Resultados guardados', 'El intento sigue en borrador hasta que lo envíes a revisión.');
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function sendForReview() {
    if (!detail || !complete || saving) return;
    Alert.alert(
      'Enviar a revisión',
      'Después de enviarlo, el entrenador ya no podrá cambiar los resultados. Administración conserva la publicación y el intento oficial.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            try {
              setSaving(true);
              for (const item of detail.items) {
                const draft = drafts[item.id];
                await saveTrainerExamResult({
                  attemptId: detail.attempt.id,
                  examItemId: item.id,
                  pointsAwarded: Number(draft.points.replace(',', '.')),
                  evaluatorNote: draft.note,
                });
              }
              await reviewTrainerExamAttempt(detail.attempt.id);
              Alert.alert('Enviado', 'El examen quedó listo para revisión administrativa.');
              router.replace('/trainer-exams' as never);
            } catch (cause) {
              Alert.alert('No se pudo enviar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  if (!capabilities.canUseTrainingWorkspace) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{detail?.exam.code || 'EXAMEN'} · {detail?.dog.name || 'PERRO'}</Text>
          <Text style={styles.title}>{detail?.exam.title || 'Captura de examen'}</Text>
          <Text style={styles.subtitle}>{detail?.dog.owner_name || ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Preparando examen…</Text></View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View>
      ) : null}

      {detail ? (
        <>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Puntuación capturada</Text>
            <Text style={styles.scoreValue}>{total} / {maxTotal}</Text>
            <Text style={styles.scoreStatus}>{detail.attempt.status === 'draft' ? 'Borrador' : 'En revisión'}</Text>
          </View>

          <View style={styles.items}>
            {detail.items.map((item) => {
              const draft = drafts[item.id] ?? { points: '', note: '' };
              const numeric = Number(draft.points.replace(',', '.'));
              const invalid = draft.points.trim() !== '' && (!Number.isFinite(numeric) || numeric < 0 || numeric > Number(item.max_points));
              return (
                <View key={item.id} style={[styles.itemCard, invalid && styles.itemInvalid]}>
                  <View style={styles.itemHeader}>
                    <View style={styles.numberBox}><Text style={styles.numberText}>{item.item_number}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.description ? <Text style={styles.itemDescription}>{item.description}</Text> : null}
                    </View>
                    <Text style={styles.maxText}>/{item.max_points}</Text>
                  </View>

                  <Text style={styles.label}>Puntos</Text>
                  <TextInput
                    value={draft.points}
                    onChangeText={(points) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, points } }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    editable={detail.attempt.status === 'draft' && !saving}
                    style={styles.input}
                  />
                  {invalid ? <Text style={styles.invalidText}>Debe estar entre 0 y {item.max_points}.</Text> : null}

                  <Text style={styles.label}>Nota del evaluador</Text>
                  <TextInput
                    value={draft.note}
                    onChangeText={(note) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, note } }))}
                    placeholder="Opcional"
                    editable={detail.attempt.status === 'draft' && !saving}
                    multiline
                    style={[styles.input, styles.noteInput]}
                  />
                </View>
              );
            })}
          </View>

          {detail.attempt.status === 'draft' ? (
            <View style={styles.footerActions}>
              <Pressable disabled={!complete || saving} style={[styles.secondaryButton, (!complete || saving) && styles.disabled]} onPress={() => void saveAll()}>
                <MaterialIcons name="save" size={19} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.secondaryText}>{saving ? 'Guardando…' : 'Guardar borrador'}</Text>
              </Pressable>
              <Pressable disabled={!complete || saving} style={[styles.primaryButton, (!complete || saving) && styles.disabled]} onPress={() => void sendForReview()}>
                <MaterialIcons name="task-alt" size={19} color={ucapsaBrand.colors.surface} />
                <Text style={styles.primaryText}>Enviar a revisión</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.reviewedCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.purpleDark} />
              <Text style={styles.reviewedText}>Este intento ya fue enviado a revisión. Administración decide publicación y oficialidad.</Text>
            </View>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 23, lineHeight: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 13, fontWeight: '900' },
  scoreCard: { flexDirection: 'row', alignItems: 'baseline', gap: 8, borderRadius: 18, backgroundColor: ucapsaBrand.colors.purpleSoft, padding: 13, marginBottom: 12 },
  scoreLabel: { flex: 1, color: ucapsaBrand.colors.purpleDark, fontSize: 10, fontWeight: '900' },
  scoreValue: { color: ucapsaBrand.colors.purpleDark, fontSize: 22, fontWeight: '900' },
  scoreStatus: { color: ucapsaBrand.colors.purpleDark, fontSize: 9, fontWeight: '900' },
  items: { gap: 10 },
  itemCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  itemInvalid: { borderColor: ucapsaBrand.colors.danger },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  numberBox: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  numberText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  itemTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  itemDescription: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  maxText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900', marginTop: 9, marginBottom: 4 },
  input: { minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 9 },
  noteInput: { minHeight: 64, textAlignVertical: 'top' },
  invalidText: { color: ucapsaBrand.colors.danger, fontSize: 9, fontWeight: '800', marginTop: 3 },
  footerActions: { gap: 8, marginTop: 14 },
  secondaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  reviewedCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.purpleSoft, padding: 12, marginTop: 14 },
  reviewedText: { flex: 1, color: ucapsaBrand.colors.purpleDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
