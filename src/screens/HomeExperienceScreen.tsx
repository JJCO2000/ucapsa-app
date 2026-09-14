import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { UcapsaDetailModal } from '../components/ui/UcapsaDetailModal';
import { ucapsaBrand, withAlpha } from '../constants/brand';
import { resolveUcapsaFormat } from '../constants/ucapsaFormats';
import { useSession } from '../hooks/useSession';
import { getHomeAnnouncements, rankHomeAnnouncements } from '../services/announcements.service';
import { readCustomerValueSnapshotCache, writeCustomerValueSnapshotCache } from '../services/customer-value-cache.service';
import {
  getCustomerValuePrimaryNextAction,
  getMyCustomerValueSnapshot,
  type CustomerValuePrimaryNextAction,
  type CustomerValueSnapshot,
} from '../services/customer-value.service';
import { createHomeCacheSource, mergeHomeCache, readHomeCache } from '../services/home-cache.service';
import { getPracticeGoalProgress, getPracticeTargetDays, DEFAULT_PRACTICE_TARGET_DAYS, type PracticeTargetDay } from '../services/practice-goal-preference.service';
import { getCachedMyPracticeActivity, getMyPracticeActivity, type PracticeActivitySnapshot } from '../services/practice.service';
import { getProgramLevelLabel } from '../services/programs.service';
import type { Announcement } from '../types/app.types';

const mark = require('../../assets/images/brand/ucapsa-mark.png');
const GUEST_WHATSAPP_MESSAGE = 'Hola UCAPSA, vi la app y quiero saber que programa recomiendan para mi perro.';
const GUEST_WHATSAPP_URL = `https://wa.me/525522410679?text=${encodeURIComponent(GUEST_WHATSAPP_MESSAGE)}`;
const RECENT_ACHIEVEMENT_DAYS = 14;

type SnapshotState = 'idle' | 'fresh' | 'cached' | 'partial' | 'error';

type NextPresentation = {
  eyebrow: string;
  title: string;
  detail: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

function formatDate(value: string | null | undefined, includeYear = false) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  });
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function programTitle(program: CustomerValueSnapshot['whatIHave']['programs'][number]) {
  if (program.programCode === 'comandos') return `Comandos ${getProgramLevelLabel(program.programLevel)}`;
  return program.programName;
}

function nextPresentation(snapshot: CustomerValueSnapshot, action: Exclude<CustomerValuePrimaryNextAction, null>): NextPresentation {
  if (action.kind === 'payment') {
    if (action.source === 'legacy_membership') {
      return {
        eyebrow: 'NECESITA TU ATENCIÓN',
        title: 'Revisa tus pagos',
        detail: 'Hay un pago pendiente de revisión.',
        icon: 'account-balance-wallet',
      };
    }
    const amount = action.remainingAmount == null ? null : money(action.remainingAmount);
    const date = formatDate(action.dueDate);
    return {
      eyebrow: action.status === 'overdue' ? 'VENCIDO' : 'PAGO PENDIENTE',
      title: action.status === 'overdue' ? 'Tienes un pago vencido' : 'Revisa tu próximo pago',
      detail: [amount, date].filter(Boolean).join(' · ') || 'Abre Pagos para revisar el detalle.',
      icon: 'account-balance-wallet',
    };
  }

  if (action.kind === 'class') {
    const title = action.programCode === 'comandos'
      ? `Comandos ${getProgramLevelLabel(action.programLevel)}`
      : action.programName;
    return {
      eyebrow: 'PRÓXIMA CLASE',
      title,
      detail: [action.dogName, formatDate(action.dateKey), action.startTime].filter(Boolean).join(' · '),
      icon: 'school',
    };
  }

  if (action.kind === 'event') {
    return {
      eyebrow: 'PRÓXIMO EVENTO',
      title: action.title,
      detail: [formatDate(action.startDate), action.location].filter(Boolean).join(' · ') || 'Consulta el calendario UCAPSA.',
      icon: 'event',
    };
  }

  const membership = snapshot.whatIHave.membership;
  if (action.status === 'pending') {
    return {
      eyebrow: 'MEMBRESÍA',
      title: 'Solicitud en revisión',
      detail: 'UCAPSA está revisando tu solicitud.',
      icon: 'workspace-premium',
    };
  }

  if (membership?.status === 'active' && !membership.isValidToday) {
    const today = new Date().toISOString().slice(0, 10);
    const start = membership.startDate?.slice(0, 10) ?? null;
    const end = membership.endDate?.slice(0, 10) ?? null;
    if (end && end < today) {
      return {
        eyebrow: 'MEMBRESÍA',
        title: 'Revisa tu renovación',
        detail: `Venció el ${formatDate(membership.endDate, true) ?? end}.`,
        icon: 'workspace-premium',
      };
    }
    if (start && start > today) {
      return {
        eyebrow: 'MEMBRESÍA',
        title: 'Tu membresía está programada',
        detail: `Inicia el ${formatDate(membership.startDate, true) ?? start}.`,
        icon: 'workspace-premium',
      };
    }
  }

  return {
    eyebrow: 'MEMBRESÍA',
    title: 'Revisa tu membresía',
    detail: action.endDate ? `Vigencia: ${formatDate(action.endDate, true) ?? action.endDate}` : 'Consulta su estado actual.',
    icon: 'workspace-premium',
  };
}

