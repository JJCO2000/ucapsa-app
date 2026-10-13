import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { getHomeAnnouncements, rankHomeAnnouncements } from '../../services/announcements.service';
import { getMyClassRsvp, setMyClassRsvp, tomorrowDateKey, type ClassRsvpResponse } from '../../services/class-rsvp.service';
import { readCustomerValueSnapshotCache, writeCustomerValueSnapshotCache } from '../../services/customer-value-cache.service';
import { mergeCustomerValueSnapshotWithCache } from '../../services/customer-value-merge.service';
import {
  getCustomerValuePrimaryNextAction,
  getMyCustomerValueSnapshot,
  type CustomerValuePrimaryNextAction,
  type CustomerValueSnapshot,
} from '../../services/customer-value.service';
import { createHomeCacheSource, mergeHomeCache, readHomeCache } from '../../services/home-cache.service';
import {
  getPracticeGoalProgress,
  getPracticeTargetDays,
  DEFAULT_PRACTICE_TARGET_DAYS,
  type PracticeTargetDay,
} from '../../services/practice-goal-preference.service';
import { getCachedMyPracticeActivity, getMyPracticeActivity, type PracticeActivitySnapshot } from '../../services/practice.service';
import type { Announcement } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import { ActivityCard, ClassRsvpPrompt, ContextNotice, ContextStrip, NextActionCard, ProgramCard } from './HomeCards';
import {
  firstName,
  formatDate,
  isImportantNotice,
  newestRecentAchievement,
  openGuestWhatsApp,
} from './homePresentation';
import { styles } from './homeStyles';

const mark = require('../../../assets/images/brand/ucapsa-mark.png');

type SnapshotState = 'idle' | 'hydrated' | 'fresh' | 'cached' | 'partial' | 'error';

