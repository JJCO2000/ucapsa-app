import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { AchievementMiniRow } from '../../components/domain/AchievementBadgeGrid';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { EventCard } from '../../components/domain/EventCard';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { WEEKLY_PRACTICE_GOAL } from '../../constants/practice';
import { useSession } from '../../hooks/useSession';
import { getCachedAchievementsForUser, refreshAchievementsForUser, type AchievementWithState } from '../../services/achievements.service';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import {
  createHomeCacheSource,
  mergeHomeCache,
  readHomeCache,
  type HomeCacheUpdates,
  type HomePaymentSummary,
  type HomePracticeSummary,
  type HomeProgramSummary,
  type HomeReadCache,
} from '../../services/home-cache.service';
import { getMyMembership } from '../../services/memberships.service';
import { getMyPaymentOverview } from '../../services/payments.service';
import { getMyProgramEnrollments, getNextProgramScheduleDate, getProgramCodeLabel, getProgramEnrollmentDogName } from '../../services/programs.service';
import { getMyWeeklyPracticeSummary, getPendingPracticeCounts, saveMyPracticeSession } from '../../services/practice.service';
import type { PracticeDifficulty } from '../../types/app.types';
import type { Announcement, EventOccurrence, MembershipStatus } from '../../types/app.types';
import { getUpcomingOccurrences } from '../../utils/events.utils';

const mark = require('../../../assets/images/brand/ucapsa-mark.png');
const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const emptyPaymentSummary: HomePaymentSummary = { attention_total: 0, legacy_membership_pending: false };
const HOME_QUERY_TIMEOUT_MS = 6000;
const GUEST_WHATSAPP_MESSAGE = 'Hola UCAPSA, vi la app y quiero saber que programa recomiendan para mi perro.';
const GUEST_WHATSAPP_URL = `https://wa.me/525522410679?text=${encodeURIComponent(GUEST_WHATSAPP_MESSAGE)}`;

type HomeSourceStatus = 'idle' | 'ok' | 'cached' | 'error';
type HomeStatuses = {
  announcements: HomeSourceStatus;
  events: HomeSourceStatus;
  membership: HomeSourceStatus;
  programs: HomeSourceStatus;
  payments: HomeSourceStatus;
  achievements: HomeSourceStatus;
  practice: HomeSourceStatus;
};

const initialStatuses: HomeStatuses = {
  announcements: 'idle',
  events: 'idle',
  membership: 'idle',
  programs: 'idle',
  payments: 'idle',
  achievements: 'idle',
  practice: 'idle',
};

function withHomeTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('home_query_timeout')), HOME_QUERY_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function nextClassText(item: HomeProgramSummary | null) {
  if (!item) return 'Sin clase próxima';
  const date = getNextProgramScheduleDate(item.schedule);
  if (!date) return 'Fecha por confirmar';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}${time ? `, ${time}` : ''}`;
}


function mergePracticeCounts(base: HomePracticeSummary, pending: Array<{ enrollment_id: string | null; dog_id: string | null; count: number }>): HomePracticeSummary {
  const counts = new Map<string, { enrollment_id: string | null; dog_id: string | null; count: number }>();
  for (const item of base.counts) {
    const key = item.enrollment_id || item.dog_id || 'general';
    counts.set(key, { ...item });
  }
  for (const item of pending) {
    const key = item.enrollment_id || item.dog_id || 'general';
    const current = counts.get(key) ?? { enrollment_id: item.enrollment_id, dog_id: item.dog_id, count: 0 };
    current.count += item.count;
    counts.set(key, current);
  }
  return { ...base, counts: [...counts.values()] };
}

function incrementPracticeSummary(base: HomePracticeSummary, program: HomeProgramSummary): HomePracticeSummary {
  const key = program.enrollment_id || program.dog_id || 'general';
  const counts = new Map<string, { enrollment_id: string | null; dog_id: string | null; count: number }>();
  for (const item of base.counts) counts.set(item.enrollment_id || item.dog_id || 'general', { ...item });
  const current = counts.get(key) ?? { enrollment_id: program.enrollment_id, dog_id: program.dog_id ?? null, count: 0 };
  current.count += 1;
  counts.set(key, current);
  return { week_start: base.week_start || new Date().toISOString().slice(0, 10), counts: [...counts.values()] };
}

async function openGuestWhatsApp() {
  try {
    await Linking.openURL(GUEST_WHATSAPP_URL);
  } catch {
    Alert.alert('No se pudo abrir WhatsApp', 'Revisa tu conexión e intenta de nuevo.');
  }
}

export default function HomeScreen() {
  const { user, profile, role, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [programs, setPrograms] = useState<HomeProgramSummary[]>([]);
  const [payments, setPayments] = useState<HomePaymentSummary>(emptyPaymentSummary);
  const [achievements, setAchievements] = useState<AchievementWithState[]>([]);
  const [practice, setPractice] = useState<HomePracticeSummary>({ week_start: '', counts: [] });
  const [practiceModalOpen, setPracticeModalOpen] = useState(false);
  const [practiceStartedAt, setPracticeStartedAt] = useState<string | null>(null);
  const [practiceDifficulty, setPracticeDifficulty] = useState<PracticeDifficulty | null>(null);
  const [practiceNote, setPracticeNote] = useState('');
  const [savingPractice, setSavingPractice] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventOccurrence | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statuses, setStatuses] = useState<HomeStatuses>(initialStatuses);
  const [homeCache, setHomeCache] = useState<HomeReadCache | null>(null);
  const cacheScopeRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (isAdmin) {
      setLoading(false);
      return;
    }

    const scope = user?.id ?? 'public';
    const scopeChanged = cacheScopeRef.current !== scope;
    if (scopeChanged) {
      cacheScopeRef.current = scope;
      setLoading(true);
      setAnnouncements([]);
      setEvents([]);
      setMembershipStatus(null);
      setPrograms([]);
      setPayments(emptyPaymentSummary);
      setAchievements([]);
      setPractice({ week_start: '', counts: [] });
      setStatuses(initialStatuses);
      setHomeCache(null);
    }

    const cachedHome = await readHomeCache(scope);
    setHomeCache(cachedHome);
    const pendingPracticeCounts = user ? await getPendingPracticeCounts(user.id) : [];

    if (cachedHome?.announcements) setAnnouncements(cachedHome.announcements.data);
    if (cachedHome?.events) setEvents(cachedHome.events.data);
    if (user && cachedHome?.membership_status) setMembershipStatus(cachedHome.membership_status.data);
    if (user && cachedHome?.programs) setPrograms(cachedHome.programs.data);
    if (user && cachedHome?.payments) setPayments(cachedHome.payments.data);
    if (user && cachedHome?.practice) setPractice(mergePracticeCounts(cachedHome.practice.data, pendingPracticeCounts));
    else if (user && pendingPracticeCounts.length > 0) setPractice({ week_start: '', counts: pendingPracticeCounts });

    let cachedAchievements: AchievementWithState[] | null = null;
    if (user) {
      cachedAchievements = await getCachedAchievementsForUser(user.id);
      if (cachedAchievements) setAchievements(cachedAchievements);
    }

    // La cache puede pintar una vista previa inmediatamente, pero no debe
    // anunciarse como "datos guardados" hasta saber que la sincronizacion fallo.
    const syncingStatuses: HomeStatuses = {
      announcements: 'idle',
      events: 'idle',
      membership: user ? 'idle' : 'ok',
      programs: user ? 'idle' : 'ok',
      payments: user ? 'idle' : 'ok',
      achievements: user ? 'idle' : 'ok',
      practice: user ? 'idle' : 'ok',
    };
    setStatuses(syncingStatuses);

    if (
      cachedHome?.announcements ||
      cachedHome?.events ||
      (user && (cachedHome?.membership_status || cachedHome?.programs || cachedHome?.payments || cachedHome?.practice || cachedAchievements))
    ) {
      setLoading(false);
    }

    const [announcementResult, eventResult, membershipResult, programsResult, paymentsResult, achievementsResult, practiceResult] = await Promise.allSettled([
      withHomeTimeout(getVisibleAnnouncements(3)),
      withHomeTimeout(getVisibleEvents()),
      user ? withHomeTimeout(getMyMembership()) : Promise.resolve(null),
      user ? withHomeTimeout(getMyProgramEnrollments()) : Promise.resolve([]),
      user ? withHomeTimeout(getMyPaymentOverview()) : Promise.resolve(null),
      user ? withHomeTimeout(refreshAchievementsForUser(user.id)) : Promise.resolve([] as AchievementWithState[]),
      user ? withHomeTimeout(getMyWeeklyPracticeSummary()) : Promise.resolve({ count: 0, goal: WEEKLY_PRACTICE_GOAL, weekStart: '', sessions: [] }),
    ]);

    const cacheUpdates: HomeCacheUpdates = {};
    const nextStatuses: HomeStatuses = {
      announcements: 'error',
      events: 'error',
      membership: user ? 'error' : 'ok',
      programs: user ? 'error' : 'ok',
      payments: user ? 'error' : 'ok',
      achievements: user ? 'error' : 'ok',
      practice: user ? 'error' : 'ok',
    };

    if (announcementResult.status === 'fulfilled') {
      const value = announcementResult.value.slice(0, 2);
      setAnnouncements(value);
      cacheUpdates.announcements = createHomeCacheSource(value);
      nextStatuses.announcements = 'ok';
    } else if (cachedHome?.announcements) {
      nextStatuses.announcements = 'cached';
    }

    if (eventResult.status === 'fulfilled') {
      const value = getUpcomingOccurrences(eventResult.value, 2);
      setEvents(value);
      cacheUpdates.events = createHomeCacheSource(value);
      nextStatuses.events = 'ok';
    } else if (cachedHome?.events) {
      nextStatuses.events = 'cached';
    }

    if (user) {
      if (membershipResult.status === 'fulfilled') {
        const value = membershipResult.value?.status ?? null;
        setMembershipStatus(value);
        cacheUpdates.membership_status = createHomeCacheSource(value);
        nextStatuses.membership = 'ok';
      } else if (cachedHome?.membership_status) {
        nextStatuses.membership = 'cached';
      }

      if (programsResult.status === 'fulfilled') {
        const value: HomeProgramSummary[] = programsResult.value.map((item) => ({
          enrollment_id: item.enrollment.id,
          enrollment_status: item.enrollment.status,
          program_code: item.program.code,
          program_name: item.program.name,
          required_attendances: item.program.required_attendances,
          attendances_count: item.enrollment.attendances_count,
          dog_id: item.enrollment.dog_id ?? null,
          dog_name: getProgramEnrollmentDogName(item),
          schedule: item.schedule,
        }));
        setPrograms(value);
        cacheUpdates.programs = createHomeCacheSource(value);
        nextStatuses.programs = 'ok';
      } else if (cachedHome?.programs) {
        nextStatuses.programs = 'cached';
      }

      if (paymentsResult.status === 'fulfilled' && paymentsResult.value) {
        const value: HomePaymentSummary = {
          attention_total: paymentsResult.value.attention_total,
          legacy_membership_pending: paymentsResult.value.legacy_membership_pending,
        };
        setPayments(value);
        cacheUpdates.payments = createHomeCacheSource(value);
        nextStatuses.payments = 'ok';
      } else if (cachedHome?.payments) {
        nextStatuses.payments = 'cached';
      }

      if (achievementsResult.status === 'fulfilled') {
        setAchievements(achievementsResult.value);
        nextStatuses.achievements = 'ok';
      } else if (cachedAchievements) {
        nextStatuses.achievements = 'cached';
      }

      if (practiceResult.status === 'fulfilled') {
        const counts = new Map<string, { enrollment_id: string | null; dog_id: string | null; count: number }>();
        for (const session of practiceResult.value.sessions) {
          const key = session.enrollment_id || session.dog_id || 'general';
          const current = counts.get(key) ?? { enrollment_id: session.enrollment_id, dog_id: session.dog_id, count: 0 };
          current.count += 1;
          counts.set(key, current);
        }
        const remoteValue: HomePracticeSummary = { week_start: practiceResult.value.weekStart, counts: [...counts.values()] };
        const pendingAfterSync = await getPendingPracticeCounts(user.id);
        const value = mergePracticeCounts(remoteValue, pendingAfterSync);
        setPractice(value);
        // La caché guarda únicamente lo confirmado por servidor; la cola local se
        // combina al leer para no contar dos veces una práctica pendiente.
        cacheUpdates.practice = createHomeCacheSource(remoteValue);
        nextStatuses.practice = pendingAfterSync.length > 0 ? 'cached' : 'ok';
      } else if (cachedHome?.practice || pendingPracticeCounts.length > 0) {
        nextStatuses.practice = 'cached';
      }
    } else {
      setMembershipStatus(null);
      setPrograms([]);
      setPayments(emptyPaymentSummary);
      setAchievements([]);
      setPractice({ week_start: '', counts: [] });
    }

    if (Object.keys(cacheUpdates).length > 0) {
      const merged = await mergeHomeCache(scope, cacheUpdates);
      setHomeCache(merged);
    }

    setStatuses(nextStatuses);
    setLoading(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const activePrograms = useMemo(() => programs.filter((item) => item.enrollment_status === 'active'), [programs]);
  const nextProgram = useMemo(() => {
    const rows = [...activePrograms];
    rows.sort((a, b) => {
      const aDate = getNextProgramScheduleDate(a.schedule)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDate = getNextProgramScheduleDate(b.schedule)?.getTime() ?? Number.POSITIVE_INFINITY;
      return aDate - bDate;
    });
    return rows[0] ?? null;
  }, [activePrograms]);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus, hasActivePrograms: activePrograms.length > 0 }), [activePrograms.length, isAdmin, membershipStatus, role, user]);
  const displayName = profile?.full_name || profile?.email || user?.email || 'Visitante';
  const profileComplete = Boolean((profile?.full_name ?? '').trim() && (profile?.phone ?? '').trim());
  const hasPaymentAttention = payments.attention_total > 0.005 || payments.legacy_membership_pending;
  const accountDataError = user ? statuses.membership === 'error' || statuses.programs === 'error' || statuses.payments === 'error' : false;
  const practiceCount = nextProgram ? (practice.counts.find((item) => item.enrollment_id === nextProgram.enrollment_id || (item.dog_id && item.dog_id === nextProgram.dog_id))?.count ?? 0) : 0;
  const practiceAvailable = statuses.practice === 'ok' || statuses.practice === 'cached';
  const accountDataFresh = user ? statuses.membership === 'ok' && statuses.programs === 'ok' && statuses.payments === 'ok' : true;
  const announcementsError = statuses.announcements === 'error';
  const eventsError = statuses.events === 'error';
  const achievementsError = statuses.achievements === 'error';
  const anyRelevantError = announcementsError || eventsError || accountDataError || achievementsError;
  const cachedLabels = useMemo(() => {
    const labels: string[] = [];
    if (statuses.announcements === 'cached') labels.push('avisos');
    if (statuses.events === 'cached') labels.push('agenda');
    if (statuses.membership === 'cached') labels.push('membresia');
    if (statuses.programs === 'cached') labels.push('clases');
    if (statuses.payments === 'cached') labels.push('pagos');
    if (statuses.achievements === 'cached') labels.push('logros');
    if (statuses.practice === 'cached') labels.push('practica');
    return labels;
  }, [statuses]);
  const cachedSourceCount = cachedLabels.length;
  const cachedSavedAt = useMemo(() => {
    if (!homeCache) return null;
    const values = [
      statuses.announcements === 'cached' ? homeCache.announcements?.saved_at : null,
      statuses.events === 'cached' ? homeCache.events?.saved_at : null,
      statuses.membership === 'cached' ? homeCache.membership_status?.saved_at : null,
      statuses.programs === 'cached' ? homeCache.programs?.saved_at : null,
      statuses.payments === 'cached' ? homeCache.payments?.saved_at : null,
      statuses.practice === 'cached' ? homeCache.practice?.saved_at : null,
    ].filter((value): value is string => Boolean(value));
    if (values.length === 0) return null;
    return values.sort()[0] ?? null;
  }, [homeCache, statuses]);

  function startPractice() {
    if (!nextProgram) return;
    setPracticeStartedAt(new Date().toISOString());
    setPracticeDifficulty(null);
    setPracticeNote('');
    setPracticeModalOpen(true);
  }

  async function savePractice() {
    if (!user || !nextProgram || !practiceStartedAt || !practiceDifficulty) return;
    try {
      setSavingPractice(true);
      const result = await saveMyPracticeSession({
        userId: user.id,
        enrollmentId: nextProgram.enrollment_id,
        dogId: nextProgram.dog_id ?? null,
        startedAt: practiceStartedAt,
        difficulty: practiceDifficulty,
        note: practiceNote,
      });
      const nextPractice = incrementPracticeSummary(practice, nextProgram);
      setPractice(nextPractice);
      setPracticeModalOpen(false);
      setPracticeStartedAt(null);
      setPracticeDifficulty(null);
      setPracticeNote('');

      if (result.syncStatus === 'synced') {
        const merged = await mergeHomeCache(user.id, { practice: createHomeCacheSource(nextPractice) });
        setHomeCache(merged);
      }

      const nextCount = practiceCount + 1;
      Alert.alert(
        'Práctica guardada',
        result.syncStatus === 'pending'
          ? `${nextCount} de ${WEEKLY_PRACTICE_GOAL} esta semana. Se sincronizará automáticamente cuando vuelva la conexión.`
          : `${nextCount} de ${WEEKLY_PRACTICE_GOAL} esta semana.`,
      );
    } catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause && typeof (cause as { message?: unknown }).message === 'string'
        ? String((cause as { message: string }).message)
        : 'No se pudo guardar la práctica.';
      Alert.alert('No se pudo guardar', message);
    } finally {
      setSavingPractice(false);
    }
  }

  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
      contentContainerStyle={styles.screenContent}
    >
      <UcapsaAmbientBackground format={format} variant="home" />
      <View style={[styles.hero, { backgroundColor: format.surface, borderColor: format.border }]}>
        <View style={styles.heroContent}>
        <View style={styles.heroTop}>
          <Image source={mark} style={styles.mark} resizeMode="contain" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={user ? 'Abrir ajustes de cuenta' : 'Iniciar sesión'}
            style={[styles.accountButton, { backgroundColor: format.accentSoft, borderColor: format.key === 'member' ? withAlpha(ucapsaBrand.colors.gold, 0.4) : format.border }]}
            onPress={() => router.push((user ? '/account-settings' : '/auth/login') as never)}
          >
            <MaterialIcons name={user ? 'person' : 'login'} size={22} color={format.accentDark} />
            {user ? <View style={[styles.accountEditDot, format.key === 'member' && styles.accountEditDotPremium]}><MaterialIcons name="edit" size={11} color={format.key === 'member' ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.surface} /></View> : null}
          </Pressable>
        </View>
        <Text style={[styles.kicker, { color: format.accentDark }]}>{user ? 'Tu UCAPSA' : 'UCAPSA'}</Text>
        <Text style={[styles.title, { color: format.text }]}>{user ? displayName : 'Mejora la convivencia con tu perro'}</Text>
        {user ? (
          <AchievementMiniRow
            items={achievements}
            premium={format.key === 'member'}
            maxItems={3}
            label="Tus logros"
            onPress={() => router.push('/achievements' as never)}
          />
        ) : (
          <>
            <Text style={[styles.subtitle, { color: format.muted }]}>Entrenamiento real contigo y tu perro, acompañado por expertos y con progreso por niveles.</Text>
            <View style={styles.proofRow}>
              <ProofPill label="40+ años" format={format} />
              <ProofPill label="Métodos positivos" format={format} />
              <ProofPill label="Progreso medible" format={format} />
            </View>
          </>
        )}
        </View>
      </View>

      {!user ? (
        <View style={[styles.guestStartCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <View style={[styles.guestStartIcon, { backgroundColor: format.accentSoft }]}>
            <MaterialIcons name="pets" size={24} color={format.accentDark} />
          </View>
          <View style={styles.guestStartBody}>
            <Text style={[styles.guestStartTitle, { color: format.cardText }]}>¿No sabes por dónde empezar?</Text>
            <Text style={[styles.guestStartText, { color: format.muted }]}>Cuéntanos la edad de tu perro y qué quieres mejorar. UCAPSA te orienta al programa adecuado.</Text>
            <View style={styles.guestStartActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Quiero orientación por WhatsApp" style={[styles.guestPrimaryButton, { backgroundColor: format.primaryButton }]} onPress={() => void openGuestWhatsApp()}>
                <MaterialIcons name="chat" size={18} color={format.primaryButtonText} />
                <Text style={[styles.guestPrimaryButtonText, { color: format.primaryButtonText }]}>Quiero orientación</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Ver servicios UCAPSA" style={[styles.guestSecondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/services' as never)}>
                <Text style={[styles.guestSecondaryButtonText, { color: format.secondaryButtonText }]}>Ver servicios</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando información...</Text></View> : null}

      {!loading && anyRelevantError ? (
        <DataErrorCard
          format={format}
          title="No pudimos actualizar toda la información"
          text="Algunos datos no están disponibles. Revisa tu conexión e intenta de nuevo."
          onRetry={() => void refresh()}
        />
      ) : null}

      {!loading && cachedSourceCount > 0 ? (
        <CachedDataCard
          format={format}
          labels={cachedLabels}
          savedAt={cachedSavedAt}
          onRetry={() => void refresh()}
        />
      ) : null}

      {!loading && user && nextProgram ? (
        <>
          <View style={[styles.progressCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <Text style={[styles.progressTitle, { color: format.cardText }]}>{nextProgram.dog_name || 'Tu perro'} y tú</Text>
            <Text style={[styles.progressLine, { color: format.muted }]}>{getProgramCodeLabel(nextProgram.program_code)} - {nextProgram.attendances_count ?? 0} de {nextProgram.required_attendances ?? 0} clases</Text>
            <Text style={[styles.progressLine, { color: format.muted }]}>{practiceAvailable ? `Prácticas de esta semana: ${practiceCount} de ${WEEKLY_PRACTICE_GOAL}` : 'Prácticas de esta semana: sin actualizar'}</Text>
            <Text style={[styles.progressLine, { color: format.muted }]}>Próxima clase: {nextClassText(nextProgram)}</Text>
          </View>

          <View style={[styles.practiceCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <Text style={[styles.practiceKicker, { color: format.cardText }]}>Esta semana con {nextProgram.dog_name || 'tu perro'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${practiceCount > 0 ? 'Continuar' : 'Empezar'} práctica con ${nextProgram.dog_name || 'tu perro'}`} style={[styles.practiceButton, { backgroundColor: format.primaryButton }]} onPress={startPractice}>
              <MaterialIcons name="play-arrow" size={20} color={format.primaryButtonText} />
              <Text style={[styles.practiceButtonText, { color: format.primaryButtonText }]}>{practiceCount > 0 ? 'Continuar entrenamiento' : 'Empezar práctica'}</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {!loading && user ? (
        <View style={styles.block}>
          <Text style={[styles.sectionTitle, { color: format.text }]}>Lo importante</Text>
          {!profileComplete ? <ActionCard format={format} icon="person" title="Completa tus datos" text="Falta información básica de tu perfil." onPress={() => router.push('/account-settings?section=profile' as never)} /> : null}
          {hasPaymentAttention ? <ActionCard format={format} icon="payments" title="Revisa tus pagos" text={payments.attention_total > 0.005 ? `Requiere atención: ${money(payments.attention_total)}` : 'Hay un pago pendiente de revisión.'} onPress={() => router.push('/payments' as never)} /> : null}
          {nextProgram ? <ActionCard format={format} icon="school" title={`Próxima clase: ${getProgramCodeLabel(nextProgram.program_code)}`} text={nextClassText(nextProgram)} onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(nextProgram.enrollment_id)}` as never)} /> : null}
          {membershipStatus === 'pending' ? <ActionCard format={format} icon="badge" title="Membresía en revisión" text="Tu solicitud sigue pendiente." onPress={() => router.push('/client/membership' as never)} /> : null}
          {profileComplete && !accountDataError && accountDataFresh && !hasPaymentAttention && !nextProgram && membershipStatus !== 'pending' ? (
            <View style={styles.okCard}><MaterialIcons name="check-circle" size={22} color={ucapsaBrand.colors.success} /><Text style={styles.okText}>No hay acciones pendientes en tu cuenta.</Text></View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.quickRow}>
        {user && (activePrograms.length > 0 || membershipStatus === 'active') ? <QuickAction format={format} icon="qr-code-scanner" label="Asistencia" onPress={() => router.push('/attendance' as never)} /> : null}
        <QuickAction format={format} icon="event" label="Calendario" onPress={() => router.push('/calendar' as never)} />
        <QuickAction format={format} icon="campaign" label="Anuncios" onPress={() => router.push('/announcements' as never)} />
        {user ? <QuickAction format={format} icon="notifications-active" label="Recordatorios" onPress={() => router.push('/account-settings?section=notifications' as never)} /> : null}
        {!user ? <QuickAction format={format} icon="login" label="Iniciar sesión" onPress={() => router.push('/auth/login' as never)} /> : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: format.text }]}>Avisos</Text>
        <Pressable onPress={() => router.push('/announcements' as never)}><Text style={[styles.link, { color: format.accentDark }]}>Ver todos</Text></Pressable>
      </View>
      {announcements[0] ? (
        <AnnouncementCard announcement={announcements[0]} onPress={() => setSelectedAnnouncement(announcements[0])} onOpenEvent={announcements[0].event ? () => router.push('/calendar' as never) : undefined} />
      ) : announcementsError ? (
        <SectionError format={format} text="No pudimos cargar los avisos." onRetry={() => void refresh()} />
      ) : (
        <Empty format={format} text="No hay anuncios publicados." />
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: format.text }]}>Agenda</Text>
        <Pressable onPress={() => router.push('/calendar' as never)}><Text style={[styles.link, { color: format.accentDark }]}>Abrir calendario</Text></Pressable>
      </View>
      {events[0] ? (
        <EventCard event={events[0].event} startDateOverride={events[0].start_date} occurrenceIndex={events[0].is_recurring ? events[0].occurrence_index : undefined} onPress={() => setSelectedEvent(events[0])} />
      ) : eventsError ? (
        <SectionError format={format} text="No pudimos cargar la agenda." onRetry={() => void refresh()} />
      ) : (
        <Empty format={format} text="No hay eventos próximos." />
      )}

      <KeyboardAwareModal visible={practiceModalOpen} onClose={() => !savingPractice && setPracticeModalOpen(false)}>
        <View style={styles.practiceModal}>
          <Text style={styles.practiceModalKicker}>Esta semana con {nextProgram?.dog_name || 'tu perro'}</Text>
          <Text style={styles.practiceModalTitle}>¿Cómo les fue?</Text>
          <View style={styles.difficultyRow}>
            {([['easy', 'Fácil'], ['good', 'Bien'], ['hard', 'Difícil']] as const).map(([value, label]) => (
              <Pressable key={value} style={[styles.difficultyButton, practiceDifficulty === value && styles.difficultyButtonActive]} onPress={() => setPracticeDifficulty(value)}>
                <Text style={[styles.difficultyText, practiceDifficulty === value && styles.difficultyTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.practiceLabel}>Nota opcional</Text>
          <TextInput value={practiceNote} onChangeText={setPracticeNote} editable={!savingPractice} multiline maxLength={500} placeholder="Escribe una nota si quieres" placeholderTextColor={ucapsaBrand.colors.muted} style={styles.practiceInput} />
          <Pressable disabled={!practiceDifficulty || savingPractice} style={[styles.practiceSaveButton, (!practiceDifficulty || savingPractice) && styles.practiceDisabled]} onPress={() => void savePractice()}>
            <Text style={styles.practiceSaveText}>{savingPractice ? 'Guardando...' : 'Guardar práctica'}</Text>
          </Pressable>
        </View>
      </KeyboardAwareModal>

      <UcapsaDetailModal visible={Boolean(selectedAnnouncement)} type="announcement" title={selectedAnnouncement?.title ?? ''} body={selectedAnnouncement?.content} dateLabel={selectedAnnouncement?.announcement_date ? new Date(selectedAnnouncement.announcement_date).toLocaleDateString('es-MX') : null} onClose={() => setSelectedAnnouncement(null)} />
      <UcapsaDetailModal visible={Boolean(selectedEvent)} type="event" title={selectedEvent?.event.title ?? ''} body={selectedEvent?.event.description} dateLabel={selectedEvent ? new Date(selectedEvent.start_date).toLocaleString('es-MX') : null} location={selectedEvent?.event.location} repeatLabel={selectedEvent?.repeat_label} onClose={() => setSelectedEvent(null)} />
    </KeyboardAwareScreen>
  );
}

function ProofPill({ label, format }: { label: string; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return (
    <View style={[styles.proofPill, { borderColor: format.border, backgroundColor: format.accentSoft }]}>
      <MaterialIcons name="check-circle" size={14} color={format.accentDark} />
      <Text style={[styles.proofPillText, { color: format.accentDark }]}>{label}</Text>
    </View>
  );
}

function ActionCard({ format, icon, title, text, onPress }: { format: ReturnType<typeof resolveUcapsaFormat>; icon: keyof typeof MaterialIcons.glyphMap; title: string; text: string; onPress: () => void }) {
  const premium = format.key === 'member';
  return (
    <Pressable style={[styles.actionCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name={icon} size={21} color={format.pillText} /></View>
      <View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: format.cardText }]}>{title}</Text><Text style={[styles.actionText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{text}</Text></View>
      <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
    </Pressable>
  );
}

function QuickAction({ format, icon, label, onPress }: { format: ReturnType<typeof resolveUcapsaFormat>; icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  const premium = format.key === 'member';
  return <Pressable style={[styles.quickAction, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={onPress}><MaterialIcons name={icon} size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} /><Text style={[styles.quickText, { color: format.cardText }]}>{label}</Text></Pressable>;
}

function CachedDataCard({
  format,
  labels,
  savedAt,
  onRetry,
}: {
  format: ReturnType<typeof resolveUcapsaFormat>;
  labels: string[];
  savedAt: string | null;
  onRetry: () => void;
}) {
  const date = savedAt ? new Date(savedAt) : null;
  const savedLabel = date && !Number.isNaN(date.getTime())
    ? ` Copia mas antigua: ${date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
    : '';

  return (
    <View style={[styles.dataErrorCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <MaterialIcons name="offline-pin" size={22} color={format.accentDark} />
      <View style={styles.dataErrorCopy}>
        <Text style={[styles.dataErrorTitle, { color: format.cardText }]}>Mostrando datos guardados</Text>
        <Text style={[styles.dataErrorText, { color: format.muted }]}>
          {`Sin actualizar: ${labels.join(', ')}.${savedLabel}`}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Intentar sincronizar datos guardados" onPress={onRetry} style={[styles.retryButton, { backgroundColor: format.pillBackground }]}>
        <MaterialIcons name="sync" size={18} color={format.pillText} />
      </Pressable>
    </View>
  );
}

function DataErrorCard({ format, title, text, onRetry }: { format: ReturnType<typeof resolveUcapsaFormat>; title: string; text: string; onRetry: () => void }) {
  return (
    <View style={[styles.dataErrorCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <MaterialIcons name="cloud-off" size={22} color={format.accentDark} />
      <View style={styles.dataErrorCopy}>
        <Text style={[styles.dataErrorTitle, { color: format.cardText }]}>{title}</Text>
        <Text style={[styles.dataErrorText, { color: format.muted }]}>{text}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Reintentar actualizar información" onPress={onRetry} style={[styles.retryButton, { backgroundColor: format.pillBackground }]}>
        <MaterialIcons name="refresh" size={18} color={format.pillText} />
      </Pressable>
    </View>
  );
}

function SectionError({ format, text, onRetry }: { format: ReturnType<typeof resolveUcapsaFormat>; text: string; onRetry: () => void }) {
  return (
    <View style={[styles.empty, styles.sectionError, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <Text style={[styles.emptyText, { color: format.muted }]}>{text}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Reintentar cargar esta seccion" onPress={onRetry}><Text style={[styles.link, { color: format.accentDark }]}>Reintentar</Text></Pressable>
    </View>
  );
}

function Empty({ format, text }: { format: ReturnType<typeof resolveUcapsaFormat>; text: string }) {
  return <View style={[styles.empty, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.emptyText, { color: format.muted }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  hero: { position: 'relative', overflow: 'hidden', borderRadius: 24, borderWidth: 1, padding: 18, marginBottom: 15 },
  heroContent: { position: 'relative', zIndex: 1, gap: 5 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  mark: { width: 44, height: 44 },
  accountButton: { position: 'relative', width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  accountEditDot: { position: 'absolute', right: -4, bottom: -4, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.red, borderWidth: 2, borderColor: ucapsaBrand.colors.surface },
  accountEditDotPremium: { backgroundColor: ucapsaBrand.colors.premiumAction, borderColor: ucapsaBrand.colors.gold },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { fontSize: 29, lineHeight: 34, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  proofRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  proofPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  proofPillText: { fontSize: 11, fontWeight: '900' },
  guestStartCard: { flexDirection: 'row', gap: 12, borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 16 },
  guestStartIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  guestStartBody: { flex: 1, gap: 6 },
  guestStartTitle: { fontSize: 17, fontWeight: '900' },
  guestStartText: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  guestStartActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  guestPrimaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 13 },
  guestPrimaryButtonText: { fontSize: 13, fontWeight: '900' },
  guestSecondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 13 },
  guestSecondaryButtonText: { fontSize: 13, fontWeight: '900' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { fontSize: 13, fontWeight: '700' },
  dataErrorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 13, marginBottom: 14 },
  dataErrorCopy: { flex: 1 },
  dataErrorTitle: { fontSize: 13, fontWeight: '900' },
  dataErrorText: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  retryButton: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressCard: { gap: 4, borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 10 },
  progressTitle: { fontSize: 18, fontWeight: '900' },
  progressLine: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  practiceCard: { gap: 12, borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 16 },
  practiceKicker: { fontSize: 17, fontWeight: '900' },
  practiceButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, paddingHorizontal: 14 },
  practiceButtonText: { fontSize: 14, fontWeight: '900' },
  practiceModal: { gap: 14 },
  practiceModalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  practiceModalTitle: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900' },
  difficultyRow: { flexDirection: 'row', gap: 8 },
  difficultyButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceSubtle },
  difficultyButtonActive: { borderColor: ucapsaBrand.colors.red, backgroundColor: ucapsaBrand.colors.redSoft },
  difficultyText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '800' },
  difficultyTextActive: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  practiceLabel: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  practiceInput: { minHeight: 96, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceSubtle, color: ucapsaBrand.colors.text, padding: 12, textAlignVertical: 'top' },
  practiceSaveButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red },
  practiceSaveText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  practiceDisabled: { opacity: 0.5 },
  block: { gap: 9, marginBottom: 14 },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  actionTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  actionText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  okCard: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft, padding: 14 },
  okText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 16 },
  quickAction: { minWidth: '30%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 11, paddingHorizontal: 10 },
  quickText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 3, marginBottom: 8 },
  link: { fontSize: 12, fontWeight: '900' },
  empty: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 15, marginBottom: 12 },
  emptyText: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  sectionError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
