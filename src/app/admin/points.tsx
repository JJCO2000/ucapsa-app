import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getDogsForUser, type BasicDog } from '../../services/dogs.service';
import {
  getAdminMembershipRows,
  getDisplayName,
  getMembershipEffectiveStatus,
  type MembershipAdminRow,
} from '../../services/memberships.service';
import {
  adminAdjustUcapsaPoints,
  getAdminUcapsaPointsParticipant,
} from '../../services/ucapsa-points.service';
import type { UcapsaPointsParticipant } from '../../types/ucapsa-points.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

export default function AdminPointsScreen() {
  const [members, setMembers] = useState<MembershipAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MembershipAdminRow | null>(null);
  const [dogs, setDogs] = useState<BasicDog[]>([]);
  const [participant, setParticipant] = useState<UcapsaPointsParticipant | null>(null);
  const [selectedDogId, setSelectedDogId] = useState('');
  const [pointsText, setPointsText] = useState('1');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMember, setLoadingMember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await withOperationTimeout(getAdminMembershipRows(), DEFAULT_READ_TIMEOUT_MS, 'admin-points-members');
      setMembers(rows.filter((row) => getMembershipEffectiveStatus(row.membership) === 'active'));
    } catch {
      setError('No se pudieron cargar los socios activos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadMembers(); return undefined; }, [loadMembers]));

  const visibleMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter((row) => [
      getDisplayName(row.profile),
      row.profile?.email,
      row.membership.member_number,
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [members, search]);

  const selectedDog = dogs.find((dog) => dog.id === selectedDogId) ?? null;

  async function chooseMember(row: MembershipAdminRow) {
    setSelected(row);
    setLoadingMember(true);
    setError(null);
    setReason('');
    setPointsText('1');
    try {
      const [nextDogs, nextParticipant] = await Promise.all([
        getDogsForUser(row.membership.user_id),
        getAdminUcapsaPointsParticipant(row.membership.user_id),
      ]);
      setDogs(nextDogs);
      setParticipant(nextParticipant);
      setSelectedDogId(nextParticipant?.dog_id ?? nextDogs[0]?.id ?? '');
    } catch {
      setDogs([]);
      setParticipant(null);
      setSelectedDogId('');
      setError('No se pudieron cargar los perros o el participante de este socio.');
    } finally {
      setLoadingMember(false);
    }
  }

  async function submit() {
    if (!selected || !selectedDogId) {
      Alert.alert('Falta información', 'Selecciona un socio y un perro.');
      return;
    }
    const points = Number(pointsText.replace(',', '.'));
    if (!Number.isInteger(points) || points === 0) {
      Alert.alert('Cantidad inválida', 'Usa un número entero distinto de cero.');
      return;
    }
    if (reason.trim().length < 3) {
      Alert.alert('Falta el motivo', 'Escribe por qué estás agregando o corrigiendo puntos.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminAdjustUcapsaPoints({
        userId: selected.membership.user_id,
        dogId: selectedDogId,
        points,
        reason,
      });
      const refreshed = await getAdminUcapsaPointsParticipant(selected.membership.user_id);
      setParticipant(refreshed);
      setReason('');
      setPointsText('1');
      Alert.alert('Puntos actualizados', `${getDisplayName(selected.profile)} ahora tiene ${result.totalPoints} puntos.`);
    } catch (submitError: any) {
      const message = String(submitError?.message ?? '');
      Alert.alert('No se pudo guardar', message.includes('active_membership_required')
        ? 'El socio debe tener una membresía activa.'
        : 'Revisa la información e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><MaterialIcons name="emoji-events" size={26} color={ucapsaBrand.colors.redDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Perro del Año</Text>
          <Text style={styles.title}>Puntos UCAPSA</Text>
          <Text style={styles.subtitle}>Asistencias suman +1 automáticamente. Aquí solo agregas bonos o correcciones manuales.</Text>
        </View>
      </View>

      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!selected ? (
        <>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Buscar socio" style={styles.searchInput} />
          </View>

          {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando socios…</Text></View> : null}

          <View style={styles.listCard}>
            {visibleMembers.map((row, index) => (
              <Pressable
                key={row.membership.id}
                style={[styles.memberRow, index === visibleMembers.length - 1 && styles.memberRowLast]}
                onPress={() => void chooseMember(row)}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{getDisplayName(row.profile).slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{getDisplayName(row.profile)}</Text>
                  <Text style={styles.memberMeta}>{row.membership.member_number || 'Socio activo'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={styles.selectedCard}>
            <View style={styles.selectedTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>SOCIO SELECCIONADO</Text>
                <Text style={styles.selectedName}>{getDisplayName(selected.profile)}</Text>
              </View>
              <Pressable style={styles.changeButton} onPress={() => { setSelected(null); setDogs([]); setParticipant(null); setSelectedDogId(''); }}>
                <Text style={styles.changeButtonText}>Cambiar</Text>
              </Pressable>
            </View>
            {participant ? (
              <View style={styles.lockedDogRow}>
                <MaterialIcons name="lock" size={17} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.lockedDogText}>Representante de temporada: {participant.display_name}</Text>
              </View>
            ) : null}
          </View>

          {loadingMember ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando perros…</Text></View> : null}

          {!loadingMember && dogs.length === 0 ? (
            <View style={styles.errorCard}><Text style={styles.errorText}>Este socio no tiene un perro activo registrado.</Text></View>
          ) : null}

          {!loadingMember && dogs.length > 0 ? (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>PERRO</Text>
              <View style={styles.dogChips}>
                {dogs.map((dog) => {
                  const active = dog.id === selectedDogId;
                  const disabled = Boolean(participant && dog.id !== participant.dog_id);
                  return (
                    <Pressable
                      key={dog.id}
                      disabled={disabled}
                      style={[styles.dogChip, active && styles.dogChipActive, disabled && styles.dogChipDisabled]}
                      onPress={() => setSelectedDogId(dog.id)}
                    >
                      <MaterialIcons name="pets" size={16} color={active ? ucapsaBrand.colors.surface : ucapsaBrand.colors.redDark} />
                      <Text style={[styles.dogChipText, active && styles.dogChipTextActive]}>{dog.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>PUNTOS</Text>
              <View style={styles.quickRow}>
                {[1, 5, -1].map((value) => (
                  <Pressable key={value} style={styles.quickButton} onPress={() => setPointsText(String(value))}>
                    <Text style={styles.quickButtonText}>{value > 0 ? `+${value}` : value}</Text>
                  </Pressable>
                ))}
                <TextInput
                  value={pointsText}
                  onChangeText={setPointsText}
                  keyboardType="numbers-and-punctuation"
                  placeholder="Cantidad"
                  style={styles.pointsInput}
                />
              </View>

              <Text style={styles.fieldLabel}>MOTIVO</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Ej. Bono por evento especial"
                multiline
                style={styles.reasonInput}
              />

              <Pressable
                disabled={submitting || !selectedDog}
                style={[styles.saveButton, (submitting || !selectedDog) && styles.saveButtonDisabled]}
                onPress={() => void submit()}
              >
                {submitting ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="add-circle" size={20} color={ucapsaBrand.colors.surface} />}
                <Text style={styles.saveButtonText}>{submitting ? 'Guardando…' : 'Guardar ajuste'}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 2 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  errorCard: { borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12, marginBottom: 12 },
  errorText: { color: ucapsaBrand.colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, minHeight: 46, color: ucapsaBrand.colors.text },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  listCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  memberRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  memberRowLast: { borderBottomWidth: 0 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  avatarText: { color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '900' },
  memberName: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  memberMeta: { marginTop: 2, color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  selectedCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 12 },
  selectedTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedName: { marginTop: 2, color: ucapsaBrand.colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  changeButton: { minHeight: 40, justifyContent: 'center', borderRadius: 13, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 13 },
  changeButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  lockedDogRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, backgroundColor: ucapsaBrand.colors.redSoft, padding: 10 },
  lockedDogText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  formCard: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  fieldLabel: { color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  dogChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dogChip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11 },
  dogChipActive: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  dogChipDisabled: { opacity: 0.35 },
  dogChipText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  dogChipTextActive: { color: ucapsaBrand.colors.surface },
  quickRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  quickButton: { minWidth: 46, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: ucapsaBrand.colors.redSoft },
  quickButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  pointsInput: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, color: ucapsaBrand.colors.text, paddingHorizontal: 11 },
  reasonInput: { minHeight: 86, textAlignVertical: 'top', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, color: ucapsaBrand.colors.text, padding: 11 },
  saveButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 16 },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
});
