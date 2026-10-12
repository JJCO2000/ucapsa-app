import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { getAdminClassRsvpSummary, tomorrowDateKey, type AdminClassRsvpSummary } from '../../services/class-rsvp.service';
import { getAdminMembershipRows } from '../../services/memberships.service';
import { getAdminClientFollowupRows } from '../../services/admin-client-followups.service';
import { getAdminTrainingDecisionRows } from '../../services/admin-training-decisions.service';
import { getAdminPaymentAttentionRows } from '../../services/payments.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type DashboardStats = {
  pendingRequests: number;
  paymentAttention: number;
  trainingDecisions: number;
  clientFollowups: number;
};

type TomorrowClassGroup = {
  scheduleId: string;
  programCode: string;
  programName: string;
  scheduleName: string;
  startTime: string;
  eligibleCount: number;
  confirmedCount: number;
  declinedCount: number;
  noResponseCount: number;
  levels: Array<{ label: string; eligibleCount: number; confirmedCount: number }>;
};

function commandsLevelLabel(level: string) {
  if (level === 'medio') return 'Intermedio';
  if (level === 'avanzado') return 'Avanzado';
  return 'Básico';
}

function groupTomorrowClasses(rows: AdminClassRsvpSummary[]): TomorrowClassGroup[] {
  const groups = new Map<string, TomorrowClassGroup>();
  for (const row of rows) {
    const key = `${row.scheduleId}:${row.programCode}:${row.startTime}`;
    const existing = groups.get(key);
    const levelLabel = commandsLevelLabel(row.programLevel);
    if (existing) {
      existing.eligibleCount += row.eligibleCount;
      existing.confirmedCount += row.confirmedCount;
      existing.declinedCount += row.declinedCount;
      existing.noResponseCount += row.noResponseCount;
      if (row.programCode === 'comandos') {
        const level = existing.levels.find((item) => item.label === levelLabel);
        if (level) {
          level.eligibleCount += row.eligibleCount;
          level.confirmedCount += row.confirmedCount;
        } else {
          existing.levels.push({ label: levelLabel, eligibleCount: row.eligibleCount, confirmedCount: row.confirmedCount });
        }
      }
      continue;
    }
    groups.set(key, {
      scheduleId: row.scheduleId,
      programCode: row.programCode,
      programName: row.programName,
      scheduleName: row.scheduleName,
      startTime: row.startTime,
      eligibleCount: row.eligibleCount,
      confirmedCount: row.confirmedCount,
      declinedCount: row.declinedCount,
      noResponseCount: row.noResponseCount,
      levels: row.programCode === 'comandos'
        ? [{ label: levelLabel, eligibleCount: row.eligibleCount, confirmedCount: row.confirmedCount }]
        : [],
    });
  }

  const levelOrder = new Map([['Básico', 0], ['Intermedio', 1], ['Avanzado', 2]]);
  return [...groups.values()]
    .map((group) => ({
      ...group,
      levels: [...group.levels].sort((a, b) => (levelOrder.get(a.label) ?? 99) - (levelOrder.get(b.label) ?? 99)),
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.programCode.localeCompare(b.programCode));
}

const emptyStats: DashboardStats = {
  pendingRequests: 0,
  paymentAttention: 0,
  trainingDecisions: 0,
  clientFollowups: 0,
};

export default function AdminHomeTab() {
  const { user, profile, role, isAdmin } = useSession();
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [tomorrowClasses, setTomorrowClasses] = useState<AdminClassRsvpSummary[]>([]);
  const [tomorrowSummaryFailed, setTomorrowSummaryFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const displayName = useMemo(
    () => profile?.full_name?.trim() || user?.email || 'Administrador',
    [profile?.full_name, user?.email],
  );
  const roleLabel = role === 'super_admin' ? 'Superadmin' : 'Admin';
  const pendingTotal = stats.trainingDecisions + stats.pendingRequests + stats.paymentAttention + stats.clientFollowups;
  const groupedTomorrowClasses = useMemo(() => groupTomorrowClasses(tomorrowClasses), [tomorrowClasses]);

  const load = useCallback(async () => {
    if (!isAdmin) return;

    setError(null);
    const [memberships, paymentAttentionRows, trainingDecisions, clientFollowups] = await withOperationTimeout(
      Promise.all([
        getAdminMembershipRows(),
        getAdminPaymentAttentionRows(),
        getAdminTrainingDecisionRows(),
        getAdminClientFollowupRows(),
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
      clientFollowups: clientFollowups.length,
    });

    try {
      const tomorrowSummary = await withOperationTimeout(
        getAdminClassRsvpSummary(),
        DEFAULT_READ_TIMEOUT_MS,
        'admin-home-class-rsvp',
      );
      setTomorrowClasses(tomorrowSummary);
      setTomorrowSummaryFailed(false);
    } catch (cause) {
      devWarn('admin-home: could not load tomorrow class RSVP summary; showing unavailable state.', cause);
      setTomorrowClasses([]);
      setTomorrowSummaryFailed(true);
    }

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

      {/* Atajos de operación frecuentes: siempre accesibles, incluso con pendientes. */}
      <View style={styles.quickAccessRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir Restaurante" style={styles.quickAccessButton} onPress={() => router.push('/admin/restaurant' as never)}>
          <MaterialIcons name="restaurant-menu" size={20} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.quickAccessText}>Restaurante</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir roster de clases" style={styles.quickAccessButton} onPress={() => router.push('/trainer-classes' as never)}>
          <MaterialIcons name="school" size={20} color={ucapsaBrand.colors.blueDark} />
          <Text style={styles.quickAccessText}>Roster</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir exámenes" style={styles.quickAccessButton} onPress={() => router.push('/trainer-exams' as never)}>
          <MaterialIcons name="assignment" size={20} color={ucapsaBrand.colors.greenDark} />
          <Text style={styles.quickAccessText}>Exámenes</Text>
        </Pressable>
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

      <View style={styles.tomorrowSection}>
        <View style={styles.tomorrowHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>MAÑANA</Text>
            <Text style={styles.sectionTitle}>Asistencia esperada</Text>
          </View>
          <View style={styles.tomorrowDatePill}>
            <MaterialIcons name="event" size={15} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.tomorrowDateText}>{tomorrowDateKey()}</Text>
          </View>
        </View>

        {groupedTomorrowClasses.length > 0 ? (
          <View style={styles.tomorrowList}>
            {groupedTomorrowClasses.map((item) => {
              const commands = item.programCode === 'comandos';
              return (
                <Pressable
                  key={`${item.scheduleId}:${item.programCode}:${item.startTime}`}
                  style={styles.tomorrowRow}
                  onPress={() => router.push(`/admin/classes?program=${encodeURIComponent(item.programCode)}&status=active` as never)}
                >
                  <View style={[
                    styles.tomorrowIcon,
                    { backgroundColor: item.programCode === 'puppy' ? ucapsaBrand.colors.goldPale : ucapsaBrand.colors.purpleSoft },
                  ]}>
                    <MaterialIcons
                      name={item.programCode === 'puppy' ? 'pets' : 'school'}
                      size={20}
                      color={item.programCode === 'puppy' ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.purpleDark}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.tomorrowProgram}>{item.programCode === 'puppy' ? 'Puppy' : 'Comandos'}</Text>
                    <Text style={styles.tomorrowConfirmed}>
                      {item.confirmedCount} / {item.eligibleCount} a las {item.startTime} confirmados
                    </Text>
                    {commands && item.levels.length > 0 ? (
                      <Text style={styles.tomorrowLevels}>
                        {item.levels.map((level) => `${level.label} ${level.confirmedCount}/${level.eligibleCount}`).join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={styles.tomorrowMeta}>
                      {item.declinedCount} no irá · {item.noResponseCount} sin responder
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
                </Pressable>
              );
            })}
          </View>
        ) : tomorrowSummaryFailed ? (
          <View style={styles.tomorrowEmpty}>
            <MaterialIcons name="cloud-off" size={20} color={ucapsaBrand.colors.muted} />
            <Text style={styles.tomorrowEmptyText}>No se pudo actualizar la asistencia esperada.</Text>
          </View>
        ) : !loading ? (
          <View style={styles.tomorrowEmpty}>
            <MaterialIcons name="event-busy" size={20} color={ucapsaBrand.colors.muted} />
            <Text style={styles.tomorrowEmptyText}>No hay clases programadas mañana.</Text>
          </View>
        ) : null}
      </View>

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
          {stats.clientFollowups > 0 ? (
            <DecisionCard
              icon="priority-high"
              title="Seguimiento de clientes"
              detail="Perros con Puppy terminado sin continuidad o 30 días sin asistencia."
              value={stats.clientFollowups}
              tone="danger"
              onPress={() => router.push('/admin/client-followups' as never)}
            />
          ) : null}
          {stats.trainingDecisions > 0 ? (
            <DecisionCard
              icon="task-alt"
              title="Listos para evaluar"
              detail="Tarjetas completas esperando tu decisión de nivel."
              value={stats.trainingDecisions}
              tone="success"
              onPress={() => router.push('/admin/training-decisions' as never)}
            />
          ) : null}
          {stats.paymentAttention > 0 ? (
            <DecisionCard
              icon="payments"
              title="Pagos por revisar"
              detail="Clientes con saldo, pago pendiente o seguimiento necesario."
              value={stats.paymentAttention}
              tone="warning"
              onPress={() => router.push('/admin-payments' as never)}
            />
          ) : null}
          {stats.pendingRequests > 0 ? (
            <DecisionCard
              icon="workspace-premium"
              title="Solicitudes de socio"
              detail="Membresías pendientes de una resolución administrativa."
              value={stats.pendingRequests}
              tone="purple"
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
  tone = 'default',
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
  value: number;
  onPress: () => void;
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'purple';
}) {
  const palette = tone === 'danger'
    ? { bg: ucapsaBrand.colors.dangerSoft, border: ucapsaBrand.colors.dangerBorder, iconBg: ucapsaBrand.colors.danger, icon: ucapsaBrand.colors.surface, countBg: ucapsaBrand.colors.danger, count: ucapsaBrand.colors.surface }
    : tone === 'warning'
      ? { bg: ucapsaBrand.colors.goldPale, border: ucapsaBrand.colors.gold, iconBg: ucapsaBrand.colors.gold, icon: ucapsaBrand.colors.goldDark, countBg: ucapsaBrand.colors.gold, count: ucapsaBrand.colors.goldDark }
      : tone === 'success'
        ? { bg: ucapsaBrand.colors.successSoft, border: ucapsaBrand.colors.successBorder, iconBg: ucapsaBrand.colors.success, icon: ucapsaBrand.colors.surface, countBg: ucapsaBrand.colors.success, count: ucapsaBrand.colors.surface }
        : tone === 'purple'
          ? { bg: ucapsaBrand.colors.purpleSoft, border: ucapsaBrand.colors.purple, iconBg: ucapsaBrand.colors.purple, icon: ucapsaBrand.colors.surface, countBg: ucapsaBrand.colors.purple, count: ucapsaBrand.colors.surface }
          : { bg: ucapsaBrand.colors.surface, border: ucapsaBrand.colors.border, iconBg: ucapsaBrand.colors.redSoft, icon: ucapsaBrand.colors.redDark, countBg: ucapsaBrand.colors.goldPale, count: ucapsaBrand.colors.goldDark };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.decisionCard,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={[styles.decisionIcon, { backgroundColor: palette.iconBg }]}>
        <MaterialIcons name={icon} size={22} color={palette.icon} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.decisionTitle}>{title}</Text>
        <Text style={styles.decisionDetail}>{detail}</Text>
      </View>
      <View style={[styles.decisionCount, { backgroundColor: palette.countBg }]}>
        <Text style={[styles.decisionCountText, { color: palette.count }]}>{value}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={palette.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quickAccessRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  quickAccessButton: { flex: 1, minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 3 },
  quickAccessText: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900' },
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
  tomorrowSection: { marginBottom: 20 },
  tomorrowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  tomorrowDatePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 9, paddingVertical: 6 },
  tomorrowDateText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  tomorrowList: { gap: 8 },
  tomorrowRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  tomorrowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tomorrowProgram: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  tomorrowConfirmed: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900', marginTop: 2 },
  tomorrowLevels: { color: ucapsaBrand.colors.purpleDark, fontSize: 10, lineHeight: 14, fontWeight: '900', marginTop: 3 },
  tomorrowMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '800', marginTop: 2 },
  tomorrowEmpty: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  tomorrowEmptyText: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '800' },
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
  decisionCardDanger: {
    borderColor: ucapsaBrand.colors.dangerBorder,
    backgroundColor: ucapsaBrand.colors.dangerSoft,
  },
  decisionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  decisionIconDanger: { backgroundColor: ucapsaBrand.colors.danger },
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
  decisionCountDanger: { backgroundColor: ucapsaBrand.colors.danger },
  decisionCountText: { color: ucapsaBrand.colors.goldDark, fontSize: 13, fontWeight: '900' },
  decisionCountTextDanger: { color: ucapsaBrand.colors.surface },
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
