import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  formatSeasonDate,
  getAdminCompetitionAdjustmentOverview,
  type CompetitionAdjustmentOverview,
} from '../../services/ucapsa-competition.service';

const emptyOverview: CompetitionAdjustmentOverview = {
  seasons: [],
  selectedSeason: null,
  dogs: [],
};

function numberLabel(value: number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

export default function AdminCompetitionAdjustmentsScreen() {
  const { seasonId: seasonIdParam } = useLocalSearchParams<{ seasonId?: string | string[] }>();
  const routeSeasonId = Array.isArray(seasonIdParam) ? seasonIdParam[0] ?? null : seasonIdParam ?? null;
  const [seasonId, setSeasonId] = useState<string | null>(routeSeasonId);
  const [overview, setOverview] = useState<CompetitionAdjustmentOverview>(emptyOverview);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await getAdminCompetitionAdjustmentOverview(seasonId ?? routeSeasonId);
      setOverview(next);
      if (next.selectedSeason && next.selectedSeason.id !== seasonId) {
        setSeasonId(next.selectedSeason.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los ajustes.');
    } finally {
      setLoading(false);
    }
  }, [routeSeasonId, seasonId]);

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

  const dogs = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    if (!clean) return overview.dogs;
    return overview.dogs.filter((dog) => (dog.dog_name ?? '').toLocaleLowerCase('es-MX').includes(clean));
  }, [overview.dogs, query]);

  const selectedSeason = overview.selectedSeason;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>Puntos y ajustes</Text>
        <Text style={styles.subtitle}>Correcciones firmadas por perro y temporada. El total se deriva de movimientos; nunca se edita directamente.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando ajustes…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && overview.seasons.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.iconBox}><MaterialIcons name="lock-clock" size={23} color={ucapsaBrand.colors.redDark} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>No hay temporada editable</Text>
            <Text style={styles.muted}>Los ajustes sólo se permiten en una temporada activa o reabierta.</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/admin/competition-seasons' as never)}>
            <Text style={styles.secondaryButtonText}>Temporadas</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && selectedSeason ? (
        <>
          <Text style={styles.sectionTitle}>Temporada</Text>
          <View style={styles.seasonCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.seasonName}>{selectedSeason.name}</Text>
              <Text style={styles.muted}>
                {formatSeasonDate(selectedSeason.starts_at)} – {formatSeasonDate(new Date(new Date(selectedSeason.ends_at).getTime() - 1).toISOString())}
              </Text>
            </View>
            <View style={[styles.statusPill, selectedSeason.status === 'reopened' && styles.statusReopened]}>
              <Text style={[styles.statusText, selectedSeason.status === 'reopened' && styles.statusReopenedText]}>
                {selectedSeason.status === 'active' ? 'Activa' : 'Reabierta'}
              </Text>
            </View>
          </View>

          {overview.seasons.length > 1 ? (
            <View style={styles.seasonChoices}>
              {overview.seasons.map((season) => {
                const selected = season.id === selectedSeason.id;
                return (
                  <Pressable
                    key={season.id}
                    style={[styles.seasonChoice, selected && styles.seasonChoiceSelected]}
                    onPress={() => {
                      if (season.id === selectedSeason.id) return;
                      setLoading(true);
                      setSeasonId(season.id);
                    }}
                  >
                    <Text style={[styles.seasonChoiceText, selected && styles.seasonChoiceTextSelected]}>{season.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Perro</Text>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar perro"
              placeholderTextColor={ucapsaBrand.colors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>

          {dogs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{query.trim() ? 'Sin coincidencias' : 'No hay perros en esta temporada'}</Text>
              <Text style={styles.muted}>{query.trim() ? 'Prueba otro nombre.' : 'La fuente competitiva todavía no tiene perros disponibles.'}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {dogs.map((dog) => (
                <Pressable
                  key={dog.dog_id}
                  style={styles.dogRow}
                  onPress={() => router.push(
                    `/admin/competition-adjustment-detail?seasonId=${encodeURIComponent(selectedSeason.id)}&dogId=${encodeURIComponent(dog.dog_id ?? '')}` as never,
                  )}
                >
                  <View style={styles.iconBox}><MaterialIcons name="pets" size={21} color={ucapsaBrand.colors.redDark} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.dogTitleLine}>
                      <Text numberOfLines={1} style={styles.dogName}>{dog.dog_name}</Text>
                      {dog.dog_is_active === false ? <Text style={styles.inactiveLabel}>Inactivo</Text> : null}
                    </View>
                    <Text style={styles.muted}>{numberLabel(dog.admin_adjustment_movement_count)} movimientos</Text>
                  </View>
                  <View style={styles.pointsBox}>
                    <Text style={styles.pointsLabel}>AJUSTE</Text>
                    <Text style={styles.pointsValue}>{Number(dog.admin_adjustment_points ?? 0) > 0 ? '+' : ''}{numberLabel(dog.admin_adjustment_points)}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 15 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, marginBottom: 12, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  secondaryButton: { borderRadius: 12, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11, paddingVertical: 9 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 8, marginBottom: 9 },
  seasonCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  seasonName: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 2 },
  statusPill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { color: ucapsaBrand.colors.successDark, fontSize: 9, fontWeight: '900' },
  statusReopened: { borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft },
  statusReopenedText: { color: ucapsaBrand.colors.warningDark },
  seasonChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  seasonChoice: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 7 },
  seasonChoiceSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  seasonChoiceText: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900' },
  seasonChoiceTextSelected: { color: ucapsaBrand.colors.redDark },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700', paddingVertical: 10 },
  list: { gap: 9 },
  dogRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  dogTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  inactiveLabel: { color: ucapsaBrand.colors.grayDark, backgroundColor: ucapsaBrand.colors.graySoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  pointsBox: { alignItems: 'flex-end' },
  pointsLabel: { color: ucapsaBrand.colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  pointsValue: { color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '900' },
});
