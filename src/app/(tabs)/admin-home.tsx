import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getAdminMembershipRows } from '../../services/memberships.service';
import { getAdminTrainingDecisionRows } from '../../services/admin-training-decisions.service';
import { getAdminPaymentAttentionRows } from '../../services/payments.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type DashboardStats = {
  pendingRequests: number;
  paymentAttention: number;
  trainingDecisions: number;
};

const emptyStats: DashboardStats = {
  pendingRequests: 0,
  paymentAttention: 0,
  trainingDecisions: 0,
};

export default function AdminHomeTab() {
  const { user, profile, role, isAdmin } = useSession();
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const displayName = useMemo(
    () => profile?.full_name?.trim() || user?.email || 'Administrador',
    [profile?.full_name, user?.email],
  );
  const roleLabel = role === 'super_admin' ? 'Superadmin' : 'Admin';
  const pendingTotal = stats.trainingDecisions + stats.pendingRequests + stats.paymentAttention;

  const load = useCallback(async () => {
    if (!isAdmin) return;

    setError(null);
    const [memberships, paymentAttentionRows, trainingDecisions] = await withOperationTimeout(
      Promise.all([
        getAdminMembershipRows(),
        getAdminPaymentAttentionRows(),
        getAdminTrainingDecisionRows(),
      ]),
      DEFAULT_READ_TIMEOUT_MS,
      'admin-home-load',
    );

    const attentionUsers = new Set(paymentAttentionRows.map((row) => row.userId));
    for (const row of memberships) {
      if (row.membership.current_payment_status === 'pending') attentionUsers.add(row.membership.user_id);
    }

    setStats({
      pendingRequests: memberships.filter((item) => item.membership.status === 'pending').length,
      paymentAttention: attentionUsers.size,
      trainingDecisions: trainingDecisions.length,
    });
    setHasData(true);
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load()
      .catch(() => setError(friendlyReadError('No se pudo actualizar el resumen administrativo.')))
      .finally(() => setLoading(false));
    return undefined;
  }, [isAdmin, load]));

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch {
      setError(friendlyReadError('No se pudo actualizar el resumen administrativo.'));
    } finally {
      setRefreshing(false);
    }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{roleLabel}</Text>
            <Text style={styles.title}>Hola, {displayName.split(' ')[0]}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir herramientas y configuración"
            style={styles.toolsButton}
            onPress={() => router.push('/admin-more' as never)}
          >
            <MaterialIcons name="settings" size={21} color={ucapsaBrand.colors.surface} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Inicio sólo muestra lo que necesita una decisión tuya.</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Buscando pendientes...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>No se pudo actualizar</Text>
          <Text style={styles.muted}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void refresh()}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>HOY</Text>
          <Text style={styles.sectionTitle}>Requiere tu intervención</Text>
        </View>
        {hasData && pendingTotal > 0 ? (
          <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>{pendingTotal}</Text></View>
        ) : null}
      </View>

      {hasData && pendingTotal > 0 ? (
        <View style={styles.decisionList}>
          {stats.trainingDecisions > 0 ? (
            <DecisionCard
              icon="task-alt"
              title="Listos para evaluar"
              detail="Tarjetas completas esperando tu decisión de nivel."
              value={stats.trainingDecisions}
              onPress={() => router.push('/admin/training-decisions' as never)}
            />
          ) : null}
          {stats.paymentAttention > 0 ? (
            <DecisionCard
              icon="payments"
              title="Pagos por revisar"
              detail="Clientes con saldo, pago pendiente o seguimiento necesario."
              value={stats.paymentAttention}
              onPress={() => router.push('/admin-payments' as never)}
            />
          ) : null}
          {stats.pendingRequests > 0 ? (
            <DecisionCard
              icon="workspace-premium"
              title="Solicitudes de socio"
              detail="Membresías pendientes de una resolución administrativa."
              value={stats.pendingRequests}
              onPress={() => router.push('/admin/members?filter=pending_requests' as never)}
            />
          ) : null}
        </View>
      ) : hasData && !loading ? (
        <View style={styles.allClear}>
          <View style={styles.allClearIcon}>
            <MaterialIcons name="check-circle" size={28} color={ucapsaBrand.colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.allClearTitle}>Todo al día</Text>
            <Text style={styles.allClearText}>No hay decisiones pendientes en clases, pagos o membresías.</Text>
          </View>
        </View>
      ) : !loading && !error ? (
        <Text style={styles.muted}>Aún no hay un resumen confirmado.</Text>
      ) : null}

      <View style={styles.domainHint}>
        <MaterialIcons name="apps" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.domainHintText}>
          Para consultar o administrar información, usa Clientes, Clases, Pagos o Comunicación.
        </Text>
      </View>
    </KeyboardAwareScreen>
  );
}

function DecisionCard({
  icon,
  title,
  detail,
  value,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
  value: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.decisionCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.decisionIcon}>
        <MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.decisionTitle}>{title}</Text>
        <Text style={styles.decisionDetail}>{detail}</Text>
      </View>
      <View style={styles.decisionCount}><Text style={styles.decisionCountText}>{value}</Text></View>
      <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: ucapsaBrand.colors.red,
    borderRadius: 26,
    padding: 20,
    gap: 7,
    marginBottom: 20,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: {
    color: ucapsaBrand.colors.redSoftStrong,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: { color: ucapsaBrand.colors.surface, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.redSoft, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  toolsButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redDark,
  },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  errorBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.dangerBorder,
    backgroundColor: ucapsaBrand.colors.dangerSoft,
    padding: 14,
    gap: 6,
    marginBottom: 14,
  },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: ucapsaBrand.colors.red,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  retryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  sectionEyebrow: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900', marginTop: 2 },
  pendingBadge: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  pendingBadgeText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  decisionList: { gap: 9 },
  decisionCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    padding: 13,
  },
  decisionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  decisionTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  decisionDetail: {
    color: ucapsaBrand.colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  decisionCount: {
    minWidth: 34,
    minHeight: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.goldPale,
  },
  decisionCountText: { color: ucapsaBrand.colors.goldDark, fontSize: 13, fontWeight: '900' },
  allClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.successBorder,
    backgroundColor: ucapsaBrand.colors.successSoft,
    padding: 16,
  },
  allClearIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.surface,
  },
  allClearTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  allClearText: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  domainHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: ucapsaBrand.colors.surfaceSubtle,
    padding: 12,
  },
  domainHintText: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
