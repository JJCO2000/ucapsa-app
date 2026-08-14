import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMembershipStatusLabel, getMyMembership } from '../../services/memberships.service';
import type { Membership } from '../../types/app.types';

const whatsappUrl = ucapsaBrand.socialLinks.find((item) => item.key === 'whatsapp')?.url ?? 'https://wa.me/525522410679';

export default function ServicesTab() {
  const { user, role, isAdmin } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) {
      setMembership(null);
      setLoading(false);
      return;
    }
    setMembership(await getMyMembership());
    setLoading(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus: membership?.status ?? null }),
    [isAdmin, membership?.status, role, user],
  );
  const premium = format.key === 'member';

  if (isAdmin) return <Redirect href="/admin-more" />;
  const membershipText = !user
    ? 'Inicia sesion para consultar o solicitar tu membresia.'
    : membership
      ? `Estado: ${getMembershipStatusLabel(membership.status)}`
      : 'Consulta requisitos y solicita revision cuando corresponda.';

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="services" />
      <View style={[styles.header, premium && styles.headerPremium]}>
        <Text style={[styles.kicker, { color: premium ? '#FFE8B5' : format.accentDark }]}>UCAPSA</Text>
        <Text style={[styles.title, { color: format.text }]}>Servicios</Text>
        <Text style={[styles.subtitle, { color: format.muted }]}>Entra solo a lo que necesitas. Clases y pagos tienen su propia seccion.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando...</Text></View> : null}

      <ServiceCard
        premium={premium}
        icon="badge"
        title="Membresia"
        subtitle={membershipText}
        onPress={() => router.push((user ? '/client/membership' : '/auth/login') as never)}
      />

      <ServiceCard
        premium={premium}
        icon="shopping-bag"
        title="Compras y consultas"
        subtitle="Pregunta por productos, disponibilidad u otros servicios directamente con UCAPSA."
        onPress={() => void Linking.openURL(whatsappUrl)}
      />

      <View style={[styles.contactCard, premium && styles.cardPremium]}>
        <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Contacto</Text>
        <Text style={[styles.muted, premium && styles.mutedPremium]}>Elige el canal que prefieras.</Text>
        <SocialLinksRow premium={premium} />
      </View>
    </KeyboardAwareScreen>
  );
}

function ServiceCard({ premium, icon, title, subtitle, onPress }: { premium: boolean; icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.card, premium && styles.cardPremium]} onPress={onPress}>
      <View style={[styles.iconBox, premium && styles.iconBoxPremium]}><MaterialIcons name={icon} size={24} color={premium ? '#FFE8B5' : ucapsaBrand.colors.redDark} /></View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, premium && styles.textPremium]}>{title}</Text>
        <Text style={[styles.cardSubtitle, premium && styles.mutedPremium]}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={premium ? '#FFE8B5' : ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: '#270711' },
  header: { gap: 4, marginBottom: 16 },
  headerPremium: { marginBottom: 12 },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { fontSize: 30, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  mutedPremium: { color: '#FFE3E8' },
  textPremium: { color: '#FFFFFF' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 16, marginBottom: 12 },
  cardPremium: { backgroundColor: '#38111B', borderColor: 'rgba(250,204,21,0.34)' },
  iconBox: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  iconBoxPremium: { backgroundColor: 'rgba(250,204,21,0.14)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.25)' },
  cardText: { flex: 1 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  cardSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 2 },
  contactCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 16 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
});
