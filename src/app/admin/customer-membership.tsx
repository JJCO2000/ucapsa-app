import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getAdminCustomerRecord, type AdminCustomerRecord } from '../../services/admin-customer.service';
import { forceMembershipForProfile, getMembershipStatusLabel, updateMembershipStatus } from '../../services/memberships.service';
import type { MembershipStatus } from '../../types/app.types';

const statusOptions: Array<{ value: MembershipStatus; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'active', label: 'Activa' },
  { value: 'rejected', label: 'Rechazada' },
  { value: 'expired', label: 'Vencida' },
  { value: 'cancelled', label: 'Cancelada' },
];

export default function CustomerMembershipScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [memberNumber, setMemberNumber] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<MembershipStatus>('pending');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin || !userId) return;
    const next = await getAdminCustomerRecord(userId);
    setRecord(next);
    if (next.membership) {
      setMemberNumber(next.membership.member_number ?? '');
      setStartDate(next.membership.start_date?.slice(0, 10) ?? '');
      setEndDate(next.membership.end_date?.slice(0, 10) ?? '');
      setStatus(next.membership.status);
    }
  }, [isAdmin, userId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [load]));

  async function createMembership() {
    if (!record) return;
    try {
      setSaving(true);
      await forceMembershipForProfile(record.profile);
      await load();
      Alert.alert('Membresia creada', 'La membresia quedo activa y lista para editar.');
    } catch (cause) {
      Alert.alert('No se pudo crear', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!record?.membership) return;
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      Alert.alert('Fecha invalida', 'Usa AAAA-MM-DD para la fecha de inicio.');
      return;
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      Alert.alert('Fecha invalida', 'Usa AAAA-MM-DD para la vigencia.');
      return;
    }
    try {
      setSaving(true);
      await updateMembershipStatus(record.membership, status, {
        memberNumber,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setEditing(false);
      await load();
      Alert.alert('Membresia guardada', 'Los cambios se actualizaron.');
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) return <KeyboardAwareScreen><Text style={styles.title}>Acceso restringido</Text></KeyboardAwareScreen>;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Cliente</Text>
        <Text style={styles.title}>Membresia</Text>
        <Text style={styles.subtitle}>Solo estado, numero y vigencia. Los pagos viven en su propia pantalla.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}

      {record && !record.membership ? (
        <View style={styles.empty}>
          <MaterialIcons name="badge" size={34} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>Sin membresia</Text>
          <Text style={styles.muted}>Este cliente todavia no tiene membresia.</Text>
          <Pressable disabled={saving} style={styles.primary} onPress={createMembership}><Text style={styles.primaryText}>{saving ? 'Creando...' : 'Crear membresia'}</Text></Pressable>
        </View>
      ) : null}

      {record?.membership ? (
        <>
          {!editing ? (
            <View style={styles.card}>
              <Detail label="Estado" value={getMembershipStatusLabel(record.membership.status)} />
              <Detail label="Numero de socio" value={record.membership.member_number || 'Pendiente'} />
              <Detail label="Inicio" value={record.membership.start_date?.slice(0, 10) || 'Sin fecha'} />
              <Detail label="Vigencia" value={record.membership.end_date?.slice(0, 10) || 'Sin fecha'} last />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>Estado</Text>
              <View style={styles.statusGrid}>
                {statusOptions.map((option) => (
                  <Pressable key={option.value} style={[styles.statusButton, status === option.value && styles.statusButtonActive]} onPress={() => setStatus(option.value)}>
                    <Text style={[styles.statusText, status === option.value && styles.statusTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Numero de socio" value={memberNumber} onChangeText={setMemberNumber} placeholder="Ej. SOC-2026-001" />
              <Field label="Inicio" value={startDate} onChangeText={setStartDate} placeholder="AAAA-MM-DD" />
              <Field label="Vigencia" value={endDate} onChangeText={setEndDate} placeholder="AAAA-MM-DD" />
            </View>
          )}

          <View style={styles.actions}>
            {editing ? (
              <>
                <Pressable disabled={saving} style={styles.primary} onPress={save}><Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text></Pressable>
                <Pressable disabled={saving} style={styles.secondary} onPress={() => setEditing(false)}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.primary} onPress={() => setEditing(true)}><Text style={styles.primaryText}>Editar membresia</Text></Pressable>
                <Pressable style={styles.secondary} onPress={() => router.push(`/admin/customer-payments?userId=${encodeURIComponent(userId)}` as never)}><Text style={styles.secondaryText}>Ir a pagos</Text></Pressable>
              </>
            )}
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Detail({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.detail, last && styles.detailLast]}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} style={styles.input} autoCapitalize="characters" /></View>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 9, paddingVertical: 36 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900' },
  card: { borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14, gap: 12 },
  detail: { borderBottomWidth: 1, borderBottomColor: '#F4E5E8', paddingBottom: 11 },
  detailLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginTop: 3 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  field: { gap: 6 },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text, backgroundColor: '#FFFDFD' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { width: '48%', borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', alignItems: 'center', paddingVertical: 9 },
  statusButtonActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  statusText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  statusTextActive: { color: '#fff' },
  actions: { marginTop: 14, gap: 9 },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondary: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', alignItems: 'center', paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
});
