import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MemberClubCrest } from './MemberClubCrest';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import type { UcapsaFormat } from '../../constants/ucapsaFormats';
import { getProgramLevelLabel } from '../../services/programs.service';
import {
  getCustomerValuePrimaryNextAction,
  type CustomerValuePrimaryNextAction,
  type CustomerValueSnapshot,
} from '../../services/customer-value.service';

type Props = {
  snapshot: CustomerValueSnapshot;
  format: UcapsaFormat;
  dataState: 'ok' | 'cached' | 'partial';
  savedAt?: string | null;
  onOpenHave?: () => void;
  onOpenUsed?: () => void;
  onOpenVisits?: () => void;
  onOpenPractices?: () => void;
  onOpenAchieved?: () => void;
  onOpenNext?: (action: CustomerValuePrimaryNextAction) => void;
};

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value);
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function programName(program: CustomerValueSnapshot['whatIHave']['programs'][number]) {
  if (program.programCode === 'comandos') return `Comandos ${getProgramLevelLabel(program.programLevel)}`;
  return program.programName;
}

function completedProgramName(program: CustomerValueSnapshot['whatIAchieved']['completedPrograms'][number]) {
  if (program.programCode === 'puppy') return 'Puppy';
  if (program.programCode === 'comandos') return `Comandos ${getProgramLevelLabel(program.programLevel)}`;
  return program.programName;
}

function latestAchievement(snapshot: CustomerValueSnapshot) {
  const achievements = snapshot.whatIAchieved.achievements;
  if (achievements.length > 0) {
    const first = achievements[0];
    return {
      title: first.unlockedTitle || first.title,
      detail: achievements.length > 1
        ? `+${achievements.length - 1} ${achievements.length - 1 === 1 ? 'logro adicional' : 'logros adicionales'}`
        : 'Logro desbloqueado',
    };
  }

  const completed = snapshot.whatIAchieved.completedPrograms;
  if (completed.length > 0) {
    return {
      title: completedProgramName(completed[0]),
      detail: completed.length > 1
        ? `Programa completado · +${completed.length - 1}`
        : 'Programa completado',
    };
  }

  if (snapshot.whatIAchieved.attendanceRequirementsMet.length > 0) {
    return {
      title: plural(snapshot.whatIAchieved.attendanceRequirementsMet.length, 'meta cubierta', 'metas cubiertas'),
      detail: 'Requisito de asistencias',
    };
  }

  return null;
}

