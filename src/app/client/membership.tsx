import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { MemberCredentialCard } from '../../components/domain/MemberCredentialCard';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMembershipStatusLabel, getMyMembership, isMembershipDateExpired, requestMembership } from '../../services/memberships.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import type { Membership, ProgramEnrollmentWithDetails } from '../../types/app.types';

export default function ClientMembershipScreen() {
  const { user, profile, role, isAdmin, refreshProfile } = useSession();
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

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus: membership?.status ?? null, hasActivePrograms: programs.some((item) => item.enrollment.status === 'active') }), [isAdmin, membership?.status, programs, role, user]);
  const premium = format.key === 'member';

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const eligible = programs.some((item) => item.enrollment.status === 'active' || item.enrollment.status === 'completed');
  const active = membership?.status === 'active';
  const pending = membership?.status === 'pending';
  const inactive = Boolean(membership && !active && !pending);
  const displayName = profile?.full_name || profile?.email || user.email || 'Usuario UCAPSA';

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="services" />
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: premium ? '#FFE8B5' : format.accentDark }]}>Servicios</Text>
        <Text style={[styles.title, { color: format.text }]}>Membresia</Text>
        <Text style={[styles.subtitle, { color: format.muted }]}>Estado, vigencia y credencial. Las clases y pagos estan en sus propias secciones.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando membresia...</Text></View> : null}

      {!loading && !membership && !eligible ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="info-outline" size={28} color={format.accent} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Todavia no disponible</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Para solicitar membresia primero debes estar inscrito o haber completado Puppy o Comandos.</Text>
          <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/classes' as never)}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Ver mis clases</Text></Pressable>
        </View>
      ) : null}

      {!loading && !membership && eligible ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Puedes solicitar membresia</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Envia la solicitud para que administracion la revise.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} disabled={saving} onPress={() => void requestReview()}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Enviando...' : 'Solicitar membresia'}</Text></Pressable>
        </View>
      ) : null}

      {pending ? (
        <View style={[styles.noticeCard, premium && styles.noticeCardPremium]}>
          <Text style={[styles.cardTitle, { color: premium ? '#FFFFFF' : format.text }]}>Solicitud pendiente</Text>
          <Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>Administracion esta revisando tu solicitud. La credencial aparecera aqui cuando sea aprobada.</Text>
        </View>
      ) : null}

      {inactive ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Estado: {getMembershipStatusLabel(membership?.status ?? 'cancelled')}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Si necesitas revision, puedes solicitarla desde aqui.</Text>
          {eligible ? <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} disabled={saving} onPress={() => void requestReview()}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Enviando...' : 'Solicitar revision'}</Text></Pressable> : null}
        </View>
      ) : null}

      {active && membership ? (
        <>
          <MemberCredentialCard membership={membership} profile={profile} displayName={displayName} expiredByDate={isMembershipDateExpired(membership)} />
          <View style={styles.actions}>
            <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/payments' as never)}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Ver pagos</Text></Pressable>
            <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/classes' as never)}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Ver clases</Text></Pressable>
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: '#270711' },
  header: { gap: 4, marginBottom: 16 },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 29, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: { gap: 9, borderRadius: 20, borderWidth: 1, padding: 17, marginBottom: 14 },
  noticeCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 17, marginBottom: 14 },
  noticeCardPremium: { borderColor: 'rgba(250,204,21,0.42)', backgroundColor: '#38111B' },
  cardTitle: { fontSize: 18, fontWeight: '900' },
  primaryButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 12, marginTop: 2 },
  primaryButtonText: { fontSize: 13, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingVertical: 12 },
  secondaryButtonText: { fontSize: 13, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
