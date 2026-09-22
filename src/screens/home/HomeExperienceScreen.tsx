import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { UcapsaDetailModal } from '../../components/ui/UcapsaDetailModal';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getHomeAnnouncements, rankHomeAnnouncements } from '../../services/announcements.service';
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
import { ActivityCard, ContextNotice, ContextStrip, NextActionCard, ProgramCard } from './HomeCards';
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
  const { user, profile, role, isAdmin } = useSession();
  const [snapshot, setSnapshot] = useState<CustomerValueSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>('idle');
  const [practice, setPractice] = useState<PracticeActivitySnapshot | null>(null);
  const [targetDays, setTargetDays] = useState<PracticeTargetDay[]>(DEFAULT_PRACTICE_TARGET_DAYS);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const cacheScopeRef = useRef<string | null>(null);
  const loadRunRef = useRef(0);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;

    if (isAdmin) {
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
  }, [isAdmin, user]);

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
  const mainProgram = snapshot?.whatIHave.programs.length
    ? [...snapshot.whatIHave.programs].sort((left, right) => {
        const rank = (program: (typeof snapshot.whatIHave.programs)[number]) => {
          if (program.programCode === 'puppy') return 0;
          if (program.programLevel === 'medio') return 2;
          if (program.programLevel === 'avanzado') return 3;
          return 1;
        };
        const levelDiff = rank(right) - rank(left);
        if (levelDiff !== 0) return levelDiff;
        if (left.accessMode !== right.accessMode) return left.accessMode === 'membership' ? -1 : 1;
        return right.attendanceCount - left.attendanceCount;
      })[0] ?? null
    : null;
  const membershipStatus = snapshot?.whatIHave.membership?.status ?? null;
  const hasActivePrograms = Boolean(mainProgram);
  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus, hasActivePrograms }),
    [hasActivePrograms, isAdmin, membershipStatus, role, user],
  );
  const premium = format.key === 'member';
  const displayName = profile?.full_name || snapshot?.identity.displayName || profile?.email || user?.email || 'Visitante';
  const dogName = mainProgram?.dogName || profile?.dog_name || null;
  const identityDetail = user
    ? [dogName, premium ? 'Socio UCAPSA' : mainProgram ? 'Cliente UCAPSA' : 'UCAPSA'].filter(Boolean).join(' · ')
    : 'Entrenamiento y convivencia con una ruta clara';
  const profileComplete = Boolean((profile?.full_name ?? '').trim() && (profile?.phone ?? '').trim());
  const nextAction = snapshot ? getCustomerValuePrimaryNextAction(snapshot) : null;
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

      {!user ? (
        <View style={[styles.guestCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <View style={[styles.guestIcon, { backgroundColor: format.accentSoft }]}>
            <MaterialIcons name="pets" size={25} color={format.accentDark} />
          </View>
          <View style={styles.guestBody}>
            <Text style={[styles.guestTitle, { color: format.cardText }]}>Empieza por lo que quieres mejorar con tu perro</Text>
            <Text style={[styles.guestText, { color: format.muted }]}>UCAPSA te orienta al programa adecuado y después te ayuda a ver lo que tienes, lo que aprovechas y lo que sigue.</Text>
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

      {!loading && user && snapshotState === 'error' ? (
        <View style={[styles.stateStrip, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="cloud-off" size={20} color={format.accentDark} />
          <View style={styles.stateCopy}>
            <Text style={[styles.stateTitle, { color: format.cardText }]}>No pudimos cargar tu resumen</Text>
            <Text style={[styles.stateText, { color: format.muted }]}>Revisa tu conexión e intenta actualizar.</Text>
          </View>
          <Pressable onPress={() => void refresh()} style={[styles.iconButton, { backgroundColor: format.accentSoft }]}>
            <MaterialIcons name="refresh" size={18} color={format.accentDark} />
          </Pressable>
        </View>
      ) : null}

      {!loading && user && (snapshotState === 'cached' || snapshotState === 'partial') ? (
        <View style={[styles.syncStrip, { borderColor: format.cardBorder, backgroundColor: format.surfaceAlt }]}>
          <MaterialIcons name={snapshotState === 'cached' ? 'offline-pin' : 'info-outline'} size={17} color={format.accentDark} />
          <Text style={[styles.syncText, { color: format.muted }]}>
            {snapshotState === 'cached' ? 'Mostrando la última información guardada.' : 'Algunos datos no pudieron actualizarse.'}
          </Text>
        </View>
      ) : null}

      {!loading && user && snapshot && nextAction ? (
        <NextActionCard snapshot={snapshot} action={nextAction} format={format} onPress={() => openNext(nextAction)} />
      ) : null}

      {!loading && user && snapshot ? (
        <ProgramCard
          snapshot={snapshot}
          practice={practice}
          practiceGoal={practiceGoal}
          format={format}
          onPress={() => router.push((mainProgram ? '/classes' : '/client/membership') as never)}
          onPractice={() => router.push('/client/practice-activity' as never)}
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
          eyebrow="NUEVO LOGRO"
          title={recentAchievement.unlockedTitle || recentAchievement.title}
          detail={[recentAchievement.dogName, `Desbloqueado ${formatDate(recentAchievement.awardedAt) ?? 'recientemente'}`].filter(Boolean).join(' · ')}
          onPress={() => router.push((recentAchievement.dogId ? `/dog?dogId=${encodeURIComponent(recentAchievement.dogId)}` : '/achievements') as never)}
          accent="gold"
        />
      ) : null}

      {!loading && announcements.length === 0 ? (
        <Pressable style={styles.noticeLinkOnly} onPress={() => router.push('/announcements' as never)}>
          <MaterialIcons name="campaign" size={17} color={format.accentDark} />
          <Text style={[styles.noticeLinkOnlyText, { color: format.accentDark }]}>Ver avisos UCAPSA</Text>
        </Pressable>
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
