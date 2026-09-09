import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import type { Announcement, UcapsaColorKey, UcapsaPriority } from '../../types/app.types';

type Props = {
  announcement: Announcement;
  onPress?: () => void;
  onOpenEvent?: () => void;
  showAdminStatus?: boolean;
};

const colorMap: Record<UcapsaColorKey, { main: string; soft: string; text: string }> = {
  red: { main: ucapsaBrand.colors.red, soft: ucapsaBrand.colors.redSoft, text: ucapsaBrand.colors.redDark },
  blue: { main: ucapsaBrand.colors.blue, soft: ucapsaBrand.colors.blueSoft, text: ucapsaBrand.colors.blueDark },
  yellow: { main: ucapsaBrand.colors.gold, soft: ucapsaBrand.colors.goldPale, text: ucapsaBrand.colors.warningDark },
  green: { main: ucapsaBrand.colors.green, soft: ucapsaBrand.colors.greenSoft, text: ucapsaBrand.colors.greenDark },
  purple: { main: ucapsaBrand.colors.purple, soft: ucapsaBrand.colors.purpleSoft, text: ucapsaBrand.colors.purpleDark },
  gray: { main: ucapsaBrand.colors.mutedNeutral, soft: ucapsaBrand.colors.graySoft, text: ucapsaBrand.colors.grayDark },
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
    public: 'Público',
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
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Abrir anuncio: ${announcement.title}` : undefined}
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
          <MaterialIcons name="event-note" size={18} color={tone.text} />
          <Text style={[styles.dateText, { color: tone.text }]}>{dateLabel}</Text>
        </View>
      ) : null}

      <Text style={styles.content}>{announcement.content}</Text>

      {announcement.event ? (
        <Pressable
          accessibilityRole={onOpenEvent ? 'button' : undefined}
          accessibilityLabel={onOpenEvent ? `Abrir evento: ${announcement.event.title}` : undefined}
          onPress={onOpenEvent}
          disabled={!onOpenEvent}
          style={({ pressed }) => [styles.eventLink, pressed && styles.pressedLink]}
        >
          <MaterialIcons name="event" size={20} color={tone.text} />
          <View style={styles.eventTextBox}>
            <Text style={styles.eventLabel}>Evento vinculado</Text>
            <Text style={styles.eventTitle}>{announcement.event.title}</Text>
          </View>
          {onOpenEvent ? <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.mutedNeutral} /> : null}
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
    backgroundColor: ucapsaBrand.colors.surface,
    borderWidth: 1,
    borderLeftWidth: 6,
    borderColor: ucapsaBrand.colors.borderNeutral,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  pressedLink: { opacity: 0.72 },
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
    color: ucapsaBrand.colors.cameraDark,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  dateText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
  },
  content: {
    color: ucapsaBrand.colors.grayDark,
    fontSize: 15,
    lineHeight: 22,
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
    lineHeight: 17,
    fontWeight: '800',
  },
  priorityBadge: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    color: ucapsaBrand.colors.grayDark,
    backgroundColor: ucapsaBrand.colors.graySoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  priorityHigh: { color: ucapsaBrand.colors.warningDark, backgroundColor: ucapsaBrand.colors.goldPale },
  priorityUrgent: { color: ucapsaBrand.colors.danger, backgroundColor: ucapsaBrand.colors.dangerSoft },
  pin: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    color: ucapsaBrand.colors.redDark,
    backgroundColor: ucapsaBrand.colors.redSoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  eventLink: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: ucapsaBrand.colors.redPale,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.borderNeutral,
  },
  eventTextBox: {
    flex: 1,
    minWidth: 0,
  },
  eventLabel: {
    color: ucapsaBrand.colors.mutedNeutral,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  eventTitle: {
    color: ucapsaBrand.colors.cameraDark,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  status: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  statusPublished: { color: ucapsaBrand.colors.redDark, backgroundColor: ucapsaBrand.colors.redSoft },
  statusActive: { color: ucapsaBrand.colors.grayDark, backgroundColor: ucapsaBrand.colors.graySoft },
  warning: {
    color: ucapsaBrand.colors.warningDark,
    backgroundColor: ucapsaBrand.colors.goldPale,
  },
  danger: {
    color: ucapsaBrand.colors.danger,
    backgroundColor: ucapsaBrand.colors.dangerSoft,
  },
});
