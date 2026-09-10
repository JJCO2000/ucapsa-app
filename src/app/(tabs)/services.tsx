import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { MemberClubCrest } from '../../components/domain/MemberClubCrest';
import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMembershipEffectiveStatus, getMyMembership, type MembershipEffectiveStatus } from '../../services/memberships.service';
import { clientReadKeys, createMembershipOfflineSummary, readClientResource, writeClientResource, type MembershipOfflineSummary } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

const whatsappUrl = ucapsaBrand.socialLinks.find((item) => item.key === 'whatsapp')?.url ?? 'https://wa.me/525522410679';
const guestWhatsAppUrl = `${whatsappUrl}?text=${encodeURIComponent('Hola UCAPSA, vi la app y quiero saber que programa recomiendan para mi perro.')}`;
const schoolUrl = 'https://www.ucapsa.mx/ucapsa-school';
const trainingUrl = 'https://www.ucapsa.mx/ucapsa/entrenamientos';

async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('No se pudo abrir', 'Revisa tu conexión e intenta de nuevo.');
  }
}

export default function ServicesTab() {
  const { user, role, isAdmin } = useSession();
  const [membershipStatus, setMembershipStatus] = useState<MembershipEffectiveStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [membershipLoadFailed, setMembershipLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) {
      setMembershipStatus(null);
      setLoading(false);
      return;
    }

    setUsingSavedData(false);
    setMembershipLoadFailed(false);
    const cached = await readClientResource<MembershipOfflineSummary>(user.id, clientReadKeys.membership);
    if (cached) {
      setMembershipStatus(getMembershipEffectiveStatus(cached.data.status ? { status: cached.data.status, start_date: cached.data.start_date, end_date: cached.data.end_date } : null));
      setSavedAt(cached.saved_at);
      setLoading(false);
    }

    try {
      const membership = await withOperationTimeout(getMyMembership(), DEFAULT_READ_TIMEOUT_MS, 'services-membership');
      setMembershipStatus(getMembershipEffectiveStatus(membership));
      const stored = await writeClientResource(user.id, clientReadKeys.membership, createMembershipOfflineSummary(membership));
      setSavedAt(stored.saved_at);
    } catch {
      if (cached) setUsingSavedData(true);
      else setMembershipLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const membershipFormatStatus = membershipStatus === 'scheduled' ? 'none' : membershipStatus;
  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus: membershipFormatStatus }),
    [isAdmin, membershipFormatStatus, role, user],
  );
  const premium = format.key === 'member';

  if (isAdmin) return <Redirect href="/admin-more" />;

  if (!user) {
    return (
      <KeyboardAwareScreen
        backgroundColor={format.background}
        style={{ backgroundColor: format.background }}
        contentContainerStyle={styles.screenContent}
      >
        <UcapsaAmbientBackground format={format} variant="services" />
        <ClientPageHeader
          format={format}
          eyebrow="Método UCAPSA"
          title="Empieza con tu perro"
          subtitle="Orientación, entrenamiento y una ruta clara para avanzar juntos."
          icon="pets"
        />

        <View style={styles.guestProofCard}>
          <GuestProof icon="history" title="40+ años" text="Experiencia en entrenamiento canino." />
          <GuestProof icon="favorite" title="Métodos positivos" text="Comunicación, confianza y convivencia." />
          <GuestProof icon="trending-up" title="Ruta de entrenamiento" text="Programas y niveles que puedes recorrer en UCAPSA." />
        </View>

        <ServiceCard premium={false} icon="chat" title="1. Cuéntanos qué quieres mejorar" subtitle="Edad, paseo, obediencia, hábitos o convivencia: empieza con orientación directa de UCAPSA." onPress={() => void openExternal(guestWhatsAppUrl)} />
        <ServiceCard premium={false} icon="pets" title="2. Construir las bases" subtitle="UCAPSA School: aprende a comunicarte mejor y trabaja convivencia, hábitos y manejo." onPress={() => void openExternal(schoolUrl)} />
        <ServiceCard premium={false} icon="school" title="3. Entrenar y avanzar" subtitle="Entrenamiento guiado con niveles, seguimiento y trabajo en equipo humano-perro." onPress={() => void openExternal(trainingUrl)} />

        <View style={styles.contactCard}>
          <Text style={styles.sectionTitle}>Contacto</Text>
          <Text style={styles.muted}>También puedes conocer UCAPSA por estos canales.</Text>
          <SocialLinksRow premium={false} />
        </View>
      </KeyboardAwareScreen>
    );
  }

  const membershipHero = premium
    ? { eyebrow: 'SOCIO UCAPSA', title: 'Tu membresía UCAPSA', detail: 'Consulta tu credencial, estado y acceso de socio.', icon: 'workspace-premium' as const }
    : membershipLoadFailed
      ? { eyebrow: 'NO VERIFICADO', title: 'Revisa tu membresía', detail: 'No pudimos confirmar el estado actual.', icon: 'cloud-off' as const }
      : membershipStatus === 'active'
        ? { eyebrow: 'MEMBRESÍA', title: 'Membresía vigente', detail: 'Consulta tu credencial y estado actual.', icon: 'workspace-premium' as const }
        : membershipStatus === 'pending'
          ? { eyebrow: 'EN REVISIÓN', title: 'Solicitud de membresía', detail: 'UCAPSA está revisando tu solicitud.', icon: 'hourglass-top' as const }
          : membershipStatus === 'scheduled'
            ? { eyebrow: 'PROGRAMADA', title: 'Tu membresía ya tiene inicio', detail: 'Abre el detalle para consultar la fecha.', icon: 'event-available' as const }
            : membershipStatus === 'expired'
              ? { eyebrow: 'MEMBRESÍA', title: 'Consulta tu membresía', detail: 'Revisa su estado y tu historial de acceso.', icon: 'history' as const }
              : { eyebrow: 'MEMBRESÍA', title: 'Consulta tu elegibilidad', detail: 'Revisa si ya puedes solicitar membresía UCAPSA.', icon: 'workspace-premium' as const };

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
        eyebrow="Tu acceso"
        title="Servicios"
        subtitle="Membresía, compras y contacto directo con UCAPSA."
        icon="grid-view"
      />

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando...</Text></View> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${membershipHero.eyebrow}. ${membershipHero.title}`}
        style={[styles.membershipHero, premium && styles.membershipHeroPremium]}
        onPress={() => router.push('/client/membership' as never)}
      >
        {premium ? (
          <MemberClubCrest compact />
        ) : (
          <View style={styles.membershipHeroIcon}>
            <MaterialIcons name={membershipHero.icon} size={27} color={ucapsaBrand.colors.redDark} />
          </View>
        )}
        <View style={styles.membershipHeroCopy}>
          <Text style={[styles.membershipHeroEyebrow, premium && styles.membershipHeroEyebrowPremium]}>{membershipHero.eyebrow}</Text>
          <Text style={[styles.membershipHeroTitle, premium && styles.textPremium]}>{membershipHero.title}</Text>
          <Text style={[styles.membershipHeroDetail, premium && styles.mutedPremium]}>{membershipHero.detail}</Text>
        </View>
        <MaterialIcons name="arrow-forward" size={23} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
      </Pressable>

      {premium ? (
        <View style={styles.clubAccessCard}>
          <Text style={styles.clubAccessEyebrow}>TU ACCESO COMO SOCIO</Text>
          <View style={styles.clubAccessGrid}>
            <ClubAccessItem
              icon="badge"
              label="Credencial digital"
              onPress={() => router.push('/client/membership' as never)}
            />
            <ClubAccessItem
              icon="school"
              label="Clases incluidas"
              onPress={() => router.push('/classes' as never)}
            />
            <ClubAccessItem
              icon="history"
              label="Historial de visitas"
              onPress={() => router.push('/client/member-visits' as never)}
            />
          </View>
        </View>
      ) : null}

      <Text style={[styles.sectionEyebrow, premium && styles.sectionEyebrowPremium]}>MÁS SERVICIOS</Text>

      <ServiceCard
        premium={premium}
        icon="shopping-bag"
        title="Compras y consultas"
        subtitle="Pregunta por productos, disponibilidad u otros servicios directamente con UCAPSA."
        onPress={() => void Linking.openURL(whatsappUrl).catch(() => Alert.alert('No se pudo abrir WhatsApp', 'Revisa tu conexión e intenta de nuevo.'))}
      />

      <View style={[styles.contactCard, premium && styles.cardPremium]}>
        <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Contacto</Text>
        <Text style={[styles.muted, premium && styles.mutedPremium]}>Elige el canal que prefieras.</Text>
        <SocialLinksRow premium={premium} />
      </View>
    </KeyboardAwareScreen>
  );
}

function GuestProof({ icon, title, text }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.guestProofRow}>
      <View style={styles.guestProofIcon}><MaterialIcons name={icon} size={20} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.guestProofTitle}>{title}</Text>
        <Text style={styles.guestProofText}>{text}</Text>
      </View>
    </View>
  );
}

function ClubAccessItem({ icon, label, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.clubAccessItem, pressed && styles.clubAccessItemPressed]}
    >
      <View style={styles.clubAccessIcon}>
        <MaterialIcons name={icon} size={18} color={ucapsaBrand.colors.premiumActionText} />
      </View>
      <Text style={styles.clubAccessLabel}>{label}</Text>
    </Pressable>
  );
}

function ServiceCard({ premium, icon, title, subtitle, onPress }: { premium: boolean; icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} style={[styles.card, premium && styles.cardPremium]} onPress={onPress}>
      <View style={[styles.iconBox, premium && styles.iconBoxPremium]}><MaterialIcons name={icon} size={24} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} /></View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, premium && styles.textPremium]}>{title}</Text>
        <Text style={[styles.cardSubtitle, premium && styles.mutedPremium]}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { gap: 4, marginBottom: 16 },
  headerPremium: { marginBottom: 12 },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { fontSize: 30, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 },
  membershipHero: { minHeight: 138, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 28, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, padding: 17, marginBottom: 14 },
  membershipHeroPremium: { borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumSurface, shadowColor: ucapsaBrand.colors.redDeep, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  membershipHeroIcon: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  membershipHeroIconPremium: { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  membershipHeroCopy: { flex: 1, minWidth: 0 },
  membershipHeroEyebrow: { color: ucapsaBrand.colors.redDark, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.0 },
  membershipHeroEyebrowPremium: { color: ucapsaBrand.colors.premiumAction },
  membershipHeroTitle: { color: ucapsaBrand.colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900', marginTop: 2 },
  membershipHeroDetail: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  clubAccessCard: { gap: 10, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumHero, padding: 14, marginBottom: 18 },
  clubAccessEyebrow: { color: ucapsaBrand.colors.premiumAction, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.0 },
  clubAccessGrid: { flexDirection: 'row', gap: 8 },
  clubAccessItem: { flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, paddingHorizontal: 8, paddingVertical: 10 },
  clubAccessItemPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  clubAccessIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  clubAccessLabel: { color: ucapsaBrand.colors.premiumText, textAlign: 'center', fontSize: 10, lineHeight: 13, fontWeight: '900' },
  sectionEyebrow: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.0, marginBottom: 9, marginTop: 2 },
  sectionEyebrowPremium: { color: ucapsaBrand.colors.premiumAction },
  guestProofCard: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 12 },
  guestProofRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guestProofIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  guestProofTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  guestProofText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 1 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 12 },
  cardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  iconBox: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  iconBoxPremium: { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  cardText: { flex: 1 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  cardSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 2 },
  contactCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
});