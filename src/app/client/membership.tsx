import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { MemberCredentialCard } from '../../components/domain/MemberCredentialCard';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMembershipStatusLabel, getMyMembership, isMembershipDateExpired, requestMembership } from '../../services/memberships.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import type { Membership, ProgramEnrollmentWithDetails } from '../../types/app.types';

export default function ClientMembershipScreen() {
  const { user, profile, isAdmin, refreshProfile } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [programs, setPrograms] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    try {
      const [membershipRow, programRows] = await Promise.all([getMyMembership(), getMyProgramEnrollments()]);
      setMembership(membershipRow);
      setPrograms(programRows);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function requestReview() {
    setSaving(true);
    try {
      await requestMembership();
      await Promise.all([load(), refreshProfile()]);
      Alert.alert('Solicitud enviada', 'Administracion revisara tu membresia.');
    } catch (err) {
      Alert.alert('No se pudo enviar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const eligible = programs.some((item) => item.enrollment.status === 'active' || item.enrollment.status === 'completed');
  const active = membership?.status === 'active';
  const pending = membership?.status === 'pending';
  const inactive = Boolean(membership && !active && !pending);
  const displayName = profile?.full_name || profile?.email || user.email || 'Usuario UCAPSA';

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Servicios</Text>
        <Text style={styles.title}>Membresia</Text>
        <Text style={styles.subtitle}>Estado, vigencia y credencial. Las clases y pagos estan en sus propias secciones.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando membresia...</Text></View> : null}

      {!loading && !membership && !eligible ? (
        <View style={styles.card}>
          <MaterialIcons name="info-outline" size={28} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.cardTitle}>Todavia no disponible</Text>
          <Text style={styles.muted}>Para solicitar membresia primero debes estar inscrito o haber completado Puppy o Comandos.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/classes' as never)}><Text style={styles.secondaryButtonText}>Ver mis clases</Text></Pressable>
        </View>
      ) : null}

      {!loading && !membership && eligible ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Puedes solicitar membresia</Text>
          <Text style={styles.muted}>Envia la solicitud para que administracion la revise.</Text>
          <Pressable style={styles.primaryButton} disabled={saving} onPress={() => void requestReview()}><Text style={styles.primaryButtonText}>{saving ? 'Enviando...' : 'Solicitar membresia'}</Text></Pressable>
        </View>
      ) : null}

      {pending ? (
        <View style={styles.noticeCard}>
          <Text style={styles.cardTitle}>Solicitud pendiente</Text>
          <Text style={styles.muted}>Administracion esta revisando tu solicitud. La credencial aparecera aqui cuando sea aprobada.</Text>
        </View>
      ) : null}

      {inactive ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado: {getMembershipStatusLabel(membership?.status ?? 'cancelled')}</Text>
          <Text style={styles.muted}>Si necesitas revision, puedes solicitarla desde aqui.</Text>
          {eligible ? <Pressable style={styles.primaryButton} disabled={saving} onPress={() => void requestReview()}><Text style={styles.primaryButtonText}>{saving ? 'Enviando...' : 'Solicitar revision'}</Text></Pressable> : null}
        </View>
      ) : null}

      {active && membership ? (
        <>
          <MemberCredentialCard membership={membership} profile={profile} displayName={displayName} expiredByDate={isMembershipDateExpired(membership)} />
          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/payments' as never)}><Text style={styles.secondaryButtonText}>Ver pagos</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/classes' as never)}><Text style={styles.secondaryButtonText}>Ver clases</Text></Pressable>
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: { gap: 9, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 17, marginBottom: 14 },
  noticeCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 17, marginBottom: 14 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  primaryButton: { alignItems: 'center', borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 12, marginTop: 2 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingVertical: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
