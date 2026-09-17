import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  formatSeasonDate,
  getAdminCompetitionHubSummary,
  type CompetitionHubSummary,
} from '../../services/ucapsa-competition.service';

const emptySummary: CompetitionHubSummary = {
  activeSeason: null,
  dogsInSeason: 0,
  dogsWithActivity: 0,
  eligibleDogs: 0,
  publishedExams: 0,
};

export default function AdminCompetitionScreen() {
  const [summary, setSummary] = useState<CompetitionHubSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await getAdminCompetitionHubSummary());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar Competencia UCAPSA.');
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
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const season = summary.activeSeason;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialIcons name="emoji-events" size={28} color={ucapsaBrand.colors.surface} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>Rango 1</Text>
          <Text style={styles.heroTitle}>Competencia UCAPSA</Text>
          <Text style={styles.heroSubtitle}>Temporada, constancia, exámenes, ajustes y reconocimientos desde una sola estructura.</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando competencia…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && season ? (
        <>
          <View style={styles.seasonCard}>
            <View style={styles.seasonTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>TEMPORADA ACTIVA</Text>
                <Text style={styles.seasonName}>{season.name}</Text>
                <Text style={styles.muted}>{formatSeasonDate(season.starts_at)} – {formatSeasonDate(new Date(new Date(season.ends_at).getTime() - 1).toISOString())}</Text>
              </View>
              <View style={styles.activePill}><Text style={styles.activePillText}>Activa</Text></View>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <Metric value={summary.dogsInSeason} label="Perros" />
            <Metric value={summary.dogsWithActivity} label="Con actividad" />
            <Metric value={summary.eligibleDogs} label="Elegibles" />
            <Metric value={summary.publishedExams} label="Exámenes" />
          </View>
        </>
      ) : null}

      {!loading && !error && !season ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><MaterialIcons name="calendar-month" size={24} color={ucapsaBrand.colors.redDark} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>No hay temporada activa</Text>
            <Text style={styles.muted}>Crea una temporada en borrador y actívala cuando UCAPSA esté listo para competir.</Text>
          </View>
          <Pressable style={styles.inlineButton} onPress={() => router.push('/admin/competition-seasons' as never)}>
            <Text style={styles.inlineButtonText}>Temporadas</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Competencia</Text>
      <View style={styles.card}>
        <FeatureRow icon="leaderboard" title="Ranking" subtitle="Clasificación oficial de perros elegibles" status="Escala pendiente" disabled />
        <FeatureRow icon="workspace-premium" title="Rangos / Constancia" subtitle="Comandos y visitas de socio por perro" status="Escala pendiente" disabled last />
      </View>

      <Text style={styles.sectionTitle}>Operación</Text>
      <View style={styles.card}>
        <FeatureRow
          icon="assignment"
          title="Exámenes"
          subtitle="Configuración, resultados e importación"
          onPress={() => router.push('/admin/competition-exams' as never)}
        />
        <FeatureRow
          icon="add-chart"
          title="Puntos y ajustes"
          subtitle="Movimientos Admin por perro y temporada"
          onPress={() => router.push('/admin/competition-adjustments' as never)}
        />
        <FeatureRow
          icon="military-tech"
          title="Premios"
          subtitle="Perro del Año y reconocimientos permanentes"
          onPress={() => router.push('/admin/competition-awards' as never)}
        />
        <FeatureRow
          icon="calendar-month"
          title="Temporadas"
          subtitle="Crear, activar, cerrar y reabrir"
          onPress={() => router.push('/admin/competition-seasons' as never)}
          last
        />
      </View>

      <View style={styles.noteCard}>
        <MaterialIcons name="info-outline" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.noteText}>Ranking y Rango no se calculan todavía: faltan la escala numérica y el criterio de desempate. No se muestran resultados inventados.</Text>
      </View>
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

function FeatureRow({
  icon,
  title,
  subtitle,
  status,
  disabled = false,
  onPress,
  last = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  status?: string;
  disabled?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled || !onPress}
      style={[styles.row, last && styles.rowLast, disabled && styles.rowDisabled]}
      onPress={onPress}
    >
      <View style={styles.rowIcon}><MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          {status ? <View style={styles.statusPill}><Text style={styles.statusText}>{status}</Text></View> : null}
        </View>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {!disabled && onPress ? <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 13, alignItems: 'center', borderRadius: 24, backgroundColor: ucapsaBrand.colors.red, padding: 18, marginBottom: 16 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redDark },
  heroKicker: { color: ucapsaBrand.colors.redSoftStrong, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { color: ucapsaBrand.colors.surface, fontSize: 24, lineHeight: 29, fontWeight: '900' },
  heroSubtitle: { color: ucapsaBrand.colors.redSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, marginBottom: 14, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  seasonCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 15, marginBottom: 10 },
  seasonTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.8 },
  seasonName: { color: ucapsaBrand.colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900', marginTop: 2 },
  activePill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.successSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, paddingHorizontal: 9, paddingVertical: 5 },
  activePillText: { color: ucapsaBrand.colors.successDark, fontSize: 10, fontWeight: '900' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  metric: { width: '48%', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  emptyCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  emptyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  inlineButton: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11, paddingVertical: 9 },
  inlineButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 6, marginBottom: 9 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden', marginBottom: 14 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  rowDisabled: { opacity: 0.58 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  statusPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.graySoft, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { color: ucapsaBrand.colors.grayDark, fontSize: 9, fontWeight: '900' },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginBottom: 8 },
  noteText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
});