function nextPresentation(snapshot: CustomerValueSnapshot, action: CustomerValuePrimaryNextAction) {
  if (!action) {
    return {
      eyebrow: 'AL DÍA',
      title: 'No tienes una acción urgente',
      detail: 'Tu cuenta no tiene pendientes registrados ahora.',
      icon: 'check-circle' as const,
    };
  }

  if (action.kind === 'payment') {
    if (action.source === 'legacy_membership') {
      return {
        eyebrow: 'NECESITA TU ATENCIÓN',
        title: 'Revisa tus pagos',
        detail: 'Hay un pago pendiente de revisión.',
        icon: 'account-balance-wallet' as const,
      };
    }
    const amount = action.remainingAmount == null ? null : money(action.remainingAmount);
    const date = formatDate(action.dueDate);
    return {
      eyebrow: action.status === 'overdue' ? 'VENCIDO' : 'PAGO',
      title: action.status === 'overdue' ? 'Tienes un pago vencido' : action.status === 'future' ? 'Próximo pago' : 'Pago pendiente',
      detail: [amount, date].filter(Boolean).join(' · ') || 'Abre Pagos para revisar el detalle.',
      icon: 'account-balance-wallet' as const,
    };
  }

  if (action.kind === 'class') {
    const date = formatDate(action.dateKey);
    return {
      eyebrow: 'PRÓXIMA CLASE',
      title: action.programName,
      detail: [action.dogName, date, action.startTime].filter(Boolean).join(' · '),
      icon: 'school' as const,
    };
  }

  if (action.kind === 'event') {
    return {
      eyebrow: 'PRÓXIMO EVENTO',
      title: action.title,
      detail: formatDate(action.startDate) || 'Consulta el calendario UCAPSA.',
      icon: 'event' as const,
    };
  }

  const membership = snapshot.whatIHave.membership;
  if (action.status === 'pending') {
    return {
      eyebrow: 'MEMBRESÍA',
      title: 'Solicitud en revisión',
      detail: 'UCAPSA está revisando tu solicitud.',
      icon: 'workspace-premium' as const,
    };
  }

  if (membership?.status === 'active' && !membership.isValidToday) {
    const today = localDateKey();
    const start = membership.startDate?.slice(0, 10) ?? null;
    const end = membership.endDate?.slice(0, 10) ?? null;
    if (end && end < today) {
      return {
        eyebrow: 'MEMBRESÍA',
        title: 'Revisa tu renovación',
        detail: `Venció el ${formatDate(membership.endDate, true) ?? end}.`,
        icon: 'workspace-premium' as const,
      };
    }
    if (start && start > today) {
      return {
        eyebrow: 'MEMBRESÍA',
        title: 'Tu membresía está programada',
        detail: `Inicia el ${formatDate(membership.startDate, true) ?? start}.`,
        icon: 'workspace-premium' as const,
      };
    }
  }

  return {
    eyebrow: 'MEMBRESÍA',
    title: 'Revisa tu membresía',
    detail: formatDate(action.endDate, true) ? `Vigencia: ${formatDate(action.endDate, true)}` : 'Consulta su estado actual.',
    icon: 'workspace-premium' as const,
  };
}

