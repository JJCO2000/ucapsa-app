import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { MemberClubCrest } from '../../components/domain/MemberClubCrest';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { clientReadKeys, createMembershipOfflineSummary, readClientResource, writeClientResource, type MembershipOfflineSummary } from '../../services/client-read-cache.service';
import { getMembershipEffectiveStatus, getMyMembership, type MembershipEffectiveStatus } from '../../services/memberships.service';
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
  const cacheScopeRef = useRef<string | null>(null);
  const loadRunRef = useRef(0);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    const scope = user?.id ?? (isAdmin ? 'admin' : 'public');

    if (cacheScopeRef.current !== scope) {
      cacheScopeRef.current = scope;
      setMembershipStatus(null);
      setLoading(Boolean(user));
      setUsingSavedData(false);
      setSavedAt(null);
      setMembershipLoadFailed(false);
    }

    if (!user || isAdmin) {
      if (isCurrentRun()) {
        setMembershipStatus(null);
        setLoading(false);
      }
      return;
    }

    if (!isCurrentRun()) return;
    setUsingSavedData(false);
    setMembershipLoadFailed(false);
    const cached = await readClientResource<MembershipOfflineSummary>(user.id, clientReadKeys.membership);
    if (!isCurrentRun()) return;
    if (cached) {
      setMembershipStatus(getMembershipEffectiveStatus(cached.data.status ? {
        status: cached.data.status,
        start_date: cached.data.start_date,
      } : null));
      setSavedAt(cached.saved_at);
      setLoading(false);
    }

    try {
      const membership = await withOperationTimeout(getMyMembership(), DEFAULT_READ_TIMEOUT_MS, 'services-membership');
      if (!isCurrentRun()) return;
      setMembershipStatus(getMembershipEffectiveStatus(membership));
      const stored = await writeClientResource(user.id, clientReadKeys.membership, createMembershipOfflineSummary(membership));
      if (!isCurrentRun()) return;
      setSavedAt(stored.saved_at);
    } catch {
      if (!isCurrentRun()) return;
      if (cached) setUsingSavedData(true);
      else setMembershipLoadFailed(true);
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => {
      loadRunRef.current += 1;
    };
  }, [load]));

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

        <GuestServiceCard icon="chat" title="1. Cuéntanos qué quieres mejorar" subtitle="Edad, paseo, obediencia, hábitos o convivencia: empieza con orientación directa de UCAPSA." onPress={() => void openExternal(guestWhatsAppUrl)} />
        <GuestServiceCard icon="pets" title="2. Construir las bases" subtitle="UCAPSA School: aprende a comunicarte mejor y trabaja convivencia, hábitos y manejo." onPress={() => void openExternal(schoolUrl)} />
        <GuestServiceCard icon="school" title="3. Entrenar y avanzar" subtitle="Entrenamiento guiado con niveles, seguimiento y trabajo en equipo humano-perro." onPress={() => void openExternal(trainingUrl)} />
        <GuestServiceCard icon="restaurant-menu" title="Menú del restaurante" subtitle="Consulta alimentos, bebidas, precios y disponibilidad." onPress={() => router.push('/restaurant' as never)} />
        <GuestServiceCard icon="rate-review" title="Escribir reseña en Google" subtitle="Ordena tu experiencia, copia el texto y abre Google Maps." onPress={() => router.push('/reviews' as never)} />

        <SocialLinksRow title="Contacto" subtitle="Sitio web y redes oficiales de UCAPSA." premium={false} />
      </KeyboardAwareScreen>
    );
  }

  const membershipHero = premium
    ? { eyebrow: 'SOCIO UCAPSA', title: 'Tu membresía', detail: 'Credencial, estado y acceso de socio.', icon: 'workspace-premium' as const }
    : membershipLoadFailed
      ? { eyebrow: 'NO VERIFICADO', title: 'Revisa tu membresía', detail: 'No pudimos confirmar el estado actual.', icon: 'cloud-off' as const }
      : membershipStatus === 'active'
        ? { eyebrow: 'MEMBRESÍA', title: 'Tu membresía', detail: 'Credencial y acceso UCAPSA.', icon: 'workspace-premium' as const }
        : membershipStatus === 'pending'
          ? { eyebrow: 'EN REVISIÓN', title: 'Solicitud de membresía', detail: 'UCAPSA está revisando tu solicitud.', icon: 'hourglass-top' as const }
          : membershipStatus === 'scheduled'
            ? { eyebrow: 'PROGRAMADA', title: 'Tu membresía ya tiene inicio', detail: 'Consulta la fecha y el detalle.', icon: 'event-available' as const }
            : membershipStatus === 'expired'
              ? { eyebrow: 'MEMBRESÍA', title: 'Consulta tu membresía', detail: 'Revisa su estado y tu historial de acceso.', icon: 'history' as const }
              : { eyebrow: 'MEMBRESÍA', title: 'Consulta tu elegibilidad', detail: 'Revisa si ya puedes solicitarla.', icon: 'workspace-premium' as const };

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="services" />
      <CompactServicesHeader premium={premium} accent={format.accent} muted={format.muted} />

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: format.muted }]}>Actualizando acceso...</Text>
        </View>
      ) : null}

      <MembershipCard
        premium={premium}
        eyebrow={membershipHero.eyebrow}
        title={membershipHero.title}
        detail={membershipHero.detail}
        icon={membershipHero.icon}
        onPress={() => router.push('/client/membership' as never)}
      />

      {premium ? (
        <View style={styles.memberAccessSection}>
          <Text style={styles.memberAccessEyebrow}>TU ACCESO DE SOCIO</Text>
          <View style={styles.memberAccessGrid}>
            <MemberShortcut icon="badge" label="Credencial" onPress={() => router.push('/client/membership' as never)} />
            <MemberShortcut icon="emoji-events" label="Competencia" onPress={() => router.push('/dog' as never)} />
            <MemberShortcut icon="history" label="Visitas" onPress={() => router.push('/client/member-visits' as never)} />
          </View>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, premium && styles.sectionTitlePremium]}>Más en UCAPSA</Text>

      <ServiceRow
        premium={premium}
        icon="restaurant-menu"
        title="Menú del restaurante"
        subtitle="Alimentos, bebidas, precios y disponibilidad."
        onPress={() => router.push('/restaurant' as never)}
      />
      <ServiceRow
        premium={premium}
        icon="shopping-bag"
        title="Compras y consultas"
        subtitle="Productos, disponibilidad y atención directa por WhatsApp."
        onPress={() => void openExternal(whatsappUrl)}
      />
      <ServiceRow
        premium={premium}
        icon="rate-review"
        title="Escribir reseña en Google"
        subtitle="Ordena tu experiencia; tú decides el texto final."
        onPress={() => router.push('/reviews' as never)}
      />

      <View style={styles.socialSection}>
        <SocialLinksRow title="Canales oficiales" subtitle="WhatsApp, sitio web y redes de UCAPSA." premium={premium} />
      </View>
    </KeyboardAwareScreen>
  );
}

