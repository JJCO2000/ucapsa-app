import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  correctMemberVisitAdmin,
  deleteMemberVisitAdmin,
  getAdminMemberVisitMonthlyStats,
  getAdminMemberVisits,
  registerMemberVisitAdmin,
  type AdminMemberVisitRow,
  type MemberVisitMonthlyStat,
} from '../../services/member-visits.service';
import { getAdminMembershipRows, getDisplayName, type MembershipAdminRow } from '../../services/memberships.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

const MONTHS = 12;

function localInputValue(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseLocalInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
}

function visitDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminMemberVisitsScreen() {
  const { isAdmin } = useSession();
  const [stats, setStats] = useState<MemberVisitMonthlyStat[]>([]);
  const [visits, setVisits] = useState<AdminMemberVisitRow[]>([]);
  const [members, setMembers] = useState<MembershipAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminMemberVisitRow | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [search, setSearch] = useState('');
  const [visitedAt, setVisitedAt] = useState(localInputValue());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    const [nextStats, nextVisits, nextMembers] = await withOperationTimeout(Promise.all([
      getAdminMemberVisitMonthlyStats(MONTHS),
      getAdminMemberVisits(100),
      getAdminMembershipRows(),
    ]), DEFAULT_READ_TIMEOUT_MS, 'admin-member-visits');
    setStats(nextStats);
    setVisits(nextVisits);
    setMembers(nextMembers.filter((row) => row.membership.status === 'active'));
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load().catch(() => setError('No se pudieron actualizar las visitas de socios.')).finally(() => setLoading(false));
    return undefined;
  }, [load]));

  const current = stats[stats.length - 1] ?? null;
  const previous = stats[stats.length - 2] ?? null;
  const monthChange = previous && previous.total_visits > 0 ? ((Number(current?.total_visits ?? 0) - previous.total_visits) / previous.total_visits) * 100 : null;
  const avg = current && current.unique_members > 0 ? current.total_visits / current.unique_members : 0;
  const filteredMembers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return members.slice(0, 12);
    return members.filter((row) => `${getDisplayName(row.profile)} ${row.profile?.email ?? ''} ${row.membership.member_number ?? ''}`.toLowerCase().includes(needle)).slice(0, 20);
  }, [members, search]);
  const selectedMember = members.find((row) => row.membership.user_id === selectedUserId) ?? null;

  function openCreate() {
    setEditing(null);
    setSelectedUserId('');
    setSearch('');
    setVisitedAt(localInputValue());
    setNotes('');
    setModalOpen(true);
  }

  function openEdit(row: AdminMemberVisitRow) {
    setEditing(row);
    setSelectedUserId(row.user_id);
    setSearch('');
    setVisitedAt(localInputValue(row.visited_at));
    setNotes(row.notes ?? '');
    setModalOpen(true);
  }

  async function save() {
    const parsed = parseLocalInput(visitedAt);
    if (!parsed) {
      Alert.alert('Fecha no valida', 'Usa el formato AAAA-MM-DD HH:mm.');
      return;
    }
    const userId = editing?.user_id || selectedUserId;
    if (!userId) {
      Alert.alert('Selecciona socio', 'Elige a quien corresponde la visita.');
      return;
    }
    try {
      setSaving(true);
      if (editing) await correctMemberVisitAdmin({ visitId: editing.id, visitedAt: parsed.toISOString(), notes });
      else await registerMemberVisitAdmin({ userId, visitedAt: parsed.toISOString(), notes });
      setModalOpen(false);
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function remove(row: AdminMemberVisitRow) {
    Alert.alert('Quitar visita', `Se quitara la visita de ${getDisplayName(row.profile)} del ${visitDateLabel(row.visited_at)}.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => {
        try { await deleteMemberVisitAdmin(row.id); await load(); }
        catch (cause) { Alert.alert('No se pudo quitar', cause instanceof Error ? cause.message : 'Intenta de nuevo.'); }
      } },
    ]);
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" style={styles.back} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={21} color={ucapsaBrand.colors.redDark} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.kicker}>Administracion</Text><Text style={styles.title}>Visitas de socios</Text><Text style={styles.subtitle}>Tendencia mensual. Cada entrada cuenta, aunque el mismo socio visite varias veces.</Text></View>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Actualizando visitas...</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo actualizar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.secondaryButton} onPress={() => void load()}><Text style={styles.secondaryText}>Reintentar</Text></Pressable></View> : null}

      {!loading && !error ? <>
        <View style={styles.metrics}>
          <Metric label="Visitas del mes" value={String(current?.total_visits ?? 0)} />
          <Metric label="Socios unicos" value={String(current?.unique_members ?? 0)} />
          <Metric label="Promedio" value={avg.toFixed(1)} />
          <Metric label="Vs. mes anterior" value={monthChange == null ? '-' : `${monthChange >= 0 ? '+' : ''}${monthChange.toFixed(1)}%`} />
        </View>
        <View style={styles.chartCard}><Text style={styles.sectionTitle}>Visitas mensuales</Text><MonthlyLineChart rows={stats} /></View>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Registros</Text><Text style={styles.muted}>Ultimas {Math.min(visits.length, 100)} visitas.</Text></View><Pressable style={styles.primaryButton} onPress={openCreate}><MaterialIcons name="add" size={18} color={ucapsaBrand.colors.surface} /><Text style={styles.primaryText}>Agregar</Text></Pressable></View>
        <View style={styles.listCard}>
          {visits.length === 0 ? <Text style={styles.muted}>Todavia no hay visitas registradas.</Text> : visits.map((row, index) => <View key={row.id} style={[styles.visitRow, index === visits.length - 1 && styles.lastRow]}><View style={{ flex: 1 }}><Pressable onPress={() => router.push(`/admin/customer?userId=${encodeURIComponent(row.user_id)}` as never)}><Text style={styles.visitName}>{getDisplayName(row.profile)}</Text></Pressable><Text style={styles.visitMeta}>{visitDateLabel(row.visited_at)} - {row.source === 'qr_member' ? 'QR Socios' : 'Admin'}</Text></View><Pressable accessibilityLabel={`Editar visita de ${getDisplayName(row.profile)}`} style={styles.iconButton} onPress={() => openEdit(row)}><MaterialIcons name="edit" size={18} color={ucapsaBrand.colors.redDark} /></Pressable><Pressable accessibilityLabel={`Quitar visita de ${getDisplayName(row.profile)}`} style={styles.iconButton} onPress={() => remove(row)}><MaterialIcons name="delete-outline" size={18} color={ucapsaBrand.colors.danger} /></Pressable></View>)}
        </View>
      </> : null}

      <KeyboardAwareModal visible={modalOpen} onClose={() => !saving && setModalOpen(false)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalKicker}>{editing ? 'Corregir visita' : 'Agregar visita'}</Text>
          <Text style={styles.modalTitle}>{editing ? getDisplayName(editing.profile) : selectedMember ? getDisplayName(selectedMember.profile) : 'Selecciona socio'}</Text>
          {!editing ? <><TextInput value={search} onChangeText={setSearch} placeholder="Buscar nombre, correo o numero" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} />{!selectedMember ? <View style={styles.memberChoices}>{filteredMembers.map((row) => <Pressable key={row.membership.id} style={styles.memberChoice} onPress={() => setSelectedUserId(row.membership.user_id)}><Text style={styles.memberName}>{getDisplayName(row.profile)}</Text><Text style={styles.memberMeta}>{row.membership.member_number || 'Sin numero'}</Text></Pressable>)}</View> : <Pressable style={styles.selectedMember} onPress={() => setSelectedUserId('')}><Text style={styles.memberName}>{getDisplayName(selectedMember.profile)}</Text><Text style={styles.memberMeta}>Cambiar socio</Text></Pressable>}</> : null}
          <Text style={styles.label}>Fecha y hora</Text><TextInput value={visitedAt} onChangeText={setVisitedAt} placeholder="2026-08-30 12:30" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.input} autoCapitalize="none" />
          <Text style={styles.label}>Nota opcional</Text><TextInput value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="Nota administrativa" placeholderTextColor={ucapsaBrand.colors.muted} style={[styles.input, styles.noteInput]} />
          <Pressable disabled={saving} style={styles.modalSave} onPress={() => void save()}><Text style={styles.modalSaveText}>{saving ? 'Guardando...' : 'Guardar visita'}</Text></Pressable>
        </View>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function MonthlyLineChart({ rows }: { rows: MemberVisitMonthlyStat[] }) {
  const width = 330; const height = 190; const left = 28; const right = 12; const top = 18; const bottom = 34;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const values = rows.map((row) => row.total_visits); const max = Math.max(1, ...values);
  if (rows.length === 0) return <Text style={styles.muted}>Todavia no hay datos mensuales.</Text>;
  const points = rows.map((row, index) => {
    const x = left + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
    const y = top + chartHeight - (row.total_visits / max) * chartHeight;
    return { row, x, y };
  });
  return <View style={styles.chartWrap}><Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
    <Line x1={left} y1={top + chartHeight} x2={width - right} y2={top + chartHeight} stroke={ucapsaBrand.colors.border} strokeWidth="1" />
    <Polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={ucapsaBrand.colors.red} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    {points.map((point, index) => <Circle key={point.row.month_start} cx={point.x} cy={point.y} r="4" fill={ucapsaBrand.colors.surface} stroke={ucapsaBrand.colors.red} strokeWidth="3" />)}
    {points.map((point, index) => (index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0) ? <SvgText key={`label-${point.row.month_start}`} x={point.x} y={height - 10} fontSize="10" fontWeight="700" textAnchor="middle" fill={ucapsaBrand.colors.muted}>{monthLabel(point.row.month_start)}</SvgText> : null)}
    {points.map((point) => <SvgText key={`value-${point.row.month_start}`} x={point.x} y={Math.max(11, point.y - 8)} fontSize="9" fontWeight="800" textAnchor="middle" fill={ucapsaBrand.colors.text}>{point.row.total_visits}</SvgText>)}
  </Svg></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 18 }, back: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft }, kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }, title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' }, subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }, muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' }, errorCard: { gap: 8, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14 }, errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }, metric: { width: '47%', flexGrow: 1, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 }, metricValue: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900' }, metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800', marginTop: 3 },
  chartCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 16 }, chartWrap: { alignItems: 'center', overflow: 'hidden' }, sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 }, primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 42, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13 }, primaryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' }, secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13 }, secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  listCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 }, visitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border }, lastRow: { borderBottomWidth: 0 }, visitName: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' }, visitMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 }, iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoftMuted },
  modalContent: { gap: 10 }, modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }, modalTitle: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900' }, label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 4 }, input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surfaceSubtle, color: ucapsaBrand.colors.text, paddingHorizontal: 12, paddingVertical: 11 }, noteInput: { minHeight: 88, textAlignVertical: 'top' }, memberChoices: { gap: 6, maxHeight: 250 }, memberChoice: { borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceSubtle, padding: 10 }, selectedMember: { borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, padding: 11 }, memberName: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' }, memberMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 }, modalSave: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, marginTop: 6 }, modalSaveText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
});