function Metric({
  format,
  icon,
  value,
  label,
  onPress,
}: {
  format: UcapsaFormat;
  icon: keyof typeof MaterialIcons.glyphMap;
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const premium = format.key === 'member';
  const content = (
    <>
      <View style={[styles.metricIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}>
        <MaterialIcons name={icon} size={18} color={premium ? ucapsaBrand.colors.premiumActionText : format.accentDark} />
      </View>
      <Text style={[styles.metricValue, { color: format.cardText }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.metricLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{label}</Text>
    </>
  );

  const style = [
    styles.metric,
    {
      borderColor: format.border,
      backgroundColor: format.surfaceAlt,
    },
  ];

  if (!onPress) return <View style={style}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} style={style} onPress={onPress}>{content}</Pressable>;
}

export function CustomerValueSnapshotCard({
  snapshot,
  format,
  dataState,
  savedAt,
  onOpenHave,
  onOpenUsed,
  onOpenVisits,
  onOpenPractices,
  onOpenAchieved,
  onOpenNext,
}: Props) {
  const premium = format.key === 'member';
  const activePrograms = snapshot.whatIHave.programs;
  const mainProgram = activePrograms[0] ?? null;
  const membership = snapshot.whatIHave.membership;
  const nextAction = getCustomerValuePrimaryNextAction(snapshot);
  const visibleNextAction = nextAction?.kind === 'class' || nextAction?.kind === 'event' ? nextAction : null;
  const next = nextPresentation(snapshot, visibleNextAction);
  const achievement = latestAchievement(snapshot);
  const attendance = snapshot.whatIUsed.attendanceTotal;
  const visits = snapshot.whatIUsed.memberVisitsTotal ?? 0;
  const practices = snapshot.whatIUsed.practice?.thisMonthCount ?? 0;

  const savedDate = dataState === 'cached' && savedAt ? new Date(savedAt) : null;
  const stateText = dataState === 'cached'
    ? `Guardado${savedDate && !Number.isNaN(savedDate.getTime()) ? ` · ${savedDate.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`
    : dataState === 'partial'
      ? 'Datos parciales'
      : null;

  const dogName = mainProgram?.dogName || null;
  const membershipActive = membership?.status === 'active' && membership.isValidToday;
  const remaining = mainProgram?.requiredAttendances && mainProgram.requiredAttendances > 0
    ? mainProgram.attendanceRemaining
    : null;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir tu programa y membresía"
        disabled={!onOpenHave}
        onPress={onOpenHave}
        style={[
          styles.programCard,
          premium && styles.programCardClub,
          {
            borderColor: premium ? ucapsaBrand.colors.premiumBorderStrong : format.border,
            backgroundColor: premium ? ucapsaBrand.colors.premiumSurface : format.cardBackground,
          },
        ]}
      >
        {premium ? <View style={styles.clubAccentBar} /> : null}
        <View style={styles.programTopRow}>
          {premium ? (
            <MemberClubCrest compact />
          ) : (
            <View style={[styles.programIcon, { backgroundColor: format.accentSoft }]}>
              <MaterialIcons name={mainProgram ? 'school' : membershipActive ? 'workspace-premium' : 'pets'} size={23} color={format.accentDark} />
            </View>
          )}
          <View style={styles.programCopy}>
            <Text style={[styles.programEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>
              {mainProgram ? 'PROGRAMA ACTUAL' : membershipActive ? 'TU ACCESO' : 'TU ESTADO'}
            </Text>
            <Text numberOfLines={2} style={[styles.programTitle, { color: format.cardText }]}>
              {mainProgram ? programName(mainProgram) : membershipActive ? 'Membresía UCAPSA' : 'Sin programa activo'}
            </Text>
            <Text numberOfLines={2} style={[styles.programMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
              {mainProgram
                ? dogName ? `Con ${dogName}` : 'Programa activo'
                : membershipActive
                  ? 'Tu acceso de socio está activo'
                  : 'Abre para revisar tu experiencia UCAPSA'}
            </Text>
          </View>
          {!premium && remaining != null ? (
            <View style={[styles.remainingBox, { backgroundColor: format.accent }]}>
              <Text style={[styles.remainingValue, { color: format.primaryButtonText }]}>{remaining}</Text>
              <Text style={[styles.remainingLabel, { color: format.primaryButtonText }]}>clases restantes</Text>
            </View>
          ) : <MaterialIcons name="chevron-right" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />}
        </View>
        {premium && mainProgram ? (
          <View style={styles.clubBenefitRow}>
            <MaterialIcons name="verified" size={16} color={ucapsaBrand.colors.premiumAction} />
            <Text style={styles.clubBenefitText}>Entrenamiento incluido como socio</Text>
          </View>
        ) : null}
      </Pressable>

      {visibleNextAction ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${next.eyebrow}. ${next.title}. ${next.detail}`}
        disabled={!onOpenNext}
        onPress={onOpenNext ? () => onOpenNext(visibleNextAction) : undefined}
        style={[
          styles.nextCard,
          { backgroundColor: premium ? format.primaryButton : format.primaryButton },
        ]}
      >
        <View style={[styles.nextIcon, { backgroundColor: withAlpha(format.primaryButtonText, 0.14) }]}>
          <MaterialIcons name={next.icon} size={23} color={format.primaryButtonText} />
        </View>
        <View style={styles.nextCopy}>
          <Text style={[styles.nextEyebrow, { color: format.primaryButtonText }]}>{next.eyebrow}</Text>
          <Text style={[styles.nextTitle, { color: format.primaryButtonText }]}>{next.title}</Text>
          <Text numberOfLines={2} style={[styles.nextDetail, { color: format.primaryButtonText }]}>{next.detail}</Text>
        </View>
        {onOpenNext ? <MaterialIcons name="arrow-forward" size={23} color={format.primaryButtonText} /> : null}
      </Pressable> : null}

      <View style={styles.activityHeader}>
        <Text style={[styles.activityTitleCompact, { color: format.text }]}>Actividad</Text>
      </View>

      <View style={styles.metricsRow}>
        <Metric format={format} icon="school" value={attendance} label="clases asistidas" onPress={onOpenUsed} />
        {premium ? <Metric format={format} icon="badge" value={visits} label="visitas de socio" onPress={onOpenVisits} /> : null}
        <Metric format={format} icon="pets" value={practices} label="prácticas este mes" onPress={onOpenPractices} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={achievement ? `Logro. ${achievement.title}` : 'Abrir logros'}
        disabled={!onOpenAchieved}
        onPress={onOpenAchieved}
        style={[
          styles.achievementStrip,
          {
            borderColor: format.border,
            backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.surfaceAlt,
          },
        ]}
      >
        <View style={[styles.achievementIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurface : ucapsaBrand.colors.goldPale }]}>
          <MaterialIcons name="emoji-events" size={22} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.goldDark} />
        </View>
        <View style={styles.achievementCopy}>
          <Text style={[styles.achievementEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.goldDark }]}>LOGRO</Text>
          <Text numberOfLines={1} style={[styles.achievementTitle, { color: format.cardText }]}>{achievement?.title ?? 'Tu primer logro te espera'}</Text>
          <Text numberOfLines={1} style={[styles.achievementDetail, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
            {achievement?.detail ?? 'Sigue avanzando para desbloquearlo'}
          </Text>
        </View>
        {onOpenAchieved ? <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 10, marginBottom: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  sectionHeadingCopy: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.15 },
  heading: { fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.45 },
  statePill: { maxWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  stateText: { flexShrink: 1, fontSize: 9, lineHeight: 12, fontWeight: '900' },
  programCard: { position: 'relative', overflow: 'hidden', borderRadius: 22, borderWidth: 1, padding: 13 },
  programCardClub: { paddingTop: 15, paddingLeft: 16, shadowColor: ucapsaBrand.colors.redDeep, shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  clubAccentBar: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, backgroundColor: ucapsaBrand.colors.premiumAction },
  programTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  programIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  programCopy: { flex: 1, minWidth: 0 },
  programEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
  programTitle: { marginTop: 2, fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.25 },
  programMeta: { marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  clubBenefitRow: { marginTop: 11, marginLeft: 4, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumHero, paddingHorizontal: 10, paddingVertical: 7 },
  clubBenefitText: { color: ucapsaBrand.colors.premiumActionText, fontSize: 10, lineHeight: 13, fontWeight: '900' },
  remainingBox: { width: 84, minHeight: 74, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  remainingValue: { fontSize: 27, lineHeight: 30, fontWeight: '900' },
  remainingLabel: { marginTop: 1, textAlign: 'center', fontSize: 9, lineHeight: 11, fontWeight: '900' },
  benefitBox: { width: 94, minHeight: 74, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 9 },
  benefitValue: { textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 0.7 },
  benefitLabel: { marginTop: 3, textAlign: 'center', fontSize: 9, lineHeight: 12, fontWeight: '900' },
  nextCard: { minHeight: 88, borderRadius: 22, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nextCopy: { flex: 1, gap: 2 },
  nextEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.05, opacity: 0.82 },
  nextTitle: { fontSize: 19, lineHeight: 23, fontWeight: '900', letterSpacing: -0.2 },
  nextDetail: { fontSize: 11, lineHeight: 16, fontWeight: '800', opacity: 0.84 },
  activityHeader: { marginTop: 3, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  activityEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.0 },
  activityTitle: { marginTop: 1, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  activityTitleCompact: { fontSize: 17, lineHeight: 21, fontWeight: '900', letterSpacing: -0.2 },
  activityLink: { fontSize: 12, fontWeight: '900', paddingVertical: 4 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minHeight: 118, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 12, alignItems: 'flex-start' },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricValue: { fontSize: 24, lineHeight: 27, fontWeight: '900', letterSpacing: -0.35 },
  metricLabel: { marginTop: 2, fontSize: 10, lineHeight: 13, fontWeight: '800' },
  achievementStrip: { minHeight: 68, borderWidth: 1, borderRadius: 18, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  achievementIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  achievementCopy: { flex: 1, minWidth: 0 },
  achievementEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  achievementTitle: { marginTop: 1, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  achievementDetail: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
});
