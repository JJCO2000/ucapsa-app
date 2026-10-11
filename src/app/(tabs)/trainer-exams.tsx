import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  createTrainerExamAttempt,
  getTrainerExamCatalog,
  getTrainerExamDogs,
  type TrainerExamCatalogRow,
  type TrainerExamDog,
} from '../../services/trainer-staff.service';

export default function TrainerExamsTab() {
  const { isTrainer } = useSession();
  const [exams, setExams] = useState<TrainerExamCatalogRow[]>([]);
  const [dogs, setDogs] = useState<TrainerExamDog[]>([]);
  const [selectedExam, setSelectedExam] = useState<TrainerExamCatalogRow | null>(null);
  const [dogQuery, setDogQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isTrainer) return;
    setError(null);
    try {
      const [examRows, dogRows] = await Promise.all([
        getTrainerExamCatalog(),
        getTrainerExamDogs(),
      ]);
      setExams(examRows);
      setDogs(dogRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los exámenes.');
    } finally {
      setLoading(false);
    }
  }, [isTrainer]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const filteredDogs = useMemo(() => {
    const term = dogQuery.trim().toLocaleLowerCase('es-MX');
    if (!term) return dogs.slice(0, 30);
    return dogs
      .filter((dog) => `${dog.dogName} ${dog.ownerName}`.toLocaleLowerCase('es-MX').includes(term))
      .slice(0, 30);
  }, [dogQuery, dogs]);

  async function startAttempt(dog: TrainerExamDog) {
    if (!selectedExam || saving) return;
    try {
      setSaving(true);
      const attemptId = await createTrainerExamAttempt(selectedExam.examId, dog.dogId);
      setSelectedExam(null);
      setDogQuery('');
      router.push(`/staff/exam-attempt?attemptId=${encodeURIComponent(String(attemptId))}` as never);
    } catch (cause) {
      Alert.alert('No se pudo iniciar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!isTrainer) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Entrenador · Evaluación</Text>
        <Text style={styles.title}>Exámenes</Text>
        <Text style={styles.subtitle}>Captura resultados. La configuración, publicación y elección del intento oficial siguen en Administración.</Text>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando exámenes…</Text></View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}><MaterialIcons name="error-outline" size={20} color={ucapsaBrand.colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {!loading && !error && exams.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="assignment" size={28} color={ucapsaBrand.colors.muted} />
          <Text style={styles.emptyTitle}>No hay exámenes publicados</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {exams.map((exam) => (
          <Pressable key={exam.examId} style={styles.examCard} onPress={() => { setSelectedExam(exam); setDogQuery(''); }}>
            <View style={styles.examIcon}><MaterialIcons name="assignment" size={21} color={ucapsaBrand.colors.purpleDark} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.examCode}>{exam.examCode}</Text>
              <Text style={styles.examTitle}>{exam.examTitle}</Text>
              <Text style={styles.examMeta}>{exam.seasonName} · {exam.itemCount} ejercicios · {exam.maxPoints} pts</Text>
            </View>
            <MaterialIcons name="play-arrow" size={23} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>

      <KeyboardAwareModal visible={Boolean(selectedExam)} onClose={() => setSelectedExam(null)}>
        <Text style={styles.modalKicker}>Nuevo intento</Text>
        <Text style={styles.modalTitle}>{selectedExam?.examTitle ?? 'Examen'}</Text>
        <Text style={styles.modalSubtitle}>Selecciona el perro que vas a evaluar.</Text>

        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={19} color={ucapsaBrand.colors.muted} />
          <TextInput
            value={dogQuery}
            onChangeText={setDogQuery}
            placeholder="Buscar perro o tutor"
            placeholderTextColor={ucapsaBrand.colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.dogList}>
          {filteredDogs.map((dog) => (
            <Pressable key={dog.dogId} disabled={saving} style={styles.dogRow} onPress={() => void startAttempt(dog)}>
              <View style={styles.dogIcon}><MaterialIcons name="pets" size={19} color={ucapsaBrand.colors.redDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dogName}>{dog.dogName}</Text>
                <Text style={styles.ownerName}>{dog.ownerName}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={21} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          ))}
        </View>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.dangerSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, padding: 12 },
  errorText: { flex: 1, color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 7, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 22 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 9 },
  examCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  examIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.purpleSoft },
  examCode: { color: ucapsaBrand.colors.purpleDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  examTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 1 },
  examMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 3 },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900' },
  modalSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3, marginBottom: 10 },
  searchBox: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '700', paddingVertical: 9 },
  dogList: { gap: 7, marginTop: 10 },
  dogRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 10 },
  dogIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  ownerName: { color: ucapsaBrand.colors.muted, fontSize: 9, fontWeight: '700', marginTop: 2 },
});
