import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getAdminTrainingDecisionHistory,
  getAdminTrainingDecisionRows,
  resolveAdminTrainingDecision,
  type AdminTrainingDecisionHistoryRow,
  type AdminTrainingDecisionRow,
  type TrainingDecisionAction,
} from '../../services/admin-training-decisions.service';

function decisionLabel(value: TrainingDecisionAction) {
  if (value === 'repeat_level') return 'Repitió nivel';
  if (value === 'next_level') return 'Pasó al siguiente nivel';
  return 'No continuó';
}

function shortDate(value: string | null | undefined) {
  if (!value) return 'Ahora';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminTrainingDecisionsScreen() {
  const { isAdmin } = useSession();
  const [rows, setRows] = useState<AdminTrainingDecisionRow[]>([]);
  const [history, setHistory] = useState<AdminTrainingDecisionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ row: AdminTrainingDecisionRow; action: TrainingDecisionAction } | null>(null);
  const [newCardNumber, setNewCardNumber] = useState('');

  const load = useCallback(async () => {
    const [nextRows, nextHistory] = await Promise.all([
      getAdminTrainingDecisionRows(),
      getAdminTrainingDecisionHistory(16),
    ]);
    setRows(nextRows);
    setHistory(nextHistory);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load()
      .catch((cause) => Alert.alert('No se pudieron cargar las decisiones', cause instanceof Error ? cause.message : 'Intenta de nuevo.'))
      .finally(() => setLoading(false));
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  function openDecision(row: AdminTrainingDecisionRow, action: TrainingDecisionAction) {
    if (action === 'next_level' && row.programCode === 'comandos' && row.programLevel === 'avanzado') {
      Alert.alert(
        'Avanzado continúa',
        'Avanzado es el nivel superior. Puede repetir otra tarjeta o no continuar; sus logros siguen creciendo por asistencias.',
      );
      return;
    }
    setNewCardNumber('');
    setPending({ row, action });
  }

  async function confirmDecision() {
    if (!pending) return;
    try {
      setSavingId(pending.row.enrollmentId);
      await resolveAdminTrainingDecision(
        pending.row.enrollmentId,
        pending.action,
        pending.action === 'no_continue' ? null : newCardNumber,
      );
      setPending(null);
      setNewCardNumber('');
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar la decisión', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSavingId(null);
    }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  const modalTitle = pending?.action === 'repeat_level'
    ? 'Repetir nivel'
    : pending?.action === 'next_level'
      ? 'Siguiente nivel'
      : 'No continúa';
  const modalText = pending?.action === 'repeat_level'
    ? (pending.row.dogName + ' seguirá en ' + pending.row.levelLabel + '. La tarjeta actual se cierra y se crea otra del mismo nivel.')
    : pending?.action === 'next_level'
      ? (pending.row.dogName + ' será promovido desde ' + pending.row.levelLabel + '. El logro de la etapa superada se registra automáticamente.')
      : pending
        ? ('La tarjeta de ' + pending.row.dogName + ' se cerrará sin crear otra. El historial se conserva.')
        : '';

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Admin · Decisiones</Text>
        <Text style={styles.title}>Listos para evaluar</Text>
        <Text style={styles.subtitle}>Sólo aparecen tarjetas que ya cumplieron sus asistencias y necesitan una decisión tuya.</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Revisando tarjetas...</Text>
        </View>
      ) : null}

      {!loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="check-circle" size={34} color={ucapsaBrand.colors.success} />
          <Text style={styles.emptyTitle}>Nada pendiente</Text>
          <Text style={styles.muted}>Cuando una tarjeta cumpla sus asistencias aparecerá aquí automáticamente.</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {rows.map((row) => {
          const advanced = row.programCode === 'comandos' && row.programLevel === 'avanzado';
          const saving = savingId === row.enrollmentId;
          return (
            <View key={row.enrollmentId} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.iconBox}>
                  <MaterialIcons name={row.programCode === 'puppy' ? 'pets' : 'school'} size={20} color={ucapsaBrand.colors.redDark} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.dogName}>{row.dogName}</Text>
                  <Text numberOfLines={1} style={styles.customer}>{row.customerName}</Text>
                </View>
                <View style={styles.ready}><Text style={styles.readyText}>LISTO</Text></View>
              </View>

              <View style={styles.info}>
                <Mini label="Nivel" value={row.levelLabel} />
                <Mini label="Clases" value={String(row.attendanceCount) + '/' + String(row.requiredAttendances)} />
                <Mini label="Tarjeta" value={row.physicalCardNumber || 'Sin número'} />
                <Mini label="Desde" value={shortDate(row.requirementsMetAt || row.createdAt)} />
              </View>

              <View style={styles.actions}>
                <Action label="No continúa" icon="close" onPress={() => openDecision(row, 'no_continue')} disabled={saving} />
                <Action label="Repetir" icon="replay" onPress={() => openDecision(row, 'repeat_level')} disabled={saving} />
                <Action
                  label={advanced ? 'Nivel máximo' : 'Siguiente'}
                  icon={advanced ? 'workspace-premium' : 'arrow-upward'}
                  onPress={() => openDecision(row, 'next_level')}
                  disabled={saving || advanced}
                  primary={!advanced}
                />
              </View>

              <Pressable
                style={styles.open}
                onPress={() => router.push(('/admin/customer-class?userId=' + encodeURIComponent(row.userId) + '&enrollmentId=' + encodeURIComponent(row.enrollmentId)) as never)}
              >
                <Text style={styles.openText}>Ver ficha completa</Text>
                <MaterialIcons name="chevron-right" size={18} color={ucapsaBrand.colors.redDark} />
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.historyHead}>
        <Text style={styles.sectionTitle}>Historial reciente</Text>
        <Text style={styles.hint}>Sólo decisiones resueltas</Text>
      </View>

      {history.length === 0 ? <Text style={styles.muted}>Todavía no hay decisiones registradas.</Text> : (
        <View style={styles.history}>
          {history.map((item, index) => (
            <View key={item.enrollmentId + '-' + item.decidedAt} style={[styles.historyRow, index === history.length - 1 && styles.last]}>
              <View style={styles.dot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>{item.dogName + ' · ' + decisionLabel(item.decision)}</Text>
                <Text style={styles.historyMeta}>
                  {item.customerName + ' · ' + (item.programCode === 'puppy' ? 'Puppy' : item.programLevel) + ' · ' + String(item.attendanceCount) + ' asistencias'}
                </Text>
                <Text style={styles.historyDate}>{shortDate(item.decidedAt)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <KeyboardAwareModal visible={Boolean(pending)} onClose={() => setPending(null)}>
        {pending ? (
          <>
            <Text style={styles.modalKicker}>Decisión de entrenamiento</Text>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Text style={styles.modalText}>{modalText}</Text>
            {pending.action !== 'no_continue' ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nueva tarjeta física</Text>
                <TextInput
                  value={newCardNumber}
                  onChangeText={setNewCardNumber}
                  placeholder="Opcional: número de la nueva tarjeta"
                  style={styles.input}
                />
                <Text style={styles.hint}>Si todavía no la tienes, puedes asignarla después.</Text>
              </View>
            ) : null}
            <Pressable disabled={Boolean(savingId)} style={styles.primary} onPress={() => void confirmDecision()}>
              <Text style={styles.primaryText}>{savingId ? 'Guardando...' : 'Confirmar decisión'}</Text>
            </Pressable>
            <Pressable disabled={Boolean(savingId)} style={styles.secondary} onPress={() => setPending(null)}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
          </>
        ) : null}
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <View style={styles.mini}><Text style={styles.miniLabel}>{label}</Text><Text numberOfLines={1} style={styles.miniValue}>{value}</Text></View>;
}

function Action({ label, icon, onPress, disabled, primary = false }: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable disabled={disabled} style={[styles.action, primary && styles.actionPrimary, disabled && styles.disabled]} onPress={onPress}>
      <MaterialIcons name={icon} size={17} color={primary ? ucapsaBrand.colors.surface : ucapsaBrand.colors.redDark} />
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 7, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 22, marginBottom: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  grid: { gap: 10 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13, gap: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconBox: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  customer: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  ready: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.goldPale, paddingHorizontal: 8, paddingVertical: 5 },
  readyText: { color: ucapsaBrand.colors.goldDark, fontSize: 9, fontWeight: '900' },
  info: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  mini: { width: '48%', borderRadius: 13, backgroundColor: ucapsaBrand.colors.surfaceAlt, padding: 9 },
  miniLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  miniValue: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  action: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 6, paddingVertical: 8 },
  actionPrimary: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  actionText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  actionTextPrimary: { color: ucapsaBrand.colors.surface },
  disabled: { opacity: 0.48 },
  open: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 2 },
  openText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  historyHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 9 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  history: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', gap: 9, padding: 12, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  last: { borderBottomWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: ucapsaBrand.colors.red },
  historyTitle: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  historyMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  historyDate: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '800', marginTop: 3 },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 23, fontWeight: '900', marginTop: 3 },
  modalText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 5, marginBottom: 12 },
  field: { gap: 5, marginBottom: 12 },
  fieldLabel: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceSubtle, paddingHorizontal: 12, color: ucapsaBrand.colors.text },
  primary: { borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingVertical: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  secondary: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, alignItems: 'center', paddingVertical: 12 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
});
