import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMembershipStatusLabel, getMyMembership } from '../../services/memberships.service';
import type { Membership } from '../../types/app.types';

const whatsappUrl = ucapsaBrand.socialLinks.find((item) => item.key === 'whatsapp')?.url ?? 'https://wa.me/525522410679';

export default function ServicesTab() {
  const { user, isAdmin } = useSession();
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

  if (isAdmin) return <Redirect href="/admin-more" />;

  const membershipText = !user
    ? 'Inicia sesion para consultar o solicitar tu membresia.'
    : membership
      ? `Estado: ${getMembershipStatusLabel(membership.status)}`
      : 'Consulta requisitos y solicita revision cuando corresponda.';

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>UCAPSA</Text>
        <Text style={styles.title}>Servicios</Text>
        <Text style={styles.subtitle}>Entra solo a lo que necesitas. Clases y pagos tienen su propia seccion.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}

      <Pressable style={styles.card} onPress={() => router.push((user ? '/client/membership' : '/auth/login') as never)}>
        <View style={styles.iconBox}><MaterialIcons name="badge" size={24} color={ucapsaBrand.colors.redDark} /></View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Membresia</Text>
          <Text style={styles.cardSubtitle}>{membershipText}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
      </Pressable>

      <Pressable style={styles.card} onPress={() => void Linking.openURL(whatsappUrl)}>
        <View style={styles.iconBox}><MaterialIcons name="shopping-bag" size={24} color={ucapsaBrand.colors.redDark} /></View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Compras y consultas</Text>
          <Text style={styles.cardSubtitle}>Pregunta por productos, disponibilidad u otros servicios directamente con UCAPSA.</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
      </Pressable>

      <View style={styles.contactCard}>
        <Text style={styles.sectionTitle}>Contacto</Text>
        <Text style={styles.muted}>Elige el canal que prefieras.</Text>
        <SocialLinksRow premium={false} />
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 16, marginBottom: 12 },
  iconBox: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  cardSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  contactCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 16, marginTop: 2 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
});
