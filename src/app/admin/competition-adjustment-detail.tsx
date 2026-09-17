import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  addCompetitionAdjustment,
  getAdminCompetitionAdjustmentDetail,
  reverseCompetitionAdjustment,
  type CompetitionAdjustment,
  type CompetitionAdjustmentDetail,
} from '../../services/ucapsa-competition.service';

function numberLabel(value: number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function dateTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminCompetitionAdjustmentDetailScreen() {
  const params = useLocalSearchParams<{ seasonId?: string | string[]; dogId?: string | string[] }>();
  const seasonId = Array.isArray(params.seasonId) ? params.seasonId[0] ?? '' : params.seasonId ?? '';
  const dogId = Array.isArray(params.dogId) ? params.dogId[0] ?? '' : params.dogId ?? '';

  const [detail, setDetail] = useState<CompetitionAdjustmentDetail | null>(null);
  const [pointsText, setPointsText] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seasonId || !dogId) {
      setError('Falta la temporada o el perro.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setDetail(await getAdminCompetitionAdjustmentDetail(seasonId, dogId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los movimientos.');
    } finally {
      setLoading(false);
    }
  }, [dogId, seasonId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const reversedIds = useMemo(
    () => new Set((detail?.movements ?? []).map((movement) => movement.reversal_of_id).filter((id): id is string => Boolean(id))),
    [detail?.movements],
  );
  const mutable = detail?.season.status === 'active' || detail?.season.status === 'reopened';

  async function submitAdjustment() {
    if (!detail?.dog?.dog_id || !mutable || working) return;
    const points = Number(pointsText.trim().replace(',', '.'));
    if (!Number.isFinite(points) || points === 0) {
      Alert.alert('Ajuste inválido', 'Escribe una cantidad distinta de cero. Usa signo negativo para restar.');
      return;
    }

    setWorking(true);
    try {
      await addCompetitionAdjustment({
        seasonId: detail.season.id,
        dogId: detail.dog.dog_id,
        points,
        note,
      });
      setPointsText('');
      setNote('');
      await load();
      Alert.alert('Ajuste registrado', 'El movimiento quedó firmado y el total se recalculó desde el historial.');
    } catch (actionError) {
      Alert.alert('No se pudo registrar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmReverse(movement: CompetitionAdjustment) {
    Alert.alert(
      'Revertir ajuste',
      `Se creará un movimiento nuevo por ${movement.points > 0 ? '-' : '+'}${numberLabel(Math.abs(movement.points))}. El original no se modifica.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revertir',
          style: 'destructive',
          onPress: () => void runReverse(movement),
        },
      ],
    );
  }

  async function runReverse(movement: CompetitionAdjustment) {
    if (!mutable || working) return;
    setWorking(true);
    try {
      await reverseCompetitionAdjustment({
        adjustmentId: movement.id,
        note: `Reversión de ajuste ${movement.id}`,
      });
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo revertir', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  const dog = detail?.dog;
  const movements = detail?.movements ?? [];

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando movimientos…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && detail && dog ? (
        <>
          <View style={styles.header}>
            <Text style={styles.kicker}>{detail.season.name}</Text>
            <Text style={styles.title}>{dog.dog_name}</Text>
            <Text style={styles.subtitle}>Ajustes administrativos de esta temporada. Cada corrección conserva el movimiento anterior.</Text>
          </View>

          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>AJUSTE ACUMULADO</Text>
              <Text style={styles.summaryValue}>
                {Number(dog.admin_adjustment_points ?? 0) > 0 ? '+' : ''}{numberLabel(dog.admin_adjustment_points)}
              </Text>
            </View>
            <View style={styles.summaryMeta}>
              <Text style={styles.summaryMetaValue}>{numberLabel(dog.admin_adjustment_movement_count)}</Text>
              <Text style={styles.muted}>movimientos</Text>
            </View>
          </View>

          {!mutable ? (
            <View style={styles.freezeCard}>
              <MaterialIcons name="lock" size={20} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.freezeText}>La temporada está cerrada. Reábrela antes de agregar o revertir ajustes.</Text>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Nuevo ajuste</Text>
              <Text style={styles.help}>Positivo suma. Negativo resta. La nota es opcional.</Text>
              <TextInput
                value={pointsText}
                onChangeText={setPointsText}
                placeholder="+100 o -25"
                placeholderTextColor={ucapsaBrand.colors.muted}
                keyboardType="numbers-and-punctuation"
                style={styles.pointsInput}
              />
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Nota opcional"
                placeholderTextColor={ucapsaBrand.colors.muted}
                style={[styles.pointsInput, styles.noteInput]}
                multiline
              />
              <Pressable disabled={working} style={[styles.primaryButton, working && styles.disabled]} onPress={() => void submitAdjustment()}>
                {working ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} />}
                <Text style={styles.primaryButtonText}>{working ? 'Guardando…' : 'Registrar movimiento'}</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionTitle}>Historial</Text>
          {movements.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin ajustes todavía</Text>
              <Text style={styles.muted}>El primer movimiento de este perro aparecerá aquí.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {movements.map((movement) => {
                const isReversal = Boolean(movement.reversal_of_id);
                const isReversed = reversedIds.has(movement.id);
                const canReverse = Boolean(mutable && !isReversal && !isReversed);
                return (
                  <View key={movement.id} style={styles.movementRow}>
                    <View style={[styles.movementIcon, movement.points < 0 && styles.movementIconNegative]}>
                      <MaterialIcons name={movement.points >= 0 ? 'add' : 'remove'} size={18} color={movement.points >= 0 ? ucapsaBrand.colors.successDark : ucapsaBrand.colors.danger} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.movementTitleLine}>
                        <Text style={[styles.movementPoints, movement.points < 0 && styles.movementPointsNegative]}>
                          {movement.points > 0 ? '+' : ''}{numberLabel(movement.points)}
                        </Text>
                        {isReversal ? <Text style={styles.reversalPill}>Reversión</Text> : isReversed ? <Text style={styles.reversedPill}>Revertido</Text> : null}
                      </View>
                      <Text style={styles.muted}>{dateTimeLabel(movement.occurred_at)}</Text>
                      {movement.note ? <Text style={styles.note}>{movement.note}</Text> : null}
                    </View>
                    {canReverse ? (
                      <Pressable style={styles.reverseButton} onPress={() => confirmReverse(movement)}>
                        <MaterialIcons name="undo" size={18} color={ucapsaBrand.colors.redDark} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.auditNote}>
            <MaterialIcons name="history" size={19} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.auditText}>Append-only: un ajuste existente nunca se edita ni se borra. Revertir crea otro movimiento con signo opuesto.</Text>
          </View>
        </>
      ) : null}

      {!loading && !error && detail && !dog ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Perro no disponible</Text>
          <Text style={styles.muted}>No existe una identidad competitiva para este perro en la temporada seleccionada.</Text>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  header: { gap: 3, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 12 },
  summaryLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  summaryValue: { color: ucapsaBrand.colors.redDark, fontSize: 28, fontWeight: '900', marginTop: 2 },
  summaryMeta: { alignItems: 'flex-end' },
  summaryMetaValue: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  freezeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginBottom: 12 },
  freezeText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  formCard: { gap: 9, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 12 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 5, marginBottom: 7 },
  help: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  pointsInput: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceSubtle, color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 10 },
  noteInput: { minHeight: 70, textAlignVertical: 'top' },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 14 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  emptyCard: { gap: 4, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 8 },
  movementRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  movementIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.successSoft },
  movementIconNegative: { backgroundColor: ucapsaBrand.colors.dangerSoft },
  movementTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  movementPoints: { color: ucapsaBrand.colors.successDark, fontSize: 16, fontWeight: '900' },
  movementPointsNegative: { color: ucapsaBrand.colors.danger },
  reversalPill: { color: ucapsaBrand.colors.warningDark, backgroundColor: ucapsaBrand.colors.warningSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  reversedPill: { color: ucapsaBrand.colors.grayDark, backgroundColor: ucapsaBrand.colors.graySoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  note: { color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  reverseButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  auditNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginTop: 12 },
  auditText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
});