function newestRecentAchievement(snapshot: CustomerValueSnapshot | null) {
  if (!snapshot) return null;
  const now = Date.now();
  const maxAge = RECENT_ACHIEVEMENT_DAYS * 24 * 60 * 60 * 1000;
  const sorted = [...snapshot.whatIAchieved.achievements]
    .filter((item) => item.awardedAt)
    .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
  const first = sorted[0] ?? null;
  if (!first) return null;
  const time = new Date(first.awardedAt).getTime();
  if (!Number.isFinite(time) || now - time > maxAge) return null;
  return first;
}

function isImportantNotice(announcement: Announcement | null) {
  if (!announcement) return false;
  return announcement.is_pinned || announcement.priority === 'urgent' || announcement.priority === 'high';
}

async function openGuestWhatsApp() {
  try {
    await Linking.openURL(GUEST_WHATSAPP_URL);
  } catch {
    // El CTA secundario de Servicios sigue disponible si WhatsApp no puede abrirse.
  }
}

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

  const load = useCallback(async () => {
    if (isAdmin) {
      setLoading(false);
      return;
    }

    const scope = user?.id ?? 'public';
    const cachedHome = await readHomeCache(scope);
    const cachedAnnouncements = rankHomeAnnouncements(cachedHome?.announcements?.data ?? [], 1);
    if (cachedAnnouncements.length > 0) setAnnouncements(cachedAnnouncements);

    let cachedSnapshot: Awaited<ReturnType<typeof readCustomerValueSnapshotCache>> = null;
    if (user) {
      const [savedSnapshot, savedPractice, savedTargetDays] = await Promise.all([
        readCustomerValueSnapshotCache(user.id),
        getCachedMyPracticeActivity(user.id),
        getPracticeTargetDays(user.id),
      ]);
      cachedSnapshot = savedSnapshot;
      if (savedSnapshot) {
        setSnapshot(savedSnapshot.snapshot);
        setSnapshotState('cached');
        setLoading(false);
      }
      if (savedPractice) setPractice(savedPractice);
      setTargetDays(savedTargetDays);
    } else if (cachedAnnouncements.length > 0) {
      setLoading(false);
    }

    const [announcementResult, snapshotResult, practiceResult, targetDaysResult] = await Promise.allSettled([
      getHomeAnnouncements(1),
      user ? getMyCustomerValueSnapshot() : Promise.resolve(null),
      user ? getMyPracticeActivity(user.id) : Promise.resolve(null),
      user ? getPracticeTargetDays(user.id) : Promise.resolve(DEFAULT_PRACTICE_TARGET_DAYS),
    ]);

    if (announcementResult.status === 'fulfilled') {
      setAnnouncements(announcementResult.value);
      void mergeHomeCache(scope, { announcements: createHomeCacheSource(announcementResult.value) });
    }

    if (targetDaysResult.status === 'fulfilled') setTargetDays(targetDaysResult.value);
    if (practiceResult.status === 'fulfilled' && practiceResult.value) setPractice(practiceResult.value);

    if (user) {
      if (snapshotResult.status === 'fulfilled' && snapshotResult.value) {
        const remoteSnapshot = snapshotResult.value;
        const hasSourceErrors = Object.values(remoteSnapshot.sourceStatus).some((status) => status === 'error');
        if (hasSourceErrors && cachedSnapshot) {
          setSnapshot(cachedSnapshot.snapshot);
          setSnapshotState('cached');
        } else {
          setSnapshot(remoteSnapshot);
          setSnapshotState(hasSourceErrors ? 'partial' : 'fresh');
          if (!hasSourceErrors) void writeCustomerValueSnapshotCache(remoteSnapshot);
        }
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

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  const mainProgram = snapshot?.whatIHave.programs[0] ?? null;
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
              <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/services' as never)}>
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
        <NextActionCard
          snapshot={snapshot}
          action={nextAction}
          format={format}
          onPress={() => openNext(nextAction)}
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
        />
      ) : null}

      {!loading && user && snapshot ? (
        <ActivityCard
          snapshot={snapshot}
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
          detail={`Desbloqueado ${formatDate(recentAchievement.awardedAt) ?? 'recientemente'}`}
          onPress={() => router.push('/achievements' as never)}
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
        dateLabel={selectedAnnouncement?.announcement_date ? new Date(selectedAnnouncement.announcement_date).toLocaleDateString('es-MX') : null}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </KeyboardAwareScreen>
  );
}

function NextActionCard({
  snapshot,
  action,
  format,
  onPress,
}: {
  snapshot: CustomerValueSnapshot;
  action: Exclude<CustomerValuePrimaryNextAction, null>;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onPress: () => void;
}) {
  const presentation = nextPresentation(snapshot, action);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${presentation.eyebrow}. ${presentation.title}. ${presentation.detail}`}
      onPress={onPress}
      style={[styles.nextCard, { backgroundColor: format.primaryButton }]}
    >
      <View style={[styles.nextIcon, { backgroundColor: withAlpha(format.primaryButtonText, 0.14) }]}>
        <MaterialIcons name={presentation.icon} size={24} color={format.primaryButtonText} />
      </View>
      <View style={styles.nextCopy}>
        <Text style={[styles.nextEyebrow, { color: format.primaryButtonText }]}>{presentation.eyebrow}</Text>
        <Text numberOfLines={2} style={[styles.nextTitle, { color: format.primaryButtonText }]}>{presentation.title}</Text>
        <Text numberOfLines={2} style={[styles.nextDetail, { color: format.primaryButtonText }]}>{presentation.detail}</Text>
      </View>
      <MaterialIcons name="arrow-forward" size={23} color={format.primaryButtonText} />
    </Pressable>
  );
}

function ProgramCard({
  snapshot,
  practice,
  practiceGoal,
  format,
  onPress,
  onPractice,
}: {
  snapshot: CustomerValueSnapshot;
  practice: PracticeActivitySnapshot | null;
  practiceGoal: ReturnType<typeof getPracticeGoalProgress>;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onPress: () => void;
  onPractice: () => void;
}) {
  const premium = format.key === 'member';
  const program = snapshot.whatIHave.programs[0] ?? null;
  const membership = snapshot.whatIHave.membership;
  const required = program?.requiredAttendances ?? 0;
  const attendance = program?.attendanceCount ?? 0;
  const attendancePercent = required > 0 ? Math.min(100, Math.round((attendance / required) * 100)) : 0;
  const streak = practice?.stats.currentStreak ?? snapshot.whatIUsed.practice?.currentStreak ?? 0;
  const weekPractices = practice?.stats.thisWeekCount ?? snapshot.whatIUsed.practice?.thisWeekCount ?? 0;
  const title = program ? programTitle(program) : membership?.isValidToday ? 'Membresía UCAPSA' : 'Sin programa activo';
  const meta = program
    ? `Con ${program.dogName}`
    : membership?.isValidToday
      ? 'Tu acceso de socio está activo'
      : 'Explora qué sigue para ti y tu perro';

  return (
    <View style={[styles.programCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.programMain}>
        <View style={styles.programTop}>
          <View style={[styles.programIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}>
            <MaterialIcons name={program ? 'school' : membership?.isValidToday ? 'workspace-premium' : 'pets'} size={23} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          </View>
          <View style={styles.programCopy}>
            <Text style={[styles.programEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>
              {program ? 'TU PROGRAMA' : membership?.isValidToday ? 'TU ACCESO' : 'TU RECORRIDO'}
            </Text>
            <Text numberOfLines={2} style={[styles.programTitle, { color: format.cardText }]}>{title}</Text>
            <Text style={[styles.programMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{meta}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={23} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </View>

        {program && required > 0 ? (
          <View style={styles.attendanceBlock}>
            <View style={styles.attendanceLabels}>
              <Text style={[styles.attendanceTitle, { color: format.cardText }]}>Asistencias del programa</Text>
              <Text style={[styles.attendanceValue, { color: premium ? ucapsaBrand.colors.premiumActionText : format.accentDark }]}>{attendance}/{required}</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}>
              <View style={[styles.progressFill, { width: `${attendancePercent}%`, backgroundColor: premium ? ucapsaBrand.colors.premiumAction : format.accent }]} />
            </View>
          </View>
        ) : null}
      </Pressable>

      {program ? (
        <Pressable accessibilityRole="button" onPress={onPractice} style={[styles.practiceSummary, { borderTopColor: format.border }]}>
          <View style={styles.practiceSummaryItem}>
            <MaterialIcons name="local-fire-department" size={18} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            <Text style={[styles.practiceSummaryText, { color: format.cardText }]}>{streak} día{streak === 1 ? '' : 's'} de racha</Text>
          </View>
          <View style={styles.practiceSummaryItem}>
            <MaterialIcons name="pets" size={18} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            <Text style={[styles.practiceSummaryText, { color: format.cardText }]}>{practiceGoal.completedTargets}/{practiceGoal.targetCount} días objetivo</Text>
          </View>
          <Text style={[styles.practiceWeekText, { color: format.muted }]}>{weekPractices} práctica{weekPractices === 1 ? '' : 's'} esta semana</Text>
          <MaterialIcons name="chevron-right" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ActivityCard({
  snapshot,
  format,
  onClasses,
  onVisits,
  onPractices,
  onQr,
}: {
  snapshot: CustomerValueSnapshot;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onClasses: () => void;
  onVisits?: () => void;
  onPractices: () => void;
  onQr: () => void;
}) {
  const premium = format.key === 'member';
  const visits = snapshot.whatIUsed.memberVisitsTotal ?? 0;
  const practices = snapshot.whatIUsed.practice?.thisMonthCount ?? 0;
  return (
    <View style={[styles.activityCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <View style={styles.activityHeader}>
        <View>
          <Text style={[styles.activityEyebrow, { color: format.muted }]}>LO QUE HAS APROVECHADO</Text>
          <Text style={[styles.activityTitle, { color: format.cardText }]}>Tu actividad</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Escanear QR para registrar asistencia o visita" onPress={onQr} style={[styles.qrButton, { borderColor: format.border, backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}>
          <MaterialIcons name="qr-code-scanner" size={19} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.qrButtonText, { color: premium ? ucapsaBrand.colors.premiumActionText : format.accentDark }]}>Escanear QR</Text>
        </Pressable>
      </View>
      <View style={[styles.metricsRow, { borderTopColor: format.border }]}>
        <MetricInline icon="school" value={snapshot.whatIUsed.attendanceTotal} label="clases" color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} onPress={onClasses} />
        {onVisits ? <MetricDivider color={format.border} /> : null}
        {onVisits ? <MetricInline icon="badge" value={visits} label="visitas" color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} onPress={onVisits} /> : null}
        <MetricDivider color={format.border} />
        <MetricInline icon="pets" value={practices} label="prácticas este mes" color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} onPress={onPractices} />
      </View>
    </View>
  );
}

function MetricInline({
  icon,
  value,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: number;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress} style={styles.metricInline}>
      <MaterialIcons name={icon} size={18} color={color} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={2} style={styles.metricLabel}>{label}</Text>
    </Pressable>
  );
}

function MetricDivider({ color }: { color: string }) {
  return <View style={[styles.metricDivider, { backgroundColor: color }]} />;
}

function ContextNotice({
  announcement,
  format,
  onOpen,
  onOpenAll,
}: {
  announcement: Announcement;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onOpen: () => void;
  onOpenAll: () => void;
}) {
  const important = isImportantNotice(announcement);
  const date = announcement.announcement_date ? formatDate(announcement.announcement_date, true) : null;
  return (
    <View style={styles.contextBlock}>
      <View style={styles.contextHeader}>
        <Text style={[styles.contextSectionTitle, { color: format.text }]}>Para ti ahora</Text>
        <Pressable onPress={onOpenAll}><Text style={[styles.contextLink, { color: format.accentDark }]}>Ver todos los avisos</Text></Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={[styles.contextStrip, { borderColor: important ? format.accent : format.cardBorder, backgroundColor: format.cardBackground }]}>
        <View style={[styles.contextIcon, { backgroundColor: important ? format.accentSoft : format.surfaceAlt }]}>
          <MaterialIcons name={important ? 'priority-high' : 'campaign'} size={21} color={format.accentDark} />
        </View>
        <View style={styles.contextCopy}>
          <Text style={[styles.contextEyebrow, { color: format.accentDark }]}>{important ? 'AVISO IMPORTANTE' : 'AVISO UCAPSA'}</Text>
          <Text numberOfLines={1} style={[styles.contextTitle, { color: format.cardText }]}>{announcement.title}</Text>
          <Text numberOfLines={1} style={[styles.contextDetail, { color: format.muted }]}>{date || announcement.content}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={format.accentDark} />
      </Pressable>
    </View>
  );
}

function ContextStrip({
  format,
  icon,
  eyebrow,
  title,
  detail,
  onPress,
  accent = 'brand',
}: {
  format: ReturnType<typeof resolveUcapsaFormat>;
  icon: keyof typeof MaterialIcons.glyphMap;
  eyebrow: string;
  title: string;
  detail: string;
  onPress: () => void;
  accent?: 'brand' | 'gold';
}) {
  const gold = accent === 'gold';
  const iconColor = gold ? ucapsaBrand.colors.goldDark : format.accentDark;
  const iconBackground = gold ? ucapsaBrand.colors.goldPale : format.accentSoft;
  return (
    <View style={styles.contextBlock}>
      <Text style={[styles.contextSectionTitle, { color: format.text }]}>Para ti ahora</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.contextStrip, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
        <View style={[styles.contextIcon, { backgroundColor: iconBackground }]}>
          <MaterialIcons name={icon} size={21} color={iconColor} />
        </View>
        <View style={styles.contextCopy}>
          <Text style={[styles.contextEyebrow, { color: iconColor }]}>{eyebrow}</Text>
          <Text numberOfLines={1} style={[styles.contextTitle, { color: format.cardText }]}>{title}</Text>
          <Text numberOfLines={2} style={[styles.contextDetail, { color: format.muted }]}>{detail}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={iconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, paddingHorizontal: 2 },
  identityRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityCopy: { flex: 1, minWidth: 0 },
  markWrap: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  markWrapPremium: { position: 'relative', borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumSurface },
  mark: { width: 35, height: 35 },
  crownBadge: { position: 'absolute', top: -7, right: -7, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumSurface },
  headerEyebrow: { fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 1.05 },
  headerTitle: { marginTop: 1, fontSize: 22, lineHeight: 25, fontWeight: '900', letterSpacing: -0.35 },
  headerDetail: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  accountButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  guestCard: { flexDirection: 'row', gap: 12, borderRadius: 22, borderWidth: 1, padding: 15, marginBottom: 16 },
  guestIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  guestBody: { flex: 1, gap: 6 },
  guestTitle: { fontSize: 17, lineHeight: 21, fontWeight: '900' },
  guestText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  guestActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  primaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 13 },
  primaryButtonText: { fontSize: 12, fontWeight: '900' },
  secondaryButton: { minHeight: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  secondaryButtonText: { fontSize: 12, fontWeight: '900' },
  loadingRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 12, fontWeight: '800' },
  stateStrip: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 12 },
  stateCopy: { flex: 1 },
  stateTitle: { fontSize: 13, fontWeight: '900' },
  stateText: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  iconButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  syncStrip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  syncText: { flex: 1, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  nextCard: { minHeight: 102, borderRadius: 24, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12 },
  nextIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nextCopy: { flex: 1, minWidth: 0, gap: 2 },
  nextEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.05, opacity: 0.84 },
  nextTitle: { fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.25 },
  nextDetail: { fontSize: 11, lineHeight: 16, fontWeight: '800', opacity: 0.86 },
  programCard: { overflow: 'hidden', borderWidth: 1, borderRadius: 22, marginBottom: 12 },
  programMain: { padding: 13 },
  programTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  programIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  programCopy: { flex: 1, minWidth: 0 },
  programEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
  programTitle: { marginTop: 1, fontSize: 19, lineHeight: 23, fontWeight: '900', letterSpacing: -0.22 },
  programMeta: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  attendanceBlock: { marginTop: 12, gap: 6 },
  attendanceLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  attendanceTitle: { fontSize: 11, fontWeight: '800' },
  attendanceValue: { fontSize: 11, fontWeight: '900' },
  progressTrack: { height: 7, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  practiceSummary: { minHeight: 54, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 10 },
  practiceSummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  practiceSummaryText: { fontSize: 10, fontWeight: '900' },
  practiceWeekText: { flex: 1, minWidth: 100, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  activityCard: { borderWidth: 1, borderRadius: 22, padding: 13, marginBottom: 14 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  activityEyebrow: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.9 },
  activityTitle: { marginTop: 1, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  qrButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10 },
  qrButtonText: { fontSize: 10, fontWeight: '900' },
  metricsRow: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, flexDirection: 'row', alignItems: 'stretch' },
  metricInline: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 3 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 20, lineHeight: 23, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, textAlign: 'center', fontSize: 9, lineHeight: 12, fontWeight: '800' },
  metricDivider: { width: 1, marginVertical: 3, opacity: 0.8 },
  contextBlock: { gap: 8, marginBottom: 14 },
  contextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  contextSectionTitle: { fontSize: 17, lineHeight: 21, fontWeight: '900' },
  contextLink: { fontSize: 10, fontWeight: '900' },
  contextStrip: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, padding: 11 },
  contextIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  contextCopy: { flex: 1, minWidth: 0 },
  contextEyebrow: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.85 },
  contextTitle: { marginTop: 1, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  contextDetail: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  noticeLinkOnly: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 },
  noticeLinkOnlyText: { fontSize: 11, fontWeight: '900' },
});
