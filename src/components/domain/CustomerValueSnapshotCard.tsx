import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  onOpenAchieved?: () => void;
  onOpenNext?: (action: CustomerValuePrimaryNextAction) => void;
};

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

function formatDateKey(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function formatMembershipDate(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value);
}


function programLabel(program: CustomerValueSnapshot['whatIHave']['programs'][number]) {
  const level = program.programCode === 'comandos' ? ` ${getProgramLevelLabel(program.programLevel)}` : '';
  const dog = program.dogName ? ` con ${program.dogName}` : '';
  return `${program.programName}${level}${dog}`;
}

function completedProgramLabel(program: CustomerValueSnapshot['whatIAchieved']['completedPrograms'][number]) {
  if (program.programCode === 'puppy') return 'Puppy completado';
  if (program.programCode === 'comandos') return `Comandos ${getProgramLevelLabel(program.programLevel)} completado`;
  return `${program.programName} completado`;
}

function buildHaveText(snapshot: CustomerValueSnapshot) {
  if (snapshot.sourceStatus.programs === 'error' && snapshot.sourceStatus.membership === 'error') {
    return 'No pudimos verificar tus programas o membresía.';
  }

  const parts: string[] = [];
  const programs = snapshot.whatIHave.programs;

  if (programs.length === 1) {
    const program = programs[0];
    let text = programLabel(program);
    if (program.requiredAttendances > 0) {
      text += ` · ${program.attendanceRemaining} de ${program.requiredAttendances} clases restantes`;
    }
    parts.push(text);
  } else if (programs.length > 1) {
    parts.push(plural(programs.length, 'programa activo'));
  }

  const membership = snapshot.whatIHave.membership;
  if (membership?.status === 'active' && membership.isValidToday) {
    const endLabel = formatMembershipDate(membership.endDate);
    parts.push(`Membresía vigente${endLabel ? ` hasta ${endLabel}` : ''}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Sin programa o membresía activa.';
}

function hasUsedActivity(snapshot: CustomerValueSnapshot) {
  return snapshot.whatIUsed.attendanceTotal > 0
    || (snapshot.whatIUsed.memberVisitsTotal ?? 0) > 0
    || (snapshot.whatIUsed.practice?.thisMonthCount ?? 0) > 0;
}

function buildUsedText(snapshot: CustomerValueSnapshot) {
  if (snapshot.sourceStatus.programs === 'error' && snapshot.sourceStatus.member_visits === 'error' && snapshot.sourceStatus.practice === 'error') {
    return 'No pudimos verificar tu actividad.';
  }

  const parts: string[] = [];

  if (snapshot.whatIUsed.attendanceTotal > 0) {
    parts.push(`${plural(snapshot.whatIUsed.attendanceTotal, 'asistencia', 'asistencias')} en tu historial`);
  }

  if ((snapshot.whatIUsed.memberVisitsTotal ?? 0) > 0) {
    parts.push(plural(snapshot.whatIUsed.memberVisitsTotal ?? 0, 'visita de socio', 'visitas de socio'));
  }

  if ((snapshot.whatIUsed.practice?.thisMonthCount ?? 0) > 0) {
    parts.push(`${plural(snapshot.whatIUsed.practice?.thisMonthCount ?? 0, 'práctica', 'prácticas')} este mes`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Aún no hay actividad registrada.';
}

function hasAchievedValue(snapshot: CustomerValueSnapshot) {
  return snapshot.whatIAchieved.achievements.length > 0
    || snapshot.whatIAchieved.completedPrograms.length > 0
    || snapshot.whatIAchieved.attendanceRequirementsMet.length > 0;
}

function buildAchievedText(snapshot: CustomerValueSnapshot) {
  if (snapshot.sourceStatus.programs === 'error' && snapshot.sourceStatus.achievements === 'error') {
    return 'No pudimos verificar tus hitos.';
  }

  const achievements = snapshot.whatIAchieved.achievements;
  if (achievements.length > 0) {
    const first = achievements[0].unlockedTitle || achievements[0].title;
    if (achievements.length === 1) return first;
    return `${first} · +${achievements.length - 1} ${achievements.length - 1 === 1 ? 'logro' : 'logros'}`;
  }

  const completed = snapshot.whatIAchieved.completedPrograms;
  if (completed.length === 1) return completedProgramLabel(completed[0]);
  if (completed.length > 1) return `${completedProgramLabel(completed[0])} · +${completed.length - 1} programas completados`;

  if (snapshot.whatIAchieved.attendanceRequirementsMet.length > 0) {
    return plural(
      snapshot.whatIAchieved.attendanceRequirementsMet.length,
      'requisito de asistencias cubierto',
      'requisitos de asistencias cubiertos',
    );
  }

  return 'Tu historial todavía no tiene hitos registrados.';
}

function buildNextText(snapshot: CustomerValueSnapshot, action: CustomerValuePrimaryNextAction) {
  if (!action) {
    const nextSources = [
      snapshot.sourceStatus.payments,
      snapshot.sourceStatus.schedules,
      snapshot.sourceStatus.cancellations,
      snapshot.sourceStatus.events,
      snapshot.sourceStatus.membership,
    ];
    if (nextSources.some((status) => status === 'error')) return 'No pudimos verificar qué sigue.';
    return 'No hay una acción próxima registrada.';
  }

  if (action.kind === 'payment') {
    if (action.source === 'legacy_membership') return 'Revisa tus pagos · hay un pendiente de revisión';
    const date = formatDateKey(action.dueDate);
    const status = action.status === 'overdue'
      ? 'Pago vencido'
      : action.status === 'future'
        ? 'Próximo pago'
        : 'Pago pendiente';
    const amount = action.remainingAmount == null ? '' : ` · ${money(action.remainingAmount)}`;
    return `${status}${amount}${date ? ` · ${date}` : ''}`;
  }

  if (action.kind === 'class') {
    const date = formatDateKey(action.dateKey);
    return `${action.programName} con ${action.dogName}${date ? ` · ${date}` : ''}${action.startTime ? `, ${action.startTime}` : ''}`;
  }

  if (action.kind === 'event') {
    const date = formatDateTime(action.startDate);
    return `${action.title}${date ? ` · ${date}` : ''}`;
  }

  const membership = snapshot.whatIHave.membership;
  if (action.status === 'pending') return 'Tu membresía sigue en revisión.';
  if (membership?.status === 'active' && !membership.isValidToday) {
    const today = localDateKey();
    const start = membership.startDate?.slice(0, 10) ?? null;
    const end = membership.endDate?.slice(0, 10) ?? null;
    if (end && end < today) {
      const label = formatMembershipDate(membership.endDate);
      return label ? `Revisa tu membresía · venció el ${label}` : 'Revisa tu membresía vencida.';
    }
    if (start && start > today) {
      const label = formatMembershipDate(membership.startDate);
      return label ? `Tu membresía inicia el ${label}` : 'Tu membresía todavía no inicia.';
    }
  }
  const date = formatMembershipDate(action.endDate);
  return date ? `Membresía vigente hasta ${date}` : 'Revisa el estado de tu membresía.';
}

function ValueRow({
  format,
  icon,
  label,
  text,
  onPress,
}: {
  format: UcapsaFormat;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  text: string;
  onPress?: () => void;
}) {
  const sectionColor = format.key === 'member' ? format.secondaryButtonText : format.accentDark;
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: format.pillBackground }]}>
        <MaterialIcons name={icon} size={19} color={format.pillText} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: sectionColor }]}>{label}</Text>
        <Text style={[styles.rowText, { color: format.cardText }]}>{text}</Text>
      </View>
      {onPress ? <MaterialIcons name="chevron-right" size={22} color={sectionColor} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, { borderTopColor: format.cardBorder }]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${text}`}
      style={[styles.row, { borderTopColor: format.cardBorder }]}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

export function CustomerValueSnapshotCard({
  snapshot,
  format,
  dataState,
  savedAt,
  onOpenHave,
  onOpenUsed,
  onOpenAchieved,
  onOpenNext,
}: Props) {
  const nextAction = getCustomerValuePrimaryNextAction(snapshot);
  const activeDogNames = [...new Set(snapshot.whatIHave.programs.map((item) => item.dogName).filter(Boolean))];
  const title = activeDogNames.length === 1 ? `Tu UCAPSA con ${activeDogNames[0]}` : 'Tu UCAPSA';

  const savedDate = dataState === 'cached' && savedAt ? new Date(savedAt) : null;
  const savedLabel = savedDate && !Number.isNaN(savedDate.getTime())
    ? `Datos guardados · ${savedDate.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : 'Datos guardados';
  const stateLabel = dataState === 'cached' ? savedLabel : dataState === 'partial' ? 'Algunos datos no se pudieron verificar' : null;

  const showUsed = hasUsedActivity(snapshot) || snapshot.sourceStatus.programs === 'error' || snapshot.sourceStatus.member_visits === 'error' || snapshot.sourceStatus.practice === 'error';
  const showAchieved = hasAchievedValue(snapshot) || snapshot.sourceStatus.programs === 'error' || snapshot.sourceStatus.achievements === 'error';
  const showNext = Boolean(nextAction) || [snapshot.sourceStatus.payments, snapshot.sourceStatus.schedules, snapshot.sourceStatus.cancellations, snapshot.sourceStatus.events].some((status) => status === 'error');

  return (
    <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: format.cardText }]}>{title}</Text>
        {stateLabel ? (
          <View style={[styles.statePill, { backgroundColor: format.pillBackground, borderColor: format.cardBorder }]}>
            <Text style={[styles.stateText, { color: format.pillText }]}>{stateLabel}</Text>
          </View>
        ) : null}
      </View>

      <ValueRow format={format} icon="inventory-2" label="Tienes" text={buildHaveText(snapshot)} onPress={onOpenHave} />
      {showUsed ? <ValueRow format={format} icon="insights" label="Aprovechaste" text={buildUsedText(snapshot)} onPress={onOpenUsed} /> : null}
      {showAchieved ? <ValueRow format={format} icon="emoji-events" label="Conseguiste" text={buildAchievedText(snapshot)} onPress={onOpenAchieved} /> : null}
      {showNext ? (
        <ValueRow
          format={format}
          icon="arrow-forward"
          label="Sigue"
          text={buildNextText(snapshot, nextAction)}
          onPress={nextAction && onOpenNext ? () => onOpenNext(nextAction) : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  header: {
    gap: 8,
    paddingVertical: 6,
    paddingBottom: 10,
  },
  title: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
  },
  statePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stateText: {
    fontSize: 10,
    fontWeight: '900',
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  rowText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
});
