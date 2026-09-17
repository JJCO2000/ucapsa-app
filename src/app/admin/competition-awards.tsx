import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminCompetitionAwardWorkspace,
  revokeCompetitionDogAward,
  type AdminCompetitionAwardRow,
  type AdminCompetitionAwardWorkspace,
} from '../../services/ucapsa-competition.service';

const emptyWorkspace: AdminCompetitionAwardWorkspace = {
  definitions: [],
  seasons: [],
  dogs: [],
  awards: [],
};

function dateTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminCompetitionAwardsScreen() {
  const [workspace, setWorkspace] = useState<AdminCompetitionAwardWorkspace>(emptyWorkspace);
  const [query, setQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingAwardId, setWorkingAwardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWorkspace(await getAdminCompetitionAwardWorkspace());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los premios.');
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

  const visibleAwards = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    return workspace.awards.filter((award) => {
      if (!showHistory && award.revoked_at) return false;
      if (!clean) return true;
      return [
        award.dogName,
        award.ownerName,
        award.awardTitle,
        award.seasonName,
      ].some((value) => value?.toLocaleLowerCase('es-MX').includes(clean));
    });
  }, [query, showHistory, workspace.awards]);

  const activeCount = workspace.awards.filter((award) => !award.revoked_at).length;
  const revokedCount = workspace.awards.filter((award) => Boolean(award.revoked_at)).length;

  function confirmRevoke(award: AdminCompetitionAwardRow) {
    Alert.alert(
      'Revocar premio',
      `${award.awardTitle} dejará de aparecer como vigente para ${award.dogName}. El registro histórico se conserva.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revocar',
          style: 'destructive',
          onPress: () => void runRevoke(award),
        },
      ],
    );
  }

  async function runRevoke(award: AdminCompetitionAwardRow) {
    if (workingAwardId) return;
    setWorkingAwardId(award.id);
    try {
      await revokeCompetitionDogAward({ awardId: award.id });
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo revocar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorkingAwardId(null);
    }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>Premios</Text>
        <Text style={styles.subtitle}>Reconocimientos institucionales otorgados explícitamente a un perro. No se derivan del Ranking ni del Podio.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={() => router.push('/admin/competition-award-form' as never)}>
        <MaterialIcons name="military-tech" size={20} color={ucapsaBrand.colors.surface} />
        <Text style={styles.primaryButtonText}>Otorgar premio</Text>
      </Pressable>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando premios…</Text>
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
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{activeCount}</Text>
              <Text style={styles.metricLabel}>vigentes</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{revokedCount}</Text>
              <Text style={styles.metricLabel}>revocados</Text>
            </View>
          </View>

          <View style={styles.modeRow}>
            <Pressable style={[styles.modePill, !showHistory && styles.modePillSelected]} onPress={() => setShowHistory(false)}>
              <Text style={[styles.modeText, !showHistory && styles.modeTextSelected]}>Vigentes</Text>
            </Pressable>
            <Pressable style={[styles.modePill, showHistory && styles.modePillSelected]} onPress={() => setShowHistory(true)}>
              <Text style={[styles.modeText, showHistory && styles.modeTextSelected]}>Historial completo</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar perro, dueño, premio o temporada"
              placeholderTextColor={ucapsaBrand.colors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>

          {visibleAwards.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="military-tech" size={26} color={ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>{query.trim() ? 'Sin coincidencias' : showHistory ? 'Todavía no hay premios' : 'No hay premios vigentes'}</Text>
                <Text style={styles.muted}>{query.trim() ? 'Prueba otra búsqueda.' : 'Cuando Admin otorgue un reconocimiento aparecerá aquí.'}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {visibleAwards.map((award) => {
                const revoked = Boolean(award.revoked_at);
                return (
                  <View key={award.id} style={[styles.awardRow, revoked && styles.awardRowRevoked]}>
                    <View style={[styles.awardIcon, revoked && styles.awardIconRevoked]}>
                      <MaterialIcons name="military-tech" size={22} color={revoked ? ucapsaBrand.colors.grayDark : ucapsaBrand.colors.goldDark} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleLine}>
                        <Text numberOfLines={1} style={styles.awardTitle}>{award.awardTitle}</Text>
                        <View style={[styles.statusPill, revoked && styles.statusRevoked]}>
                          <Text style={[styles.statusText, revoked && styles.statusRevokedText]}>{revoked ? 'Revocado' : 'Vigente'}</Text>
                        </View>
                      </View>
                      <Text style={styles.dogName}>{award.dogName}</Text>
                      <Text style={styles.muted}>{award.ownerName || 'Dueño sin nombre'}{award.seasonName ? ` · ${award.seasonName}` : ''}</Text>
                      <Text style={styles.dateText}>Otorgado {dateTimeLabel(award.awarded_at)}</Text>
                      {award.note ? <Text style={styles.note}>{award.note}</Text> : null}
                      {revoked && award.revoked_at ? <Text style={styles.revokedMeta}>Revocado {dateTimeLabel(award.revoked_at)}</Text> : null}
                    </View>
                    {!revoked ? (
                      <Pressable
                        disabled={workingAwardId === award.id}
                        style={[styles.revokeButton, workingAwardId === award.id && styles.disabled]}
                        onPress={() => confirmRevoke(award)}
                      >
                        {workingAwardId === award.id
                          ? <ActivityIndicator size="small" color={ucapsaBrand.colors.redDark} />
                          : <MaterialIcons name="block" size={18} color={ucapsaBrand.colors.redDark} />}
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.auditNote}>
            <MaterialIcons name="history" size={19} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.auditText}>Revocar no borra el premio. El histórico y la auditoría permanecen; si fue una corrección, después puedes otorgar el reconocimiento correcto.</Text>
          </View>
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
  primaryButton: { minHeight: 48, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginBottom: 14 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, marginBottom: 12, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  metricsRow: { flexDirection: 'row', gap: 9, marginBottom: 11 },
  metric: { flex: 1, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '800', marginTop: 2 },
  modeRow: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  modePill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11, paddingVertical: 8 },
  modePillSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  modeText: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900' },
  modeTextSelected: { color: ucapsaBrand.colors.redDark },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 11 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 9 },
  awardRow: { minHeight: 92, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  awardRowRevoked: { backgroundColor: ucapsaBrand.colors.graySoft },
  awardIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.goldPale },
  awardIconRevoked: { backgroundColor: ucapsaBrand.colors.surface },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  awardTitle: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  statusPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.successSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { color: ucapsaBrand.colors.successDark, fontSize: 8, fontWeight: '900' },
  statusRevoked: { backgroundColor: ucapsaBrand.colors.surface, borderColor: ucapsaBrand.colors.borderNeutral },
  statusRevokedText: { color: ucapsaBrand.colors.grayDark },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 3 },
  dateText: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '700', marginTop: 3 },
  note: { color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  revokedMeta: { color: ucapsaBrand.colors.grayDark, fontSize: 10, fontWeight: '800', marginTop: 3 },
  revokeButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  disabled: { opacity: 0.55 },
  auditNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginTop: 12 },
  auditText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
});
