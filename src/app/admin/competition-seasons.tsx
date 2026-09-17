import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  formatSeasonDate,
  getAdminCompetitionSeasons,
  type CompetitionSeason,
} from '../../services/ucapsa-competition.service';

const statusLabel: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activa',
  closed: 'Cerrada',
  reopened: 'Reabierta',
};

export default function AdminCompetitionSeasonsScreen() {
  const { role } = useSession();
  const [seasons, setSeasons] = useState<CompetitionSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = role === 'super_admin';

  const load = useCallback(async () => {
    setError(null);
    try {
      setSeasons(await getAdminCompetitionSeasons());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las temporadas.');
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

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>Temporadas</Text>
        <Text style={styles.subtitle}>Cada periodo conserva su propia constancia, exámenes, ajustes y resultados competitivos.</Text>
      </View>

      {isSuperAdmin ? (
        <Pressable style={styles.primaryButton} onPress={() => router.push('/admin/competition-season-form' as never)}>
          <MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} />
          <Text style={styles.primaryButtonText}>Nueva temporada</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando temporadas…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && seasons.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="calendar-month" size={26} color={ucapsaBrand.colors.redDark} />
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>Aún no hay temporadas</Text>
            <Text style={styles.muted}>{isSuperAdmin ? 'Crea la primera en borrador. Nada competitivo inicia hasta activarla.' : 'Un Superadmin debe crear la primera temporada.'}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {seasons.map((season) => {
          const endDisplay = new Date(new Date(season.ends_at).getTime() - 1).toISOString();
          return (
            <Pressable
              key={season.id}
              style={styles.seasonRow}
              onPress={() => router.push(`/admin/competition-season-detail?seasonId=${season.id}` as never)}
            >
              <View style={styles.iconBox}>
                <MaterialIcons name={season.status === 'active' ? 'play-circle' : 'calendar-month'} size={22} color={ucapsaBrand.colors.redDark} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.titleLine}>
                  <Text style={styles.seasonName}>{season.name}</Text>
                  <StatusPill status={season.status} />
                </View>
                <Text style={styles.seasonCode}>{season.code}</Text>
                <Text style={styles.muted}>{formatSeasonDate(season.starts_at)} – {formatSeasonDate(endDisplay)}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          );
        })}
      </View>
    </KeyboardAwareScreen>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === 'active';
  const reopened = status === 'reopened';
  return (
    <View style={[styles.statusPill, active && styles.statusActive, reopened && styles.statusReopened]}>
      <Text style={[styles.statusText, active && styles.statusActiveText, reopened && styles.statusReopenedText]}>{statusLabel[status] ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 15 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  primaryButton: { minHeight: 48, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginBottom: 14 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, marginBottom: 12 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  emptyCard: { flexDirection: 'row', gap: 11, alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 15 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginBottom: 2 },
  list: { gap: 10 },
  seasonRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  seasonName: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  seasonCode: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 2, marginBottom: 2 },
  statusPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.graySoft, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { color: ucapsaBrand.colors.grayDark, fontSize: 9, fontWeight: '900' },
  statusActive: { backgroundColor: ucapsaBrand.colors.successSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder },
  statusActiveText: { color: ucapsaBrand.colors.successDark },
  statusReopened: { backgroundColor: ucapsaBrand.colors.warningSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder },
  statusReopenedText: { color: ucapsaBrand.colors.warningDark },
});
