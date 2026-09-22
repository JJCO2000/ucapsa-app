import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getAdminCustomerRecord, type AdminCustomerRecord } from '../../services/admin-customer.service';
import {
  forceMembershipForProfile,
  getMembershipDogAccessForUser,
  getMembershipStatusLabel,
  setMemberDogTrainingStageAdmin,
  setMembershipDogCoverageAdmin,
  updateMembershipStatus,
  type MembershipDogAccessRow,
} from '../../services/memberships.service';
import { getProgramLevelLabel } from '../../services/programs.service';
import type { MembershipStatus, ProgramCode, ProgramLevel } from '../../types/app.types';

const statusOptions: Array<{ value: MembershipStatus; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'active', label: 'Activa' },
  { value: 'rejected', label: 'Rechazada' },
  { value: 'cancelled', label: 'Cancelada' },
];

function mexicoCurrentMonthKey() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

export default function CustomerMembershipScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [memberNumber, setMemberNumber] = useState('');
  const [startDate, setStartDate] = useState('');
  const [status, setStatus] = useState<MembershipStatus>('pending');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dogAccess, setDogAccess] = useState<MembershipDogAccessRow[]>([]);
  const [stageDogId, setStageDogId] = useState<string | null>(null);
  const [stageProgram, setStageProgram] = useState<ProgramCode>('comandos');
  const [stageLevel, setStageLevel] = useState<ProgramLevel>('principiante');

  const load = useCallback(async () => {
    if (!userId) return;
    const next = await getAdminCustomerRecord(userId);
    setRecord(next);
    if (next.membership) {
      setMemberNumber(next.membership.member_number ?? '');
      setStartDate(next.membership.start_date?.slice(0, 10) ?? '');
      setStatus(next.membership.status);
      setDogAccess(await getMembershipDogAccessForUser(userId, next.membership.id));
    } else {
      setDogAccess([]);
    }
  }, [userId]);

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
      Alert.alert('Membresia creada', 'La membresia quedo activa y sin vencimiento por fecha.');
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
    try {
      setSaving(true);
      await updateMembershipStatus(record.membership, status, {
        memberNumber,
        startDate: startDate || null,
        endDate: null,
      });
      setEditing(false);
      await load();
      Alert.alert('Membresia guardada', 'Los cambios se actualizaron. La membresia no vence por fecha.');
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const visitMonths = new Set((record?.memberVisits ?? []).map((visit) => visit.visit_date.slice(0, 7)));
  const currentMonth = mexicoCurrentMonthKey();
  const visitsThisMonth = (record?.memberVisits ?? []).filter((visit) => visit.visit_date.startsWith(currentMonth)).length;
  const visitsPerActiveMonth = visitMonths.size > 0 ? (record?.memberVisits.length ?? 0) / visitMonths.size : 0;
  const accessByDog = useMemo(() => new Map(dogAccess.map((item) => [item.dog_id, item])), [dogAccess]);
  const coveredDogs = useMemo(() => dogAccess.filter((item) => item.is_covered && item.dog), [dogAccess]);
  const selectedStageDog = stageDogId ? dogAccess.find((item) => item.dog_id === stageDogId)?.dog ?? null : null;

  function memberEnrollmentForDog(dogId: string) {
    return record?.enrollments.find((item) =>
      item.enrollment.dog_id === dogId
      && item.enrollment.status === 'active'
      && item.enrollment.access_mode === 'membership',
    ) ?? null;
  }

  function stageLabelForDog(dogId: string) {
    const row = memberEnrollmentForDog(dogId);
    if (!row) return 'Sin etapa activa';
    if (row.program.code === 'puppy') return 'Puppy';
    return 'Comandos · ' + getProgramLevelLabel(row.enrollment.program_level);
  }

  function openStageEditor(dogId: string) {
    const row = memberEnrollmentForDog(dogId);
    if (row?.program.code === 'puppy') {
      setStageProgram('puppy');
      setStageLevel('base');
    } else {
      setStageProgram('comandos');
      setStageLevel(row?.enrollment.program_level === 'medio' || row?.enrollment.program_level === 'avanzado'
        ? row.enrollment.program_level
        : 'principiante');
    }
    setStageDogId(dogId);
  }

  async function setCoverage(item: MembershipDogAccessRow, covered: boolean) {
    if (!record?.membership || !item.dog) return;
    const apply = async () => {
      try {
        setSaving(true);
        await setMembershipDogCoverageAdmin({
          membershipId: record.membership!.id,
          dogId: item.dog_id,
          covered,
        });
        await load();
      } catch (cause) {
        Alert.alert('No se pudo cambiar la cobertura', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
      } finally {
        setSaving(false);
      }
    };

    if (!covered) {
      Alert.alert(
        'Quitar acceso de socio',
        item.dog.name + ' dejará de tener clases ilimitadas. Su nivel y su historial se conservan.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Quitar acceso', style: 'destructive', onPress: () => void apply() },
        ],
      );
      return;
    }
    await apply();
  }

  async function saveStage() {
    if (!record?.membership || !stageDogId) return;
    const current = memberEnrollmentForDog(stageDogId);
    const currentRank = current?.program.code === 'puppy'
      ? 0
      : current?.enrollment.program_level === 'medio'
        ? 2
        : current?.enrollment.program_level === 'avanzado'
          ? 3
          : 1;
    const targetRank = stageProgram === 'puppy'
      ? 0
      : stageLevel === 'medio'
        ? 2
        : stageLevel === 'avanzado'
          ? 3
          : 1;

    const apply = async () => {
      try {
        setSaving(true);
        await setMemberDogTrainingStageAdmin({
          membershipId: record.membership!.id,
          dogId: stageDogId,
          programCode: stageProgram,
          programLevel: stageProgram === 'puppy' ? 'base' : stageLevel,
          reason: 'Cambio manual desde la ficha de membresía.',
        });
        setStageDogId(null);
        await load();
      } catch (cause) {
        Alert.alert('No se pudo cambiar la etapa', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
      } finally {
        setSaving(false);
      }
    };

    if (targetRank > currentRank + 1) {
      Alert.alert(
        'Salto de niveles',
        'Vas a mover a ' + (selectedStageDog?.name ?? 'este perro') + ' directamente a una etapa superior. Los logros previos coherentes se registrarán automáticamente.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => void apply() },
        ],
      );
      return;
    }
    await apply();
  }

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader customerName={adminCustomerDisplayName(record?.profile)} section="Membresia" subtitle="Estado, numero y visitas del socio seleccionado. La membresia no vence por fecha." member={record?.membership?.status === 'active'} onBack={() => router.back()} />

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
              <Detail label="Duracion" value="Toda la vida del perro" />
              <Detail label="Visitas registradas" value={String(record.memberVisits.length)} />
              <Detail label="Visitas este mes" value={String(visitsThisMonth)} />
              <Detail label="Promedio por mes con actividad" value={visitsPerActiveMonth.toFixed(1)} />
              <Detail label="Ultima visita" value={record.memberVisits[0]?.visited_at ? new Date(record.memberVisits[0].visited_at).toLocaleString('es-MX') : 'Sin visitas'} last />
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.lifetimeNotice}>
                <MaterialIcons name="all-inclusive" size={20} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.lifetimeText}>Sin vencimiento por fecha. Si deja de aplicar, cambia el estado manualmente a Cancelada.</Text>
              </View>
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
            </View>
          )}

          {record.membership.status === 'active' && dogAccess.length > 0 ? (
            <>
              <View style={styles.dogSectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Perros de la membresía</Text>
                  <Text style={styles.sectionHint}>Todos entran por defecto. Sólo cambia una excepción cuando realmente aplique.</Text>
                </View>
                <View style={styles.coveredCount}><Text style={styles.coveredCountText}>{coveredDogs.length}</Text></View>
              </View>
              <View style={styles.dogList}>
                {dogAccess.map((item, index) => {
                  const covered = item.is_covered;
                  return (
                    <View key={item.dog_id} style={[styles.dogRow, index === dogAccess.length - 1 && styles.dogRowLast]}>
                      <View style={[styles.dogCrown, !covered && styles.dogCrownOff]}>
                        <MaterialIcons name={covered ? 'workspace-premium' : 'pets'} size={20} color={covered ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.muted} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.dogName}>{item.dog?.name || 'Perro'}</Text>
                        <Text style={styles.dogMeta}>{covered ? stageLabelForDog(item.dog_id) : 'Fuera de la cobertura de socio'}</Text>
                      </View>
                      {covered ? (
                        <Pressable disabled={saving} style={styles.dogAction} onPress={() => openStageEditor(item.dog_id)}>
                          <Text style={styles.dogActionText}>Cambiar nivel</Text>
                        </Pressable>
                      ) : null}
                      <Pressable disabled={saving} style={[styles.coverageToggle, covered && styles.coverageToggleOn]} onPress={() => void setCoverage(item, !covered)}>
                        <MaterialIcons name={covered ? 'check' : 'add'} size={18} color={covered ? ucapsaBrand.colors.surface : ucapsaBrand.colors.redDark} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

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
                <Pressable style={styles.secondary} onPress={() => router.push('/admin/member-visits' as never)}><Text style={styles.secondaryText}>Ver visitas de socios</Text></Pressable>
              </>
            )}
          </View>
        </>
      ) : null}
      <KeyboardAwareModal visible={Boolean(stageDogId)} onClose={() => setStageDogId(null)}>
        <Text style={styles.modalKicker}>Entrenamiento de socio</Text>
        <Text style={styles.modalTitle}>{selectedStageDog?.name || 'Perro'}</Text>
        <Text style={styles.modalText}>El nivel se cambia manualmente. Las asistencias nunca promueven por sí solas.</Text>

        <Text style={styles.label}>Etapa</Text>
        <View style={styles.stageChoices}>
          <StageChoice label="Puppy" active={stageProgram === 'puppy'} onPress={() => { setStageProgram('puppy'); setStageLevel('base'); }} />
          <StageChoice label="Básico" active={stageProgram === 'comandos' && stageLevel === 'principiante'} onPress={() => { setStageProgram('comandos'); setStageLevel('principiante'); }} />
          <StageChoice label="Intermedio" active={stageProgram === 'comandos' && stageLevel === 'medio'} onPress={() => { setStageProgram('comandos'); setStageLevel('medio'); }} />
          <StageChoice label="Avanzado" active={stageProgram === 'comandos' && stageLevel === 'avanzado'} onPress={() => { setStageProgram('comandos'); setStageLevel('avanzado'); }} />
        </View>

        <Pressable disabled={saving} style={styles.primary} onPress={() => void saveStage()}>
          <Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar etapa'}</Text>
        </Pressable>
        <Pressable disabled={saving} style={styles.secondary} onPress={() => setStageDogId(null)}>
          <Text style={styles.secondaryText}>Cancelar</Text>
        </Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function StageChoice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.stageChoice, active && styles.stageChoiceActive]} onPress={onPress}>
      <Text style={[styles.stageChoiceText, active && styles.stageChoiceTextActive]}>{label}</Text>
    </Pressable>
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
  card: { borderRadius: 20, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14, gap: 12 },
  lifetimeNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, backgroundColor: ucapsaBrand.colors.redSoft, padding: 11 },
  lifetimeText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 17, fontWeight: '800' },
  detail: { borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted, paddingBottom: 11 },
  detailLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginTop: 3 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  field: { gap: 6 },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text, backgroundColor: ucapsaBrand.colors.surfaceSubtle },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { width: '48%', borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, alignItems: 'center', paddingVertical: 9 },
  statusButtonActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  statusText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  statusTextActive: { color: ucapsaBrand.colors.surface },
  dogSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 9 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  sectionHint: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  coveredCount: { minWidth: 34, minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.goldPale },
  coveredCountText: { color: ucapsaBrand.colors.goldDark, fontSize: 13, fontWeight: '900' },
  dogList: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  dogRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  dogRowLast: { borderBottomWidth: 0 },
  dogCrown: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.goldPale },
  dogCrownOff: { backgroundColor: ucapsaBrand.colors.surfaceSubtle },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  dogMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  dogAction: { borderRadius: 11, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 9, paddingVertical: 8 },
  dogActionText: { color: ucapsaBrand.colors.redDark, fontSize: 9, fontWeight: '900' },
  coverageToggle: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, alignItems: 'center', justifyContent: 'center' },
  coverageToggleOn: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 23, fontWeight: '900', marginTop: 2 },
  modalText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  stageChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7, marginBottom: 14 },
  stageChoice: { width: '48%', borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, alignItems: 'center', paddingVertical: 10, backgroundColor: ucapsaBrand.colors.surface },
  stageChoiceActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  stageChoiceText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  stageChoiceTextActive: { color: ucapsaBrand.colors.surface },
  actions: { marginTop: 14, gap: 9 },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  secondary: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, alignItems: 'center', paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
});
