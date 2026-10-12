import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  createCompetitionExamAttempt,
  getAdminCompetitionExamAttemptDetail,
  getAdminCompetitionExamAttemptsWorkspace,
  getAdminCompetitionExamWorkspace,
  publishCompetitionExamAttempt,
  reviewCompetitionExamAttempt,
  saveCompetitionExamItemResult,
  type AdminCompetitionExamAttemptDetail,
  type AdminCompetitionExamAttemptsWorkspace,
  type AdminCompetitionExamWorkspace,
} from '../../services/ucapsa-competition.service';

function numeric(text: string): number {
  return text.trim() ? Number(text.trim().replace(',', '.')) : NaN;
}

function labelNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function AdminCompetitionQuickGradeScreen() {
  const params = useLocalSearchParams<{ examId?: string | string[]; attemptId?: string | string[] }>();
  const paramExamId = Array.isArray(params.examId) ? params.examId[0] ?? '' : params.examId ?? '';
  const attemptId = Array.isArray(params.attemptId) ? params.attemptId[0] ?? '' : params.attemptId ?? '';
  const [selectedExamId, setSelectedExamId] = useState(paramExamId);
  const [exams, setExams] = useState<AdminCompetitionExamWorkspace | null>(null);
  const [workspace, setWorkspace] = useState<AdminCompetitionExamAttemptsWorkspace | null>(null);
  const [detail, setDetail] = useState<AdminCompetitionExamAttemptDetail | null>(null);
  const [query, setQuery] = useState('');
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (attemptId) {
        const next = await getAdminCompetitionExamAttemptDetail(attemptId);
        setDetail(next);
        setGrades(Object.fromEntries(next.results.map((item) => [item.exam_item_id, String(item.points_awarded)])));
        setWorkspace(null);
      } else {
        const list = await getAdminCompetitionExamWorkspace();
        setExams(list);
        setDetail(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo preparar la evaluación.');
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  useEffect(() => {
    if (attemptId || !selectedExamId) {
      setWorkspace(null);
      return;
    }
    let active = true;
    setError(null);
    void getAdminCompetitionExamAttemptsWorkspace(selectedExamId).then((next) => {
      if (active) setWorkspace(next);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los perros.');
    });
    return () => { active = false; };
  }, [attemptId, selectedExamId]);

  const published = useMemo(
    () => (exams?.exams ?? []).filter((exam) =>
      exam.status === 'published' && exams?.seasons.some(
        (season) => season.id === exam.season_id && ['active', 'reopened'].includes(season.status),
      )),
    [exams],
  );

  const dogs = useMemo(() => {
    const filter = query.trim().toLocaleLowerCase('es-MX');
    return (workspace?.dogs ?? []).filter((dog) =>
      !filter || [dog.name, dog.ownerName].some((value) => value?.toLocaleLowerCase('es-MX').includes(filter)),
    );
  }, [query, workspace]);

  async function begin(dogId: string) {
    if (!workspace || working) return;
    const existing = workspace.attempts.find((row) =>
      row.attempt.dog_id === dogId && ['draft', 'reviewed'].includes(row.attempt.status),
    );
    if (existing) {
      router.push(`/admin/competition-quick-grade?attemptId=${encodeURIComponent(existing.attempt.id)}` as never);
      return;
    }
    const previousOfficial = workspace.attempts.some((row) =>
      row.attempt.dog_id === dogId && row.attempt.is_official && row.attempt.status === 'published',
    );
    const create = async () => {
      setWorking(true);
      try {
        const id = await createCompetitionExamAttempt({ examId: workspace.exam.id, dogId });
        router.push(`/admin/competition-quick-grade?attemptId=${encodeURIComponent(id)}` as never);
      } catch (cause) {
        Alert.alert('No se pudo iniciar', cause instanceof Error ? cause.message : 'Reintenta.');
      } finally { setWorking(false); }
    };
    if (previousOfficial) {
      Alert.alert(
        'Este perro ya tiene resultado oficial',
        'Se creará un nuevo intento. Solo al confirmarlo como oficial sustituirá la calificación anterior; el historial se conserva.',
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Nuevo intento', onPress: () => void create() }],
      );
    } else {
      await create();
    }
  }

  const entries = detail?.items.map((item) => ({
    item,
    value: grades[item.id] ?? '',
    parsed: numeric(grades[item.id] ?? ''),
  })) ?? [];
  const allValid = entries.length > 0 && entries.every(({ item, parsed }) =>
    Number.isFinite(parsed) && parsed >= 0 && parsed <= Number(item.max_points),
  );
  const total = entries.reduce((sum, entry) => sum + (Number.isFinite(entry.parsed) ? entry.parsed : 0), 0);
  const mayFinalize = Boolean(
    detail && !detail.attempt.import_batch_id && detail.season?.status !== 'closed'
      && ['draft', 'reviewed'].includes(detail.attempt.status),
  );

  function confirmFinalize() {
    if (!detail || !allValid || !mayFinalize || working) {
      Alert.alert('Faltan calificaciones', 'Captura todos los ejercicios con valores de 0 hasta su máximo.');
      return;
    }
    const previous = detail.attempt.is_official ? '' : ' Si existe otro resultado oficial, este lo reemplazará sin borrar el histórico.';
    Alert.alert(
      'Guardar y publicar resultado oficial',
      `${detail.dog.name}: ${labelNumber(total)} de ${labelNumber(detail.maxPoints)} puntos.${previous} Esta acción actualizará el Ranking.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar y publicar', onPress: () => void finalize() }],
    );
  }

  async function finalize() {
    if (!detail || !allValid || !mayFinalize || working) return;
    setWorking(true);
    setError(null);
    try {
      if (detail.attempt.status === 'draft') {
        const previousByItem = new Map(detail.results.map((row) => [row.exam_item_id, Number(row.points_awarded)]));
        for (const { item, parsed } of entries) {
          if (previousByItem.get(item.id) !== parsed) {
            await saveCompetitionExamItemResult({
              attemptId: detail.attempt.id, examItemId: item.id, pointsAwarded: parsed,
            });
          }
        }
        await reviewCompetitionExamAttempt(detail.attempt.id);
      }
      await publishCompetitionExamAttempt({ attemptId: detail.attempt.id, makeOfficial: true });
      const completedId = detail.attempt.id;
      Alert.alert(
        'Resultado oficial publicado',
        'Los puntos se calcularon por ejercicio. El Ranking usará la nueva puntuación si el perro ya cumple los requisitos.',
        [
          { text: 'Ver resultado', onPress: () => router.replace(`/admin/competition-exam-attempt-detail?attemptId=${encodeURIComponent(completedId)}` as never) },
          { text: 'Ver Ranking', onPress: () => router.replace('/admin/competition-ranking' as never) },
        ],
      );
    } catch (cause) {
      // Un fallo intermedio deja los resultados existentes para que el Admin retome, sin crear puntos artificiales.
      setError(cause instanceof Error ? cause.message : 'No se completó la publicación. Revisa el intento.');
      await load();
    } finally { setWorking(false); }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>ADMINISTRACIÓN · COMPETENCIA</Text>
        <Text style={styles.title}>Calificar examen</Text>
        <Text style={styles.muted}>Elige examen y perro, captura puntos y confirma una sola vez. El sistema revisa y publica el resultado oficial.</Text>
      </View>
      {loading ? <ActivityIndicator color={ucapsaBrand.colors.red} /> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => detail ? router.push(`/admin/competition-exam-attempt-detail?attemptId=${encodeURIComponent(detail.attempt.id)}` as never) : void load()}><Text style={styles.link}>Revisar / reintentar</Text></Pressable></View> : null}
      {!loading && !attemptId ? (
        <>
          <Text style={styles.section}>1. Examen</Text>
          <View style={styles.cards}>
            {published.map((exam) => (
              <Pressable key={exam.id} style={[styles.row, selectedExamId === exam.id && styles.selected]} onPress={() => { setSelectedExamId(exam.id); setQuery(''); }}>
                <MaterialIcons name="assignment" size={21} color={ucapsaBrand.colors.redDark} />
                <View style={styles.flex}><Text style={styles.strong}>{exam.title}</Text><Text style={styles.muted}>{exam.seasonName} · máximo {exam.maxPoints} pts</Text></View>
                {selectedExamId === exam.id ? <MaterialIcons name="check-circle" size={22} color={ucapsaBrand.colors.redDark} /> : null}
              </Pressable>
            ))}
            {published.length === 0 && exams ? <Text style={styles.muted}>No hay exámenes publicados en una temporada activa. Crea o publica uno primero.</Text> : null}
          </View>
          {selectedExamId ? (
            <>
              <Text style={styles.section}>2. Perro</Text>
              <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Buscar perro o propietario" placeholderTextColor={ucapsaBrand.colors.muted} />
              <View style={styles.cards}>
                {dogs.map((dog) => (
                  <Pressable key={dog.id} style={styles.row} disabled={working} onPress={() => void begin(dog.id)}>
                    <MaterialIcons name="pets" size={22} color={ucapsaBrand.colors.redDark} />
                    <View style={styles.flex}><Text style={styles.strong}>{dog.name}</Text><Text style={styles.muted}>{dog.ownerName || 'Sin nombre de propietario'}</Text></View>
                    <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
                  </Pressable>
                ))}
                {workspace && dogs.length === 0 ? <Text style={styles.muted}>No hay perros que coincidan.</Text> : null}
              </View>
            </>
          ) : null}
        </>
      ) : null}
      {!loading && detail ? (
        <>
          <View style={styles.card}>
            <Text style={styles.strong}>{detail.exam.title} · {detail.dog.name}</Text>
            <Text style={styles.muted}>{detail.season?.name || 'Temporada'} · {detail.attempt.status === 'draft' ? 'Borrador' : detail.attempt.status === 'reviewed' ? 'Revisado' : 'Publicado'}</Text>
            <Text style={styles.total}>{labelNumber(total)} / {labelNumber(detail.maxPoints)} pts</Text>
          </View>
          {entries.map(({ item, value, parsed }) => (
            <View key={item.id} style={styles.gradeRow}>
              <View style={styles.flex}><Text style={styles.strong}>{item.title}</Text><Text style={styles.muted}>Máximo: {labelNumber(Number(item.max_points))} pts</Text></View>
              <TextInput
                style={[styles.gradeInput, value.trim() && !(Number.isFinite(parsed) && parsed >= 0 && parsed <= Number(item.max_points)) && styles.invalid]}
                keyboardType="decimal-pad" value={value} placeholder="0"
                editable={mayFinalize && detail.attempt.status === 'draft' && !working}
                onChangeText={(next) => setGrades((current) => ({ ...current, [item.id]: next }))}
              />
            </View>
          ))}
          {mayFinalize ? (
            <>
              {detail.attempt.status === 'reviewed' ? <Text style={styles.muted}>Este intento ya está revisado. Solo falta publicarlo; sus puntuaciones están bloqueadas.</Text> : null}
              <Pressable style={[styles.primary, (!allValid || working) && styles.disabled]} disabled={!allValid || working} onPress={confirmFinalize}>
                {working ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="task-alt" size={19} color={ucapsaBrand.colors.surface} />}
                <Text style={styles.primaryText}>{working ? 'Procesando…' : 'Guardar y publicar oficial'}</Text>
              </Pressable>
            </>
          ) : <Text style={styles.muted}>Para corregir un resultado publicado, abre el detalle histórico y crea un nuevo intento.</Text>}
          <Pressable style={styles.secondary} onPress={() => router.push(`/admin/competition-exam-attempt-detail?attemptId=${encodeURIComponent(detail.attempt.id)}` as never)}>
            <Text style={styles.link}>Ver historial y controles avanzados</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 5, marginBottom: 18 },
  kicker: { fontSize: 11, fontWeight: '900', color: ucapsaBrand.colors.redDark },
  title: { fontSize: 28, fontWeight: '900', color: ucapsaBrand.colors.text },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18 },
  section: { fontSize: 18, fontWeight: '900', color: ucapsaBrand.colors.text, marginTop: 13, marginBottom: 9 },
  cards: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface },
  selected: { borderColor: ucapsaBrand.colors.red },
  flex: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '900', fontSize: 15, color: ucapsaBrand.colors.text },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 13, backgroundColor: ucapsaBrand.colors.surface, padding: 12, color: ucapsaBrand.colors.text, marginBottom: 10 },
  card: { padding: 15, gap: 7, borderRadius: 18, backgroundColor: ucapsaBrand.colors.surface, borderColor: ucapsaBrand.colors.border, borderWidth: 1, marginVertical: 12 },
  total: { color: ucapsaBrand.colors.redDark, fontSize: 25, fontWeight: '900' },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, marginBottom: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  gradeInput: { width: 83, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 12, color: ucapsaBrand.colors.text, padding: 12, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  invalid: { borderColor: ucapsaBrand.colors.danger },
  primary: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: ucapsaBrand.colors.red, borderRadius: 14, padding: 15, marginTop: 15 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 15 },
  disabled: { opacity: 0.5 },
  secondary: { paddingVertical: 15, alignItems: 'center' },
  link: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  errorBox: { backgroundColor: ucapsaBrand.colors.dangerSoft, borderRadius: 13, padding: 12, gap: 8 },
  errorText: { color: ucapsaBrand.colors.danger, fontWeight: '800' },
});