function CompactServicesHeader({ premium, accent, muted }: { premium: boolean; accent: string; muted: string }) {
  return (
    <View style={styles.compactHeader}>
      <View style={[styles.compactHeaderIcon, premium && styles.compactHeaderIconPremium]}>
        <MaterialIcons name="grid-view" size={22} color={accent} />
      </View>
      <View style={styles.compactHeaderCopy}>
        <Text style={[styles.compactHeaderTitle, premium && styles.textPremium]}>Servicios</Text>
        <Text style={[styles.compactHeaderSubtitle, { color: muted }]}>Tu membresía y accesos UCAPSA</Text>
      </View>
    </View>
  );
}

function MembershipCard({ premium, eyebrow, title, detail, icon, onPress }: {
  premium: boolean;
  eyebrow: string;
  title: string;
  detail: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}. ${title}`}
      style={({ pressed }) => [styles.membershipCard, premium && styles.membershipCardPremium, pressed && styles.pressed]}
      onPress={onPress}
    >
      {premium ? (
        <MemberClubCrest compact />
      ) : (
        <View style={styles.membershipIcon}>
          <MaterialIcons name={icon} size={24} color={ucapsaBrand.colors.redDark} />
        </View>
      )}
      <View style={styles.membershipCopy}>
        <Text style={[styles.membershipEyebrow, premium && styles.membershipEyebrowPremium]}>{eyebrow}</Text>
        <Text style={[styles.membershipTitle, premium && styles.textPremium]}>{title}</Text>
        <Text style={[styles.membershipDetail, premium && styles.mutedPremium]}>{detail}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

function MemberShortcut({ icon, label, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.memberShortcut, pressed && styles.pressed]}
    >
      <View style={styles.memberShortcutIcon}>
        <MaterialIcons name={icon} size={18} color={ucapsaBrand.colors.premiumActionText} />
      </View>
      <Text style={styles.memberShortcutLabel}>{label}</Text>
    </Pressable>
  );
}

function ServiceRow({ premium, icon, title, subtitle, onPress }: {
  premium: boolean;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.serviceRow, premium && styles.cardPremium, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.serviceIcon, premium && styles.serviceIconPremium]}>
        <MaterialIcons name={icon} size={21} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
      </View>
      <View style={styles.serviceCopy}>
        <Text style={[styles.serviceTitle, premium && styles.textPremium]}>{title}</Text>
        <Text style={[styles.serviceSubtitle, premium && styles.mutedPremium]}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
    </Pressable>
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

function GuestServiceCard({ icon, title, subtitle, onPress }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} style={styles.guestServiceCard} onPress={onPress}>
      <View style={styles.guestServiceIcon}><MaterialIcons name={icon} size={24} color={ucapsaBrand.colors.redDark} /></View>
      <View style={styles.serviceCopy}>
        <Text style={styles.serviceTitle}>{title}</Text>
        <Text style={styles.serviceSubtitle}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
  compactHeaderIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder },
  compactHeaderIconPremium: { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderColor: ucapsaBrand.colors.premiumBorder },
  compactHeaderCopy: { flex: 1, minWidth: 0 },
  compactHeaderTitle: { color: ucapsaBrand.colors.text, fontSize: 27, lineHeight: 31, fontWeight: '900' },
  compactHeaderSubtitle: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 1 },
  loading: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 8 },
  muted: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  membershipCard: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 13 },
  membershipCardPremium: { borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumSurface, shadowColor: ucapsaBrand.colors.redDeep, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  membershipIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  membershipCopy: { flex: 1, minWidth: 0 },
  membershipEyebrow: { color: ucapsaBrand.colors.redDark, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1 },
  membershipEyebrowPremium: { color: ucapsaBrand.colors.premiumAction },
  membershipTitle: { color: ucapsaBrand.colors.text, fontSize: 18, lineHeight: 22, fontWeight: '900', marginTop: 1 },
  membershipDetail: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  memberAccessSection: { gap: 8, marginBottom: 17 },
  memberAccessEyebrow: { color: ucapsaBrand.colors.premiumAction, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1 },
  memberAccessGrid: { flexDirection: 'row', gap: 8 },
  memberShortcut: { flex: 1, minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, paddingHorizontal: 6, paddingVertical: 8 },
  memberShortcutIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  memberShortcutLabel: { color: ucapsaBrand.colors.premiumText, textAlign: 'center', fontSize: 10, lineHeight: 12, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.redDark, fontSize: 12, lineHeight: 16, fontWeight: '900', marginBottom: 8, marginTop: 1 },
  sectionTitlePremium: { color: ucapsaBrand.colors.premiumAction },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 9 },
  cardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  serviceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  serviceIconPremium: { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceTitle: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  serviceSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 1 },
  socialSection: { marginTop: 3 },
  guestProofCard: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 12 },
  guestProofRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guestProofIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  guestProofTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  guestProofText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 1 },
  guestServiceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 12 },
  guestServiceIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
});