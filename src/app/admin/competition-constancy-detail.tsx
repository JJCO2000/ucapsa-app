import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminCompetitionConstancyDetail,
  type AdminCompetitionConstancyDetail,
  type CompetitionConstancyEvent,
} from '../../services/ucapsa-competition.service';

function dateLabel(value: string | null) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function eventLabel(event: CompetitionConstancyEvent) {
  return event.event_type === 'command_attendance' ? 'Comandos' : 'Visita de socio';
}

function sourceLabel(value: string | null) {
  if (!value) return 'Origen no especificado';
  if (value === 'qr') return 'QR';
  if (value === 'manual') return 'Manual';
  return value;
}

export default function AdminCompetitionConstancyDetailScreen() {
  const params = useLocalSearchParams<{ seasonId?: string | string[]; dogId?: string | string[] }>();
  const seasonId = Array.isArray(params.seasonId) ? params.seasonId[0] ?? '' : params.seasonId ?? '';
  const dogId = Array.isArray(params.dogId) ? params.dogId[0] ?? '' : params.dogId ?? '';

  const [detail, setDetail] = useState<AdminCompetitionConstancyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seasonId || !dogId) {
      setError('Falta el perro o la temporada.');
      setLoading(false);
      return;
    }

    setError(null);
    try {
      setDetail(await getAdminCompetitionConstancyDetail({ seasonId, dogId }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la constancia.');
    } finally {
      setLoading(false);
    }
  }, [dogId, seasonId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const counts = useMemo(() => ({
    commands: Number(detail?.dog.command_attendances_count ?? 0),
    visits: Number(detail?.dog.member_visits_count ?? 0),
    total: Number(detail?.dog.constancy_events_count ?? 0),
  }), [detail?.dog]);

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando constancia…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && detail ? (
        <>
          <View style={styles.header}>
            <View style={styles.dogIcon}><MaterialIcons name="pets" size={24} color={ucapsaBrand.colors.redDark} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>{detail.season.name}</Text>
              <Text style={styles.title}>{detail.dog.dog_name || 'Perro sin nombre'}</Text>
              <Text style={styles.muted}>{detail.dog.ownerName || 'Dueño sin nombre'}</Text>
            </View>
          </View>

          <View style={styles.rangeCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rangeLabel}>NIVEL DE CONSTANCIA</Text>
              <Text style={styles.rangeValue}>{detail.dog.range_name || 'Cobre'}</Text>
              <Text style={styles.muted}>
                {counts.total === 0
                  ? '0 eventos: Cobre por regla de actividad. El perro sí cuenta en la población de la temporada.'
                  : `Percentil desde la cima: ${Number(detail.dog.constancy_percentile ?? 0).toFixed(2)}%. Empates de Constancia comparten Nivel.`}
                {detail.dog.is_constancy_outstanding ? ' · Constancia sobresaliente (top 5%).' : ''}
              </Text>
            </View>
            <MaterialIcons name="workspace-premium" size={26} color={ucapsaBrand.colors.redDark} />
          </View>

          <View style={styles.infoCard}>
            <InfoRow label="Puntaje competitivo" value={`${Number(detail.dog.competitive_score ?? 0)} pts`} />
            <InfoRow label="Constancia" value={String(Number(detail.dog.constancy_points ?? 0))} />
            <InfoRow label="Exámenes" value={String(Number(detail.dog.exam_points ?? 0))} />
            <InfoRow label="Ajustes Admin" value={String(Number(detail.dog.admin_adjustment_points ?? 0))} />
          </View>

          <View style={styles.metricsRow}>
            <Metric value={counts.total} label="eventos" />
            <Metric value={counts.commands} label="Comandos" />
            <Metric value={counts.visits} label="visitas" />
          </View>

          <View style={styles.infoCard}>
            <InfoRow label="Primera actividad" value={dateLabel(detail.dog.first_event_date)} />
            <InfoRow label="Última actividad" value={dateLabel(detail.dog.last_event_date)} />
            <InfoRow label="Estado del perro" value={detail.dog.dog_is_active ? 'Activo' : 'Inactivo'} />
          </View>

          <View style={styles.noteCard}>
            <MaterialIcons name="info-outline" size={19} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.noteText}>La constancia es derivada. Si un hecho está mal, se corrige en la asistencia o visita de origen; aquí no existe un total editable.</Text>
          </View>

          <Text style={styles.sectionTitle}>Historial de constancia</Text>

          {detail.events.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin eventos en esta temporada</Text>
              <Text style={styles.muted}>Este perro todavía no tiene asistencias de Comandos ni visitas de socio acreditadas.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {detail.events.map((event) => (
                <View key={`${event.event_type}-${event.source_id}`} style={styles.eventRow}>
                  <View style={styles.eventIcon}>
                    <MaterialIcons name={event.event_type === 'command_attendance' ? 'school' : 'qr-code-scanner'} size={20} color={ucapsaBrand.colors.redDark} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{eventLabel(event)}</Text>
                    <Text style={styles.muted}>{dateLabel(event.event_date)} · {sourceLabel(event.source)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 11 },
  dogIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { color: ucapsaBrand.colors.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 2 },
  rangeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 13, marginBottom: 10 },
  rangeLabel: { color: ucapsaBrand.colors.redDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  rangeValue: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900', marginTop: 2, marginBottom: 2 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  metric: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '800', marginTop: 2 },
  infoCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 10 },
  infoRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  infoLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  infoValue: { color: ucapsaBrand.colors.text, fontSize: 10, fontWeight: '900', textAlign: 'right' },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginBottom: 12 },
  noteText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 8 },
  emptyCard: { gap: 4, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  list: { gap: 8 },
  eventRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 10 },
  eventIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  eventTitle: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
});
