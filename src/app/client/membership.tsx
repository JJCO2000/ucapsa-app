import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { MemberCredentialCard } from '../../components/domain/MemberCredentialCard';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMembershipEffectiveStatus, getMembershipStatusLabel, getMyMembership, getMyMembershipEligibility, isMembershipDateExpired, requestMembership, type MembershipEligibility } from '../../services/memberships.service';
import { clientReadKeys, createMembershipOfflineSummary, readClientResource, sanitizeProgramRowsForCache, writeClientResource, type MembershipOfflineSummary } from '../../services/client-read-cache.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import type { Membership, ProgramEnrollmentWithDetails } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';


function offlineDateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClientMembershipScreen() {
  const { user, profile, role, isAdmin, refreshProfile } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [programs, setPrograms] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [cachedMembership, setCachedMembership] = useState<MembershipOfflineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [membershipDataAvailable, setMembershipDataAvailable] = useState(false);
  const [membershipFresh, setMembershipFresh] = useState(false);
  const [eligibility, setEligibility] = useState<MembershipEligibility | null>(null);
  const [eligibilityFresh, setEligibilityFresh] = useState(false);
  const [eligibilityChecking, setEligibilityChecking] = useState(true);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    setUsingSavedData(false);
    setMembershipDataAvailable(false);
    setMembershipFresh(false);
    setEligibility(null);
    setEligibilityFresh(false);
    setEligibilityChecking(true);

    const [membershipCache, programCache] = await Promise.all([
      readClientResource<MembershipOfflineSummary>(user.id, clientReadKeys.membership),
      readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs),
    ]);

    if (membershipCache) {
      setCachedMembership(membershipCache.data);
      setMembershipDataAvailable(true);
      setSavedAt(membershipCache.saved_at);
      setLoading(false);
    }
    if (programCache) {
      setPrograms(programCache.data);
      setSavedAt((current) => current ?? programCache.saved_at);
      setLoading(false);
    }

    const [membershipResult, programResult, eligibilityResult] = await Promise.allSettled([
      withOperationTimeout(getMyMembership(), DEFAULT_READ_TIMEOUT_MS, 'membership'),
      withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'membership-programs'),
      withOperationTimeout(getMyMembershipEligibility(), DEFAULT_READ_TIMEOUT_MS, 'membership-eligibility'),
    ]);

    if (membershipResult.status === 'fulfilled') {
      setMembership(membershipResult.value);
      setMembershipDataAvailable(true);
      setMembershipFresh(true);
      const summary = createMembershipOfflineSummary(membershipResult.value);
      setCachedMembership(summary);
      const stored = await writeClientResource(user.id, clientReadKeys.membership, summary);
      setSavedAt(stored.saved_at);
    } else {
      // Nunca muestres un QR de membresia de una lectura anterior como si acabara
      // de verificarse. El resumen local no contiene el token QR.
      setMembership(null);
      setMembershipFresh(false);
    }

    if (programResult.status === 'fulfilled') {
      setPrograms(programResult.value);
      await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(programResult.value));
    }

    if (eligibilityResult.status === 'fulfilled') {
      setEligibility(eligibilityResult.value);
      setEligibilityFresh(true);
    }

    const membershipMissing = membershipResult.status === 'rejected' && !membershipCache;
    if (membershipMissing) {
      setError(friendlyReadError('No se pudo cargar tu membresia.'));
    } else if (membershipResult.status === 'rejected' && membershipCache) {
      // Solo una membresia en cache debe bloquear una escritura. Un fallo al hidratar
      // la pantalla de clases no invalida una elegibilidad remota ya confirmada.
      setUsingSavedData(true);
    }

    setEligibilityChecking(false);
    setLoading(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function requestReview() {
    const userId = user?.id;
    if (!userId) {
      Alert.alert('Sesion requerida', 'Vuelve a iniciar sesion para enviar la solicitud.');
      return;
    }

    setSaving(true);
    try {
      // La solicitud puede insertar una fila; evita un timeout artificial que no cancelaria la escritura.
      const requested = await requestMembership();
      setMembership(requested);
      setMembershipDataAvailable(true);
      setMembershipFresh(true);
      const summary = createMembershipOfflineSummary(requested);
      setCachedMembership(summary);
      const stored = await writeClientResource(userId, clientReadKeys.membership, summary);
      setSavedAt(stored.saved_at);
      setUsingSavedData(false);

      // La solicitud ya esta confirmada. Estas lecturas son solo para completar
      // datos secundarios y no deben convertir el exito en un falso error.
      void load();
      void refreshProfile().catch(() => undefined);
      Alert.alert('Solicitud enviada', 'Administracion revisara tu membresia.');
    } catch (err) {
      Alert.alert('No se pudo enviar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const membershipStatus = membershipDataAvailable ? (membership?.status ?? cachedMembership?.status ?? null) : null;
  const validitySource = membership
    ? membership
    : cachedMembership?.status
      ? { status: cachedMembership.status, start_date: cachedMembership.start_date, end_date: cachedMembership.end_date }
      : null;
  const effectiveMembershipStatus = getMembershipEffectiveStatus(validitySource);
  const membershipFormatStatus = effectiveMembershipStatus === 'active'
    ? 'active'
    : membershipStatus === 'pending'
      ? 'pending'
      : effectiveMembershipStatus === 'expired'
        ? 'expired'
        : membershipStatus;
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus: membershipFormatStatus, hasActivePrograms: programs.some((item) => item.enrollment.status === 'active') }), [isAdmin, membershipFormatStatus, programs, role, user]);
  const premium = format.key === 'member';

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const eligibilityVerified = membershipFresh && eligibilityFresh;
  const eligible = eligibilityVerified ? eligibility?.eligible ?? false : null;
  const active = effectiveMembershipStatus === 'active';
  const pending = membershipStatus === 'pending';
  const scheduled = effectiveMembershipStatus === 'scheduled';
  const inactive = Boolean(membershipStatus && !active && !pending) || scheduled;
  const inactiveLabel = scheduled
    ? 'Programada'
    : effectiveMembershipStatus === 'expired'
      ? 'Vencida'
      : getMembershipStatusLabel((membershipStatus ?? 'cancelled') as Exclude<typeof membershipStatus, null>);
  const displayName = profile?.full_name || profile?.email || user.email || 'Usuario UCAPSA';

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="services" />
      <ClientPageHeader
        format={format}
        eyebrow="Tu acceso UCAPSA"
        title="Membresía"
        subtitle={premium ? 'Tu credencial, vigencia y acceso como socio.' : 'Estado, vigencia y credencial.'}
        icon="workspace-premium"
      />

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}
      {error ? <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.cardTitle, { color: format.cardText }]}>No se pudo actualizar</Text><Text style={[styles.muted, { color: format.muted }]}>{error}</Text><Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void refresh()}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Reintentar</Text></Pressable></View> : null}
      {!loading && !membershipStatus && (!membershipFresh || !eligibilityFresh) && !error ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          {eligibilityChecking ? <ActivityIndicator color={format.accent} /> : <MaterialIcons name="info-outline" size={28} color={format.accent} />}
          <Text style={[styles.cardTitle, { color: format.cardText }]}>{eligibilityChecking ? 'Verificando elegibilidad' : 'Falta verificar tu informacion'}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>
            {eligibilityChecking
              ? 'Estamos confirmando tus programas y tu membresia.'
              : 'Conectate para confirmar tu membresia y si ya puedes solicitarla. Los datos guardados no se usan para negarte elegibilidad.'}
          </Text>
          {!eligibilityChecking ? <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void refresh()}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Reintentar</Text></Pressable> : null}
        </View>
      ) : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando membresia...</Text></View> : null}

      {!loading && !error && membershipFresh && eligibilityFresh && !membershipStatus && eligible === false ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="info-outline" size={28} color={format.accent} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Todavia no disponible</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Para solicitar membresia primero debes estar inscrito o haber completado Puppy o Comandos.</Text>
          <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/classes' as never)}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Ver mis clases</Text></Pressable>
        </View>
      ) : null}

      {!loading && !error && membershipFresh && eligibilityFresh && !membershipStatus && eligible === true ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Puedes solicitar membresia</Text>
          <Text style={[styles.muted, { color: format.muted }]}>{eligibility?.source === 'program_completion_achievement' ? 'Tu historial UCAPSA confirma que completaste un programa elegible. Envia la solicitud para que administracion la revise.' : 'Cumples el requisito de acceso. Envia la solicitud para que administracion la revise.'}</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} disabled={saving || usingSavedData} onPress={() => void requestReview()}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Enviando...' : usingSavedData ? 'Conectate para solicitar' : 'Solicitar membresia'}</Text></Pressable>
        </View>
      ) : null}

      {pending ? (
        <View style={[styles.noticeCard, premium && styles.noticeCardPremium]}>
          <Text style={[styles.cardTitle, { color: premium ? ucapsaBrand.colors.premiumText : format.text }]}>Solicitud pendiente</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Administracion esta revisando tu solicitud. La credencial aparecera aqui cuando sea aprobada.</Text>
        </View>
      ) : null}

      {inactive ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Estado: {inactiveLabel}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>
            {scheduled
              ? `Tu membresia inicia el ${offlineDateLabel(membership?.start_date ?? cachedMembership?.start_date)}. El QR estara disponible cuando entre en vigencia.`
              : effectiveMembershipStatus === 'expired'
                ? `La vigencia termino el ${offlineDateLabel(membership?.end_date ?? cachedMembership?.end_date)}. Administracion debe revisar las fechas antes de reactivarla.`
                : 'Si necesitas revision, puedes solicitarla desde aqui.'}
          </Text>
          {eligible === true && membershipStatus !== 'active' ? <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} disabled={saving || usingSavedData} onPress={() => void requestReview()}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Enviando...' : usingSavedData ? 'Conectate para solicitar' : 'Solicitar revision'}</Text></Pressable> : null}
        </View>
      ) : null}

      {active && membership && membershipFresh ? (
        <>
          <MemberCredentialCard membership={membership} profile={profile} displayName={displayName} expiredByDate={isMembershipDateExpired(membership)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar visita de socio"
            style={styles.memberVisitAction}
            onPress={() => router.push('/attendance' as never)}
          >
            <View style={styles.memberVisitIcon}>
              <MaterialIcons name="qr-code-scanner" size={24} color={ucapsaBrand.colors.premiumActionText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberVisitTitle}>Registrar visita de socio</Text>
              <Text style={styles.memberVisitText}>Escanea el QR oficial de Socios al ingresar a UCAPSA. Se registra como visita, no como asistencia a clase.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={25} color={ucapsaBrand.colors.premiumAction} />
          </Pressable>
          <Pressable style={[styles.secondaryButton, styles.classesButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/classes' as never)}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Ver clases</Text></Pressable>
        </>
      ) : active && cachedMembership ? (
        <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="verified" size={28} color={format.accent} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Membresia vigente</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Socio: {cachedMembership.member_number || 'Sin numero'}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Vigencia: {offlineDateLabel(cachedMembership.start_date)} - {offlineDateLabel(cachedMembership.end_date)}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>La credencial QR requiere conexion para mostrar un token vigente.</Text>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { gap: 4, marginBottom: 16 },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 29, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: { gap: 9, borderRadius: 20, borderWidth: 1, padding: 17, marginBottom: 14 },
  noticeCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.goldSoft, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 17, marginBottom: 14 },
  noticeCardPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  cardTitle: { fontSize: 18, fontWeight: '900' },
  primaryButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 12, marginTop: 2 },
  primaryButtonText: { fontSize: 13, fontWeight: '900' },
  secondaryButton: { flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingVertical: 12 },
  secondaryButtonText: { fontSize: 13, fontWeight: '900' },
  memberVisitAction: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumHero, padding: 14 },
  memberVisitIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumActionSoft },
  memberVisitTitle: { color: ucapsaBrand.colors.premiumText, fontSize: 15, fontWeight: '900' },
  memberVisitText: { color: ucapsaBrand.colors.premiumMuted, fontSize: 11, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  classesButton: { marginTop: 10 },
});
