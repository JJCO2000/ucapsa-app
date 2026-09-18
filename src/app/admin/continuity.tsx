import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminContinuityObservations,
  summarizeContinuity,
  summarizeContinuityCohort30,
  summarizeContinuityWindow,
  type ContinuityObservation,
  type ContinuityWindowDays,
} from '../../services/continuity-evidence.service';

type SeasonOption = {
  id: string;
  name: string;
  status: string | null;
};

function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function percentLabel(part: number, total: number) {
  if (total <= 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

function membershipLabel(status: string | null | undefined) {
  if (status === 'active') return 'Activa';
  if (status === 'cancelled') return 'Cancelada';
  if (status === 'expired') return 'Expirada';
  if (status === 'pending') return 'Pendiente';
  if (status === 'rejected') return 'Rechazada';
  return status || 'Sin membresía';
}

export default function AdminContinuityScreen() {
  const [rows, setRows] = useState<ContinuityObservation[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<ContinuityWindowDays>(30);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await getAdminContinuityObservations();
      setRows(next);
      setSelectedSeasonId((current) => {
        if (current && next.some((row) => row.season_id === current)) return current;
        return next.find((row) => row.season_status === 'active')?.season_id
          ?? next.find((row) => row.season_status === 'reopened')?.season_id
          ?? next[0]?.season_id
          ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la evidencia de continuidad.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const seasons = useMemo<SeasonOption[]>(() => {
    const map = new Map<string, SeasonOption>();
    for (const row of rows) {
      if (!row.season_id || map.has(row.season_id)) continue;
      map.set(row.season_id, {
        id: row.season_id,
        name: row.season_name || 'Temporada',
        status: row.season_status,
      });
    }
    return [...map.values()];
  }, [rows]);

  const visibleRows = useMemo(
    () => rows.filter((row) => row.season_id === selectedSeasonId),
    [rows, selectedSeasonId],
  );
  const summary = useMemo(() => summarizeContinuity(visibleRows), [visibleRows]);
  const windowSummary = useMemo(
    () => summarizeContinuityWindow(visibleRows, windowDays),
    [visibleRows, windowDays],
  );
  const cohortSummary = useMemo(() => summarizeContinuityCohort30(visibleRows), [visibleRows]);

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Sostener y mantener</Text>
        <Text style={styles.title}>Continuidad</Text>
        <Text style={styles.subtitle}>
          Evidencia para estudiar si hacer visible el valor se asocia con actividad y pago posteriores.
        </Text>
      </View>

      <View style={styles.methodCard}>
        <MaterialIcons name="science" size={21} color={ucapsaBrand.colors.redDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.methodTitle}>Lectura observacional</Text>
          <Text style={styles.muted}>
            Esto no demuestra causalidad. “Posterior” empieza al día siguiente de la primera exposición para no atribuir actividad previa del mismo día.
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Actualizando evidencia…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error ? (
        <>
          {seasons.length > 0 ? (
            <View style={styles.pills}>
              {seasons.map((season) => {
                const selected = season.id === selectedSeasonId;
                return (
                  <Pressable
                    key={season.id}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => setSelectedSeasonId(season.id)}
                  >
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{season.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {visibleRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="insights" size={27} color={ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>Todavía no hay observaciones</Text>
                <Text style={styles.muted}>
                  La medición empieza cuando exista población en una temporada y los clientes vean su Nivel de Constancia.
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Qué podemos observar</Text>
              <View style={styles.metricsGrid}>
                <MetricCard
                  label="Clientes observados"
                  value={String(summary.observedCustomers)}
                  detail="cliente + temporada"
                  icon="people"
                />
                <MetricCard
                  label="Exposición registrada"
                  value={String(summary.exposedCustomers)}
                  detail={percentLabel(summary.exposedCustomers, summary.observedCustomers)}
                  icon="visibility"
                />
                <MetricCard
                  label="Actividad posterior"
                  value={String(summary.activityAfterExposure)}
                  detail={percentLabel(summary.activityAfterExposure, summary.exposedCustomers)}
                  icon="directions-run"
                />
                <MetricCard
                  label="Mensualidad posterior"
                  value={String(summary.membershipPaymentAfterExposure)}
                  detail={percentLabel(summary.membershipPaymentAfterExposure, summary.exposedCustomers)}
                  icon="payments"
                />
              </View>

              <Text style={styles.sectionTitle}>Ventana después de exposición</Text>
              <View style={styles.pills}>
                {([7, 30, 60, 90] as ContinuityWindowDays[]).map((days) => {
                  const selected = days === windowDays;
                  return (
                    <Pressable
                      key={days}
                      style={[styles.pill, selected && styles.pillSelected]}
                      onPress={() => setWindowDays(days)}
                    >
                      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{days} días</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.metricsGrid}>
                <MetricCard
                  label="Actividad"
                  value={String(windowSummary.activityCustomers)}
                  detail={percentLabel(windowSummary.activityCustomers, windowSummary.exposedCustomers)}
                  icon="directions-run"
                />
                <MetricCard
                  label="Cualquier pago"
                  value={String(windowSummary.anyPaymentCustomers)}
                  detail={percentLabel(windowSummary.anyPaymentCustomers, windowSummary.exposedCustomers)}
                  icon="receipt-long"
                />
                <MetricCard
                  label="Mensualidad"
                  value={String(windowSummary.membershipPaymentCustomers)}
                  detail={percentLabel(windowSummary.membershipPaymentCustomers, windowSummary.exposedCustomers)}
                  icon="payments"
                />
              </View>

              <Text style={styles.sectionTitle}>Comparación 30 días</Text>
              <View style={styles.methodCard}>
                <MaterialIcons name="compare-arrows" size={21} color={ucapsaBrand.colors.redDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>Cohorte comparable</Text>
                  <Text style={styles.muted}>
                    Sólo clientes con seguimiento completo: exposición durante los primeros 7 días desde su primera actividad y resultados observados en los 30 días siguientes.
                  </Text>
                </View>
              </View>
              {cohortSummary.eligibleCustomers === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="hourglass-empty" size={24} color={ucapsaBrand.colors.redDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emptyTitle}>Aún no hay seguimiento completo</Text>
                    <Text style={styles.muted}>Se necesitan 37 días desde la primera actividad para comparar ambos grupos sin recortar la ventana.</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.cohortGrid}>
                  <CohortCard title="Exposición temprana" group={cohortSummary.earlyExposure} />
                  <CohortCard title="Sin exposición temprana" group={cohortSummary.noEarlyExposure} />
                </View>
              )}

              {summary.deleteRequestAfterExposure > 0 ? (
                <View style={styles.warningCard}>
                  <MaterialIcons name="info-outline" size={20} color={ucapsaBrand.colors.danger} />
                  <Text style={styles.warningText}>
                    {summary.deleteRequestAfterExposure} cliente(s) solicitaron eliminación de cuenta después de una exposición. Es un hecho observado, no una atribución causal.
                  </Text>
                </View>
              ) : null}

              <Text style={styles.sectionTitle}>Observaciones</Text>
              <View style={styles.list}>
                {visibleRows.map((row) => (
                  <ObservationRow
                    key={`${row.user_id ?? 'user'}-${row.season_id ?? 'season'}`}
                    row={row}
                  />
                ))}
              </View>
            </>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <View style={styles.metricCard}>
      <MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.red} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function ObservationRow({ row }: { row: ContinuityObservation }) {
  const exposed = row.has_value_exposure === true;
  const activityAfter = Number(row.activity_events_after_exposure ?? 0);
  const paymentAfter = Number(row.paid_payments_after_exposure ?? 0);
  const membershipPaymentAfter = Number(row.membership_paid_payments_after_exposure ?? 0);

  return (
    <View style={styles.observationCard}>
      <View style={styles.observationHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.customerName}>{row.full_name || row.email || 'Cliente'}</Text>
          <Text style={styles.muted}>
            {Number(row.dog_count ?? 0)} perro(s) · {Number(row.constancy_events_count ?? 0)} actividades
          </Text>
        </View>
        <View style={[styles.exposurePill, !exposed && styles.exposurePillMuted]}>
          <Text style={[styles.exposureText, !exposed && styles.exposureTextMuted]}>
            {exposed ? `${Number(row.value_exposure_days ?? 0)} día(s) de exposición` : 'Sin exposición'}
          </Text>
        </View>
      </View>

      <View style={styles.factGrid}>
        <Fact label="Última actividad" value={dateLabel(row.last_activity_date)} />
        <Fact label="Días sin actividad" value={row.days_since_last_activity == null ? '—' : String(row.days_since_last_activity)} />
        <Fact label="Membresía" value={membershipLabel(row.membership_status)} />
        <Fact label="Pago actual" value={row.current_payment_status || '—'} />
      </View>

      {exposed ? (
        <View style={styles.afterBox}>
          <Text style={styles.afterTitle}>Después de la primera exposición</Text>
          <Text style={styles.afterText}>
            {activityAfter} actividad(es) posterior(es)
            {row.next_activity_date ? ` · primera: ${dateLabel(row.next_activity_date)}` : ''}
          </Text>
          <Text style={styles.afterText}>
            {paymentAfter} pago(s) UCAPSA posterior(es)
            {row.next_paid_at ? ` · primero: ${dateLabel(row.next_paid_at)}` : ''}
          </Text>
          <Text style={styles.afterText}>
            {membershipPaymentAfter} mensualidad(es) posterior(es)
            {row.next_membership_paid_at ? ` · primera: ${dateLabel(row.next_membership_paid_at)}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function CohortCard({
  title,
  group,
}: {
  title: string;
  group: {
    customers: number;
    activityCustomers: number;
    anyPaymentCustomers: number;
    membershipPaymentCustomers: number;
  };
}) {
  return (
    <View style={styles.cohortCard}>
      <Text style={styles.cohortTitle}>{title}</Text>
      <Text style={styles.cohortN}>{group.customers} cliente(s)</Text>
      <Text style={styles.cohortLine}>Actividad · {percentLabel(group.activityCustomers, group.customers)}</Text>
      <Text style={styles.cohortLine}>Cualquier pago · {percentLabel(group.anyPaymentCustomers, group.customers)}</Text>
      <Text style={styles.cohortLine}>Mensualidad · {percentLabel(group.membershipPaymentCustomers, group.customers)}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  methodCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 17, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginBottom: 13 },
  methodTitle: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', marginBottom: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  pillSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  pillText: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900' },
  pillTextSelected: { color: ucapsaBrand.colors.redDark },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 4, marginBottom: 9 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 },
  metricCard: { width: '48%', minHeight: 118, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12, gap: 3 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  metricDetail: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '700' },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 11, marginBottom: 12 },
  warningText: { flex: 1, color: ucapsaBrand.colors.danger, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  cohortGrid: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  cohortCard: { flex: 1, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11, gap: 4 },
  cohortTitle: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  cohortN: { color: ucapsaBrand.colors.redDark, fontSize: 17, fontWeight: '900' },
  cohortLine: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 14, fontWeight: '800' },
  list: { gap: 9 },
  observationCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12, gap: 10 },
  observationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  customerName: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  exposurePill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 7, paddingVertical: 4 },
  exposurePillMuted: { backgroundColor: ucapsaBrand.colors.graySoft },
  exposureText: { color: ucapsaBrand.colors.redDark, fontSize: 8, fontWeight: '900' },
  exposureTextMuted: { color: ucapsaBrand.colors.grayDark },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { width: '48%', borderRadius: 12, backgroundColor: ucapsaBrand.colors.graySoft, padding: 9 },
  factLabel: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '800' },
  factValue: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900', marginTop: 2 },
  afterBox: { borderRadius: 13, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 10, gap: 3 },
  afterTitle: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  afterText: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 14, fontWeight: '700' },
});
