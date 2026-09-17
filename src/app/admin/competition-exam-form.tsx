import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  createCompetitionExam,
  getAdminCompetitionExamDetail,
  getAdminCompetitionExamWorkspace,
  updateCompetitionExam,
  type CompetitionExam,
  type CompetitionSeason,
} from '../../services/ucapsa-competition.service';

function validDateKey(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export default function AdminCompetitionExamFormScreen() {
  const { examId: examIdParam } = useLocalSearchParams<{ examId?: string | string[] }>();
  const examId = Array.isArray(examIdParam) ? examIdParam[0] ?? null : examIdParam ?? null;
  const [seasons, setSeasons] = useState<CompetitionSeason[]>([]);
  const [existingExam, setExistingExam] = useState<CompetitionExam | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [examDate, setExamDate] = useState('');
  const [required, setRequired] = useState(true);
  const [sortOrder, setSortOrder] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const workspace = await getAdminCompetitionExamWorkspace();
      setSeasons(workspace.seasons);

      if (examId) {
        const detail = await getAdminCompetitionExamDetail(examId);
        setExistingExam(detail.exam);
        setSeasonId(detail.exam.season_id);
        setCode(detail.exam.code);
        setTitle(detail.exam.title);
        setDescription(detail.exam.description ?? '');
        setExamDate(detail.exam.exam_date ?? '');
        setRequired(detail.exam.is_required_for_ranking);
        setSortOrder(String(detail.exam.sort_order));
      } else {
        const available = workspace.seasons.filter((season) => season.status !== 'closed');
        const preferred = available.find((season) => season.status === 'active')
          ?? available.find((season) => season.status === 'reopened')
          ?? available[0]
          ?? null;
        setSeasonId((current) => current ?? preferred?.id ?? null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo preparar el examen.');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  const selectedSeason = seasons.find((season) => season.id === seasonId) ?? null;
  const mutable = Boolean(selectedSeason && selectedSeason.status !== 'closed' && existingExam?.status !== 'archived');
  const creating = !examId;
  const codeEditable = creating || existingExam?.status === 'draft';

  async function save() {
    if (saving) return;
    const cleanCode = code.trim();
    const cleanTitle = title.trim();
    const cleanDate = examDate.trim();
    const parsedOrder = Number(sortOrder.trim() || '0');

    if (!seasonId || !cleanCode || !cleanTitle) {
      Alert.alert('Faltan datos', 'Selecciona temporada y escribe código y título.');
      return;
    }
    if (!validDateKey(cleanDate)) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD o deja la fecha vacía.');
      return;
    }
    if (!Number.isFinite(parsedOrder)) {
      Alert.alert('Orden inválido', 'El orden debe ser un número entero.');
      return;
    }

    setSaving(true);
    try {
      let savedId: string;
      if (examId) {
        savedId = await updateCompetitionExam({
          examId,
          code: cleanCode,
          title: cleanTitle,
          description,
          examDate: cleanDate || null,
          isRequiredForRanking: required,
          sortOrder: Math.round(parsedOrder),
        });
      } else {
        savedId = await createCompetitionExam({
          seasonId,
          code: cleanCode,
          title: cleanTitle,
          description,
          examDate: cleanDate || null,
          isRequiredForRanking: required,
          sortOrder: Math.round(parsedOrder),
        });
      }
      router.replace(`/admin/competition-exam-detail?examId=${encodeURIComponent(savedId)}` as never);
    } catch (actionError) {
      Alert.alert('No se pudo guardar', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Competencia UCAPSA</Text>
        <Text style={styles.title}>{creating ? 'Nuevo examen' : 'Editar examen'}</Text>
        <Text style={styles.subtitle}>Aquí vive la definición del examen. Los ejercicios y sus máximos se administran por separado.</Text>
      </View>

      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Preparando examen…</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error ? (
        <>
          <Text style={styles.label}>Temporada</Text>
          {creating ? (
            <View style={styles.pills}>
              {seasons.filter((season) => season.status !== 'closed').map((season) => {
                const selected = season.id === seasonId;
                return (
                  <Pressable key={season.id} style={[styles.pill, selected && styles.pillSelected]} onPress={() => setSeasonId(season.id)}>
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{season.name} · {season.status}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.readonlyCard}>
              <MaterialIcons name="calendar-month" size={19} color={ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.readonlyValue}>{selectedSeason?.name || 'Temporada no disponible'}</Text>
                <Text style={styles.muted}>{selectedSeason?.status || 'sin estado'}</Text>
              </View>
            </View>
          )}

          {!creating && !mutable ? (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>Este examen no puede editarse mientras la temporada esté cerrada o el examen esté archivado.</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Código</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            editable={codeEditable && (creating || mutable)}
            autoCapitalize="characters"
            placeholder="Ej. OB-2026"
            placeholderTextColor={ucapsaBrand.colors.muted}
            style={[styles.input, (!codeEditable || (!creating && !mutable)) && styles.inputDisabled]}
          />
          {!codeEditable ? <Text style={styles.help}>El código queda fijo después de publicar.</Text> : null}

          <Text style={styles.label}>Título</Text>
          <TextInput value={title} onChangeText={setTitle} editable={creating || mutable} placeholder="Nombre del examen" placeholderTextColor={ucapsaBrand.colors.muted} style={[styles.input, !creating && !mutable && styles.inputDisabled]} />

          <Text style={styles.label}>Descripción opcional</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            editable={creating || mutable}
            placeholder="Qué evalúa este examen"
            placeholderTextColor={ucapsaBrand.colors.muted}
            style={[styles.input, styles.multiline, !creating && !mutable && styles.inputDisabled]}
            multiline
          />

          <Text style={styles.label}>Fecha opcional</Text>
          <TextInput
            value={examDate}
            onChangeText={setExamDate}
            editable={creating || mutable}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={ucapsaBrand.colors.muted}
            style={[styles.input, !creating && !mutable && styles.inputDisabled]}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Orden</Text>
          <TextInput
            value={sortOrder}
            onChangeText={setSortOrder}
            editable={creating || mutable}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={ucapsaBrand.colors.muted}
            style={[styles.input, !creating && !mutable && styles.inputDisabled]}
          />

          <Text style={styles.label}>Elegibilidad competitiva</Text>
          <Pressable
            disabled={!creating && !mutable}
            style={[styles.toggleCard, required && styles.toggleCardSelected, !creating && !mutable && styles.disabled]}
            onPress={() => setRequired((current) => !current)}
          >
            <View style={[styles.toggleIcon, required && styles.toggleIconSelected]}>
              <MaterialIcons name={required ? 'check' : 'remove'} size={18} color={required ? ucapsaBrand.colors.surface : ucapsaBrand.colors.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>{required ? 'Obligatorio' : 'Opcional'}</Text>
              <Text style={styles.help}>Sólo define si este examen es requisito canónico. No calcula Ranking ni posiciones.</Text>
            </View>
          </Pressable>

          {(creating || mutable) ? (
            <Pressable disabled={saving || !seasonId} style={[styles.primaryButton, (saving || !seasonId) && styles.disabled]} onPress={() => void save()}>
              {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="save" size={20} color={ucapsaBrand.colors.surface} />}
              <Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : creating ? 'Crear examen' : 'Guardar cambios'}</Text>
            </Pressable>
          ) : null}
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
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 11, marginBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  pillSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft },
  pillText: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '900' },
  pillTextSelected: { color: ucapsaBrand.colors.redDark },
  readonlyCard: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  readonlyValue: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11, marginTop: 10 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 10 },
  inputDisabled: { backgroundColor: ucapsaBrand.colors.graySoft, color: ucapsaBrand.colors.grayDark },
  multiline: { minHeight: 78, textAlignVertical: 'top' },
  help: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 4 },
  toggleCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  toggleCardSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redPale },
  toggleIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.graySoft },
  toggleIconSelected: { backgroundColor: ucapsaBrand.colors.red },
  toggleTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  primaryButton: { minHeight: 50, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginTop: 16 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
