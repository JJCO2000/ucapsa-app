import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Announcement, UcapsaColorKey, UcapsaPriority } from '../../types/app.types';

type Props = {
  announcement: Announcement;
  onPress?: () => void;
  onOpenEvent?: () => void;
  showAdminStatus?: boolean;
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

function audienceLabel(audience: Announcement['audience']): string {
  const labels = {
    public: 'Publico',
    clients: 'Clientes',
    members: 'Socios',
    admins: 'Admins',
  };

  return labels[audience];
}

function formatAnnouncementDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function AnnouncementCard({
  announcement,
  onPress,
  onOpenEvent,
  showAdminStatus = false,
}: Props) {
  const archived = Boolean(announcement.archived_at);
  const unpublished = !announcement.is_published;
  const dateLabel = formatAnnouncementDate(announcement.announcement_date);
  const tone = getColor(announcement.color_key);
  const priority = announcement.priority ?? 'normal';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, { borderLeftColor: tone.main }, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>{announcement.title}</Text>
          <View style={styles.metaRow}>
            {announcement.is_pinned ? <Text style={styles.pin}>Fijado</Text> : null}
            <Text style={[styles.badge, { color: tone.text, backgroundColor: tone.soft }]}>{audienceLabel(announcement.audience)}</Text>
            <Text style={[styles.priorityBadge, priority === 'urgent' && styles.priorityUrgent, priority === 'high' && styles.priorityHigh]}>{priorityLabels[priority]}</Text>
          </View>
        </View>
      </View>

      {dateLabel ? (
        <View style={[styles.dateRow, { backgroundColor: tone.soft }]}>
          <MaterialIcons name="event-note" size={17} color={tone.main} />
          <Text style={[styles.dateText, { color: tone.text }]}>{dateLabel}</Text>
        </View>
      ) : null}

      <Text style={styles.content}>{announcement.content}</Text>

      {announcement.event ? (
        <Pressable onPress={onOpenEvent} disabled={!onOpenEvent} style={styles.eventLink}>
          <MaterialIcons name="event" size={18} color={tone.main} />
          <View style={styles.eventTextBox}>
            <Text style={styles.eventLabel}>Evento vinculado</Text>
            <Text style={styles.eventTitle}>{announcement.event.title}</Text>
          </View>
          {onOpenEvent ? <MaterialIcons name="chevron-right" size={22} color="#64748b" /> : null}
        </Pressable>
      ) : null}

      {showAdminStatus ? (
        <View style={styles.statusRow}>
          <Text style={[styles.status, styles.statusPublished, unpublished && styles.warning]}>
            {announcement.is_published ? 'Publicado' : 'Despublicado'}
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
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderLeftWidth: 6,
    borderColor: '#e2e8f0',
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleBox: {
    flex: 1,
    gap: 8,
  },
  title: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '900',
  },
  content: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
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
  pin: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    color: '#8F1324',
    backgroundColor: '#FFE8EC',
    fontSize: 12,
    fontWeight: '800',
  },
  eventLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  eventTextBox: {
    flex: 1,
  },
  eventLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  eventTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
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
  warning: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
  danger: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
});
