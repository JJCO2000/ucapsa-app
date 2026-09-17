import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  awardRequiresSeason,
  getAdminCompetitionAwardWorkspace,
  grantCompetitionDogAward,
  type AdminCompetitionAwardWorkspace,
} from '../../services/ucapsa-competition.service';

const emptyWorkspace: AdminCompetitionAwardWorkspace = {
  definitions: [],
  seasons: [],
  dogs: [],
  awards: [],
};

export default function AdminCompetitionAwardFormScreen() {
  const { seasonId: seasonIdParam } = useLocalSearchParams<{ seasonId?: string | string[] }>();
  const requestedSeasonId = Array.isArray(seasonIdParam) ? seasonIdParam[0] ?? null : seasonIdParam ?? null;
  const [workspace, setWorkspace] = useState<AdminCompetitionAwardWorkspace>(emptyWorkspace);
  const [awardCode, setAwardCode] = useState('');
  const [seasonId, setSeasonId] = useState<string | null>(requestedSeasonId);
  const [dogId, setDogId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await getAdminCompetitionAwardWorkspace();
      setWorkspace(next);
      const activeDefinitions = next.definitions.filter((definition) => definition.is_active);
      setAwardCode((current) => current || activeDefinitions[0]?.code || '');
      setSeasonId((current) => {
        if (current && next.seasons.some((season) => season.id === current)) return current;
        const active = next.seasons.find((season) => season.status === 'active');
        return active?.id ?? next.seasons[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo preparar el premio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  const definitions = workspace.definitions.filter((definition) => definition.is_active);
  const selectedDefinition = definitions.find((definition) => definition.code === awardCode) ?? null;
  const requiresSeason = awardRequiresSeason(awardCode);
  const selectedSeason = workspace.seasons.find((season) => season.id === seasonId) ?? null;
  const selectedDog = workspace.dogs.find((dog) => dog.id === dogId) ?? null;

  const dogs = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    if (!clean) return workspace.dogs;
    return workspace.dogs.filter((dog) =>
      [dog.name, dog.ownerName].some((value) => value?.toLocaleLowerCase('es-MX').includes(clean)),
    );
  }, [query, workspace.dogs]);

  const existingSeasonWinner = useMemo(() => {
    if (awardCode !== 'dog_of_year' || !seasonId) return null;
    return workspace.awards.find(
      (award) => award.award_code === 'dog_of_year' && award.season_id === seasonId && !award.revoked_at,
    ) ?? null;
  }, [awardCode, seasonId, workspace.awards]);

  async function submit() {
    if (!selectedDefinition || !selectedDog || saving) return;
    if (requiresSeason && !selectedSeason) {
      Alert.alert('Falta temporada', 'Este premio requiere una temporada UCAPSA.');
      return;
    }
    if (existingSeasonWinner) {
      Alert.alert('Premio ya otorgado', `${existingSeasonWinner.dogName} ya tiene Perro del Año vigente en esta temporada. Revócalo primero si necesitas corregirlo.`);
      return;
    }

    setSaving(true);
    try {
      await grantCompetitionDogAward({
        dogId: selectedDog.id,
        awardCode: selectedDefinition.code,
        seasonId: selectedSeason?.id ?? null,
        note,
      });
      Alert.alert('Premio otorgado', `${selectedDefinition.title} quedó registrado para ${selectedDog.name}.`, [
        { text: 'Ver premios', onPress: () => router.replace('/admin/competition-awards' as never) },
      ]);
    } catch (actionError) {
      Alert.alert('No se pudo otorgar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>Otorgar premio</Text>
        <Text style={styles.subtitle}>El reconocimiento se asigna explícitamente. No se toma automáticamente del Ranking, Podio ni de otro cálculo.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Preparando premios…</Text>
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
          <Text style={styles.sectionTitle}>1. Premio</Text>
          {definitions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No hay premios activos</Text>
              <Text style={styles.muted}>Activa una definición de premio antes de otorgarla.</Text>
            </View>
          ) : (
            <View style={styles.choiceList}>
              {definitions.map((definition) => {
                const selected = definition.code === awardCode;
                return (
                  <Pressable key={definition.code} style={[styles.definitionCard, selected && styles.definitionCardSelected]} onPress={() => setAwardCode(definition.code)}>
                    <View style={[styles.definitionIcon, selected && styles.definitionIconSelected]}>
                      <MaterialIcons name="military-tech" size={22} color={selected ? ucapsaBrand.colors.surface : ucapsaBrand.colors.goldDark} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.definitionTitle}>{definition.title}</Text>
                      {definition.description ? <Text style={styles.muted}>{definition.description}</Text> : null}
                    </View>
                    {selected ? <MaterialIcons name="check-circle" size={21} color={ucapsaBrand.colors.red} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionTitle}>2. Temporada</Text>
          {workspace.seasons.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No hay temporadas disponibles</Text>
              <Text style={styles.muted}>Perro del Año no puede otorgarse sobre una temporada en borrador.</Text>
            </View>
          ) : (
            <View style={styles.pills}>
              {!requiresSeason ? (
                <Pressable style={[styles.pill, !seasonId && styles.pillSelected]} onPress={() => setSeasonId(null)}>
                  <Text style={[styles.pillText, !seasonId && styles.pillTextSelected]}>Sin temporada</Text>
                </Pressable>
              ) : null}
              {workspace.seasons.map((season) => {
                const selected = season.id === seasonId;
                return (
                  <Pressable key={season.id} style={[styles.pill, selected && styles.pillSelected]} onPress={() => setSeasonId(season.id)}>
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{season.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {existingSeasonWinner ? (
            <View style={styles.warningCard}>
              <MaterialIcons name="info-outline" size={20} color={ucapsaBrand.colors.warningDark} />
              <Text style={styles.warningText}>{existingSeasonWinner.dogName} ya tiene Perro del Año vigente en {existingSeasonWinner.seasonName || 'esta temporada'}. Revoca ese premio antes de cambiar al ganador.</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>3. Perro</Text>
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

          <View style={styles.choiceList}>
            {dogs.map((dog) => {
              const selected = dog.id === dogId;
              return (
                <Pressable key={dog.id} style={[styles.dogRow, selected && styles.dogRowSelected]} onPress={() => setDogId(dog.id)}>
                  <View style={[styles.dogIcon, selected && styles.dogIconSelected]}>
                    <MaterialIcons name="pets" size={20} color={selected ? ucapsaBrand.colors.surface : ucapsaBrand.colors.redDark} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.dogTitleLine}>
                      <Text numberOfLines={1} style={styles.dogName}>{dog.name}</Text>
                      {!dog.is_active ? <Text style={styles.inactiveLabel}>Inactivo</Text> : null}
                    </View>
                    <Text numberOfLines={1} style={styles.muted}>{dog.ownerName || 'Dueño sin nombre'}</Text>
                  </View>
                  {selected ? <MaterialIcons name="check-circle" size={21} color={ucapsaBrand.colors.red} /> : null}
                </Pressable>
              );
            })}
          </View>

          {dogs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin coincidencias</Text>
              <Text style={styles.muted}>Prueba otro nombre de perro o dueño.</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>4. Nota opcional</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Contexto interno opcional"
            placeholderTextColor={ucapsaBrand.colors.muted}
            style={styles.noteInput}
            multiline
          />

          <Pressable
            disabled={!selectedDefinition || !selectedDog || (requiresSeason && !selectedSeason) || Boolean(existingSeasonWinner) || saving}
            style={[
              styles.primaryButton,
              (!selectedDefinition || !selectedDog || (requiresSeason && !selectedSeason) || existingSeasonWinner || saving) && styles.disabled,
            ]}
            onPress={() => void submit()}
          >
            {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="military-tech" size={20} color={ucapsaBrand.colors.surface} />}
            <Text style={styles.primaryButtonText}>{saving ? 'Otorgando…' : 'Otorgar premio'}</Text>
          </Pressable>
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
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 8, marginBottom: 9 },
  emptyCard: { gap: 4, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  choiceList: { gap: 8 },
  definitionCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  definitionCardSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redPale },
  definitionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.goldPale },
  definitionIconSelected: { backgroundColor: ucapsaBrand.colors.red },
  definitionTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginBottom: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  pillSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  pillText: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900' },
  pillTextSelected: { color: ucapsaBrand.colors.redDark },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 12, marginTop: 10 },
  warningText: { flex: 1, color: ucapsaBrand.colors.warningDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  dogRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  dogRowSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redPale },
  dogIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  dogIconSelected: { backgroundColor: ucapsaBrand.colors.red },
  dogTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  inactiveLabel: { color: ucapsaBrand.colors.grayDark, backgroundColor: ucapsaBrand.colors.graySoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  noteInput: { minHeight: 82, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 11, textAlignVertical: 'top' },
  primaryButton: { minHeight: 50, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginTop: 16 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
