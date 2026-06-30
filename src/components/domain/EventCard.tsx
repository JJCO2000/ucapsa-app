import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UcapsaColorKey, UcapsaEvent, UcapsaPriority } from '../../types/app.types';
import { getEventRepeatLabel } from '../../utils/events.utils';

type Props = {
  event: UcapsaEvent;
  onPress?: () => void;
  showAdminStatus?: boolean;
  startDateOverride?: string;
  occurrenceIndex?: number;
};

const colorMap: Record<UcapsaColorKey, { main: string; soft: string; text: string }> = {
  red: { main: '#C91F37', soft: '#FFE8EC', text: '#8F1324' },
  blue: { main: '#2563EB', soft: '#EAF1FF', text: '#1D4ED8' },
  yellow: { main: '#EAB308', soft: '#FEF3C7', text: '#92400E' },
  green: { main: '#0f766e', soft: '#ccfbf1', text: '#0f766e' },
  purple: { main: '#7C3AED', soft: '#EDE9FE', text: '#5B21B6' },
  gray: { main: '#64748b', soft: '#f1f5f9', text: '#334155' },
};

const priorityLabels: Record<UcapsaPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

function getColor(color: UcapsaColorKey | null | undefined) {
  return colorMap[color ?? 'red'] ?? colorMap.red;
}

function formatDate(value: string | null, hasTime: boolean): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('es-MX', hasTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'full' }
  );
}

function audienceLabel(audience: UcapsaEvent['audience']): string {
  const labels = {
    public: 'Publico',
    clients: 'Clientes',
    members: 'Socios',
    admins: 'Admins',
  };

  return labels[audience];
}

export function EventCard({ event, onPress, showAdminStatus = false, startDateOverride, occurrenceIndex }: Props) {
  const archived = Boolean(event.archived_at);
  const unpublished = !event.is_published;
  const repeatLabel = getEventRepeatLabel(event);
  const displayDate = startDateOverride ?? event.start_date;
  const tone = getColor(event.color_key);
  const priority = event.priority ?? 'normal';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, { borderLeftColor: tone.main }, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: tone.soft }]}>
          <MaterialIcons name="event" size={22} color={tone.main} />
        </View>
        <View style={styles.titleBox}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.date}>{formatDate(displayDate, event.has_time ?? true)}</Text>
        </View>
      </View>

      {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

      <View style={styles.metaRow}>
        <Text style={[styles.badge, { color: tone.text, backgroundColor: tone.soft }]}>{audienceLabel(event.audience)}</Text>
        <Text style={[styles.priorityBadge, priority === 'urgent' && styles.priorityUrgent, priority === 'high' && styles.priorityHigh]}>
          {priorityLabels[priority]}
        </Text>
        {event.location ? <Text style={styles.location}>{event.location}</Text> : null}
        {repeatLabel ? <Text style={styles.repeatBadge}>{repeatLabel}</Text> : null}
        {repeatLabel && occurrenceIndex !== undefined ? <Text style={styles.repeatBadge}>Ocurrencia {occurrenceIndex + 1}</Text> : null}
      </View>

      {showAdminStatus ? (
        <View style={styles.statusRow}>
          <Text style={[styles.status, styles.statusPublished, unpublished && styles.warning]}>
            {event.is_published ? 'Publicado' : 'Despublicado'}
          </Text>
          <Text style={[styles.status, styles.statusActive, archived && styles.danger]}>
            {archived ? 'Archivado' : 'Activo'}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderLeftWidth: 6,
    borderColor: '#e2e8f0',
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.995 }] },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: { flex: 1, gap: 2 },
  title: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  date: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  description: { color: '#334155', fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  priorityBadge: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    color: '#475569',
    backgroundColor: '#f1f5f9',
    fontSize: 12,
    fontWeight: '800',
  },
  priorityHigh: { color: '#92400e', backgroundColor: '#fef3c7' },
  priorityUrgent: { color: '#991b1b', backgroundColor: '#fee2e2' },
  repeatBadge: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    color: '#334155',
    backgroundColor: '#f1f5f9',
    fontSize: 12,
    fontWeight: '800',
  },
  location: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: 8 },
  status: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  statusPublished: { color: '#8F1324', backgroundColor: '#FFE8EC' },
  statusActive: { color: '#334155', backgroundColor: '#F1F5F9' },
  warning: { color: '#92400e', backgroundColor: '#fef3c7' },
  danger: { color: '#991b1b', backgroundColor: '#fee2e2' },
});