export default function HomeExperienceScreen() {
  const { user, profile, role, isAdmin, isTrainer, isStaff } = useSession();
  const [snapshot, setSnapshot] = useState<CustomerValueSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>('idle');
  const [practice, setPractice] = useState<PracticeActivitySnapshot | null>(null);
  const [targetDays, setTargetDays] = useState<PracticeTargetDay[]>(DEFAULT_PRACTICE_TARGET_DAYS);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [classRsvp, setClassRsvp] = useState<ClassRsvpResponse | null>(null);
  const [classRsvpSaving, setClassRsvpSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const cacheScopeRef = useRef<string | null>(null);
  const loadRunRef = useRef(0);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;

    if (isStaff) {
      if (isCurrentRun()) setLoading(false);
      return;
    }

    const scope = user?.id ?? 'public';
    if (cacheScopeRef.current !== scope) {
      cacheScopeRef.current = scope;
      setLoading(true);
      setSnapshot(null);
      setSnapshotState('idle');
      setPractice(null);
      setTargetDays(DEFAULT_PRACTICE_TARGET_DAYS);
      setAnnouncements([]);
      setSelectedAnnouncement(null);
    }

    const cachedHome = await readHomeCache(scope);
    if (!isCurrentRun()) return;

    const cachedAnnouncements = rankHomeAnnouncements(cachedHome?.announcements?.data ?? [], 1);
    if (cachedAnnouncements.length > 0) setAnnouncements(cachedAnnouncements);

    let cachedSnapshot: Awaited<ReturnType<typeof readCustomerValueSnapshotCache>> = null;
    if (user) {
      const [savedSnapshot, savedPractice, savedTargetDays] = await Promise.all([
        readCustomerValueSnapshotCache(user.id),
        getCachedMyPracticeActivity(user.id),
        getPracticeTargetDays(user.id),
      ]);
      if (!isCurrentRun()) return;

      cachedSnapshot = savedSnapshot;
      if (savedSnapshot) {
        setSnapshot(savedSnapshot.snapshot);
        // La caché hidratada es una vista inmediata, no una prueba de que estemos offline.
        // El aviso sólo aparece después si el refresh remoto realmente falla.
        setSnapshotState('hydrated');
        setLoading(false);
      }
      if (savedPractice) setPractice(savedPractice);
      setTargetDays(savedTargetDays);
    } else if (cachedAnnouncements.length > 0) {
      setLoading(false);
    }

    const [announcementResult, snapshotResult, practiceResult, targetDaysResult] = await Promise.allSettled([
      withOperationTimeout(getHomeAnnouncements(1), DEFAULT_READ_TIMEOUT_MS, 'home-announcements'),
      user
        ? withOperationTimeout(getMyCustomerValueSnapshot(), DEFAULT_READ_TIMEOUT_MS, 'home-customer-value')
        : Promise.resolve(null),
      user
        ? withOperationTimeout(getMyPracticeActivity(user.id), DEFAULT_READ_TIMEOUT_MS, 'home-practice')
        : Promise.resolve(null),
      user ? getPracticeTargetDays(user.id) : Promise.resolve(DEFAULT_PRACTICE_TARGET_DAYS),
    ]);
    if (!isCurrentRun()) return;

    if (announcementResult.status === 'fulfilled') {
      setAnnouncements(announcementResult.value);
      void mergeHomeCache(scope, { announcements: createHomeCacheSource(announcementResult.value) });
    }

    if (targetDaysResult.status === 'fulfilled') setTargetDays(targetDaysResult.value);
    if (practiceResult.status === 'fulfilled' && practiceResult.value) setPractice(practiceResult.value);

    if (user) {
      const announcementsFresh = announcementResult.status === 'fulfilled';
      const practiceFresh = practiceResult.status === 'fulfilled' && practiceResult.value?.source === 'remote';

      if (snapshotResult.status === 'fulfilled' && snapshotResult.value) {
        const remoteSnapshot = snapshotResult.value;
        const hasSourceErrors = Object.values(remoteSnapshot.sourceStatus).some((status) => status === 'error');
        const mergedSnapshot = mergeCustomerValueSnapshotWithCache(remoteSnapshot, cachedSnapshot?.snapshot);
        setSnapshot(mergedSnapshot);
        setSnapshotState(hasSourceErrors || !announcementsFresh || !practiceFresh ? 'partial' : 'fresh');
        void writeCustomerValueSnapshotCache(mergedSnapshot);
      } else if (cachedSnapshot) {
        setSnapshot(cachedSnapshot.snapshot);
        setSnapshotState('cached');
      } else {
        setSnapshot(null);
        setSnapshotState('error');
      }
    }

    setLoading(false);
  }, [isStaff, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => {
      loadRunRef.current += 1;
    };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const nextClass = snapshot?.whatIsNext.nextClass ?? null;
  const mainProgram = nextClass
    ? snapshot?.whatIHave.programs.find((program) => program.enrollmentId === nextClass.enrollmentId) ?? snapshot?.whatIHave.programs[0] ?? null
    : snapshot?.whatIHave.programs[0] ?? null;
  const membershipStatus = snapshot?.whatIHave.membership?.status ?? null;
  const hasActivePrograms = Boolean(mainProgram);
  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus, hasActivePrograms }),
    [hasActivePrograms, isAdmin, membershipStatus, role, user],
  );
  const premium = format.key === 'member';
  const displayName = profile?.full_name || snapshot?.identity.displayName || profile?.email || user?.email || 'Visitante';
  const identityDetail = user
    ? 'Tu próxima clase · clases tomadas · logros · siguiente paso'
    : 'Todo el recorrido de tu perro en un solo lugar';
  const profileComplete = Boolean((profile?.full_name ?? '').trim() && (profile?.phone ?? '').trim());
  const nextAction = snapshot ? getCustomerValuePrimaryNextAction(snapshot) : null;
  const rsvpClass = snapshot?.whatIsNext.nextClass ?? null;
  const nextClassEnrollmentId = rsvpClass?.enrollmentId ?? null;
  const nextClassDate = rsvpClass?.dateKey ?? null;
  const classIsTomorrow = Boolean(nextClassDate && nextClassDate === tomorrowDateKey());
  const recentAchievement = newestRecentAchievement(snapshot);
  const homeNotice = announcements[0] ?? null;
  const practiceGoal = getPracticeGoalProgress((practice?.entries ?? []).map((entry) => entry.completedAt), targetDays);
  const contextKind = isImportantNotice(homeNotice)
    ? 'notice'
    : user && !profileComplete
      ? 'profile'
      : recentAchievement
        ? 'achievement'
        : homeNotice
          ? 'notice'
          : null;

  useEffect(() => {
    let active = true;
    if (!user || !classIsTomorrow || !nextClassEnrollmentId || !nextClassDate) {
      setClassRsvp(null);
      return () => { active = false; };
    }

    setClassRsvp(null);
    void getMyClassRsvp(nextClassEnrollmentId, nextClassDate)
      .then((value) => {
        if (active) setClassRsvp(value?.response ?? null);
      })
      .catch((cause) => {
        devWarn('Could not load class RSVP on Home.', cause);
      });

    return () => { active = false; };
  }, [classIsTomorrow, nextClassDate, nextClassEnrollmentId, user]);

  async function handleClassRsvp(response: ClassRsvpResponse) {
    if (!classIsTomorrow || !nextClassEnrollmentId || !nextClassDate || classRsvpSaving) return;
    try {
      setClassRsvpSaving(true);
      const saved = await setMyClassRsvp(nextClassEnrollmentId, nextClassDate, response);
      setClassRsvp(saved.response);
    } catch (cause) {
      Alert.alert(
        'No se pudo guardar',
        cause instanceof Error ? cause.message : 'Intenta de nuevo.',
      );
    } finally {
      setClassRsvpSaving(false);
    }
  }

  function openNext(action: Exclude<CustomerValuePrimaryNextAction, null>) {
    if (action.kind === 'payment') {
      router.push('/payments' as never);
      return;
    }
    if (action.kind === 'class') {
      router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(action.enrollmentId)}` as never);
      return;
    }
    if (action.kind === 'event') {
      router.push('/calendar' as never);
      return;
    }
    router.push('/client/membership' as never);
  }

  if (isAdmin) return <Redirect href="/admin-home" />;
  if (isTrainer) return <Redirect href="/trainer-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="home" />

      <View style={styles.header}>
        <View style={styles.identityRow}>
          <View style={[styles.markWrap, premium && styles.markWrapPremium]}>
            <Image source={mark} style={styles.mark} resizeMode="contain" />
            {premium ? (
              <View style={styles.crownBadge}>
                <MaterialCommunityIcons name="crown" size={12} color={ucapsaBrand.colors.premiumAction} />
              </View>
            ) : null}
          </View>
          <View style={styles.identityCopy}>
            <Text style={[styles.headerEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>
              {user ? 'HOLA' : 'UCAPSA'}
            </Text>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: premium ? format.heroText : format.text }]}>
              {user ? firstName(displayName) : 'Mejora la convivencia con tu perro'}
            </Text>
            <Text numberOfLines={1} style={[styles.headerDetail, { color: premium ? format.heroMuted : format.muted }]}>
              {identityDetail}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {user ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir ranking"
              onPress={() => router.push('/client/competition' as never)}
              style={[
                styles.headerQuickAction,
                {
                  borderColor: premium ? ucapsaBrand.colors.premiumBorderStrong : ucapsaBrand.colors.purple,
                  backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : ucapsaBrand.colors.purpleSoft,
                },
              ]}
            >
              <MaterialIcons name="leaderboard" size={18} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.purpleDark} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={user ? 'Abrir ajustes de cuenta' : 'Iniciar sesión'}
            onPress={() => router.push((user ? '/account-settings' : '/auth/login') as never)}
            style={[
              styles.accountButton,
              {
                borderColor: premium ? ucapsaBrand.colors.premiumBorderStrong : format.border,
                backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft,
              },
            ]}
          >
            <MaterialIcons name={user ? 'person' : 'login'} size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          </Pressable>
        </View>
      </View>

      {user && !isStaff ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Consultar menú del restaurante UCAPSA"
          onPress={() => router.push('/restaurant' as never)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: format.cardBackground, borderColor: format.cardBorder,
            borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14,
            marginBottom: 12, minHeight: 58,
          }}
        >
          <MaterialIcons name="restaurant-menu" size={24} color={format.accentDark} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: format.cardText, fontSize: 16, fontWeight: '800' }}>Restaurante UCAPSA</Text>
            <Text style={{ color: format.muted, fontSize: 13 }}>Ver menú y precios</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={format.accentDark} />
        </Pressable>
      ) : null}

      {!user ? (
        <View style={[styles.guestCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <View style={[styles.guestIcon, { backgroundColor: format.accentSoft }]}>
            <MaterialIcons name="pets" size={25} color={format.accentDark} />
          </View>
          <View style={styles.guestBody}>
            <Text style={[styles.guestTitle, { color: format.cardText }]}>Sabe qué toca y cómo va tu perro</Text>
            <Text style={[styles.guestText, { color: format.muted }]}>Después de inscribirte, consulta en segundos tu próxima clase, clases tomadas, logros y siguiente paso.</Text>
            <View style={styles.guestActions}>
              <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => void openGuestWhatsApp()}>
                <MaterialIcons name="chat" size={18} color={format.primaryButtonText} />
                <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Quiero orientación</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
                onPress={() => router.push('/services' as never)}
              >
                <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Ver servicios</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.loadingText, { color: format.muted }]}>Preparando tu resumen...</Text>
        </View>
      ) : null}

      {!loading && user && (snapshotState === 'error' || snapshotState === 'cached' || snapshotState === 'partial') ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sin conexión o datos parciales. Reintentar sincronización."
          onPress={() => void refresh()}
          style={[styles.offlineOnly, { borderColor: format.cardBorder, backgroundColor: format.surfaceAlt }]}
        >
          <MaterialIcons name="cloud-off" size={20} color={format.accentDark} />
        </Pressable>
      ) : null}

      {!loading && user && snapshot && nextAction ? (
        <NextActionCard
          snapshot={snapshot}
          action={nextAction}
          format={format}
          onPress={() => openNext(nextAction)}
          onAttendance={() => router.push('/attendance' as never)}
          rsvpResponse={classRsvp}
          rsvpSaving={classRsvpSaving}
          onRsvp={nextAction.kind === 'class' && classIsTomorrow ? (response) => void handleClassRsvp(response) : undefined}
        />
      ) : null}

      {!loading && user && snapshot && rsvpClass && classIsTomorrow && nextAction?.kind !== 'class' ? (
        <ClassRsvpPrompt
          title={`${rsvpClass.programName} · ${rsvpClass.dogName}`}
          detail={`${rsvpClass.startTime} · ${rsvpClass.scheduleName}`}
          format={format}
          rsvpResponse={classRsvp}
          rsvpSaving={classRsvpSaving}
          onOpen={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(rsvpClass.enrollmentId)}` as never)}
          onRsvp={(response) => void handleClassRsvp(response)}
        />
      ) : null}

      {!loading && user && snapshot ? (
        <ProgramCard
          snapshot={snapshot}
          practice={practice}
          practiceGoal={practiceGoal}
          format={format}
          onPress={() => router.push((mainProgram ? '/classes' : '/client/membership') as never)}
          onPractice={() => router.push('/client/practice-activity' as never)}
          onAchievements={() => router.push((mainProgram?.dogId ? `/client/dog-achievements?dogId=${encodeURIComponent(mainProgram.dogId)}` : '/achievements') as never)}
        />
      ) : null}

      {!loading && user && snapshot ? (
        <ActivityCard
          snapshot={snapshot}
          practice={practice}
          format={format}
          onClasses={() => router.push('/client/attendance-history' as never)}
          onVisits={premium ? () => router.push('/client/member-visits' as never) : undefined}
          onPractices={() => router.push('/client/practice-activity' as never)}
          onQr={() => router.push('/attendance' as never)}
        />
      ) : null}

      {!loading && user ? (
        <Pressable style={styles.noticeLinkOnly} onPress={() => router.push('/announcements' as never)}>
          <MaterialIcons name="campaign" size={17} color={format.accentDark} />
          <Text style={[styles.noticeLinkOnlyText, { color: format.accentDark }]}>Ver avisos UCAPSA</Text>
        </Pressable>
      ) : null}

      {!loading && contextKind === 'notice' && homeNotice ? (
        <ContextNotice
          announcement={homeNotice}
          format={format}
          onOpen={() => setSelectedAnnouncement(homeNotice)}
          onOpenAll={() => router.push('/announcements' as never)}
        />
      ) : null}

      {!loading && contextKind === 'profile' ? (
        <ContextStrip
          format={format}
          icon="person"
          eyebrow="COMPLETA TU CUENTA"
          title="Añade tus datos básicos"
          detail="Tener tu perfil completo ayuda a que UCAPSA te identifique correctamente."
          onPress={() => router.push('/account-settings?section=profile' as never)}
        />
      ) : null}

      {!loading && contextKind === 'achievement' && recentAchievement ? (
        <ContextStrip
          format={format}
          icon="emoji-events"
          eyebrow="LOGRO UCAPSA"
          title={recentAchievement.unlockedTitle || recentAchievement.title}
          detail={[recentAchievement.dogName, formatDate(recentAchievement.awardedAt)].filter(Boolean).join(' · ')}
          onPress={() => router.push((recentAchievement.dogId ? `/client/dog-achievements?dogId=${encodeURIComponent(recentAchievement.dogId)}` : '/achievements') as never)}
          accent="gold"
        />
      ) : null}

      <UcapsaDetailModal
        visible={Boolean(selectedAnnouncement)}
        type="announcement"
        title={selectedAnnouncement?.title ?? ''}
        body={selectedAnnouncement?.content}
        dateLabel={selectedAnnouncement?.announcement_date ? formatDate(selectedAnnouncement.announcement_date, true) : null}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </KeyboardAwareScreen>
  );
}
