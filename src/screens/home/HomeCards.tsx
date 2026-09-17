import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import type { CustomerValuePrimaryNextAction, CustomerValueSnapshot } from '../../services/customer-value.service';
import type { getPracticeGoalProgress } from '../../services/practice-goal-preference.service';
import type { PracticeActivitySnapshot } from '../../services/practice.service';
import type { Announcement } from '../../types/app.types';
import { formatDate, isImportantNotice, nextPresentation, programTitle } from './homePresentation';
import { styles } from './homeStyles';

export function NextActionCard({
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

export function ProgramCard({
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
  const nextClass = snapshot.whatIsNext.nextClass ?? null;
  const program = nextClass
    ? snapshot.whatIHave.programs.find((item) => item.enrollmentId === nextClass.enrollmentId) ?? snapshot.whatIHave.programs[0] ?? null
    : snapshot.whatIHave.programs[0] ?? null;
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
            <MaterialIcons
              name={program ? 'school' : membership?.isValidToday ? 'workspace-premium' : 'pets'}
              size={23}
              color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark}
            />
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
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${attendancePercent}%`,
                    backgroundColor: premium ? ucapsaBrand.colors.premiumAction : format.accent,
                  },
                ]}
              />
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

export function ActivityCard({
  snapshot,
  practice,
  format,
  onClasses,
  onVisits,
  onPractices,
}: {
  snapshot: CustomerValueSnapshot;
  practice: PracticeActivitySnapshot | null;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onClasses: () => void;
  onVisits?: () => void;
  onPractices: () => void;
  onQr?: () => void;
}) {
  const premium = format.key === 'member';
  const visits = snapshot.whatIUsed.memberVisitsTotal ?? 0;
  const practices = practice?.stats.thisMonthCount ?? snapshot.whatIUsed.practice?.thisMonthCount ?? 0;

  return (
    <View style={[styles.activityCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <View style={styles.activityHeader}>
        <View>
          <Text style={[styles.activityEyebrow, { color: format.muted }]}>LO QUE HAS APROVECHADO</Text>
          <Text style={[styles.activityTitle, { color: format.cardText }]}>Tu actividad</Text>
        </View>
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

export function ContextNotice({
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
        <Pressable onPress={onOpenAll}>
          <Text style={[styles.contextLink, { color: format.accentDark }]}>Ver todos los avisos</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={[
          styles.contextStrip,
          {
            borderColor: important ? format.accent : format.cardBorder,
            backgroundColor: format.cardBackground,
          },
        ]}
      >
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

export function ContextStrip({
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
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.contextStrip, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}
      >
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
