import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Announcement } from '../../types/app.types';

type Props = {
  announcement: Announcement;
  onPress?: () => void;
  onOpenEvent?: () => void;
  showAdminStatus?: boolean;
};

function audienceLabel(audience: Announcement['audience']): string {
  const labels = {
    public: 'Público',
    clients: 'Clientes',
    members: 'Socios',
    admins: 'Admins',
  };

  return labels[audience];
}

export function AnnouncementCard({
  announcement,
  onPress,
  onOpenEvent,
  showAdminStatus = false,
}: Props) {
  const archived = Boolean(announcement.archived_at);
  const unpublished = !announcement.is_published;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>{announcement.title}</Text>
          <View style={styles.metaRow}>
            {announcement.is_pinned ? <Text style={styles.pin}>Fijado</Text> : null}
            <Text style={styles.badge}>{audienceLabel(announcement.audience)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.content}>{announcement.content}</Text>

      {announcement.event ? (
        <Pressable onPress={onOpenEvent} disabled={!onOpenEvent} style={styles.eventLink}>
          <MaterialIcons name="event" size={18} color="#0f766e" />
          <View style={styles.eventTextBox}>
            <Text style={styles.eventLabel}>Evento vinculado</Text>
            <Text style={styles.eventTitle}>{announcement.event.title}</Text>
          </View>
          {onOpenEvent ? <MaterialIcons name="chevron-right" size={22} color="#64748b" /> : null}
        </Pressable>
      ) : null}

      {showAdminStatus ? (
        <View style={styles.statusRow}>
          <Text style={[styles.status, unpublished && styles.warning]}>
            {announcement.is_published ? 'Publicado' : 'Despublicado'}
          </Text>
          <Text style={[styles.status, archived && styles.danger]}>
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
    color: '#0f766e',
    backgroundColor: '#ccfbf1',
    fontSize: 12,
    fontWeight: '800',
  },
  pin: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
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
    color: '#166534',
    backgroundColor: '#dcfce7',
    fontSize: 12,
    fontWeight: '800',
  },
  warning: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
  danger: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
});
