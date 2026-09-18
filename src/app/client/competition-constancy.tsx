import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import {
  getCachedMyConstancyDetail,
  refreshMyConstancyDetail,
  type ClientConstancyDetail,
  type ClientConstancyEvent,
} from '../../services/client-competition.service';
import { recordValueExposure } from '../../services/continuity-evidence.service';

function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function eventLabel(event: ClientConstancyEvent) {
  return event.event_type === 'command_attendance' ? 'Comandos' : 'Visita de socio';
}

function sourceLabel(value: string | null | undefined) {
  if (!value) return 'Registro UCAPSA';
  if (value === 'qr') return 'QR';
  if (value === 'manual') return 'Manual';
  return value;
}

function constancyLevelDescription(code: string | null | undefined) {
  if (code === 'forming') return 'Constancia en formación.';
  if (code === 'gold') return 'Constancia destacada esta temporada.';
  if (code === 'silver') return 'Constancia sostenida esta temporada.';
  return 'Constancia en desarrollo esta temporada.';
}

function topPercentLabel(value: number | null | undefined) {
  return Math.max(1, Math.ceil(Number(value ?? 0)));
}

export default function ClientCompetitionConstancyScreen() {
  const params = useLocalSearchParams<{
    dogId?: string | string[];
    seasonId?: string | string[];
  }>();
  const dogId = Array.isArray(params.dogId) ? params.dogId[0] ?? '' : params.dogId ?? '';
  const seasonId = Array.isArray(params.seasonId) ? params.seasonId[0] ?? '' : params.seasonId ?? '';

  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const [detail, setDetail] = useState<ClientConstancyDetail | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin || !dogId || !seasonId) {
      setLocalReady(true);
      return;
    }

    setError(null);
    setUsingSavedData(false);

    const cached = await getCachedMyConstancyDetail(user.id, dogId, seasonId);
    if (cached) {
      setDetail(cached.data);
      setSavedAt(cached.saved_at);
      setLocalReady(true);
    }

    try {
      const fresh = await refreshMyConstancyDetail(user.id, dogId, seasonId);
      setDetail(fresh.data);
      setSavedAt(fresh.saved_at);
      setUsingSavedData(false);
      setLocalReady(true);
    } catch (cause) {
      setLocalReady(true);
      if (cached) {
        setUsingSavedData(true);
        setSavedAt(cached.saved_at);
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar la constancia.');
      }
    }
  }, [dogId, isAdmin, seasonId, user]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    void load();
    return () => setScreenFocused(false);
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const season = detail?.season ?? null;

  useEffect(() => {
    if (!user || isAdmin || !screenFocused || !localReady || error || !detail?.dog_id || !season?.season_id) return;
    void recordValueExposure(user.id, detail.dog_id, season.season_id, 'constancy_detail')
      .catch(() => undefined);
  }, [detail?.dog_id, error, isAdmin, localReady, screenFocused, season?.season_id, user]);

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>CONSTANCIA UCAPSA</Text>
        <Text style={[styles.title, { color: format.cardText }]}>{detail?.dog_name || 'Tu perro'}</Text>
        <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{season?.season_name || 'Temporada'}</Text>
      </View>

      {usingSavedData ? (
        <OfflineDataNotice
          savedAt={savedAt}
          onRetry={() => void refresh()}
          premium={premium}
          label="Mostrando constancia guardada"
        />
      ) : null}

      {!localReady ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cargando constancia…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>No pudimos cargar la constancia</Text>
          <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Conéctate una vez para guardar este detalle en el dispositivo.</Text>
        </View>
      ) : null}

      {localReady && !error && detail && season ? (
        <>
          <View style={[styles.card, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
            <Text style={[styles.sectionEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>NIVEL DE CONSTANCIA</Text>
            <Text style={[styles.rangeValue, { color: format.cardText }]}>{season.range_name || 'Cobre'}</Text>
            <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
              {season.has_sufficient_constancy_population !== true
                ? `${Number(season.constancy_events_count ?? 0)} actividades registradas. Todavía no hay suficiente población en la temporada para asignar un nivel comparativo.`
                : Number(season.constancy_events_count ?? 0) === 0
                  ? 'Sin actividad registrada en esta temporada. Tu perro permanece en Cobre y sigue contando dentro de la población de la temporada.'
                  : `${constancyLevelDescription(season.range_code)} Está dentro del ${topPercentLabel(season.constancy_percentile)}% de mayor constancia de la temporada.`}
            </Text>
            {season.is_constancy_outstanding ? (
              <Text style={[styles.outstandingText, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Constancia sobresaliente · top 5%</Text>
            ) : null}
          </View>

          <View style={styles.metricsRow}>
            <Metric value={Number(season.constancy_events_count ?? 0)} label="eventos" premium={premium} format={format} />
            <Metric value={Number(season.command_attendances_count ?? 0)} label="Comandos" premium={premium} format={format} />
            <Metric value={Number(season.member_visits_count ?? 0)} label="visitas" premium={premium} format={format} />
          </View>

          <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
            <InfoRow label="Primera actividad" value={dateLabel(season.first_event_date)} premium={premium} format={format} />
            <InfoRow label="Última actividad" value={dateLabel(season.last_event_date)} premium={premium} format={format} />
          </View>

          <Text style={[styles.sectionTitle, { color: format.cardText }]}>Historial</Text>

          {detail.events.length === 0 ? (
            <View style={[styles.card, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: format.cardText }]}>Sin eventos en esta temporada</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Todavía no hay asistencias de Comandos ni visitas de socio acreditadas.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {detail.events.map((event) => (
                <View
                  key={`${event.event_type}-${event.source_id}`}
                  style={[styles.eventRow, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}
                >
                  <View style={[styles.eventIcon, { backgroundColor: format.pillBackground }]}>
                    <MaterialIcons
                      name={event.event_type === 'command_attendance' ? 'school' : 'qr-code-scanner'}
                      size={20}
                      color={format.pillText}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventTitle, { color: format.cardText }]}>{eventLabel(event)}</Text>
                    <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{dateLabel(event.event_date)} · {sourceLabel(event.source)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.noteCard, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
            <MaterialIcons name="info-outline" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            <Text style={[styles.noteText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cobre = constancia en desarrollo · Plata = constancia sostenida · Oro = constancia destacada. El nivel se deriva únicamente de esta Constancia; el Ranking usa además Exámenes y Ajustes Admin.</Text>
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Metric({
  value,
  label,
  premium,
  format,
}: {
  value: number;
  label: string;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
}) {
  return (
    <View style={[styles.metric, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
      <Text style={[styles.metricValue, { color: format.cardText }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{label}</Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  premium,
  format,
}: {
  label: string;
  value: string;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: format.cardText }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 14 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  card: { gap: 7, borderRadius: 19, borderWidth: 1, padding: 14, marginBottom: 11 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  sectionEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  rangeValue: { fontSize: 23, lineHeight: 29, fontWeight: '900' },
  outstandingText: { fontSize: 10, lineHeight: 15, fontWeight: '900', marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 11 },
  metric: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 11 },
  metricValue: { fontSize: 20, fontWeight: '900' },
  metricLabel: { fontSize: 9, fontWeight: '800', marginTop: 2 },
  infoRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  infoLabel: { fontSize: 10, fontWeight: '800' },
  infoValue: { fontSize: 11, fontWeight: '900', textAlign: 'right' },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', marginBottom: 8 },
  list: { gap: 8 },
  eventRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, borderWidth: 1, padding: 10 },
  eventIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { fontSize: 12, lineHeight: 17, fontWeight: '900' },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, borderWidth: 1, padding: 11, marginTop: 12 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '800' },
});
