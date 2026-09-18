import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminCompetitionConstancyOverview,
  type AdminCompetitionConstancyOverview,
} from '../../services/ucapsa-competition.service';

const emptyOverview: AdminCompetitionConstancyOverview = {
  seasons: [],
  selectedSeason: null,
  dogs: [],
};

function seasonStatusLabel(status: string) {
  if (status === 'active') return 'Activa';
  if (status === 'reopened') return 'Reabierta';
  if (status === 'closed') return 'Cerrada';
  return status;
}

export default function AdminCompetitionConstancyScreen() {
  const params = useLocalSearchParams<{ seasonId?: string | string[] }>();
  const requestedSeasonId = Array.isArray(params.seasonId) ? params.seasonId[0] ?? null : params.seasonId ?? null;

  const [overview, setOverview] = useState<AdminCompetitionConstancyOverview>(emptyOverview);
  const [seasonId, setSeasonId] = useState<string | null>(requestedSeasonId);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextSeasonId?: string | null) => {
    setError(null);
    try {
      const next = await getAdminCompetitionConstancyOverview(nextSeasonId ?? seasonId ?? requestedSeasonId);
      setOverview(next);
      setSeasonId(next.selectedSeason?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la constancia.');
    } finally {
      setLoading(false);
    }
  }, [requestedSeasonId, seasonId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function selectSeason(nextSeasonId: string) {
    if (nextSeasonId === seasonId) return;
    setSeasonId(nextSeasonId);
    setLoading(true);
    await load(nextSeasonId);
  }

  const visibleDogs = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    if (!clean) return overview.dogs;
    return overview.dogs.filter((dog) =>
      [dog.dog_name, dog.ownerName]
        .some((value) => value?.toLocaleLowerCase('es-MX').includes(clean)),
    );
  }, [overview.dogs, query]);

  const totalEvents = overview.dogs.reduce((sum, dog) => sum + Number(dog.constancy_events_count ?? 0), 0);
  const dogsWithEvents = overview.dogs.filter((dog) => Number(dog.constancy_events_count ?? 0) > 0).length;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>Rangos / Constancia</Text>
        <Text style={styles.subtitle}>Rango de Constancia por percentil de temporada. Todos los perros cuentan en la población; 0 actividad permanece Bronce.</Text>
      </View>

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

      {!loading && !error ? (
        <>
          {overview.seasons.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Temporada</Text>
              <View style={styles.pills}>
                {overview.seasons.map((season) => {
                  const selected = season.id === seasonId;
                  return (
                    <Pressable key={season.id} style={[styles.pill, selected && styles.pillSelected]} onPress={() => void selectSeason(season.id)}>
                      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{season.name} · {seasonStatusLabel(season.status)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {!overview.selectedSeason ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="calendar-month" size={25} color={ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>No hay temporadas consultables</Text>
                <Text style={styles.muted}>Activa una temporada para empezar a registrar constancia competitiva.</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.metricsRow}>
                <Metric value={overview.dogs.length} label="perros" />
                <Metric value={dogsWithEvents} label="con constancia" />
                <Metric value={totalEvents} label="eventos" />
              </View>

              <View style={styles.noteCard}>
                <MaterialIcons name="info-outline" size={19} color={ucapsaBrand.colors.redDark} />
                <Text style={styles.noteText}>Rango se calcula sólo con Constancia. El puntaje competitivo se muestra aparte y no decide Bronce/Plata/Oro/Esmeralda/Platino/Diamante.</Text>
              </View>

              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar perro o dueño"
                  placeholderTextColor={ucapsaBrand.colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                />
              </View>

              {visibleDogs.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="pets" size={25} color={ucapsaBrand.colors.redDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emptyTitle}>{query.trim() ? 'Sin coincidencias' : 'No hay perros'}</Text>
                    <Text style={styles.muted}>{query.trim() ? 'Prueba otra búsqueda.' : 'No hay perros disponibles para esta temporada.'}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.list}>
                  {visibleDogs.map((dog) => {
                    const events = Number(dog.constancy_events_count ?? 0);
                    const commands = Number(dog.command_attendances_count ?? 0);
                    const visits = Number(dog.member_visits_count ?? 0);
                    return (
                      <Pressable
                        key={dog.dog_id ?? `${dog.owner_user_id}-${dog.dog_name}`}
                        style={styles.dogRow}
                        disabled={!dog.dog_id || !overview.selectedSeason}
                        onPress={() => router.push(
                          `/admin/competition-constancy-detail?seasonId=${encodeURIComponent(overview.selectedSeason?.id ?? '')}&dogId=${encodeURIComponent(dog.dog_id ?? '')}` as never,
                        )}
                      >
                        <View style={styles.dogIcon}><MaterialIcons name="pets" size={21} color={ucapsaBrand.colors.redDark} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.titleLine}>
                            <Text numberOfLines={1} style={styles.dogName}>{dog.dog_name || 'Perro sin nombre'}</Text>
                            <View style={styles.rangePill}><Text style={styles.rangePillText}>{dog.range_name || 'Bronce'}</Text></View>
                            {!dog.dog_is_active ? <Text style={styles.inactivePill}>Inactivo</Text> : null}
                          </View>
                          <Text numberOfLines={1} style={styles.muted}>{dog.ownerName || 'Dueño sin nombre'}</Text>
                          <Text style={styles.meta}>{events} eventos de Constancia · {Number(dog.competitive_score ?? 0)} pts competitivos</Text>
                          <Text style={styles.muted}>{commands} Comandos · {visits} visitas</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
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

const styles = StyleSheet.create({
  header: { gap: 3, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  pillSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  pillText: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  pillTextSelected: { color: ucapsaBrand.colors.redDark },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  metric: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '800', marginTop: 2 },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginBottom: 10 },
  noteText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  list: { gap: 8 },
  dogRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  dogIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rangePill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 6, paddingVertical: 2 },
  rangePillText: { color: ucapsaBrand.colors.redDark, fontSize: 8, fontWeight: '900' },
  inactivePill: { color: ucapsaBrand.colors.grayDark, backgroundColor: ucapsaBrand.colors.graySoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 3 },
});
