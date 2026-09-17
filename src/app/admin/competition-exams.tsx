import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  getAdminCompetitionExamWorkspace,
  type AdminCompetitionExamWorkspace,
  type CompetitionSeason,
} from '../../services/ucapsa-competition.service';

const emptyWorkspace: AdminCompetitionExamWorkspace = { seasons: [], exams: [] };

function statusLabel(status: string) {
  if (status === 'draft') return 'Borrador';
  if (status === 'published') return 'Publicado';
  if (status === 'archived') return 'Archivado';
  return status;
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminCompetitionExamsScreen() {
  const [workspace, setWorkspace] = useState<AdminCompetitionExamWorkspace>(emptyWorkspace);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWorkspace(await getAdminCompetitionExamWorkspace());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los exámenes.');
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

  const visibleExams = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    return workspace.exams.filter((exam) => {
      if (seasonId && exam.season_id !== seasonId) return false;
      if (!clean) return true;
      return [exam.code, exam.title, exam.seasonName].some((value) => value.toLocaleLowerCase('es-MX').includes(clean));
    });
  }, [query, seasonId, workspace.exams]);

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>Exámenes</Text>
        <Text style={styles.subtitle}>Define cada examen y su estructura de ejercicios. Los puntajes máximos viven aquí; los resultados pertenecen a los intentos.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={() => router.push('/admin/competition-exam-form' as never)}>
        <MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} />
        <Text style={styles.primaryButtonText}>Nuevo examen</Text>
      </Pressable>

      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando exámenes…</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error ? (
        <>
          <Text style={styles.sectionTitle}>Temporada</Text>
          <View style={styles.pills}>
            <SeasonPill label="Todas" selected={!seasonId} onPress={() => setSeasonId(null)} />
            {workspace.seasons.map((season) => (
              <SeasonPill key={season.id} label={season.name} selected={season.id === seasonId} onPress={() => setSeasonId(season.id)} season={season} />
            ))}
          </View>

          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar código, examen o temporada"
              placeholderTextColor={ucapsaBrand.colors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>

          {visibleExams.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="assignment" size={26} color={ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>{query.trim() || seasonId ? 'Sin coincidencias' : 'Todavía no hay exámenes'}</Text>
                <Text style={styles.muted}>Crea un examen para definir sus ejercicios y máximos de puntuación.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {visibleExams.map((exam) => (
                <Pressable
                  key={exam.id}
                  style={styles.examRow}
                  onPress={() => router.push(`/admin/competition-exam-detail?examId=${encodeURIComponent(exam.id)}` as never)}
                >
                  <View style={styles.examIcon}><MaterialIcons name="assignment" size={21} color={ucapsaBrand.colors.redDark} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.titleLine}>
                      <Text style={styles.examCode}>{exam.code}</Text>
                      <View style={[styles.statusPill, exam.status === 'published' && styles.statusPublished, exam.status === 'archived' && styles.statusArchived]}>
                        <Text style={[styles.statusText, exam.status === 'published' && styles.statusPublishedText]}>{statusLabel(exam.status)}</Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={styles.examTitle}>{exam.title}</Text>
                    <Text style={styles.muted}>{exam.seasonName} · {dateLabel(exam.exam_date)}</Text>
                    <Text style={styles.meta}>{exam.itemCount} ejercicio{exam.itemCount === 1 ? '' : 's'} · {exam.maxPoints} pts máx. · {exam.is_required_for_ranking ? 'Obligatorio' : 'Opcional'}</Text>
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

function SeasonPill({ label, selected, onPress, season }: { label: string; selected: boolean; onPress: () => void; season?: CompetitionSeason }) {
  return (
    <Pressable style={[styles.pill, selected && styles.pillSelected]} onPress={onPress}>
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}{season?.status === 'closed' ? ' · cerrada' : ''}</Text>
    </Pressable>
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
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, marginBottom: 12, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 11 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 7 },
  pillSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  pillText: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  pillTextSelected: { color: ucapsaBrand.colors.redDark },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 11 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 9 },
  examRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  examIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  examCode: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  examTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  statusPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.graySoft, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { color: ucapsaBrand.colors.grayDark, fontSize: 8, fontWeight: '900' },
  statusPublished: { backgroundColor: ucapsaBrand.colors.successSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder },
  statusPublishedText: { color: ucapsaBrand.colors.successDark },
  statusArchived: { opacity: 0.75 },
  meta: { color: ucapsaBrand.colors.text, fontSize: 10, lineHeight: 15, fontWeight: '800', marginTop: 3 },
});
