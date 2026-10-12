import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  addCompetitionExamItem,
  createCompetitionExam,
  getAdminCompetitionExamWorkspace,
  publishCompetitionExam,
  type CompetitionSeason,
} from '../../services/ucapsa-competition.service';

export default function AdminQuickExamCreateScreen() {
  const [seasons, setSeasons] = useState<CompetitionSeason[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [title, setTitle] = useState('');
  const [maxText, setMaxText] = useState('100');
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const workspace = await getAdminCompetitionExamWorkspace();
      const available = workspace.seasons.filter((season) => ['active', 'reopened'].includes(season.status));
      setSeasons(available);
      setSeasonId((id) => available.some((season) => season.id === id) ? id : available[0]?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las temporadas.');
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function create() {
    const points = Number(maxText.trim().replace(',', '.'));
    if (!title.trim() || !seasonId || !Number.isFinite(points) || points <= 0 || saving) {
      Alert.alert('Revisa el examen', 'Indica nombre, temporada y máximo de puntos mayor que cero.');
      return;
    }
    let createdExamId: string | null = null;
    setSaving(true);
    try {
      const code = 'EX' + Date.now().toString(36).toUpperCase();
      createdExamId = await createCompetitionExam({
        seasonId, code, title: title.trim(), isRequiredForRanking: required,
        description: 'Evaluación rápida global, con un único criterio.',
      });
      await addCompetitionExamItem({
        examId: createdExamId, title: 'Calificación global', maxPoints: points,
        itemNumber: 1, sortOrder: 1,
      });
      await publishCompetitionExam(createdExamId);
      const examId = createdExamId;
      Alert.alert('Examen publicado', 'Ya puedes seleccionar un perro y capturar su resultado oficial.', [
        { text: 'Calificar', onPress: () => router.replace(`/admin/competition-quick-grade?examId=${encodeURIComponent(examId)}` as never) },
      ]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo crear el examen.';
      if (createdExamId) {
        const examId = createdExamId;
        Alert.alert('Examen sin publicar', 'Se creó el borrador, pero faltó un paso. No crees otro examen duplicado. ' + message, [
          { text: 'Abrir borrador', onPress: () => router.replace(`/admin/competition-exam-detail?examId=${encodeURIComponent(examId)}` as never) },
        ]);
      } else {
        Alert.alert('No se pudo crear', message);
      }
    } finally { setSaving(false); }
  }

  return (
    <KeyboardAwareScreen>
      <Text style={styles.kicker}>ADMINISTRACIÓN · EXÁMENES</Text>
      <Text style={styles.title}>Examen rápido</Text>
      <Text style={styles.muted}>Para una evaluación global, por ejemplo 80 de 100. Un solo criterio; si necesitas evaluar Sentado, Quieto y Llamado por separado, usa el editor detallado.</Text>
      {loading ? <ActivityIndicator color={ucapsaBrand.colors.red} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading ? (
        <>
          <Text style={styles.section}>Temporada</Text>
          {seasons.map((season) => (
            <Pressable key={season.id} style={[styles.option, seasonId === season.id && styles.selected]} onPress={() => setSeasonId(season.id)}>
              <Text style={styles.strong}>{season.name}</Text>
              {seasonId === season.id ? <MaterialIcons name="check-circle" color={ucapsaBrand.colors.redDark} size={22} /> : null}
            </Pressable>
          ))}
          {seasons.length === 0 ? <Text style={styles.muted}>Primero activa una temporada en Administración.</Text> : null}
          <Text style={styles.section}>Nombre del examen</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ej. Evaluación de Comandos" placeholderTextColor={ucapsaBrand.colors.muted} />
          <Text style={styles.section}>Puntos máximos</Text>
          <TextInput style={styles.input} value={maxText} onChangeText={setMaxText} keyboardType="decimal-pad" placeholder="100" placeholderTextColor={ucapsaBrand.colors.muted} />
          <View style={styles.option}>
            <View style={{ flex: 1 }}><Text style={styles.strong}>Obligatorio para Ranking</Text><Text style={styles.muted}>Todos los perros deberán presentarlo para entrar a la clasificación oficial.</Text></View>
            <Switch value={required} onValueChange={setRequired} trackColor={{ true: ucapsaBrand.colors.red }} />
          </View>
          <Pressable disabled={saving || !seasonId} onPress={() => void create()} style={[styles.primary, (saving || !seasonId) && styles.disabled]}>
            <MaterialIcons name="add-circle-outline" size={20} color={ucapsaBrand.colors.surface} />
            <Text style={styles.primaryText}>{saving ? 'Publicando…' : 'Crear y publicar examen'}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push('/admin/competition-exam-form' as never)}>
            <Text style={styles.link}>Editor avanzado por ejercicios</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  kicker: { marginTop: 10, color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 11 },
  title: { fontSize: 29, fontWeight: '900', color: ucapsaBrand.colors.text, marginTop: 7, marginBottom: 8 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18 },
  section: { fontWeight: '900', fontSize: 16, marginTop: 19, marginBottom: 8, color: ucapsaBrand.colors.text },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 13, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 8 },
  selected: { borderColor: ucapsaBrand.colors.red },
  strong: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 14 },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 13, backgroundColor: ucapsaBrand.colors.surface, padding: 14, color: ucapsaBrand.colors.text },
  primary: { backgroundColor: ucapsaBrand.colors.red, padding: 15, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  secondary: { alignItems: 'center', padding: 18 },
  link: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  error: { color: ucapsaBrand.colors.danger, paddingVertical: 12 },
});
