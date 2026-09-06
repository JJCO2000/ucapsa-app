import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPracticeActivity, saveMyPracticeSession, type PracticeActivitySnapshot } from '../../services/practice.service';
import { DEFAULT_PRACTICE_TARGET_DAYS, getPracticeGoalProgress, getPracticeTargetDays, togglePracticeTargetDay, type PracticeTargetDay } from '../../services/practice-goal-preference.service';
import { getMyProgramEnrollments, getProgramEnrollmentDogName } from '../../services/programs.service';
import type { PracticeDifficulty, ProgramEnrollmentWithDetails } from '../../types/app.types';


function localPracticeDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentWeekDays(completedAtValues: string[], now = new Date()) {
  const practiced = new Set(
    completedAtValues
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map(localPracticeDateKey),
  );
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 12, 0, 0, 0);
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const todayKey = localPracticeDateKey(now);
  return labels.map((label, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12, 0, 0, 0);
    const dateKey = localPracticeDateKey(date);
    return {
      dateKey,
      label,
      weekday: date.getDay() as PracticeTargetDay,
      practiced: practiced.has(dateKey),
      isToday: dateKey === todayKey,
    };
  });
}

function formatPracticeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PracticeActivityScreen() {
  const { user, role, isAdmin } = useSession();
  const [activity, setActivity] = useState<PracticeActivitySnapshot | null>(null);
  const [activeProgram, setActiveProgram] = useState<ProgramEnrollmentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [targetDays, setTargetDays] = useState<PracticeTargetDay[]>(DEFAULT_PRACTICE_TARGET_DAYS);
  const [savingTarget, setSavingTarget] = useState(false);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: Boolean(activeProgram) }), [activeProgram, isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    try {
      const [practice, programs, savedTargetDays] = await Promise.all([getMyPracticeActivity(user.id), getMyProgramEnrollments(), getPracticeTargetDays(user.id)]);
      setActivity(practice);
      setTargetDays(savedTargetDays);
      setActiveProgram(programs.find((item) => item.enrollment.status === 'active') ?? null);
    } catch {
      setError('No pudimos cargar tu actividad de práctica.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }


  async function toggleTarget(day: PracticeTargetDay) {
    if (!user || savingTarget) return;
    setSavingTarget(true);
    try {
      const next = await togglePracticeTargetDay(user.id, targetDays, day);
      setTargetDays(next);
    } finally {
      setSavingTarget(false);
    }
  }

  function openPractice() {
    if (!activeProgram) return;
    setStartedAt(new Date().toISOString());
    setDifficulty(null);
    setNote('');
    setModalOpen(true);
  }

  async function savePractice() {
    if (!user || !activeProgram || !startedAt || !difficulty) return;
    try {
      setSaving(true);
      const result = await saveMyPracticeSession({
        userId: user.id,
        enrollmentId: activeProgram.enrollment.id,
        dogId: activeProgram.enrollment.dog_id ?? null,
        dogName: getProgramEnrollmentDogName(activeProgram),
        startedAt,
        difficulty,
        note,
      });
      setModalOpen(false);
      await load();
      Alert.alert(result.syncStatus === 'synced' ? 'Práctica guardada' : 'Práctica guardada en el dispositivo', result.syncStatus === 'synced' ? 'Tu racha y actividad ya se actualizaron.' : 'Se sincronizará cuando vuelva la conexión.');
    } catch {
      Alert.alert('No pudimos guardar', 'La práctica no se registró. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  const stats = activity?.stats;
  const dogName = activeProgram ? getProgramEnrollmentDogName(activeProgram) : 'tu perro';
  const completedAtValues = (activity?.entries ?? []).map((entry) => entry.completedAt);
  const goalProgress = getPracticeGoalProgress(completedAtValues, targetDays);
  const weekDays = currentWeekDays(completedAtValues);

  return (
    <KeyboardAwareScreen
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="home" />
      <ClientPageHeader
        format={format}
        eyebrow="Hábito de entrenamiento"
        title="Racha y práctica"
        subtitle="Tu constancia fuera de clase, medida con prácticas reales."
        icon="local-fire-department"
      />

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando práctica...</Text></View> : null}
      {error ? <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.stateTitle, { color: format.cardText }]}>{error}</Text></View> : null}

      {stats ? (
        <>
          <View style={[styles.heroCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <View style={styles.heroTop}>
              <View style={[styles.fireSeal, { backgroundColor: format.accentSoft }]}><MaterialIcons name="local-fire-department" size={30} color={format.accentDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroEyebrow, { color: format.accentDark }]}>RACHA ACTUAL</Text>
                <Text style={[styles.heroValue, { color: format.cardText }]}>{stats.currentStreak} día{stats.currentStreak === 1 ? '' : 's'}</Text>
                <Text style={[styles.heroMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Mejor racha: {stats.longestStreak} · {goalProgress.completedTargets}/{goalProgress.targetCount} objetivo semanal</Text>
              </View>
            </View>

            <View style={styles.goalHintRow}>
              <Text style={[styles.goalHint, { color: format.muted }]}>Toca los días que quieres practicar. El ✓ sólo aparece con una práctica real.</Text>
              <Text style={[styles.goalCount, { color: premium ? ucapsaBrand.colors.premiumActionText : format.accentDark }]}>{goalProgress.completedTargets}/{goalProgress.targetCount}</Text>
            </View>

            <View style={styles.weekRow}>
              {weekDays.map((day) => {
                const weekday = day.weekday;
                const planned = targetDays.includes(weekday);
                const selectedBorder = premium ? ucapsaBrand.colors.premiumAction : format.accent;
                const idleBackground = premium ? ucapsaBrand.colors.premiumSurface : format.secondaryButton;
                const plannedBackground = premium ? ucapsaBrand.colors.premiumSurfaceAlt : ucapsaBrand.colors.surface;
                const completedBackground = premium ? ucapsaBrand.colors.premiumAction : format.accent;
                return (
                  <Pressable
                    key={day.dateKey}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.label}. ${planned ? 'Día objetivo' : 'No seleccionado'}. ${day.practiced ? 'Práctica registrada' : 'Sin práctica registrada'}`}
                    disabled={savingTarget}
                    onPress={() => void toggleTarget(weekday)}
                    style={styles.dayItem}
                  >
                    <View
                      style={[
                        styles.dayDot,
                        {
                          borderColor: day.practiced || planned ? selectedBorder : format.cardBorder,
                          backgroundColor: day.practiced ? completedBackground : planned ? plannedBackground : idleBackground,
                        },
                        day.isToday && styles.dayToday,
                      ]}
                    >
                      {day.practiced ? <MaterialIcons name="check" size={13} color={premium ? ucapsaBrand.colors.premiumActionText : format.primaryButtonText} /> : planned ? <View style={[styles.plannedDot, { backgroundColor: selectedBorder }]} /> : null}
                    </View>
                    <Text style={[styles.dayLabel, { color: planned || day.practiced ? (premium ? ucapsaBrand.colors.premiumActionText : format.accentDark) : format.muted }]}>{day.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable disabled={!activeProgram} style={[styles.practiceButton, { backgroundColor: activeProgram ? format.primaryButton : format.secondaryButton }]} onPress={openPractice}>
              <MaterialIcons name="play-arrow" size={21} color={activeProgram ? format.primaryButtonText : format.muted} />
              <Text style={[styles.practiceButtonText, { color: activeProgram ? format.primaryButtonText : format.muted }]}>{activeProgram ? `Practicar con ${dogName}` : 'Sin programa activo'}</Text>
            </Pressable>
          </View>

          <View style={styles.statsGrid}>
            <StatCard format={format} premium={premium} value={stats.thisMonthCount} label="prácticas este mes" />
            <StatCard format={format} premium={premium} value={stats.activeDaysThisMonth} label="días activos este mes" />
            <StatCard format={format} premium={premium} value={activity?.entries.length ?? 0} label="prácticas registradas" />
          </View>

          <Pressable style={[styles.badgesLink, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => router.push('/client/activity-achievements' as never)}>
            <View style={[styles.badgesIcon, { backgroundColor: format.accentSoft }]}><MaterialIcons name="stars" size={21} color={format.accentDark} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.badgesTitle, { color: format.cardText }]}>Insignias de actividad</Text><Text style={[styles.badgesMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{premium ? 'Rachas, prácticas, asistencias y visitas de socio' : 'Rachas, prácticas y asistencias'}</Text></View>
            <MaterialIcons name="chevron-right" size={22} color={format.accentDark} />
          </Pressable>

          <View style={styles.historySection}>
            <Text style={[styles.sectionTitle, { color: format.text }]}>Prácticas recientes</Text>
            {(activity?.entries ?? []).slice(0, 12).map((entry) => (
              <View key={entry.id} style={[styles.historyRow, { borderColor: premium ? withAlpha(ucapsaBrand.colors.gold, 0.2) : format.cardBorder, backgroundColor: format.cardBackground }]}>
                <View style={[styles.historyIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="pets" size={18} color={format.pillText} /></View>
                <View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.historyTitle, { color: format.cardText }]}>{formatPracticeDate(entry.completedAt)}</Text><Text style={[styles.historyMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{entry.dogName || 'Tu perro'} · {entry.difficulty === 'easy' ? 'Fácil' : entry.difficulty === 'hard' ? 'Difícil' : 'Bien'}{entry.syncStatus === 'pending' ? ' · por sincronizar' : ''}</Text></View>
              </View>
            ))}
            {activity?.entries.length === 0 ? <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tu primera práctica aparecerá aquí.</Text> : null}
          </View>
        </>
      ) : null}

      <KeyboardAwareModal visible={modalOpen} onClose={() => !saving && setModalOpen(false)}>
        <View style={styles.modal}>
          <Text style={styles.modalEyebrow}>Práctica con {dogName}</Text>
          <Text style={styles.modalTitle}>¿Cómo les fue?</Text>
          <View style={styles.difficultyRow}>
            {([['easy', 'Fácil'], ['good', 'Bien'], ['hard', 'Difícil']] as const).map(([value, label]) => (
              <Pressable key={value} style={[styles.difficultyButton, difficulty === value && styles.difficultyButtonActive]} onPress={() => setDifficulty(value)}><Text style={[styles.difficultyText, difficulty === value && styles.difficultyTextActive]}>{label}</Text></Pressable>
            ))}
          </View>
          <TextInput multiline maxLength={500} placeholder="Nota opcional" placeholderTextColor={ucapsaBrand.colors.muted} value={note} onChangeText={setNote} style={styles.noteInput} />
          <Pressable disabled={!difficulty || saving} style={[styles.saveButton, (!difficulty || saving) && styles.disabled]} onPress={() => void savePractice()}><Text style={styles.saveButtonText}>{saving ? 'Guardando...' : 'Guardar práctica'}</Text></Pressable>
        </View>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function StatCard({ format, premium, value, label }: { format: ReturnType<typeof resolveUcapsaFormat>; premium: boolean; value: number; label: string }) {
  return <View style={[styles.statCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.statValue, { color: format.cardText }]}>{value}</Text><Text style={[styles.statLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  stateCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  stateTitle: { fontSize: 17, fontWeight: '900' },
  heroCard: { gap: 16, borderWidth: 1, borderRadius: 28, padding: 17, marginBottom: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fireSeal: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.9 },
  heroValue: { marginTop: 2, fontSize: 29, lineHeight: 33, fontWeight: '900' },
  heroMeta: { marginTop: 3, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  goalHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  goalHint: { flex: 1, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  goalCount: { fontSize: 13, fontWeight: '900' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  dayItem: { flex: 1, alignItems: 'center', gap: 4 },
  dayDot: { width: 31, height: 31, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 2 },
  plannedDot: { width: 6, height: 6, borderRadius: 3 },
  dayLabel: { fontSize: 10, fontWeight: '900' },
  practiceButton: { minHeight: 52, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  practiceButtonText: { fontSize: 14, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, minHeight: 104, borderWidth: 1, borderRadius: 20, padding: 13, justifyContent: 'center' },
  statValue: { fontSize: 27, lineHeight: 30, fontWeight: '900' },
  statLabel: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  badgesLink: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 20, padding: 13, marginBottom: 16 },
  badgesIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badgesTitle: { fontSize: 15, lineHeight: 19, fontWeight: '900' },
  badgesMeta: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  historySection: { gap: 8 },
  sectionTitle: { fontSize: 20, lineHeight: 24, fontWeight: '900', marginBottom: 2 },
  historyRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, padding: 12 },
  historyIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: 13, lineHeight: 17, fontWeight: '900' },
  historyMeta: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  modal: { gap: 12 },
  modalEyebrow: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900' },
  difficultyRow: { flexDirection: 'row', gap: 8 },
  difficultyButton: { flex: 1, alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingVertical: 12 },
  difficultyButtonActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  difficultyText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  difficultyTextActive: { color: ucapsaBrand.colors.surface },
  noteInput: { minHeight: 92, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 12, color: ucapsaBrand.colors.text, textAlignVertical: 'top' },
  saveButton: { alignItems: 'center', borderRadius: 17, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 14 },
  saveButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
