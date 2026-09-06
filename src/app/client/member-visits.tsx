import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyMemberVisits } from '../../services/client-activity.service';
import type { MemberVisit } from '../../types/app.types';

function formatVisitDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MemberVisitsScreen() {
  const { user, role, isAdmin } = useSession();
  const [visits, setVisits] = useState<MemberVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    try {
      setVisits(await getMyMemberVisits(user.id));
    } catch {
      setError('No pudimos cargar tus visitas de socio.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;
  if (format.key !== 'member') return <Redirect href="/home" />;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = visits.filter((item) => item.visit_date?.startsWith(monthKey)).length;

  return (
    <KeyboardAwareScreen
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="services" />
      <ClientPageHeader
        format={format}
        eyebrow="Actividad de socio"
        title="Tus visitas"
        subtitle="Cada entrada registrada como socio, separada de tus asistencias a clase."
        icon="badge"
      />

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.summaryValue, { color: format.cardText }]}>{visits.length}</Text>
          <Text style={[styles.summaryLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>visitas totales</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.summaryValue, { color: format.cardText }]}>{thisMonth}</Text>
          <Text style={[styles.summaryLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>este mes</Text>
        </View>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando visitas...</Text></View> : null}
      {error ? <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><MaterialIcons name="error-outline" size={25} color={format.accentDark} /><Text style={[styles.stateTitle, { color: format.cardText }]}>{error}</Text></View> : null}

      {!loading && !error && visits.length === 0 ? (
        <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="badge" size={28} color={format.accentDark} />
          <Text style={[styles.stateTitle, { color: format.cardText }]}>Aún no hay visitas registradas</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cuando uses tu acceso de socio, tus visitas aparecerán aquí.</Text>
        </View>
      ) : null}

      {visits.length > 0 ? (
        <View style={styles.list}>
          <Text style={[styles.sectionTitle, { color: format.text }]}>Historial</Text>
          {visits.map((visit) => (
            <View key={visit.id} style={[styles.visitRow, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
              <View style={[styles.visitIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="login" size={19} color={format.pillText} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.visitTitle, { color: format.cardText }]}>{formatVisitDate(visit.visited_at)}</Text>
                <Text style={[styles.visitMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{visit.source === 'qr_member' ? 'Acceso con QR de socio' : 'Registro UCAPSA'}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, minHeight: 104, justifyContent: 'center', borderWidth: 1, borderRadius: 22, padding: 15 },
  summaryValue: { fontSize: 31, lineHeight: 34, fontWeight: '900' },
  summaryLabel: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  stateCard: { gap: 8, borderWidth: 1, borderRadius: 22, padding: 18 },
  stateTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  list: { gap: 9 },
  sectionTitle: { fontSize: 20, lineHeight: 24, fontWeight: '900', marginBottom: 2 },
  visitRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 19, padding: 13 },
  visitIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  visitTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900' },
  visitMeta: { marginTop: 3, fontSize: 11, lineHeight: 15, fontWeight: '700' },
});
