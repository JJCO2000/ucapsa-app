import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  createCompetitionExamAttempt,
  getAdminCompetitionExamAttemptsWorkspace,
  type AdminCompetitionExamAttemptsWorkspace,
} from '../../services/ucapsa-competition.service';

function mexicoNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function validTimeKey(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function mexicoLocalToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-06:00`).toISOString();
}

export default function AdminCompetitionExamAttemptFormScreen() {
  const { examId: examIdParam } = useLocalSearchParams<{ examId?: string | string[] }>();
  const examId = Array.isArray(examIdParam) ? examIdParam[0] ?? '' : examIdParam ?? '';
  const now = useMemo(mexicoNowParts, []);
  const [workspace, setWorkspace] = useState<AdminCompetitionExamAttemptsWorkspace | null>(null);
  const [dogId, setDogId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dateKey, setDateKey] = useState(now.date);
  const [timeKey, setTimeKey] = useState(now.time);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!examId) {
      setError('Falta el examen.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setWorkspace(await getAdminCompetitionExamAttemptsWorkspace(examId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo preparar el intento.');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  const dogs = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('es-MX');
    if (!clean) return workspace?.dogs ?? [];
    return (workspace?.dogs ?? []).filter((dog) =>
      [dog.name, dog.ownerName].some((value) => value?.toLocaleLowerCase('es-MX').includes(clean)),
    );
  }, [query, workspace?.dogs]);

  const selectedDog = workspace?.dogs.find((dog) => dog.id === dogId) ?? null;
  const blocked = Boolean(
    workspace
    && (workspace.exam.status !== 'published' || workspace.season?.status === 'closed'),
  );

  async function submit() {
    if (!workspace || !selectedDog || blocked || saving) return;
    const cleanDate = dateKey.trim();
    const cleanTime = timeKey.trim();
    if (!validDateKey(cleanDate) || !validTimeKey(cleanTime)) {
      Alert.alert('Fecha u hora inválida', 'Usa AAAA-MM-DD y HH:MM con hora de Ciudad de México.');
      return;
    }

    setSaving(true);
    try {
      const attemptId = await createCompetitionExamAttempt({
        examId: workspace.exam.id,
        dogId: selectedDog.id,
        presentedAt: mexicoLocalToIso(cleanDate, cleanTime),
      });
      router.replace(`/admin/competition-exam-attempt-detail?attemptId=${encodeURIComponent(attemptId)}` as never);
    } catch (actionError) {
      Alert.alert('No se pudo crear', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>{workspace?.exam.code || 'EXAMEN'}</Text>
        <Text style={styles.title}>Nuevo intento</Text>
        <Text style={styles.subtitle}>Selecciona al perro y registra cuándo presentó el examen. El intento inicia siempre en borrador.</Text>
      </View>

      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Preparando intento…</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error && workspace ? (
        <>
          {blocked ? (
            <View style={styles.lockCard}>
              <MaterialIcons name="lock" size={19} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.lockText}>{workspace.season?.status === 'closed' ? 'La temporada está cerrada.' : 'El examen todavía no está publicado.'}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Fecha de presentación</Text>
              <View style={styles.dateRow}>
                <TextInput value={dateKey} onChangeText={setDateKey} placeholder="AAAA-MM-DD" placeholderTextColor={ucapsaBrand.colors.muted} style={[styles.input, styles.dateInput]} autoCapitalize="none" />
                <TextInput value={timeKey} onChangeText={setTimeKey} placeholder="HH:MM" placeholderTextColor={ucapsaBrand.colors.muted} style={[styles.input, styles.timeInput]} autoCapitalize="none" />
              </View>
              <Text style={styles.help}>Hora de Ciudad de México.</Text>

              <Text style={styles.label}>Perro</Text>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Buscar perro o dueño" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.searchInput} autoCapitalize="none" />
              </View>

              <View style={styles.list}>
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
                          {!dog.is_active ? <Text style={styles.inactivePill}>Inactivo</Text> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.muted}>{dog.ownerName || 'Dueño sin nombre'}</Text>
                      </View>
                      {selected ? <MaterialIcons name="check-circle" size={21} color={ucapsaBrand.colors.red} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              {dogs.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Sin coincidencias</Text><Text style={styles.muted}>Prueba otro nombre de perro o dueño.</Text></View> : null}

              <Pressable disabled={!selectedDog || saving} style={[styles.primaryButton, (!selectedDog || saving) && styles.disabled]} onPress={() => void submit()}>
                {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : <MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} />}
                <Text style={styles.primaryButtonText}>{saving ? 'Creando…' : 'Crear intento'}</Text>
              </Pressable>
            </>
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
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13, gap: 3 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  lockCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 11 },
  lockText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  dateRow: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 10 },
  dateInput: { flex: 1.4 },
  timeInput: { flex: 0.8 },
  help: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '700', marginTop: 4 },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 9 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  list: { gap: 8 },
  dogRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  dogRowSelected: { borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redPale },
  dogIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  dogIconSelected: { backgroundColor: ucapsaBrand.colors.red },
  dogTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  inactivePill: { color: ucapsaBrand.colors.grayDark, backgroundColor: ucapsaBrand.colors.graySoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  emptyCard: { gap: 4, borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 15, marginTop: 16 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
