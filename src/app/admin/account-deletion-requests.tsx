import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  completeAccountDeletionRequest,
  getAccountDeletionStatusLabel,
  getOpenAccountDeletionRequests,
  updateAccountDeletionRequest,
  type AccountDeletionRequest,
} from '../../services/account-deletion.service';

type ActionMode = 'block' | 'reject' | 'complete' | null;

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AccountDeletionRequestsScreen() {
  const { role } = useSession();
  const isSuperAdmin = role === 'super_admin';
  const [rows, setRows] = useState<AccountDeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AccountDeletionRequest | null>(null);
  const [mode, setMode] = useState<ActionMode>(null);
  const [note, setNote] = useState('');
  const [retentionUntil, setRetentionUntil] = useState('');
  const [notificationMethod, setNotificationMethod] = useState('');
  const [notificationReference, setNotificationReference] = useState('');

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      setRows(await getOpenAccountDeletionRequests());
    } catch (cause) {
      Alert.alert('No se pudieron cargar solicitudes', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  const grouped = useMemo(() => ({
    pending: rows.filter((row) => row.status === 'pending'),
    reviewing: rows.filter((row) => row.status === 'in_review'),
    blocked: rows.filter((row) => row.status === 'blocked'),
  }), [rows]);

  if (!isSuperAdmin) return <Redirect href="/admin/tools-administration" />;

  async function setReviewing(row: AccountDeletionRequest) {
    try {
      setSavingId(row.id);
      await updateAccountDeletionRequest({ requestId: row.id, status: 'in_review' });
      await load();
    } catch (cause) {
      Alert.alert('No se pudo actualizar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSavingId(null);
    }
  }

  function openAction(row: AccountDeletionRequest, nextMode: Exclude<ActionMode, null>) {
    setSelected(row);
    setMode(nextMode);
    setNote('');
    setRetentionUntil(nextMode === 'complete' ? row.retention_until ?? '' : '');
    setNotificationMethod('');
    setNotificationReference('');
  }

  function closeAction() {
    setSelected(null);
    setMode(null);
    setNote('');
    setRetentionUntil('');
    setNotificationMethod('');
    setNotificationReference('');
  }

  async function submitAction() {
    if (!selected || !mode) return;

    if ((mode === 'reject' || mode === 'complete') && note.trim().length < 5) {
      Alert.alert('Falta evidencia', 'Escribe una nota breve que documente la resolución.');
      return;
    }

    if (mode === 'block' && !/^\d{4}-\d{2}-\d{2}$/.test(retentionUntil)) {
      Alert.alert('Fecha requerida', 'Define la fecha hasta la que los datos permanecerán bloqueados, en formato AAAA-MM-DD.');
      return;
    }

    if (mode === 'complete' && selected.retention_until && selected.retention_until > todayKey()) {
      Alert.alert('Bloqueo vigente', `El periodo de bloqueo termina el ${selected.retention_until}. No cierres antes de esa fecha.`);
      return;
    }

    if (mode === 'complete' && !notificationMethod.trim()) {
      Alert.alert('Falta medio de notificación', 'Registra cómo se informó al titular del cierre.');
      return;
    }

    if (mode === 'complete' && !notificationReference.trim()) {
      Alert.alert('Falta referencia', 'Registra un folio, evidencia o referencia verificable de la notificación.');
      return;
    }

    try {
      setSavingId(selected.id);
      if (mode === 'complete') {
        await completeAccountDeletionRequest({
          requestId: selected.id,
          resolutionNote: note,
          notificationMethod,
          notificationReference,
        });
      } else {
        await updateAccountDeletionRequest({
          requestId: selected.id,
          status: mode === 'block' ? 'blocked' : 'rejected',
          resolutionNote: note,
          retentionUntil: mode === 'block' ? retentionUntil : selected.retention_until,
        });
      }
      closeAction();
      await load();
      Alert.alert(
        mode === 'block' ? 'Bloqueo registrado' : mode === 'reject' ? 'Solicitud resuelta' : 'Resolución registrada',
        mode === 'complete'
          ? 'La solicitud quedó cerrada como atendida. Usa esta acción sólo después de ejecutar el proceso de supresión/baja correspondiente.'
          : 'El expediente quedó actualizado.',
      );
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Superadmin · Datos personales</Text>
        <Text style={styles.title}>Bajas de cuenta</Text>
        <Text style={styles.subtitle}>Revisa solicitudes, documenta bloqueo y registra la resolución. Esta pantalla no borra evidencia automáticamente.</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="Pendientes" value={grouped.pending.length} />
        <Metric label="En revisión" value={grouped.reviewing.length} />
        <Metric label="Bloqueadas" value={grouped.blocked.length} />
      </View>

      <View style={styles.info}>
        <MaterialIcons name="policy" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.infoText}>Cuenta y membresía son procesos distintos. Si existe obligación de conservación, registra el periodo de bloqueo antes de cerrar la solicitud.</Text>
      </View>

      {loading ? <Text style={styles.muted}>Cargando solicitudes...</Text> : null}
      {!loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="task-alt" size={32} color={ucapsaBrand.colors.green} />
          <Text style={styles.emptyTitle}>Sin solicitudes abiertas</Text>
          <Text style={styles.muted}>No hay expedientes pendientes, en revisión o bloqueados.</Text>
        </View>
      ) : null}

      {rows.map((row) => {
        const busy = savingId === row.id;
        const canComplete = row.status === 'blocked' && (!row.retention_until || row.retention_until <= todayKey());
        return (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{row.snapshot_name || 'Cuenta UCAPSA'}</Text>
                <Text style={styles.email}>{row.snapshot_email || 'Correo no disponible'}</Text>
              </View>
              <Text style={styles.status}>{getAccountDeletionStatusLabel(row.status)}</Text>
            </View>

            <Text style={styles.meta}>Solicitada: {formatDateTime(row.requested_at)}</Text>
            {row.reason ? <Text style={styles.reason}>Motivo: {row.reason}</Text> : null}
            {row.retention_until ? <Text style={styles.blocked}>Bloqueo hasta: {row.retention_until}</Text> : null}

            <View style={styles.actions}>
              {row.status === 'pending' ? (
                <Action label="Tomar revisión" onPress={() => void setReviewing(row)} disabled={busy} />
              ) : null}
              {row.status === 'in_review' ? (
                <>
                  <Action label="Registrar bloqueo" onPress={() => openAction(row, 'block')} disabled={busy} />
                  <Action label="No procede" variant="secondary" onPress={() => openAction(row, 'reject')} disabled={busy} />
                </>
              ) : null}
              {row.status === 'blocked' ? (
                <Action
                  label={canComplete ? 'Registrar supresión completada' : 'Bloqueo vigente'}
                  onPress={() => openAction(row, 'complete')}
                  disabled={busy || !canComplete}
                />
              ) : null}
            </View>
          </View>
        );
      })}

      <KeyboardAwareModal visible={Boolean(selected && mode)} onClose={closeAction}>
        <Text style={styles.modalKicker}>Expediente de baja</Text>
        <Text style={styles.modalTitle}>
          {mode === 'block' ? 'Registrar periodo de bloqueo' : mode === 'reject' ? 'Resolver como no procedente' : 'Registrar proceso completado'}
        </Text>
        <Text style={styles.muted}>{selected?.snapshot_name || selected?.snapshot_email || 'Cuenta UCAPSA'}</Text>

        {mode === 'block' ? (
          <>
            <Text style={styles.label}>Bloqueo hasta</Text>
            <TextInput
              value={retentionUntil}
              onChangeText={setRetentionUntil}
              placeholder="AAAA-MM-DD"
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />
            <Text style={styles.hint}>La fecha debe provenir del criterio jurídico/contable aplicable; la app no inventa ese plazo.</Text>
          </>
        ) : null}

        <Text style={styles.label}>{mode === 'block' ? 'Nota interna' : 'Motivo / evidencia de resolución'}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={mode === 'complete' ? 'Ej. Supresión ejecutada y verificada...' : 'Describe brevemente la decisión...'}
          multiline
          style={[styles.input, styles.textArea]}
        />

        {mode === 'complete' ? (
          <>
            <Text style={styles.label}>Medio de notificación al titular</Text>
            <TextInput
              value={notificationMethod}
              onChangeText={setNotificationMethod}
              placeholder="Ej. correo electrónico, llamada documentada"
              style={styles.input}
            />
            <Text style={styles.label}>Referencia verificable</Text>
            <TextInput
              value={notificationReference}
              onChangeText={setNotificationReference}
              placeholder="Ej. folio interno o referencia del correo enviado"
              style={styles.input}
            />
            <View style={styles.warning}>
              <Text style={styles.warningText}>Esta acción sólo registra que la supresión y el aviso ya fueron ejecutados. No elimina por sí misma Auth, pagos ni históricos.</Text>
            </View>
          </>
        ) : null}

        <Pressable disabled={Boolean(savingId)} style={[styles.primary, savingId && styles.disabled]} onPress={() => void submitAction()}>
          <Text style={styles.primaryText}>{savingId ? 'Guardando...' : 'Confirmar'}</Text>
        </Pressable>
        <Pressable disabled={Boolean(savingId)} style={styles.secondary} onPress={closeAction}>
          <Text style={styles.secondaryText}>Cancelar</Text>
        </Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Action({ label, onPress, disabled, variant = 'primary' }: { label: string; onPress: () => void; disabled: boolean; variant?: 'primary' | 'secondary' }) {
  return (
    <Pressable disabled={disabled} style={[variant === 'primary' ? styles.actionPrimary : styles.actionSecondary, disabled && styles.disabled]} onPress={onPress}>
      <Text style={variant === 'primary' ? styles.actionPrimaryText : styles.actionSecondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metric: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '800', marginTop: 2 },
  info: { flexDirection: 'row', gap: 9, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoft, padding: 12, marginBottom: 14 },
  infoText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 30 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  card: { gap: 7, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  email: { color: ucapsaBrand.colors.muted, fontSize: 11, marginTop: 2 },
  status: { maxWidth: 120, borderRadius: 999, overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700' },
  reason: { color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  blocked: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
  actionPrimary: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 11, paddingVertical: 9 },
  actionPrimaryText: { color: ucapsaBrand.colors.surface, fontSize: 11, fontWeight: '900' },
  actionSecondary: { borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11, paddingVertical: 9 },
  actionSecondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 23, fontWeight: '900', marginTop: 3, marginBottom: 7 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 9, marginBottom: 5 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, paddingHorizontal: 12 },
  textArea: { minHeight: 90, paddingTop: 11, textAlignVertical: 'top' },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 16, fontWeight: '700', marginTop: 5 },
  warning: { borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 10, marginTop: 10 },
  warningText: { color: ucapsaBrand.colors.danger, fontSize: 10, lineHeight: 16, fontWeight: '800' },
  primary: { alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginTop: 12 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  secondary: { alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 12, marginTop: 8 },
  secondaryText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
